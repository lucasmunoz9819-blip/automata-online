import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { loadState, saveState } from './state.js';
import { tick } from './agent.js';
import { auditFile } from './util.js';
import {
  businessSummary, cloudEnabled, createOrder, getOrderByTokenHash, pullCloudState, pushCloudState, updateOrder
} from './cloud-store.js';
import { fetchPublicContext, publicSources } from './public-apis.js';
import { catalog, hashToken, newOrder, publicOrder } from './orders.js';
import { createCheckout, paymentsReady, validateWebhook } from './payments.js';
import { processNextPaidOrder, processOrder, reconcilePayment } from './business.js';

const config = loadConfig();
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const staticFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/pedido.html', ['pedido.html', 'text/html; charset=utf-8']],
  ['/admin.html', ['admin.html', 'text/html; charset=utf-8']],
  ['/terminos.html', ['terminos.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/site.js', ['site.js', 'text/javascript; charset=utf-8']],
  ['/pedido.js', ['pedido.js', 'text/javascript; charset=utf-8']],
  ['/admin.js', ['admin.js', 'text/javascript; charset=utf-8']]
]);
const rateBuckets = new Map();
let timer = null;
let busy = false;

const securityHeaders = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'content-security-policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self' https://www.mercadopago.cl https://www.mercadopago.com"
};

function json(res, status, payload) {
  res.writeHead(status, { ...securityHeaders, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload));
}

function staticResponse(res, file, contentType) {
  const contents = fs.readFileSync(path.join(publicDir, file));
  res.writeHead(200, { ...securityHeaders, 'content-type': contentType, 'cache-control': file.endsWith('.html') ? 'no-store' : 'public, max-age=300' });
  res.end(contents);
}

function authorized(req) {
  if (!config.adminToken) return process.env.NODE_ENV !== 'production';
  return req.headers.authorization === `Bearer ${config.adminToken}`;
}

function clientKey(req) {
  return String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? 'unknown').split(',')[0].trim();
}

function rateLimit(req, scope, limit, windowMs) {
  const key = `${scope}:${clientKey(req)}`;
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

async function requestBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 20_000) throw new Error('Solicitud demasiado grande');
  }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new Error('JSON inválido'); }
}

async function currentState() {
  return (await pullCloudState(config, config.name)) ?? loadState(config);
}

async function runWork() {
  if (busy) return { skipped: true, reason: 'trabajo_en_curso' };
  busy = true;
  try { return await processNextPaidOrder(config); } finally { busy = false; }
}

async function runAgentTick() {
  if (busy) return { skipped: true, reason: 'trabajo_en_curso' };
  busy = true;
  try { return await tick(); } finally { busy = false; }
}

function startLoop() {
  if (timer) return false;
  timer = setInterval(() => runWork().catch(error => console.error('worker:', error.message)), config.tickSeconds * 1000);
  timer.unref();
  return true;
}

function stopLoop() {
  if (!timer) return false;
  clearInterval(timer);
  timer = null;
  return true;
}

function schedulePayment(paymentId) {
  setImmediate(async () => {
    try {
      const order = await reconcilePayment(config, paymentId);
      if (order?.status === 'paid') await processOrder(config, order.id);
    } catch (error) {
      console.error('payment:', String(error.message ?? error).slice(0, 300));
    }
  });
}

