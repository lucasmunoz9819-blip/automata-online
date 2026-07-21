const form = document.querySelector('#orderForm');
const message = document.querySelector('#formMessage');
const button = document.querySelector('#submitOrder');

function money(value) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value);
}

async function loadCatalog() {
  try {
    const response = await fetch('/api/catalog');
    const item = await response.json();
    const price = `${money(item.price)} CLP`;
    document.querySelector('#heroPrice').textContent = price;
    document.querySelector('#formPrice').textContent = price;
    if (item.supportEmail) {
      const support = document.querySelector('#supportEmail');
      support.href = `mailto:${item.supportEmail}`;
      support.textContent = ` · Soporte: ${item.supportEmail}`;
      support.classList.remove('hidden');
    }
    if (!item.paymentAvailable) {
      button.disabled = true;
      button.textContent = 'Pagos en configuración';
      message.textContent = 'Estamos terminando de habilitar el canal de pago.';
    }
  } catch {
    message.textContent = 'No se pudo consultar la disponibilidad.';
    message.classList.add('error');
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  button.disabled = true;
  message.classList.remove('error');
  message.textContent = 'Creando tu pedido seguro…';
  const data = Object.fromEntries(new FormData(form));
  data.acceptedTerms = form.elements.acceptedTerms.checked;
  try {
    const response = await fetch('/api/orders', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data)
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'No se pudo crear el pedido');
    localStorage.setItem('automata:lastOrderToken', payload.token);
    message.textContent = 'Pedido creado. Abriendo Mercado Pago…';
    window.location.assign(payload.order.checkoutUrl);
  } catch (error) {
    button.disabled = false;
    message.textContent = error.message;
    message.classList.add('error');
  }
});

loadCatalog();
