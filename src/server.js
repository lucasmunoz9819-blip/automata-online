import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { loadState, saveState } from './state.js';
import { tick } from './agent.js';
import { auditFile } from './util.js';
import { pullCloudState, pushCloudState } from './cloud-store.js';

const config = loadConfig();
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
let timer = null;
let busy = false;

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(body));
}
function authorized(req) {
  if (!config.adminToken) return process.env.NODE_ENV !== 'production';
  return req.headers.authorization === `Bearer ${config.adminToken}`;
}
async function runTick() {
  if (busy) return { skipped: true, reason: 'turno_en_curso' };
  busy = true;
  try { return await tick(); } finally { busy = false; }
}
async function currentState() {
  return (await pullCloudState(config, config.name)) ?? loadState(config);
}
function startLoop() {
  if (timer) return false;
  timer = setInterval(() => runTick().catch(error => console.error('tick:', error.message)), config.tickSeconds * 1000);
  timer.unref();
  return true;
}
function stopLoop() { if (!timer) return false; clearInterval(timer); timer = null; return true; }
async function body(req) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 20_000) throw new Error('Solicitud demasiado grande'); }
  return raw ? JSON.parse(raw) : {};
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/') {
      const html = fs.readFileSync(path.join(publicDir, 'index.html'));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'" });
      return res.end(html);
    }
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, name: config.name, loop: Boolean(timer), provider: config.provider });
    if (!authorized(req)) return json(res, 401, { error: 'No autorizado' });
    if (req.method === 'GET' && url.pathname === '/api/status') return json(res, 200, await currentState());
    if (req.method === 'POST' && url.pathname === '/api/tick') return json(res, 200, await runTick());
    if (req.method === 'POST' && url.pathname === '/api/run/start') return json(res, 200, { started: startLoop() });
    if (req.method === 'POST' && url.pathname === '/api/run/stop') return json(res, 200, { stopped: stopLoop() });
    if (req.method === 'POST' && url.pathname === '/api/fund') {
      const input = await body(req); const amount = Math.min(10000, Math.max(0, Number(input.amount ?? 0)));
      const state = await currentState(); state.credits += amount; saveState(state); await pushCloudState(config, config.name, state);
      return json(res, 200, { credits: state.credits, simulated: true });
    }
    if (req.method === 'GET' && url.pathname === '/api/logs') {
      const lines = fs.existsSync(auditFile) ? fs.readFileSync(auditFile, 'utf8').trim().split('\n').filter(Boolean).slice(-100).map(line => JSON.parse(line)) : [];
      return json(res, 200, lines);
    }
    return json(res, 404, { error: 'No encontrado' });
  } catch (error) { return json(res, 500, { error: error.message }); }
});

if (config.autoRun) startLoop();
server.listen(config.port, '0.0.0.0', () => console.log(`Automata web en http://0.0.0.0:${config.port}`));
