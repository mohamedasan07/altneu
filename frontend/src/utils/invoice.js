// ALTNEU — invoice view helpers (Sprint 22.5 Phase 4).
//
// Pure view logic: whether an order has enough snapshot data for an invoice,
// and neutral display labels for statuses / payment methods. Nothing here
// invents data — an unset value maps to an empty string and the caller omits
// the row rather than fabricating a placeholder.

import { PAYMENT_METHODS } from '../hooks/useCheckout';
import { ORDER_STATUSES } from '../components/orders/OrderStatusBadge/OrderStatusBadge';

const PAYMENT_STATUS_LABELS = {
  pending: 'Pending',
  paid: 'Paid',
  failed: 'Failed',
  refunded: 'Refunded',
};

/** An order is invoice-ready once it has at least one item snapshot. */
export function canShowInvoice(order) {
  return Boolean(order && Array.isArray(order.items) && order.items.length > 0);
}

export function paymentMethodLabel(id) {
  return PAYMENT_METHODS.find((m) => m.id === id)?.label || '';
}

export function paymentStatusLabel(status) {
  return PAYMENT_STATUS_LABELS[status] ?? '';
}

export function orderStatusLabel(status) {
  return ORDER_STATUSES[status]?.label ?? '';
}

export function formatInvoiceDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}