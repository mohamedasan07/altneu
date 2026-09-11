// ALTNEU — order API client (Sprint 21.3 Phase 4).
//
// All three calls talk to the customer order API, mounted at
// /api/customer/orders. The shared request() helper attaches the customer JWT,
// so only authenticated customers can list, view or place orders. Server
// responses are authoritative — the backend recomputes every money value from
// database prices and the client never sends totals.

import { request } from './api';

/** GET /api/customer/orders — the current customer's order history. */
export async function fetchOrders() {
  const data = await request('/api/customer/orders');
  return Array.isArray(data.orders) ? data.orders : [];
}

/** GET /api/customer/orders/:id — a single order with its items. */
export async function fetchOrder(id) {
  const data = await request(`/api/customer/orders/${id}`);
  return data.order;
}

/**
 * POST /api/customer/orders — place an order from the active cart.
 *
 * The backend recomputes totals and validates stock; the client only sends
 * shipping, contact (via shipping), the delivery option, the payment method,
 * the coupon code and an idempotency key for double-submit protection.
 *
 * @param {{
 *   shipping: { name, phone, email, line1, line2, city, state, pincode, country },
 *   delivery: string,
 *   payment: string,
 *   coupon: string|null,
 *   notes: string,
 *   idempotencyKey: string,
 * }} payload
 * @returns {Promise<{ order: object, replayed: boolean }>}
 */
export async function placeOrder(payload) {
  const data = await request('/api/customer/orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return { order: data.order, replayed: Boolean(data.replayed) };
}

/**
 * PATCH /api/customer/orders/:id/cancel — cancel an own, cancellable order.
 *
 * The backend enforces ownership, cancellable status and idempotency; the
 * client only sends the order id. Throws on error (400 not cancellable, 404
 * not found, 500) exactly like every other service call via the shared
 * request() helper. Returns the updated (cancelled) order.
 */
export async function cancelOrder(id) {
  const data = await request(`/api/customer/orders/${id}/cancel`, { method: 'PATCH' });
  return data.order;
}