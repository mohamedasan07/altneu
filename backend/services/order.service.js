import { createHash, randomBytes, randomInt } from 'crypto';
import { ApiError } from '../utils/apiError.js';
import { logger } from '../utils/logger.js';
import {
  findActiveCartByUser,
  findCartItems,
} from '../repositories/cart.repository.js';
import { findProductById } from '../repositories/product.repository.js';
import {
  findOrderByNumber,
  insertOrder,
  insertOrderItems,
  deleteOrderById,
  markCartCheckedOut,
  decrementStock,
  restoreStock,
  findOrderById,
  findOrdersByUser,
  cancelOrderById,
} from '../repositories/order.repository.js';
import {
  validateOrderPayload,
  computeOrderPricing,
  parseOrderId,
  DELIVERY_OPTIONS,
  CURRENCY,
} from '../validators/order.validator.js';
import { recordOrderHistory, getOrderHistory } from './orderHistory.service.js';

/**
 * Order service (Sprint 21.3 Phase 3).
 *
 * Owns all checkout business logic: loading the caller's cart, verifying
 * products/stock/active status, recomputing every money value server-side
 * (never trust client totals), the sequenced write for order placement, the
 * idempotency anchor, and the compensating rollback when any step fails.
 *
 * Placement sequence (Supabase has no server-side transactions, so this is a
 * clear-then-set write with compensation, per the audit §5.2):
 *   1. validate + load cart + verify products/stock (read-only)
 *   2. compute totals from database prices
 *   3. generate order_number (deterministic from the idempotency key) + replay
 *      check
 *   4. conditional stock decrement for every line (CAS — never oversells)
 *   5. insert orders
 *   6. insert order_items
 *   7. mark cart checked_out
 *   8. record the initial 'pending'/'system' history row (best-effort)
 * Any failure after a write restores the decremented stock and deletes the
 * order row (order_items + history cascade via FK), so no partial order ever
 * persists.
 */

/** Build a consistent 500 for failed database operations. */
function toDbError(action, result) {
  logger.error(`[orders] ${action} failed: ${result?.reason || 'unknown error'}`);
  const err = new ApiError(500, `Unable to ${action}. Please try again.`);
  err.detail = result?.reason;
  return err;
}

/** Statuses a customer may cancel before fulfilment begins (Sprint 22.5 P2). */
const CANCELLABLE_STATUSES = ['pending', 'confirmed', 'processing'];

