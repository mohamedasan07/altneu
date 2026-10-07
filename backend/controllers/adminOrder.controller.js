import {
  listAdminOrders,
  getAdminOrder,
  updateAdminOrderStatus,
  updateAdminOrderPaymentStatus,
  updateAdminOrderTracking,
} from '../services/adminOrder.service.js';

/**
 * Admin order HTTP handlers (Sprint 22.1 Phases 1–2).
 * Controllers stay thin: parse the request, delegate to the service, shape the
 * response. Errors thrown by the service (400/404/500) are forwarded to the
 * centralized errorHandler by the asyncHandler wrapper in the route file.
 */

/** GET /api/admin/orders — paginated, filtered order list. */
export async function listAdminOrdersHandler(req, res) {
  const { orders, pagination } = await listAdminOrders(req.query);
  res.json({ success: true, orders, pagination });
}

/** GET /api/admin/orders/:id — one order with its items. */
export async function getAdminOrderHandler(req, res) {
  const order = await getAdminOrder(req.params.id);
  res.json({ success: true, order });
}

/** PATCH /api/admin/orders/:id/status — update the fulfilment status. */
export async function updateOrderStatusHandler(req, res) {
  const order = await updateAdminOrderStatus(req.params.id, req.body);
  res.json({ success: true, order });
}

/** PATCH /api/admin/orders/:id/payment — update the payment status. */
export async function updateOrderPaymentStatusHandler(req, res) {
  const order = await updateAdminOrderPaymentStatus(req.params.id, req.body);
  res.json({ success: true, order });
}

/** PATCH /api/admin/orders/:id/tracking — update the tracking fields. */
export async function updateOrderTrackingHandler(req, res) {
  const order = await updateAdminOrderTracking(req.params.id, req.body);
  res.json({ success: true, order });
}