import { ApiError } from '../utils/apiError.js';
import { logger } from '../utils/logger.js';
import {
  findAllOrders,
  findOrderByIdAdmin,
  updateOrderStatus,
  updateOrderPaymentStatus,
  updateOrderTracking,
  adminCancelOrderAtomic,
} from '../repositories/adminOrder.repository.js';
import { findRefundIntentById } from '../repositories/refund.repository.js';
import { processRefundIntent } from './refund.service.js';
import { parseOrderId } from '../validators/order.validator.js';
import {
  parseAdminOrderQuery,
  validateStatusUpdatePayload,
  validatePaymentStatusUpdatePayload,
  validateTrackingUpdatePayload,
} from '../validators/adminOrder.validator.js';
import { normalizeOrder } from './order.service.js';
import {
  getOrderHistory,
  recordOrderHistory,
} from './orderHistory.service.js';

/**
 * Admin order service (Sprint 22.1 Phases 1–2; Sprint 22.5 Phase 5 history).
 *
 * Admin order listing, detail, and status/payment updates. Reuses the customer
 * module's normalizeOrder (exported, unmodified) so the admin and customer
 * order shapes are identical, and parseOrderId for the same UUID validation.
 * All query values are allowlisted by parseAdminOrderQuery and all writes are
 * allowlisted by the update validators before they reach the repository.
 * Writes only ever set the two status columns — everything else is untouched.
 *
 * Sprint 22.5 Phase 5: admin detail and PATCH responses gain an additive
 * `history` array from the real order_status_history rows (same shape the
 * customer detail exposes: { status, by, at }, oldest first). Successful admin
 * status transitions additionally record exactly one history row (by_role
 * 'admin'); payment-status changes are not order-status transitions and record
 * nothing. Existing fields are unchanged.
 */

/** Build a consistent 500 for failed database operations. */
function toDbError(action, result) {
  logger.error(`[admin-orders] ${action} failed: ${result?.reason || 'unknown error'}`);
  const err = new ApiError(500, `Unable to ${action}. Please try again.`);
  err.detail = result?.reason;
  return err;
}

/**
 * Admin-only order projection: the shared customer shape (normalizeOrder) plus
 * the DB timestamps the admin UI needs (created/updated) and the customer
 * response deliberately omits. Keeps normalizeOrder — and therefore the
 * customer order endpoints — completely untouched.
 * @param {object} row  raw order row (with created_at / updated_at columns)
 * @returns {object} normalized order with createdAt / updatedAt
 */
function adminOrderFor(row) {
  return {
    ...normalizeOrder(row),
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

/**
 * Attach the order's real status-history timeline (additive, defensive).
 * Mirrors the customer detail endpoint (Sprint 22.5 Phase 3): a history load
 * failure degrades to `history: []` instead of failing the whole request.
 * @param {string} orderId  order uuid
 * @param {object} order    normalized admin order (mutated with `.history`)
 * @returns {Promise<object>} the same order with `.history` attached
 */
async function withHistory(orderId, order) {
  try {
    order.history = await getOrderHistory(orderId);
  } catch (err) {
    logger.warn(`[admin-orders] history load failed for order ${orderId}: ${err.message}`);
    order.history = [];
  }
  return order;
}

/**
 * GET /api/admin/orders — paginated admin order list.
 * @param {object} query  req.query (page, limit, search, status, paymentStatus, sort, order)
 * @returns {Promise<{ orders: Array, pagination: { page, limit, total, totalPages } }>}
 */
export async function listAdminOrders(query = {}) {
  const params = parseAdminOrderQuery(query);
  const offset = (params.page - 1) * params.limit;

  const result = await findAllOrders({
    status: params.status,
    paymentStatus: params.paymentStatus,
    search: params.search,
    sort: params.sort,
    order: params.order,
    offset,
    limit: params.limit,
  });
  if (!result.ok) throw toDbError('load orders', result);

  const orders = (result.data || []).map(adminOrderFor);
  const total = Number(result.count) || 0;

  return {
    orders,
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / params.limit)),
    },
  };
}

