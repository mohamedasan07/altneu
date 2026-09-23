import {
  listOrders,
  getOrder,
  placeOrder,
  cancelOrder,
} from '../services/order.service.js';

/**
 * Order HTTP handlers (Sprint 21.3 Phase 3).
 * Controllers stay thin: parse the request, delegate to the service, shape the
 * response. Errors thrown by the service (400/404/500) are forwarded to the
 * centralized errorHandler by the asyncHandler wrapper in the route file.
 */

/** Resolve who owns this request: customer JWT wins, else guest sessionId. */
function resolveOwner(req) {
  if (req.user?.id) return { user_id: req.user.id };
  const sessionId = req.body?.sessionId ?? req.query?.sessionId;
  return { session_id: sessionId };
}

/** GET /api/customer/orders — the current customer's order history. */
export async function listOrdersHandler(req, res) {
  const orders = await listOrders(req.user.id);
  res.json({ success: true, orders });
}

/** GET /api/customer/orders/:id — one order with its items. */
export async function getOrderHandler(req, res) {
  const order = await getOrder(req.user.id, req.params.id);
  res.json({ success: true, order });
}

/** POST /api/customer/orders — place an order from the active cart. */
export async function createOrderHandler(req, res) {
  const { order, replayed } = await placeOrder(resolveOwner(req), req.body);
  res.status(replayed ? 200 : 201).json({ success: true, order, replayed });
}

/** PATCH /api/customer/orders/:id/cancel — cancel an own, cancellable order. */
export async function cancelOrderHandler(req, res) {
  const order = await cancelOrder(req.user.id, req.params.id);
  res.json({ success: true, order });
}