export const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const staticFile = req.method === 'GET' ? staticFiles.get(url.pathname) : null;
    if (staticFile) return staticResponse(res, ...staticFile);

    if (req.method === 'GET' && url.pathname === '/api/health') {
      return json(res, 200, {
        ok: true,
        name: config.name,
        worker: Boolean(timer),
        provider: config.provider,
        database: cloudEnabled(config),
        payments: paymentsReady(config)
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/catalog') return json(res, 200, catalog(config));

    if (req.method === 'POST' && url.pathname === '/api/orders') {
      if (!rateLimit(req, 'orders', 5, 60 * 60 * 1000)) return json(res, 429, { error: 'Demasiados intentos. Prueba nuevamente más tarde.' });
      if (!cloudEnabled(config) || !paymentsReady(config)) return json(res, 503, { error: 'El canal de pago está en configuración. Vuelve a intentarlo pronto.' });
      const input = await requestBody(req);
      const { token, record } = newOrder(config, input);
      let order = await createOrder(config, record);
      try {
        const checkout = await createCheckout(config, order, token);
        order = await updateOrder(config, order.id, {
          provider_preference_id: checkout.preferenceId,
          checkout_url: checkout.checkoutUrl,
          payment_status: 'pending'
        });
      } catch (error) {
        await updateOrder(config, order.id, { payment_status: 'checkout_error', last_error: String(error.message).slice(0, 500) });
        return json(res, 502, { error: 'No fue posible abrir el pago. El intento quedó registrado; no se realizó ningún cobro.' });
      }
      return json(res, 201, { token, order: publicOrder(order) });
    }

    const orderMatch = url.pathname.match(/^\/api\/orders\/([A-Za-z0-9_-]{30,60})$/);
    if (req.method === 'GET' && orderMatch) {
      if (!rateLimit(req, 'order-status', 120, 60 * 60 * 1000)) return json(res, 429, { error: 'Demasiadas consultas.' });
      const order = await getOrderByTokenHash(config, hashToken(orderMatch[1]));
      if (!order) return json(res, 404, { error: 'Pedido no encontrado' });
      return json(res, 200, publicOrder(order));
    }

    if (req.method === 'POST' && orderMatch) {
      if (!rateLimit(req, 'reconcile', 12, 60 * 60 * 1000)) return json(res, 429, { error: 'Demasiados intentos.' });
      const knownOrder = await getOrderByTokenHash(config, hashToken(orderMatch[1]));
      if (!knownOrder) return json(res, 404, { error: 'Pedido no encontrado' });
      const input = await requestBody(req);
      const reconciled = await reconcilePayment(config, String(input.paymentId ?? ''), { expectedOrderId: knownOrder.id });
      if (reconciled?.id !== knownOrder.id) return json(res, 409, { error: 'El pago no corresponde a este pedido' });
      if (reconciled.status === 'paid') schedulePayment(String(input.paymentId));
      return json(res, 200, publicOrder(reconciled));
    }

    if (req.method === 'POST' && url.pathname === '/api/payments/mercadopago/webhook') {
      const input = await requestBody(req);
      const dataId = url.searchParams.get('data.id') ?? String(input.data?.id ?? '');
      try {
        validateWebhook(config, {
          xSignature: req.headers['x-signature'],
          xRequestId: req.headers['x-request-id'],
          dataId
        });
      } catch {
        return json(res, 401, { error: 'Firma inválida' });
      }
      if ((input.type === 'payment' || url.searchParams.get('type') === 'payment') && dataId) schedulePayment(dataId);
      return json(res, 200, { received: true });
    }

    if (!authorized(req)) return json(res, 401, { error: 'No autorizado' });
    if (req.method === 'GET' && url.pathname === '/api/status') return json(res, 200, await currentState());
    if (req.method === 'GET' && url.pathname === '/api/business/summary') return json(res, 200, await businessSummary(config));
    if (req.method === 'GET' && url.pathname === '/api/public-context') {
      if (!config.allowPublicApis) return json(res, 403, { error: 'APIs públicas desactivadas' });
      const source = url.searchParams.get('source');
      if (!source) return json(res, 200, { sources: publicSources() });
      return json(res, 200, await fetchPublicContext(source, Object.fromEntries(url.searchParams)));
    }
    if (req.method === 'POST' && url.pathname === '/api/tick') return json(res, 200, await runWork());
    if (req.method === 'POST' && url.pathname === '/api/agent/tick') return json(res, 200, await runAgentTick());
    if (req.method === 'POST' && url.pathname === '/api/run/start') return json(res, 200, { started: startLoop() });
    if (req.method === 'POST' && url.pathname === '/api/run/stop') return json(res, 200, { stopped: stopLoop() });
    if (req.method === 'POST' && url.pathname === '/api/fund') {
      const input = await requestBody(req);
      const amount = Math.min(10000, Math.max(0, Number(input.amount ?? 0)));
      const state = await currentState();
      state.credits += amount;
      saveState(state);
      await pushCloudState(config, config.name, state);
      return json(res, 200, { credits: state.credits, simulated: true });
    }
    if (req.method === 'GET' && url.pathname === '/api/logs') {
      const lines = fs.existsSync(auditFile) ? fs.readFileSync(auditFile, 'utf8').trim().split('\n').filter(Boolean).slice(-100).map(line => JSON.parse(line)) : [];
      return json(res, 200, lines);
    }
    return json(res, 404, { error: 'No encontrado' });
  } catch (error) {
    const message = String(error.message ?? error);
    const clientError = /Escribe|Debes aceptar|Solicitud demasiado grande|JSON inválido|Identificador de pago inválido/.test(message);
    console.error('request:', message.slice(0, 300));
    return json(res, clientError ? 400 : 500, { error: clientError ? message : 'Ocurrió un error al procesar la solicitud.' });
  }
});

if (config.autoRun) startLoop();
server.listen(config.port, '0.0.0.0', () => console.log(`Autómata web en http://0.0.0.0:${config.port}`));
