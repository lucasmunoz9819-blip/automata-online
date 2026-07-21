const table = 'automata_state';

function enabled(config) { return Boolean(config.supabaseUrl && config.supabaseServiceKey); }
function headers(config, extra = {}) {
  return { apikey: config.supabaseServiceKey, authorization: `Bearer ${config.supabaseServiceKey}`, 'content-type': 'application/json', ...extra };
}

export async function pullCloudState(config, agentName) {
  if (!enabled(config)) return null;
  const url = `${config.supabaseUrl}/rest/v1/${table}?name=eq.${encodeURIComponent(agentName)}&select=state&limit=1`;
  const response = await fetch(url, { headers: headers(config) });
  if (!response.ok) throw new Error(`Supabase lectura ${response.status}`);
  return (await response.json())[0]?.state ?? null;
}

export async function pushCloudState(config, agentName, state) {
  if (!enabled(config)) return false;
  const url = `${config.supabaseUrl}/rest/v1/${table}?on_conflict=name`;
  const response = await fetch(url, {
    method: 'POST', headers: headers(config, { prefer: 'resolution=merge-duplicates' }),
    body: JSON.stringify({ name: agentName, state, updated_at: new Date().toISOString() })
  });
  if (!response.ok) throw new Error(`Supabase escritura ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return true;
}