/** "US-YYYYMMDD-XXXXXXXX" — unique, human-readable order number. */
function orderNumberFor(idempotencyKey) {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  if (idempotencyKey) {
    // Deterministic from the key: a retry with the same key resolves to the
    // same order_number, which the unique constraint + replay check dedupe.
    const hash = createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 8).toUpperCase();
    return `US-${ymd}-${hash}`;
  }
  return `US-${ymd}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

/** Generate 8-char customer-facing order number (ALT + YY + 3 chars A-Z,0-9) */
function generateAltneuNumber() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let randomPart = '';
  for (let i = 0; i < 3; i++) {
    randomPart += chars.charAt(randomInt(chars.length));
  }
  const year = String(new Date().getFullYear()).slice(-2);
  return `ALT${year}${randomPart}`;
}

/** Best-effort rollback of previously decremented stock lines. */
async function compensateStock(lines) {
  for (const line of lines) {
    const restored = await restoreStock(line.productId, line.quantity);
    if (!restored.ok) {
      logger.warn(`[orders] stock rollback failed for product ${line.productId}: ${restored.reason}`);
    }
  }
}

/** Roll back the whole placement: stock first, then the order row. */
async function compensatePlacement(orderId, decremented) {
  await compensateStock(decremented);
  if (orderId) {
    const removed = await deleteOrderById(orderId);
    if (!removed.ok) {
      logger.warn(`[orders] order ${orderId} rollback failed: ${removed.reason}`);
    }
  }
}

/** Map a joined order row (+ items) to the public order shape. */
export function normalizeOrder(row) {
  if (!row) return null;
  const address = row.shipping_address || {};
  const contact = row.contact || {};
  const delivery = contact.delivery || {};
  const items = (row.items || []).map((it) => ({
    id: it.id,
    productId: it.product_id,
    name: it.name || 'Untitled',
    price: Number(it.price_at_order) || 0,
    imageUrl: it.image_url || '',
    size: it.size || '',
    color: it.color || '',
    colorName: it.color_name || '',
    quantity: it.quantity,
  }));
  const count = items.reduce((sum, it) => sum + it.quantity, 0);
  return {
    id: row.id,
    orderNumber: row.order_number,
    altneuNumber: row.altneu_number || null,
    status: row.status,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    totals: {
      count,
      subtotal: Number(row.subtotal) || 0,
      discount: Number(row.discount) || 0,
      shipping: Number(row.shipping) || 0,
      tax: Number(row.tax) || 0,
      taxable: (Number(row.subtotal) || 0) - (Number(row.discount) || 0),
      grandTotal: Number(row.grand_total) || 0,
    },
    currency: row.currency || CURRENCY,
    couponCode: row.coupon_code || null,
    shipping: {
      name: address.name || '',
      phone: address.phone || '',
      email: address.email || '',
      line1: address.line1 || '',
      line2: address.line2 || '',
      city: address.city || '',
      state: address.state || '',
      pincode: address.pincode || '',
      country: address.country || '',
    },
    contact: {
      name: contact.name || '',
      phone: contact.phone || '',
      email: contact.email || '',
    },
    delivery: {
      id: delivery.id || 'standard',
      label: delivery.label || DELIVERY_OPTIONS.standard.label,
      note: delivery.note || DELIVERY_OPTIONS.standard.note,
      etaDays: delivery.etaDays ?? DELIVERY_OPTIONS.standard.etaDays,
    },
    notes: contact.notes || '',
    items,
    placedAt: row.placed_at || row.created_at || null,
  };
}

/**
 * GET /api/customer/orders — the customer's order history, newest first.
 * @param {string} userId
 * @returns {Promise<Array>} normalized orders
 */
export async function listOrders(userId) {
  const result = await findOrdersByUser(userId);
  if (!result.ok) throw toDbError('load orders', result);
  return (result.data || []).map(normalizeOrder);
}

/**
 * GET /api/customer/orders/:id — a single order with its items.
 * Ownership-guarded: returns 404 when the order does not belong to the caller.
 *
 * Sprint 22.5 Phase 3: attaches `order.history` ({ status, by, at } per entry,
 * oldest first) from the real order_status_history rows so the storefront
 * timeline is truthful. Additive and backward compatible — the history load is
 * defensive: if it ever fails the order still returns with `history: []`.
 *
 * @param {string} userId
 * @param {string} orderId
 * @returns {Promise<object>} normalized order
 */
export async function getOrder(userId, orderId) {
  const id = parseOrderId(orderId);
  const result = await findOrderById(id, userId);
  if (!result.ok) throw toDbError('load order', result);
  if (!result.data) throw new ApiError(404, 'Order not found');
  const order = normalizeOrder(result.data);
  try {
    order.history = await getOrderHistory(id);
  } catch (err) {
    logger.warn(`[orders] history load failed for order ${id}: ${err.message}`);
    order.history = [];
  }
  return order;
}

/**
 * PATCH /api/customer/orders/:id/cancel — customer self-service cancellation.
 *
 * Guards + side effects (Sprint 22.5 Phase 2):
 *   1. Ownership: the order must belong to req.user.id (404 otherwise). The
 *      user id never comes from the request body.
 *   2. Already cancelled → 200 no-op replay (no stock restore, no history).
 *   3. Not in a cancellable status (pending/confirmed/processing) → 400.
 *   4. Compare-and-swap transition: the single CAS gate. Only one concurrent
 *      cancellation wins the `WHERE status = <expected>` update; a loser
 *      re-reads and replays the cancelled order, so stock is restored exactly
 *      once and exactly one cancelled history row is written.
 *   5. Stock restored per line via the shared restoreStock (same helper as
 *      checkout compensation — best-effort, logged on failure).
 *   6. Truthful history recorded only after the successful transition
 *      (recordOrderHistory, orderHistory.service.js).
 *
 * @param {string} userId
 * @param {string} orderId
 * @returns {Promise<object>} normalized order with status 'cancelled'
 * @throws {ApiError} 400 invalid id / not cancellable, 404 not found or not owned
 */
export async function cancelOrder(userId, orderId) {
  const id = parseOrderId(orderId);
  const result = await findOrderById(id, userId);
  if (!result.ok) throw toDbError('load order', result);
  const order = result.data;
  if (!order) throw new ApiError(404, 'Order not found');

  // Idempotent: a repeated cancellation is a safe 200 no-op.
  if (order.status === 'cancelled') {
    return normalizeOrder(order);
  }
  if (!CANCELLABLE_STATUSES.includes(order.status)) {
    throw new ApiError(400, 'This order can no longer be cancelled');
  }

  // CAS transition — the winner restores stock and records history exactly once.
  const updated = await cancelOrderById(id, userId, order.status);
  if (!updated.ok) throw toDbError('cancel order', updated);

  if (!updated.data) {
    // CAS lost → a concurrent cancel (or admin transition) won. Re-read and
    // replay the cancelled order instead of touching stock or history again.
    const recheck = await findOrderById(id, userId);
    if (!recheck.ok) throw toDbError('load order', recheck);
    if (recheck.data && recheck.data.status === 'cancelled') {
      return normalizeOrder(recheck.data);
    }
    throw new ApiError(400, 'This order can no longer be cancelled');
  }

  // Winner: restore stock for every line (order_items quantities preserved —
  // the order row itself is untouched beyond status).
  for (const item of order.items || []) {
    const restored = await restoreStock(item.product_id, item.quantity);
    if (!restored.ok) {
      logger.warn(`[orders] stock restore on cancel failed for product ${item.product_id}: ${restored.reason}`);
    }
  }

  // Truthful history — only after the successful transition, exactly once.
  try {
    await recordOrderHistory(id, 'cancelled', 'customer');
  } catch (err) {
    logger.warn(`[orders] history record on cancel failed for order ${id}: ${err.message}`);
  }

  return normalizeOrder(updated.data);
}

/**
 * POST /api/customer/orders — place an order from the caller's active cart.
 *
 * Never trusts client totals: subtotal is recomputed from database product
 * prices; discount/shipping/tax/grand-total come from computeOrderPricing.
 * Idempotency: an idempotencyKey (client UUID) is folded into the order_number,
 * so a browser refresh or double-click with the same key replays the original
 * order instead of creating a second one.
 *
 * @param {string} userId
 * @param {object} input  validated checkout payload
 * @returns {Promise<{ order: object, replayed: boolean }>}
 */
export async function placeOrder(userId, input) {
  const payload = validateOrderPayload(input);

  // --- idempotency FIRST: a retry (browser refresh / double-click) with the
  // same key replays the original order before we touch the cart or stock.
  // The order_number is derived deterministically from the key, so the same
  // key always resolves to the same order even after the cart is checked out.
  const orderNumber = orderNumberFor(payload.idempotencyKey);
  if (payload.idempotencyKey) {
    const existing = await findOrderByNumber(orderNumber);
    if (!existing.ok) throw toDbError('check order', existing);
    if (existing.data) {
      if (existing.data.user_id !== userId) {
        throw new ApiError(400, 'This idempotency key is already in use');
      }
      return { order: normalizeOrder(existing.data), replayed: true };
    }
  }

  // --- load the caller's active cart ---
  const cartResult = await findActiveCartByUser(userId);
  if (!cartResult.ok) throw toDbError('load cart', cartResult);
  const cart = cartResult.data;
  if (!cart) throw new ApiError(400, 'Your cart is empty');

  const linesResult = await findCartItems(cart.id);
  if (!linesResult.ok) throw toDbError('load cart items', linesResult);
  const lines = (linesResult.data || []).filter((l) => l.quantity > 0);
  if (lines.length === 0) throw new ApiError(400, 'Your cart is empty');

  // --- verify products + recompute subtotal from the database ---
  const verified = [];
  let subtotal = 0;
  for (const line of lines) {
    const productResult = await findProductById(line.product_id);
    if (!productResult.ok) throw toDbError('validate product', productResult);
    const product = productResult.data;
    if (!product) throw new ApiError(404, `Product not found (id ${line.product_id})`);
    if (product.is_active === false) {
      throw new ApiError(400, `"${product.name}" is no longer available`);
    }
    const stock = Number(product.stock_quantity) || 0;
    if (line.quantity > stock) {
      throw new ApiError(400, `Only ${stock} units of "${product.name}" are available`);
    }
    subtotal += Number(product.price) * line.quantity;
    verified.push({ ...line, product, price: Number(product.price) });
  }
  subtotal = Math.round(subtotal * 100) / 100;

  // --- server-side totals ---
  const pricing = computeOrderPricing(subtotal, payload.delivery, payload.couponCode);

  // --- snapshot the shipping + contact info for the order ---
  const shippingSnapshot = {
    name: payload.shipping.name,
    phone: payload.shipping.phone,
    email: payload.shipping.email,
    line1: payload.shipping.line1,
    line2: payload.shipping.line2,
    city: payload.shipping.city,
    state: payload.shipping.state,
    pincode: payload.shipping.pincode,
    country: payload.shipping.country,
  };
  const deliveryOption = DELIVERY_OPTIONS[payload.delivery];
  const contactSnapshot = {
    name: payload.shipping.name,
    phone: payload.shipping.phone,
    email: payload.shipping.email,
    delivery: {
      id: deliveryOption.id,
      label: deliveryOption.label,
      note: deliveryOption.note,
      etaDays: deliveryOption.etaDays,
    },
    notes: payload.notes,
  };

  // --- step 4: conditional stock decrement (CAS, never oversells) ---
  const decremented = [];
  for (const line of verified) {
    const result = await decrementStock(line.product_id, line.quantity);
    if (!result.ok) {
      await compensateStock(decremented);
      throw toDbError('reserve stock', result);
    }
    if (!result.data) {
      // Insufficient stock (or product vanished) — roll back what we took.
      await compensateStock(decremented);
      throw new ApiError(400, `Not enough stock for "${line.product.name}"`);
    }
    decremented.push({ productId: line.product_id, quantity: line.quantity });
  }

  // --- step 5: insert the order ---
  let created;
  let attempts = 0;
  const MAX_ATTEMPTS = 5;

  while (attempts < MAX_ATTEMPTS) {
    const altneuNumber = generateAltneuNumber();
    created = await insertOrder({
      user_id: userId,
      order_number: orderNumber,
      altneu_number: altneuNumber,
      status: 'pending',
      payment_status: 'pending',
      payment_method: payload.payment,
      subtotal: pricing.subtotal,
      discount: pricing.discount,
      shipping: pricing.shipping,
      tax: pricing.tax,
      grand_total: pricing.grandTotal,
      currency: CURRENCY,
      coupon_code: payload.couponCode,
      shipping_address: shippingSnapshot,
      contact: contactSnapshot,
    });

    if (!created.ok) {
      if (created.code === '23505') {
        const errStr = (created.reason || '').toLowerCase();
        // If the error specifically mentions the altneu_number constraint, retry
        if (errStr.includes('altneu_number')) {
          attempts++;
          continue;
        }

        // A concurrent double-submit with the same key hits the unique
        // order_number constraint (code 23505) — replay the winner instead of
        // failing, rolling back the stock this attempt reserved.
        const existing = await findOrderByNumber(orderNumber);
        if (existing.ok && existing.data && existing.data.user_id === userId) {
          await compensateStock(decremented);
          return { order: normalizeOrder(existing.data), replayed: true };
        }
      }
      break; // Not a recoverable error, break the loop and fail.
    }
    break; // Success!
  }

  if (!created || !created.ok) {
    await compensatePlacement(null, decremented);
    throw toDbError('create order', created);
  }
  const order = created.data;

  // --- step 6: insert order_items snapshots ---
  const itemsResult = await insertOrderItems(
    verified.map((line) => ({
      order_id: order.id,
      product_id: line.product_id,
      name: line.product.name,
      price_at_order: line.price,
      image_url: line.product.image_url || '',
      size: line.size || '',
      color: line.color || '',
      color_name: line.color_name || '',
      quantity: line.quantity,
    }))
  );
  if (!itemsResult.ok) {
    await compensatePlacement(order.id, decremented);
    throw toDbError('save order items', itemsResult);
  }

  // --- step 7: mark the cart checked_out (idempotent — active→checked_out) ---
  const checkedOut = await markCartCheckedOut(cart.id);
  if (!checkedOut.ok) {
    await compensatePlacement(order.id, decremented);
    throw toDbError('finalize cart', checkedOut);
  }

  const fullResult = await findOrderById(order.id, userId);
  if (!fullResult.ok) throw toDbError('load order', fullResult);
  if (!fullResult.data) {
    await compensatePlacement(order.id, decremented);
    throw toDbError('load order', { ok: false, reason: 'order missing after placement' });
  }

  // --- step 8: initial 'pending'/'system' history row. The order is fully
  // committed here, so this is best-effort (same convention as customer-cancel
  // and admin transitions): a failed history write must never fail or duplicate
  // a successfully placed order, and neither replay path above can reach this
  // line, so a retry with the same idempotency key can never write a second row.
  // created_at uses the history service's normal default (now()) — placement
  // never computes its own placedAt (the orders table defaults it).
  try {
    await recordOrderHistory(order.id, 'pending', 'system');
  } catch (err) {
    logger.warn(`[orders] initial history record failed for order ${order.id}: ${err.message}`);
  }

  return { order: normalizeOrder(fullResult.data), replayed: false };
}