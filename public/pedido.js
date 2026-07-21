const query = new URLSearchParams(location.search);
const token = query.get('token') || localStorage.getItem('automata:lastOrderToken');
const paymentId = query.get('payment_id') || query.get('collection_id');
let reportText = '';
let timer;

const states = {
  awaiting_payment: ['Pago pendiente', 'Cuando Mercado Pago confirme la operación, iniciaremos tu informe.'],
  paid: ['Pago aprobado', 'Tu pago fue verificado. El informe está en la cola de generación.'],
  processing: ['Creando tu informe', 'Autómata está analizando el contexto y construyendo el plan de acción.'],
  delivered: ['Tu informe está listo', 'Puedes leerlo, copiarlo o descargarlo desde este enlace privado.'],
  failed: ['Revisión necesaria', 'El pago está registrado, pero la generación automática no terminó. El pedido quedó para revisión.'],
  payment_reversed: ['Pago revertido', 'Mercado Pago informó una reversa o contracargo para esta operación.']
};

async function reconcile() {
  if (!token || !paymentId || !/^\d+$/.test(paymentId)) return;
  try {
    await fetch(`/api/orders/${encodeURIComponent(token)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ paymentId })
    });
  } catch { /* El sondeo posterior volverá a consultar el estado persistido. */ }
}

function render(order) {
  const content = states[order.status] || ['Pedido registrado', 'Estamos consultando el estado de tu pedido.'];
  document.querySelector('#statusPill').textContent = order.status.replaceAll('_', ' ');
  document.querySelector('#statusTitle').textContent = content[0];
  document.querySelector('#statusText').textContent = content[1];
  document.querySelector('#orderMeta').textContent = `${order.product} · ${order.email} · Pedido ${order.id}`;
  if (order.status === 'delivered' && order.report) {
    clearTimeout(timer);
    reportText = order.report;
    document.querySelector('#progress').classList.add('hidden');
    document.querySelector('#reportArea').classList.remove('hidden');
    document.querySelector('#report').textContent = reportText;
  } else if (['failed', 'payment_reversed'].includes(order.status)) {
    clearTimeout(timer);
    document.querySelector('#progress').classList.add('hidden');
    document.querySelector('#statusError').textContent = order.error || '';
  }
}

async function poll() {
  if (!token) {
    document.querySelector('#statusTitle').textContent = 'Falta el enlace privado del pedido';
    document.querySelector('#statusText').textContent = 'Abre el enlace recibido después de crear el pedido.';
    document.querySelector('#progress').classList.add('hidden');
    return;
  }
  try {
    const response = await fetch(`/api/orders/${encodeURIComponent(token)}`);
    const order = await response.json();
    if (!response.ok) throw new Error(order.error || 'No se pudo consultar el pedido');
    render(order);
    if (!['delivered', 'failed', 'payment_reversed'].includes(order.status)) timer = setTimeout(poll, 5000);
  } catch (error) {
    document.querySelector('#statusError').textContent = error.message;
    timer = setTimeout(poll, 10000);
  }
}

document.querySelector('#copyReport').addEventListener('click', async () => {
  await navigator.clipboard.writeText(reportText);
  document.querySelector('#copyReport').textContent = 'Copiado';
});
document.querySelector('#downloadReport').addEventListener('click', () => {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([reportText], { type: 'text/markdown;charset=utf-8' }));
  link.download = 'informe-automata.md';
  link.click();
  URL.revokeObjectURL(link.href);
});

reconcile().finally(poll);
