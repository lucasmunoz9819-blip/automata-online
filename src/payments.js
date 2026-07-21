import { MercadoPagoConfig, Payment, Preference, WebhookSignatureValidator } from 'mercadopago';

export function paymentsReady(config) {
  return Boolean(config.mercadoPagoAccessToken && config.mercadoPagoWebhookSecret && config.publicBaseUrl?.startsWith('https://'));
}

function clients(config) {
  if (!config.mercadoPagoAccessToken) throw new Error('Mercado Pago no está configurado');
  const client = new MercadoPagoConfig({ accessToken: config.mercadoPagoAccessToken, options: { timeout: 12_000 } });
  return { preference: new Preference(client), payment: new Payment(client) };
}

export async function createCheckout(config, order, publicToken, dependencies = {}) {
  if (!paymentsReady(config)) throw new Error('El canal de pago aún no está habilitado');
  const preference = dependencies.preferenceClient ?? clients(config).preference;
  const base = config.publicBaseUrl.replace(/\/$/, '');
  const deliveryUrl = `${base}/pedido.html?token=${encodeURIComponent(publicToken)}`;
  const response = await preference.create({
    body: {
      items: [{ id: order.product_code, title: 'Informe Estratégico Express', quantity: 1, currency_id: 'CLP', unit_price: order.amount }],
      payer: { name: order.customer_name, email: order.customer_email },
      external_reference: order.id,
      metadata: { order_id: order.id, product_code: order.product_code },
      notification_url: `${base}/api/payments/mercadopago/webhook`,
      back_urls: {
        success: `${deliveryUrl}&return=success`,
        pending: `${deliveryUrl}&return=pending`,
        failure: `${deliveryUrl}&return=failure`
      },
      auto_return: 'approved',
      statement_descriptor: 'AUTOMATA',
      binary_mode: false
    },
    requestOptions: { idempotencyKey: `preference-${order.id}` }
  });
  if (!response?.id || !response?.init_point) throw new Error('Mercado Pago no devolvió un enlace de pago');
  return { preferenceId: response.id, checkoutUrl: response.init_point };
}

export function validateWebhook(config, { xSignature, xRequestId, dataId }) {
  if (!config.mercadoPagoWebhookSecret) throw new Error('Firma de webhook no configurada');
  WebhookSignatureValidator.validate({ xSignature, xRequestId, dataId, secret: config.mercadoPagoWebhookSecret });
  return true;
}

export async function getPayment(config, paymentId, dependencies = {}) {
  if (!/^\d{1,30}$/.test(String(paymentId))) throw new Error('Identificador de pago inválido');
  const payment = dependencies.paymentClient ?? clients(config).payment;
  return payment.get({ id: String(paymentId) });
}

export function paymentMatchesOrder(payment, order) {
  return String(payment.external_reference ?? '') === order.id
    && Number(payment.transaction_amount) === Number(order.amount)
    && String(payment.currency_id ?? '').toUpperCase() === order.currency;
}
