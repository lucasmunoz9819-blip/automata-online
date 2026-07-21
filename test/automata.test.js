import test from 'node:test';
import assert from 'node:assert/strict';
import { survivalTier } from '../src/state.js';
import { inside } from '../src/util.js';
import { fetchPublicContext, publicSources } from '../src/public-apis.js';

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
