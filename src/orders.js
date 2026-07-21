import crypto from 'node:crypto';

export const PRODUCT_CODE = 'informe_estrategico_express';

function clean(value, max) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value) && value.length <= 254;
}

export function catalog(config) {
  return {
    code: PRODUCT_CODE,
    name: 'Informe Estratégico Express',
    description: 'Análisis personalizado con opciones, riesgos y un plan de acción concreto.',
    currency: 'CLP',
    price: config.productPriceClp,
    paymentAvailable: Boolean(config.supabaseUrl && config.supabaseServiceKey && config.mercadoPagoAccessToken && config.mercadoPagoWebhookSecret && config.publicBaseUrl?.startsWith('https://')),
    supportEmail: config.supportEmail || undefined
  };
}

export function validateOrderInput(input) {
  const customerName = clean(input.customerName, 90);
  const customerEmail = clean(input.customerEmail, 254).toLowerCase();
  const topic = clean(input.topic, 220);
  const context = clean(input.context, 4000);
  const objective = clean(input.objective, 900);
  if (customerName.length < 2) throw new Error('Escribe tu nombre.');
  if (!validEmail(customerEmail)) throw new Error('Escribe un correo válido.');
  if (topic.length < 12) throw new Error('Describe el tema con al menos 12 caracteres.');
  if (objective.length < 12) throw new Error('Explica qué decisión o resultado necesitas.');
  if (input.acceptedTerms !== true) throw new Error('Debes aceptar los términos y el uso de datos para crear el informe.');
  return { customerName, customerEmail, topic, context, objective };
}

export function newOrder(config, input, now = new Date()) {
  const values = validateOrderInput(input);
  const token = crypto.randomBytes(32).toString('base64url');
  const id = `ord_${crypto.randomBytes(12).toString('hex')}`;
  return {
    token,
    record: {
      id,
      public_token_hash: hashToken(token),
      product_code: PRODUCT_CODE,
      customer_name: values.customerName,
      customer_email: values.customerEmail,
      topic: values.topic,
      context: values.context,
      objective: values.objective,
      status: 'awaiting_payment',
      currency: 'CLP',
      amount: config.productPriceClp,
      payment_status: 'not_started',
      attempts: 0,
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    }
  };
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function maskEmail(email = '') {
  const [name, domain] = email.split('@');
  if (!domain) return '';
  return `${name.slice(0, 2)}${'*'.repeat(Math.min(6, Math.max(2, name.length - 2)))}@${domain}`;
}

export function publicOrder(order) {
  if (!order) return null;
  const delivered = order.status === 'delivered';
  return {
    id: order.id,
    product: 'Informe Estratégico Express',
    status: order.status,
    paymentStatus: order.payment_status,
    amount: order.amount,
    currency: order.currency,
    email: maskEmail(order.customer_email),
    topic: order.topic,
    checkoutUrl: order.checkout_url || undefined,
    report: delivered ? order.report_markdown : undefined,
    error: order.status === 'failed' ? 'No se pudo completar automáticamente. El pedido quedó registrado para revisión.' : undefined,
    createdAt: order.created_at,
    paidAt: order.paid_at,
    deliveredAt: order.delivered_at
  };
}