/**
 * GET /api/admin/orders/:id — a single order with its items.
 * No ownership guard: admins may view every order.
 * @param {string} orderId
 * @returns {Promise<object>} normalized order (with createdAt / updatedAt)
 * @throws {ApiError} 400 invalid id, 404 when not found
 */
export async function getAdminOrder(orderId) {
  const id = parseOrderId(orderId);
  const result = await findOrderByIdAdmin(id);
  if (!result.ok) throw toDbError('load order', result);
  if (!result.data) throw new ApiError(404, 'Order not found');
  return withHistory(id, adminOrderFor(result.data));
}

/**
 * Cancel an order as an authorized administrator.
 * Restores inventory exactly once, and for paid orders creates a durable refund intent.
 *
 * @param {string} orderId
 * @param {object} [body]  { reason, idempotencyKey }
 * @returns {Promise<object>} normalized updated order (with history)
 * @throws {ApiError} 400 when invalid or delivered, 404 when not found
 */
export async function cancelAdminOrder(orderId, body = {}) {
  const id = parseOrderId(orderId);
  const reason = body?.reason ? String(body.reason).trim().slice(0, 500) : 'Admin-initiated order cancellation';
  const idempotencyKey = body?.idempotencyKey ? String(body.idempotencyKey).trim() : null;

  const existing = await findOrderByIdAdmin(id);
  if (!existing.ok) throw toDbError('load order', existing);
  if (!existing.data) throw new ApiError(404, 'Order not found');

  const order = existing.data;

  // Idempotent return if already cancelled or refunded
  if (order.status === 'cancelled' || order.status === 'refunded') {
    return withHistory(id, adminOrderFor(order));
  }

  // Only pre-fulfilment orders may be cancelled. Shipped or delivered orders cannot be cancelled.
  if (['shipped', 'delivered'].includes(order.status)) {
    throw new ApiError(400, `Orders in '${order.status}' status cannot be cancelled. Initiate a return workflow instead.`);
  }

  const cancelResult = await adminCancelOrderAtomic({
    orderId: id,
    reason,
    idempotencyKey,
  });

  if (!cancelResult.ok) {
    if (cancelResult.missingRpc) {
      logger.error('[admin-orders] Atomic cancellation RPC admin_cancel_order_atomic is unavailable. Migration 016 required. Failing closed.');
      throw new ApiError(
        503,
        'Admin order cancellation is temporarily unavailable: Database Migration 016 (admin_cancel_order_atomic) must be applied to the database before orders can be cancelled.'
      );
    }
    if (cancelResult.reason === 'order_not_found') {
      throw new ApiError(404, 'Order not found');
    }
    if (cancelResult.reason === 'order_already_dispatched' || cancelResult.reason === 'order_already_delivered') {
      throw new ApiError(400, 'Orders that have been shipped or delivered cannot be cancelled');
    }
    throw toDbError('cancel order', cancelResult);
  }

  // If paid order and refund intent created, trigger durable refund processor (non-blocking)
  if (cancelResult.data?.is_paid && cancelResult.data?.refund_intent_id) {
    try {
      const intentRes = await findRefundIntentById(cancelResult.data.refund_intent_id);
      if (intentRes.ok && intentRes.data && intentRes.data.status === 'pending') {
        processRefundIntent(intentRes.data, 'admin_cancel_worker').catch((err) => {
          logger.warn(`[admin-orders] background refund processing error for intent ${cancelResult.data.refund_intent_id}: ${err.message}`);
        });
      }
    } catch (e) {
      logger.warn(`[admin-orders] could not trigger immediate refund processing: ${e.message}`);
    }
  }

  const fresh = await findOrderByIdAdmin(id);
  if (!fresh.ok) throw toDbError('load order', fresh);
  return withHistory(id, adminOrderFor(fresh.data || cancelResult.data?.order || order));
}

