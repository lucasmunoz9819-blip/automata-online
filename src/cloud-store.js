const stateTable = 'automata_state';
const ordersTable = 'automata_orders';
const ledgerTable = 'automata_ledger';

export function cloudEnabled(config) { return Boolean(config.supabaseUrl && config.supabaseServiceKey); }
function headers(config, extra = {}) {
  return { apikey: config.supabaseServiceKey, authorization: `Bearer ${config.supabaseServiceKey}`, 'content-type': 'application/json', ...extra };
}

async function request(config, pathname, options = {}) {
  if (!cloudEnabled(config)) throw new Error('Persistencia de pedidos no configurada');
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${pathname}`, { ...options, headers: headers(config, options.headers) });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${(await response.text()).slice(0, 300)}`);
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export async function pullCloudState(config, agentName) {
  if (!cloudEnabled(config)) return null;
  const url = `${config.supabaseUrl}/rest/v1/${stateTable}?name=eq.${encodeURIComponent(agentName)}&select=state&limit=1`;
  const response = await fetch(url, { headers: headers(config) });
  if (!response.ok) throw new Error(`Supabase lectura ${response.status}`);
  return (await response.json())[0]?.state ?? null;
}

export async function pushCloudState(config, agentName, state) {
  if (!cloudEnabled(config)) return false;
  const url = `${config.supabaseUrl}/rest/v1/${stateTable}?on_conflict=name`;
  const response = await fetch(url, {
    method: 'POST', headers: headers(config, { prefer: 'resolution=merge-duplicates' }),
    body: JSON.stringify({ name: agentName, state, updated_at: new Date().toISOString() })
  });
  if (!response.ok) throw new Error(`Supabase escritura ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return true;
}

export async function createOrder(config, order) {
  const rows = await request(config, `${ordersTable}?select=*`, {
    method: 'POST', headers: { prefer: 'return=representation' }, body: JSON.stringify(order)
  });
  return rows?.[0] ?? null;
}

export async function getOrderById(config, id) {
  const rows = await request(config, `${ordersTable}?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  return rows?.[0] ?? null;
}

export async function getOrderByTokenHash(config, tokenHash) {
  const rows = await request(config, `${ordersTable}?public_token_hash=eq.${encodeURIComponent(tokenHash)}&select=*&limit=1`);
  return rows?.[0] ?? null;
}

export async function updateOrder(config, id, patch, expectedStatus) {
  const statusFilter = expectedStatus ? `&status=eq.${encodeURIComponent(expectedStatus)}` : '';
  const rows = await request(config, `${ordersTable}?id=eq.${encodeURIComponent(id)}${statusFilter}&select=*`, {
    method: 'PATCH', headers: { prefer: 'return=representation' },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() })
  });
  return rows?.[0] ?? null;
}

export async function nextPaidOrder(config) {
  const rows = await request(config, `${ordersTable}?status=eq.paid&select=*&order=paid_at.asc&limit=1`);
  return rows?.[0] ?? null;
}

export async function countReportsSince(config, sinceIso) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${ordersTable}?status=in.(processing,delivered)&paid_at=gte.${encodeURIComponent(sinceIso)}&select=id`, {
    method: 'HEAD', headers: headers(config, { prefer: 'count=exact' })
  });
  if (!response.ok) throw new Error(`Supabase conteo ${response.status}`);
  const range = response.headers.get('content-range') ?? '*/0';
  return Number(range.split('/')[1] ?? 0);
}

export async function recordLedger(config, entry) {
  await request(config, `${ledgerTable}?on_conflict=external_id`, {
    method: 'POST', headers: { prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(entry)
  });
  return true;
}

export async function businessSummary(config) {
  const rows = await request(config, `${ordersTable}?select=status,amount,currency,payment_status,created_at,paid_at,delivered_at&order=created_at.desc&limit=1000`);
  const paid = rows.filter(row => ['paid', 'processing', 'delivered'].includes(row.status));
  return {
    orders: rows.length,
    awaitingPayment: rows.filter(row => row.status === 'awaiting_payment').length,
    paid: paid.length,
    processing: rows.filter(row => row.status === 'processing').length,
    delivered: rows.filter(row => row.status === 'delivered').length,
    failed: rows.filter(row => row.status === 'failed').length,
    grossRevenueClp: paid.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    lastOrders: rows.slice(0, 20)
  };
}
