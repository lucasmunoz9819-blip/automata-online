const REQUEST_TIMEOUT_MS = 7000;
const MAX_RESPONSE_CHARS = 200_000;

const sourceNames = Object.freeze(['weather', 'exchange', 'country']);

function finiteNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function currency(value, fallback) {
  const normalized = String(value ?? '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : fallback;
}

async function getJson(url, fetchImpl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      headers: { accept: 'application/json', 'user-agent': 'automata-online/0.2' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`API publica respondio ${response.status}`);
    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARS) throw new Error('Respuesta publica demasiado grande');
    return JSON.parse(text);
  } finally {
    clearTimeout(timeout);
  }
}

export function publicSources() {
  return [...sourceNames];
}

export async function fetchPublicContext(source, args = {}, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  if (!sourceNames.includes(source)) throw new Error(`Fuente publica no permitida: ${source}`);

  if (source === 'weather') {
    const latitude = finiteNumber(args.latitude, -33.4489, -90, 90);
    const longitude = finiteNumber(args.longitude, -70.6693, -180, 180);
    const query = new URLSearchParams({
      latitude: String(latitude), longitude: String(longitude),
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,wind_speed_10m',
      timezone: 'auto', forecast_days: '1'
    });
    const data = await getJson(`https://api.open-meteo.com/v1/forecast?${query}`, fetchImpl);
    return { source, provider: 'Open-Meteo', location: { latitude, longitude, timezone: data.timezone }, current: data.current, units: data.current_units };
  }

  if (source === 'exchange') {
    const from = currency(args.from, 'USD');
    const requested = Array.isArray(args.to) ? args.to : String(args.to ?? 'EUR,GBP').split(',');
    const to = [...new Set(requested.map(value => currency(value, '')).filter(Boolean).filter(value => value !== from))].slice(0, 5);
    if (!to.length) throw new Error('Indica al menos una moneda de destino valida');
    const query = new URLSearchParams({ from, to: to.join(',') });
    const data = await getJson(`https://api.frankfurter.app/latest?${query}`, fetchImpl);
    return { source, provider: 'Frankfurter', date: data.date, base: data.base, rates: data.rates };
  }

  const name = String(args.name ?? 'Chile').trim().slice(0, 80);
  if (!/^[\p{L}\p{M} .'-]+$/u.test(name)) throw new Error('Nombre de pais invalido');
  const fields = 'name,capital,region,population,timezones,currencies,cca2';
  const data = await getJson(`https://restcountries.com/v3.1/name/${encodeURIComponent(name)}?fullText=true&fields=${fields}`, fetchImpl);
  const country = Array.isArray(data) ? data[0] : data;
  return {
    source, provider: 'REST Countries',
    country: { name: country?.name?.common, officialName: country?.name?.official, capital: country?.capital, region: country?.region, population: country?.population, timezones: country?.timezones, currencies: country?.currencies, code: country?.cca2 }
  };
}
