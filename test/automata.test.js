import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { survivalTier } from '../src/state.js';
import { inside } from '../src/util.js';
import { fetchPublicContext, publicSources } from '../src/public-apis.js';
import { catalog, hashToken, newOrder, publicOrder, validateOrderInput } from '../src/orders.js';
import { createCheckout, paymentMatchesOrder, paymentsReady, validateWebhook } from '../src/payments.js';
import { generateReport } from '../src/report-generator.js';

test('niveles de supervivencia', () => {
  assert.equal(survivalTier(100, 100), 'normal');
  assert.equal(survivalTier(20, 100), 'low_compute');
  assert.equal(survivalTier(2, 100), 'critical');
  assert.equal(survivalTier(0, 100), 'dead');
});

test('impide escapar del espacio autorizado', () => {
  assert.throws(() => inside('C:/safe', '../secret'));
});

test('limita las APIs publicas a fuentes conocidas', async () => {
  assert.deepEqual(publicSources(), ['weather', 'exchange', 'country']);
  await assert.rejects(() => fetchPublicContext('arbitrary', {}), /no permitida/);
});

test('normaliza el contexto meteorologico sin aceptar URLs arbitrarias', async () => {
  let requested;
  const fetchImpl = async url => {
    requested = String(url);
    return { ok: true, text: async () => JSON.stringify({ timezone: 'America/Santiago', current: { temperature_2m: 18 }, current_units: { temperature_2m: '°C' } }) };
  };
  const result = await fetchPublicContext('weather', { latitude: -33.45, longitude: -70.67, url: 'https://evil.invalid' }, { fetchImpl });
  assert.match(requested, /^https:\/\/api\.open-meteo\.com\/v1\/forecast\?/);
  assert.equal(result.current.temperature_2m, 18);
  assert.equal(requested.includes('evil.invalid'), false);
});

const commerceConfig = {
  productPriceClp: 4990,
  publicBaseUrl: 'https://automata.example',
  mercadoPagoAccessToken: 'APP_USR-test',
  mercadoPagoWebhookSecret: 'webhook-secret',
  supabaseUrl: 'https://db.example',
  supabaseServiceKey: 'service-role'
};

test('valida el pedido y conserva el token privado fuera del registro', () => {
  assert.throws(() => validateOrderInput({}), /nombre/);
  const created = newOrder(commerceConfig, {
    customerName: 'Lucas Muñoz', customerEmail: 'Lucas@Example.com',
    topic: 'Validar una nueva oferta digital',
    objective: 'Elegir un nicho inicial y una prueba de venta',
    context: 'Presupuesto limitado.', acceptedTerms: true
  });
  assert.match(created.token, /^[A-Za-z0-9_-]{40,60}$/);
  assert.equal(created.record.public_token_hash, hashToken(created.token));
  assert.equal(JSON.stringify(created.record).includes(created.token), false);
  assert.equal(created.record.customer_email, 'lucas@example.com');
});

test('la vista publica oculta correo y el informe hasta la entrega', () => {
  const pending = publicOrder({ id: 'ord_1', status: 'paid', payment_status: 'approved', amount: 4990, currency: 'CLP', customer_email: 'lucas@example.com', topic: 'Tema', report_markdown: 'secreto' });
  assert.equal(pending.email, 'lu***@example.com');
  assert.equal(pending.report, undefined);
  const delivered = publicOrder({ ...pending, customer_email: 'lucas@example.com', status: 'delivered', report_markdown: 'informe' });
  assert.equal(delivered.report, 'informe');
});

test('el catalogo solo habilita pago cuando toda la infraestructura existe', () => {
  assert.equal(paymentsReady(commerceConfig), true);
  assert.equal(catalog(commerceConfig).paymentAvailable, true);
  assert.equal(paymentsReady({ ...commerceConfig, mercadoPagoWebhookSecret: '' }), false);
  assert.equal(paymentsReady({ ...commerceConfig, publicBaseUrl: 'http://localhost:3000' }), false);
});

test('crea Checkout Pro con monto, referencia, retorno e idempotencia correctos', async () => {
  let request;
  const order = { id: 'ord_abc', product_code: 'informe_estrategico_express', amount: 4990, customer_name: 'Lucas', customer_email: 'lucas@example.com' };
  const result = await createCheckout(commerceConfig, order, 'private_token_123', {
    preferenceClient: { create: async input => { request = input; return { id: 'pref_1', init_point: 'https://mercadopago.example/pay' }; } }
  });
  assert.equal(result.preferenceId, 'pref_1');
  assert.equal(request.body.items[0].unit_price, 4990);
  assert.equal(request.body.external_reference, order.id);
  assert.match(request.body.back_urls.success, /token=private_token_123/);
  assert.equal(request.requestOptions.idempotencyKey, 'preference-ord_abc');
});

test('rechaza pagos cuyo monto, moneda o pedido no coinciden', () => {
  const order = { id: 'ord_abc', amount: 4990, currency: 'CLP' };
  assert.equal(paymentMatchesOrder({ external_reference: 'ord_abc', transaction_amount: 4990, currency_id: 'CLP' }, order), true);
  assert.equal(paymentMatchesOrder({ external_reference: 'ord_abc', transaction_amount: 99, currency_id: 'CLP' }, order), false);
  assert.equal(paymentMatchesOrder({ external_reference: 'ord_other', transaction_amount: 4990, currency_id: 'CLP' }, order), false);
});

test('valida la firma HMAC oficial de Mercado Pago', () => {
  const dataId = '123456';
  const requestId = 'request-abc';
  const ts = '1704908010000';
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const hash = crypto.createHmac('sha256', commerceConfig.mercadoPagoWebhookSecret).update(manifest).digest('hex');
  assert.equal(validateWebhook(commerceConfig, { xSignature: `ts=${ts},v1=${hash}`, xRequestId: requestId, dataId }), true);
  assert.throws(() => validateWebhook(commerceConfig, { xSignature: `ts=${ts},v1=deadbeef`, xRequestId: requestId, dataId }));
});

test('genera el informe con limite de salida y registra uso', async () => {
  let sent;
  const fakeMarkdown = `# Informe Estratégico Express\n${'Análisis útil. '.repeat(60)}`;
  const result = await generateReport({ geminiApiKey: 'key', model: 'gemini-test' }, {
    topic: 'Oferta digital', objective: 'Elegir un nicho', context: 'Sin presupuesto'
  }, {
    fetchImpl: async (_url, options) => {
      sent = JSON.parse(options.body);
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: fakeMarkdown }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 200, totalTokenCount: 300 } }) };
    }
  });
  assert.match(sent.contents[0].parts[0].text, /No inventes cifras/);
  assert.equal(result.usage.totalTokens, 300);
  assert.match(result.markdown, /^# Informe/);
});