/**
 * PATCH /api/admin/orders/:id/status — update the fulfilment status.
 *
 * A real transition (new status differs from the current one) updates the
 * order and records exactly one history row (status = new status, by_role =
 * 'admin'). A same-status PATCH is a no-op that returns the order unchanged
 * and records nothing, so duplicate history rows are impossible.
 * Transitioning to 'cancelled' delegates to the atomic admin cancellation workflow.
 * Setting 'refunded' directly is prohibited per gateway confirmation requirements.
 *
 * @param {string} orderId
 * @param {object} body  { status, reason } (allowlisted by the validator)
 * @returns {Promise<object>} normalized updated order (with createdAt / updatedAt / history)
 * @throws {ApiError} 400 invalid id or status, 404 when not found
 */
export async function updateAdminOrderStatus(orderId, body) {
  const payload = validateStatusUpdatePayload(body);
  const id = parseOrderId(orderId);

  // Prohibit manual direct assignment of 'refunded'
  if (payload.status === 'refunded') {
    throw new ApiError(
      400,
      'Orders cannot be marked refunded directly. Admin cancellation creates a durable refund intent that is marked refunded only upon gateway confirmation.'
    );
  }

  // Read the current order first so a transition is only recorded when the
  // status actually changes and 404s surface before any write.
  const existing = await findOrderByIdAdmin(id);
  if (!existing.ok) throw toDbError('load order', existing);
  if (!existing.data) throw new ApiError(404, 'Order not found');
  if (existing.data.status === payload.status) {
    return withHistory(id, adminOrderFor(existing.data));
  }

  // Prohibit resurrecting a cancelled or refunded order
  if (existing.data.status === 'cancelled' || existing.data.status === 'refunded') {
    throw new ApiError(400, `Cannot update status: order is already ${existing.data.status}`);
  }

  // If transitioning to cancelled, invoke the atomic admin cancellation workflow
  if (payload.status === 'cancelled') {
    return await cancelAdminOrder(id, body);
  }

  const result = await updateOrderStatus(id, payload.status);
  if (!result.ok) throw toDbError('update order status', result);
  if (!result.data) throw new ApiError(404, 'Order not found');

  // Record exactly one admin transition row after the successful update.
  try {
    await recordOrderHistory(id, payload.status, 'admin');
  } catch (err) {
    logger.warn(`[admin-orders] history record failed for order ${id}: ${err.message}`);
  }

  return withHistory(id, adminOrderFor(result.data));
}

/**
 * PATCH /api/admin/orders/:id/payment — update the payment status.
 * Payment status is not an order-status transition, so no history row is
 * recorded. History is still attached so the drawer timeline stays intact.
 * Setting 'refunded' directly is prohibited per gateway confirmation requirements.
 *
 * @param {string} orderId
 * @param {object} body  { paymentStatus } (allowlisted by the validator)
 * @returns {Promise<object>} normalized updated order (with createdAt / updatedAt / history)
 * @throws {ApiError} 400 invalid id or paymentStatus, 404 when not found
 */
export async function updateAdminOrderPaymentStatus(orderId, body) {
  const payload = validatePaymentStatusUpdatePayload(body);
  const id = parseOrderId(orderId);

  // Prohibit manual direct assignment of 'refunded'
  if (payload.paymentStatus === 'refunded') {
    throw new ApiError(
      400,
      'Payment status cannot be marked refunded directly. Refunds are verified through gateway reconciliation.'
    );
  }

  const result = await updateOrderPaymentStatus(id, payload.paymentStatus);
  if (!result.ok) throw toDbError('update order payment status', result);
  if (!result.data) throw new ApiError(404, 'Order not found');
  return withHistory(id, adminOrderFor(result.data));
}

/**
 * PATCH /api/admin/orders/:id/tracking — update the tracking data.
 * @param {string} orderId
 * @param {object} body  request payload
 * @returns {Promise<object>} normalized updated order
 * @throws {ApiError} 400 invalid id/payload, 404 when not found
 */
export async function updateAdminOrderTracking(orderId, body) {
  const payload = validateTrackingUpdatePayload(body);
  const id = parseOrderId(orderId);
  const result = await updateOrderTracking(id, payload);
  if (!result.ok) throw toDbError('update order tracking', result);
  if (!result.data) throw new ApiError(404, 'Order not found');
  return withHistory(id, adminOrderFor(result.data));
}