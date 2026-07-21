import {
  countReportsSince, getOrderById, nextPaidOrder, recordLedger, updateOrder
} from './cloud-store.js';
import { generateReport } from './report-generator.js';
import { getPayment, paymentMatchesOrder } from './payments.js';

function midnightUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

export async function reconcilePayment(config, paymentId, dependencies = {}) {
  const fetchPayment = dependencies.getPaymentImpl ?? getPayment;
  const payment = await fetchPayment(config, paymentId, dependencies);
  const orderId = String(payment.external_reference ?? '');
  if (!orderId.startsWith('ord_')) throw new Error('El pago no corresponde a un pedido de Autómata');
  if (dependencies.expectedOrderId && orderId !== dependencies.expectedOrderId) throw new Error('El pago no corresponde a este pedido');
  const order = await getOrderById(config, orderId);
  if (!order) throw new Error('Pedido de pago no encontrado');
  if (!paymentMatchesOrder(payment, order)) {
    await updateOrder(config, order.id, { payment_status: 'mismatch', provider_payment_id: String(payment.id ?? paymentId) });
    throw new Error('Los datos del pago no coinciden con el pedido');
  }

  const providerPaymentId = String(payment.id ?? paymentId);
  const paymentStatus = String(payment.status ?? 'unknown');
  if (['refunded', 'charged_back'].includes(paymentStatus)) {
    const reversed = await updateOrder(config, order.id, {
      status: 'payment_reversed', payment_status: paymentStatus, provider_payment_id: providerPaymentId
    });
    await recordLedger(config, {
      external_id: `mp-reversal-${providerPaymentId}`,
      order_id: order.id,
      kind: 'reversal',
      amount: -Number(order.amount),
      currency: order.currency,
      metadata: { provider: 'mercadopago', payment_status: paymentStatus }
    });
    return reversed;
  }

  if (paymentStatus !== 'approved') {
    return updateOrder(config, order.id, { payment_status: paymentStatus, provider_payment_id: providerPaymentId });
  }

  let paidOrder = order;
  if (order.status === 'awaiting_payment') {
    paidOrder = await updateOrder(config, order.id, {
      status: 'paid',
      payment_status: 'approved',
      provider_payment_id: providerPaymentId,
      paid_at: payment.date_approved || new Date().toISOString()
    }, 'awaiting_payment');
  }
  paidOrder ??= await getOrderById(config, order.id);
  await recordLedger(config, {
    external_id: `mp-payment-${providerPaymentId}`,
    order_id: order.id,
    kind: 'revenue',
    amount: Number(order.amount),
    currency: order.currency,
    metadata: { provider: 'mercadopago', payment_status: 'approved' }
  });
  return paidOrder;
}

export async function processOrder(config, orderId, dependencies = {}) {
  const generatedToday = await countReportsSince(config, midnightUtc());
  if (generatedToday >= config.maxPaidReportsPerDay) return { skipped: true, reason: 'límite_diario', orderId };

  const order = await getOrderById(config, orderId);
  if (!order || order.status !== 'paid') return { skipped: true, reason: 'pedido_no_disponible', orderId };
  const attempt = Number(order.attempts ?? 0) + 1;
  const claimed = await updateOrder(config, order.id, {
    status: 'processing', attempts: attempt, processing_at: new Date().toISOString(), last_error: null
  }, 'paid');
  if (!claimed) return { skipped: true, reason: 'pedido_tomado_por_otro_proceso', orderId };

  try {
    const generator = dependencies.generateReportImpl ?? generateReport;
    const result = await generator(config, claimed, dependencies);
    const delivered = await updateOrder(config, claimed.id, {
      status: 'delivered', report_markdown: result.markdown, delivered_at: new Date().toISOString(), generation_usage: result.usage
    }, 'processing');
    await recordLedger(config, {
      external_id: `generation-${claimed.id}-${attempt}`,
      order_id: claimed.id,
      kind: 'generation',
      amount: 0,
      currency: 'USD',
      metadata: result.usage
    });
    return { processed: true, orderId: claimed.id, status: delivered?.status ?? 'delivered' };
  } catch (error) {
    const exhausted = attempt >= config.maxReportAttempts;
    await updateOrder(config, claimed.id, {
      status: exhausted ? 'failed' : 'paid',
      last_error: String(error.message ?? error).slice(0, 500),
      processing_at: null
    }, 'processing');
    return { processed: false, orderId: claimed.id, status: exhausted ? 'failed' : 'paid', error: 'generación_no_completada' };
  }
}

export async function processNextPaidOrder(config, dependencies = {}) {
  const order = await nextPaidOrder(config);
  if (!order) return { skipped: true, reason: 'sin_pedidos_pagados' };
  return processOrder(config, order.id, dependencies);
}
