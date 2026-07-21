const output = document.querySelector('#adminOutput');
async function call(path, method = 'GET') {
  output.textContent = 'Procesando…';
  try {
    const response = await fetch(path, { method, headers: { authorization: `Bearer ${document.querySelector('#adminToken').value}` } });
    output.textContent = JSON.stringify(await response.json(), null, 2);
  } catch (error) { output.textContent = error.message; }
}
document.querySelector('#summary').addEventListener('click', () => call('/api/business/summary'));
document.querySelector('#work').addEventListener('click', () => call('/api/tick', 'POST'));
document.querySelector('#agent').addEventListener('click', () => call('/api/agent/tick', 'POST'));
