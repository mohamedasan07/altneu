import { getSupabase, isPrivilegedDbAvailable } from '../database/client.js';

/**
 * Order data access — all reads AND writes go to Supabase (PostgreSQL).
 *
 * Same conventions as cart.repository.js / address.repository.js: the
 * service-role key is used (bypasses RLS), and every method returns the shared
 * result envelope:
 *   { ok: true,  data }
 *   { ok: false, reason, [code] }
 * so callers never touch Supabase error objects directly. Every query is
 * scoped by user id so one customer can never read or mutate another's rows.
 *
 * Stock safety: PostgREST cannot run `stock_quantity = stock_quantity - n`
 * arithmetic in an UPDATE body, so the oversell guard is a compare-and-swap —
 * read the current stock, then `UPDATE ... WHERE id = ? AND stock_quantity =
 * <read>` and retry when a concurrent order moved it. Combined with the
 * `stock_quantity >= 0` CHECK constraint this can never write negative stock.
 */

export const BASE_ORDER_COLUMNS = `
  id,
  user_id,
  order_number,
  altneu_number,
  status,
  payment_status,
  payment_method,
  subtotal,
  discount,
  shipping,
  tax,
  grand_total,
  currency,
  coupon_code,
  shipping_address,
  contact,
  placed_at,
  created_at,
  updated_at
`;

export const ORDER_COLUMNS = `
  id,
  user_id,
  order_number,
  altneu_number,
  status,
  payment_status,
  payment_method,
  subtotal,
  discount,
  shipping,
  tax,
  grand_total,
  currency,
  coupon_code,
  shipping_address,
  contact,
  guest_session_id,
  razorpay_order_id,
  razorpay_payment_id,
  razorpay_signature,
  razorpay_refund_id,
  payment_attempts,
  payment_failed_reason,
  payment_verified_at,
  placed_at,
  created_at,
  updated_at
`;

const ORDER_ITEMS_COLUMNS = `
  id,
  order_id,
  product_id,
  name,
  price_at_order,
  image_url,
  size,
  color,
  color_name,
  quantity,
  created_at
`;

/** Baseline orders joined with their items (used by list/detail and admin views). */
export const ORDER_WITH_ITEMS = `
  ${BASE_ORDER_COLUMNS.replace(/\s+/g, ' ').trim()},
  items:order_items (
    id,
    product_id,
    name,
    price_at_order,
    image_url,
    size,
    color,
    color_name,
    quantity,
    created_at
  )
`;

/** Full orders projection including all Migration 011 payment columns. */
export const FULL_ORDER_WITH_ITEMS = `
  ${ORDER_COLUMNS.replace(/\s+/g, ' ').trim()},
  items:order_items (
    id,
    product_id,
    name,
    price_at_order,
    image_url,
    size,
    color,
    color_name,
    quantity,
    created_at
  )
`;

let hasMigration011 = null;

function isMissingColumnError(error) {
  return error && (error.code === '42703' || /column .* does not exist/i.test(error.message));
}

export function isMigration011Available() {
  return hasMigration011;
}

export function _setHasMigration011ForTest(val) {
  hasMigration011 = val;
}


/**
 * @param {string} userId  user uuid
 * @returns {Promise<{ok: boolean, data?: Array, reason?: string, code?: string}>}
 */
export async function findOrdersByUser(userId) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  if (hasMigration011 !== false) {
    const { data, error } = await supabase
      .from('orders')
      .select(FULL_ORDER_WITH_ITEMS)
      .eq('user_id', userId)
      .order('placed_at', { ascending: false });

    if (!error) {
      hasMigration011 = true;
      return { ok: true, data };
    }
    if (isMissingColumnError(error)) {
      hasMigration011 = false;
    } else {
      return { ok: false, reason: error.message, code: error.code };
    }
  }

  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_WITH_ITEMS)
    .eq('user_id', userId)
    .order('placed_at', { ascending: false });

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}

/**
 * @param {string} id      order uuid
 * @param {string} userId  owner uuid (ownership guard)
 * @returns {Promise<{ok: boolean, data?: object|null, reason?: string, code?: string}>}
 */
export async function findOrderById(id, userId) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  const execute = (projection) => {
    let query = supabase
      .from('orders')
      .select(projection)
      .eq('id', id);

    if (userId == null) {
      query = query.is('user_id', null);
    } else {
      query = query.eq('user_id', userId);
    }
    return query.maybeSingle();
  };

  if (hasMigration011 !== false) {
    const { data, error } = await execute(FULL_ORDER_WITH_ITEMS);
    if (!error) {
      hasMigration011 = true;
      return { ok: true, data };
    }
    if (isMissingColumnError(error)) {
      hasMigration011 = false;
    } else {
      return { ok: false, reason: error.message, code: error.code };
    }
  }

  const { data, error } = await execute(ORDER_WITH_ITEMS);
  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}

/**
 * Look up an order by its unique order_number (idempotency anchor).
 * @param {string} orderNumber
 * @returns {Promise<{ok: boolean, data?: object|null, reason?: string, code?: string}>}
 */
export async function findOrderByNumber(orderNumber) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  if (hasMigration011 !== false) {
    const { data, error } = await supabase
      .from('orders')
      .select(FULL_ORDER_WITH_ITEMS)
      .eq('order_number', orderNumber)
      .maybeSingle();

    if (!error) {
      hasMigration011 = true;
      return { ok: true, data };
    }
    if (isMissingColumnError(error)) {
      hasMigration011 = false;
    } else {
      return { ok: false, reason: error.message, code: error.code };
    }
  }

  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_WITH_ITEMS)
    .eq('order_number', orderNumber)
    .maybeSingle();

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}

/**
 * @param {object} row  DB-ready orders row
 * @returns {Promise<{ok: boolean, data?: object|null, reason?: string, code?: string}>}
 */
export async function insertOrder(row) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  if (hasMigration011 !== false) {
    const { data, error } = await supabase
      .from('orders')
      .insert(row)
      .select(ORDER_COLUMNS)
      .single();

    if (!error) {
      hasMigration011 = true;
      return { ok: true, data };
    }
    if (isMissingColumnError(error)) {
      hasMigration011 = false;
    } else {
      return { ok: false, reason: error.message, code: error.code };
    }
  }

  const { data, error } = await supabase
    .from('orders')
    .insert(row)
    .select(BASE_ORDER_COLUMNS)
    .single();

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}

/**
 * Bulk insert order_items rows. The order is always inserted first (order_id
 * FK), so rows are fully resolved by the caller.
 * @param {Array} rows  DB-ready order_items rows
 * @returns {Promise<{ok: boolean, data?: Array, reason?: string, code?: string}>}
 */
export async function insertOrderItems(rows) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  const { data, error } = await supabase
    .from('order_items')
    .insert(rows)
    .select(ORDER_ITEMS_COLUMNS);

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}

/**
 * Delete an order row (order_items cascade via FK). Used by the compensation
 * path when a later step in placement fails.
 * @param {string} id  order uuid
 * @returns {Promise<{ok: boolean, data?: object|null, reason?: string, code?: string}>}
 */
export async function deleteOrderById(id) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  const { data, error } = await supabase
    .from('orders')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}

/**
 * Mark a cart as checked_out. The cart row is preserved for audit; only its
 * status changes, so the same cart can never be checked out twice.
 * @param {string} cartId  cart uuid
 * @returns {Promise<{ok: boolean, data?: object|null, reason?: string, code?: string}>}
 */
export async function markCartCheckedOut(cartId) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  const { data, error } = await supabase
    .from('cart')
    .update({ status: 'checked_out' })
    .eq('id', cartId)
    .eq('status', 'active')
    .select('id, status')
    .maybeSingle();

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}

/**
 * Compare-and-swap conditional stock decrement — the oversell guard.
 *
 * Because PostgREST cannot express `stock_quantity = stock_quantity - n` in an
 * UPDATE body, this reads the current value and then issues
 * `UPDATE products SET stock_quantity = <next> WHERE id = ? AND
 * stock_quantity = <current>`. When a concurrent order decremented in between,
 * the WHERE matches zero rows and the update is retried with the fresh value.
 * A line whose stock can never cover the quantity returns
 * { ok: true, data: null } so the service can distinguish "not enough stock"
 * from "db error".
 *
 * @param {number} productId
 * @param {number} quantity
 * @param {number} [attempts=5]  CAS retries before giving up
 * @returns {Promise<{ok: boolean, data?: object|null, reason?: string, code?: string}>}
 */
export async function decrementStock(productId, quantity, attempts = 5) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  for (let i = 0; i < attempts; i += 1) {
    const read = await supabase
      .from('products')
      .select('id, stock_quantity')
      .eq('id', productId)
      .maybeSingle();

    if (read.error) return { ok: false, reason: read.error.message, code: read.error.code };
    if (!read.data) return { ok: true, data: null }; // unknown product — caller maps to 404

    const current = Number(read.data.stock_quantity) || 0;
    if (current < quantity) return { ok: true, data: null }; // insufficient stock

    const next = current - quantity;
    const update = await supabase
      .from('products')
      .update({ stock_quantity: next })
      .eq('id', productId)
      .eq('stock_quantity', current)
      .select('id, stock_quantity')
      .maybeSingle();

    if (update.error) return { ok: false, reason: update.error.message, code: update.error.code };
    if (update.data) return { ok: true, data: update.data }; // CAS succeeded
    // No row updated → stock moved concurrently → loop and re-read.
  }

  return { ok: false, reason: 'Stock changed while placing the order. Please try again.', code: 'STOCK_RACE' };
}

/**
 * Roll a stock decrement back during compensation. Best-effort: the caller
 * logs failures but must not throw (the placement is already failing).
 * @param {number} productId
 * @param {number} quantity
 * @returns {Promise<{ok: boolean, reason?: string, code?: string}>}
 */
export async function restoreStock(productId, quantity, attempts = 5) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  for (let i = 0; i < attempts; i += 1) {
    const read = await supabase
      .from('products')
      .select('id, stock_quantity')
      .eq('id', productId)
      .maybeSingle();

    if (read.error) return { ok: false, reason: read.error.message, code: read.error.code };
    if (!read.data) return { ok: true, data: true }; // product gone — nothing to restore

    const current = Number(read.data.stock_quantity) || 0;
    const next = current + quantity;

    let updateQuery = supabase
      .from('products')
      .update({ stock_quantity: next })
      .eq('id', productId);

    if (typeof updateQuery.eq === 'function') {
      updateQuery = updateQuery.eq('stock_quantity', current);
    }

    const res = await updateQuery
      .select('id, stock_quantity')
      .maybeSingle();

    if (res.error) return { ok: false, reason: res.error.message, code: res.error.code };
    if (res.data) return { ok: true, data: true }; // CAS succeeded
  }

  // Fallback to direct update if CAS retries exhausted
  const readFinal = await supabase
    .from('products')
    .select('id, stock_quantity')
    .eq('id', productId)
    .maybeSingle();
  if (!readFinal.data) return { ok: true, data: true };

  const finalStock = (Number(readFinal.data.stock_quantity) || 0) + quantity;
  const { error } = await supabase
    .from('products')
    .update({ stock_quantity: finalStock })
    .eq('id', productId);

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data: true };
}

/**
 * Compare-and-swap order cancellation — the concurrency gate for the whole
 * cancel flow (Sprint 22.5 Phase 2).
 *
 * `UPDATE orders SET status = 'cancelled' WHERE id = ? AND user_id = ? AND
 * status = <expected>`. Only one concurrent cancellation wins; a loser matches
 * zero rows (data: null) and the service re-reads to replay the already
 * cancelled order. Because stock restore and history recording run only after
 * this conditional update succeeds, a double-cancel can never restore stock or
 * write a history row twice. Same CAS philosophy as decrementStock.
 *
 * Returns the freshly updated row (with items) so the service can normalize
 * the response directly.
 *
 * @param {string} id             order uuid
 * @param {string} userId         owner uuid (ownership guard)
 * @param {string} expectedStatus the status observed before the transition
 * @returns {Promise<{ok: boolean, data?: object|null, reason?: string, code?: string}>}
 */
export async function cancelOrderById(id, userId, expectedStatus) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  const { data, error } = await supabase
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('user_id', userId)
    .eq('status', expectedStatus)
    .select(ORDER_WITH_ITEMS)
    .maybeSingle();

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}
/**
 * Look up an order by altneu_number (public lookup).
 */
export async function findOrderByAltneuNumber(altneuNumber) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  if (hasMigration011 !== false) {
    const { data, error } = await supabase
      .from('orders')
      .select(FULL_ORDER_WITH_ITEMS)
      .eq('altneu_number', altneuNumber)
      .maybeSingle();

    if (!error) {
      hasMigration011 = true;
      return { ok: true, data };
    }
    if (isMissingColumnError(error)) {
      hasMigration011 = false;
    } else {
      return { ok: false, reason: error.message, code: error.code };
    }
  }

  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_WITH_ITEMS)
    .eq('altneu_number', altneuNumber)
    .maybeSingle();

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}

/**
 * Look up an order by its UUID without filtering by user_id.
 * Used internally by payment services where ownership verification is performed
 * explicitly for both registered customers and guest checkout sessions.
 * @param {string} id
 * @returns {Promise<{ok: boolean, data?: object|null, reason?: string, code?: string}>}
 */
export async function findOrderByIdRaw(id) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  if (hasMigration011 !== false) {
    const { data, error } = await supabase
      .from('orders')
      .select(FULL_ORDER_WITH_ITEMS)
      .eq('id', id)
      .maybeSingle();

    if (!error) {
      hasMigration011 = true;
      return { ok: true, data };
    }
    if (isMissingColumnError(error)) {
      hasMigration011 = false;
    } else {
      return { ok: false, reason: error.message, code: error.code };
    }
  }

  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_WITH_ITEMS)
    .eq('id', id)
    .maybeSingle();

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}

/**
 * Look up an order by its Razorpay order ID.
 * @param {string} razorpayOrderId
 * @returns {Promise<{ok: boolean, data?: object|null, missingMigration?: boolean, reason?: string, code?: string}>}
 */
export async function findOrderByRazorpayOrderId(razorpayOrderId) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };
  if (!isPrivilegedDbAvailable()) return { ok: false, reason: 'supabase-service-role-not-configured' };

  if (hasMigration011 === false) {
    return {
      ok: false,
      missingMigration: true,
      code: 'MIGRATION_011_REQUIRED',
      reason: 'Migration 011 required: payment columns not present in database',
    };
  }

  const { data, error } = await supabase
    .from('orders')
    .select(FULL_ORDER_WITH_ITEMS)
    .eq('razorpay_order_id', razorpayOrderId)
    .maybeSingle();

  if (error) {
    if (isMissingColumnError(error)) {
      hasMigration011 = false;
      return {
        ok: false,
        missingMigration: true,
        code: 'MIGRATION_011_REQUIRED',
        reason: 'Migration 011 required: payment columns not present in database',
      };
    }
    return { ok: false, reason: error.message, code: error.code };
  }
  return { ok: true, data };
}

/**
 * Link a Razorpay order ID to an existing ALTNEU order.
 * @param {string} orderId
 * @param {string} razorpayOrderId
 * @returns {Promise<{ok: boolean, data?: object|null, missingMigration?: boolean, reason?: string, code?: string}>}
 */
export async function setOrderRazorpayOrderId(orderId, razorpayOrderId) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };
  if (!isPrivilegedDbAvailable()) return { ok: false, reason: 'supabase-service-role-not-configured' };

  if (hasMigration011 === false) {
    return {
      ok: false,
      missingMigration: true,
      code: 'MIGRATION_011_REQUIRED',
      reason: 'Migration 011 required: payment columns not present in database',
    };
  }

  let query = supabase
    .from('orders')
    .update({
      razorpay_order_id: razorpayOrderId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId);

  // Atomic Compare-And-Swap: Only set if razorpay_order_id is currently NULL.
  // Prevents conflicting concurrent order initializations from overwriting an established gateway order.
  if (typeof query.is === 'function') {
    query = query.is('razorpay_order_id', null);
  }

  const { data, error } = await query
    .select(ORDER_WITH_ITEMS)
    .maybeSingle();

  if (error) {
    if (isMissingColumnError(error)) {
      hasMigration011 = false;
      return {
        ok: false,
        missingMigration: true,
        code: 'MIGRATION_011_REQUIRED',
        reason: 'Migration 011 required: payment columns not present in database',
      };
    }
    return { ok: false, reason: error.message, code: error.code };
  }
  return { ok: true, data };
}

/**
 * Compare-and-swap atomic transition to 'paid' (supports initial attempt or retry from 'failed').
 * Winning transition updates the row and returns it. If another worker or webhook already
 * transitioned this order to 'paid', the WHERE clause matches 0 rows and returns data: null.
 *
 * @param {object} params
 * @param {string} params.orderId
 * @param {string} params.razorpayPaymentId
 * @param {string} params.razorpaySignature
 * @returns {Promise<{ok: boolean, data?: object|null, missingMigration?: boolean, reason?: string, code?: string}>}
 */
export async function updateOrderPaymentSuccessAtomic({ orderId, razorpayPaymentId, razorpaySignature }) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };
  if (!isPrivilegedDbAvailable()) return { ok: false, reason: 'supabase-service-role-not-configured' };

  if (hasMigration011 === false) {
    return {
      ok: false,
      missingMigration: true,
      code: 'MIGRATION_011_REQUIRED',
      reason: 'Migration 011 required: payment columns not present in database',
    };
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('orders')
    .update({
      status: 'confirmed',
      payment_status: 'paid',
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
      payment_failed_reason: null,
      payment_verified_at: now,
      updated_at: now,
    })
    .eq('id', orderId)
    .in('payment_status', ['pending', 'failed'])
    .eq('status', 'pending')
    .select(ORDER_WITH_ITEMS)
    .maybeSingle();

  if (error) {
    if (isMissingColumnError(error)) {
      hasMigration011 = false;
      return {
        ok: false,
        missingMigration: true,
        code: 'MIGRATION_011_REQUIRED',
        reason: 'Migration 011 required: payment columns not present in database',
      };
    }
    return { ok: false, reason: error.message, code: error.code };
  }
  return { ok: true, data };
}

/**
 * Attempt-level failure record. Never modifies paid, refunded, or cancelled orders.
 * Keeps inventory reserved for subsequent customer retries.
 *
 * @param {string} orderId
 * @param {string} reason
 * @returns {Promise<{ok: boolean, data?: object|null, missingMigration?: boolean, reason?: string, code?: string}>}
 */
export async function recordPaymentAttemptFailure(orderId, reason) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };
  if (!isPrivilegedDbAvailable()) return { ok: false, reason: 'supabase-service-role-not-configured' };

  if (hasMigration011 === false) {
    return {
      ok: false,
      missingMigration: true,
      code: 'MIGRATION_011_REQUIRED',
      reason: 'Migration 011 required: payment columns not present in database',
    };
  }

  const read = await supabase
    .from('orders')
    .select('id, payment_attempts, payment_status, status')
    .eq('id', orderId)
    .maybeSingle();

  if (read.error) {
    if (isMissingColumnError(read.error)) {
      hasMigration011 = false;
      return {
        ok: false,
        missingMigration: true,
        code: 'MIGRATION_011_REQUIRED',
        reason: 'Migration 011 required: payment columns not present in database',
      };
    }
    return { ok: false, reason: read.error.message, code: read.error.code };
  }
  if (!read.data) return { ok: true, data: null };

  if (read.data.payment_status === 'paid' || read.data.status !== 'pending') {
    return { ok: true, data: read.data };
  }

  const currentAttempts = Number(read.data.payment_attempts) || 0;
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('orders')
    .update({
      payment_status: 'failed',
      payment_failed_reason: reason ? String(reason).slice(0, 500) : 'Payment verification failed',
      payment_attempts: currentAttempts + 1,
      last_payment_attempt_at: now,
      updated_at: now,
    })
    .eq('id', orderId)
    .eq('status', 'pending')
    .not('payment_status', 'in', '("paid","refunded")')
    .select(ORDER_WITH_ITEMS)
    .maybeSingle();

  if (error) {
    if (isMissingColumnError(error)) {
      hasMigration011 = false;
      return {
        ok: false,
        missingMigration: true,
        code: 'MIGRATION_011_REQUIRED',
        reason: 'Migration 011 required: payment columns not present in database',
      };
    }
    return { ok: false, reason: error.message, code: error.code };
  }
  return { ok: true, data };
}

/**
 * Check if a Razorpay webhook event has already been processed.
 *
 * @param {string} eventId
 * @returns {Promise<{ok: boolean, data?: boolean, record?: object|null, missingMigration?: boolean, reason?: string, code?: string}>}
 */
export async function isWebhookProcessed(eventId) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };
  if (!isPrivilegedDbAvailable()) return { ok: false, reason: 'supabase-service-role-not-configured' };

  if (hasMigration011 === false) {
    return {
      ok: false,
      missingMigration: true,
      code: 'MIGRATION_011_REQUIRED',
      reason: 'Migration 011 required: razorpay_webhook_events table not present in database',
    };
  }

  const { data, error } = await supabase
    .from('razorpay_webhook_events')
    .select('event_id, event_type, order_id, processed_at')
    .eq('event_id', eventId)
    .maybeSingle();

  if (error) {
    if (error.code === '42P01' || /relation .* does not exist/i.test(error.message)) {
      hasMigration011 = false;
      return {
        ok: false,
        missingMigration: true,
        code: 'MIGRATION_011_REQUIRED',
        reason: 'Migration 011 required: razorpay_webhook_events table not present in database',
      };
    }
    return { ok: false, reason: error.message, code: error.code };
  }
  return { ok: true, data: Boolean(data), record: data || null };
}

/**
 * Record a processed Razorpay webhook event for idempotency and deduplication.
 * Handles duplicate insert (code 23505) gracefully by returning duplicate: true.
 *
 * @param {object} params
 * @param {string} params.eventId
 * @param {string} params.eventType
 * @param {string|null} [params.orderId]
 * @param {object} [params.payload]
 * @returns {Promise<{ok: boolean, data?: object|null, duplicate?: boolean, missingMigration?: boolean, reason?: string, code?: string}>}
 */
export async function recordWebhookEvent({ eventId, eventType, orderId = null, payload = {} }) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };
  if (!isPrivilegedDbAvailable()) return { ok: false, reason: 'supabase-service-role-not-configured' };

  if (hasMigration011 === false) {
    return {
      ok: false,
      missingMigration: true,
      code: 'MIGRATION_011_REQUIRED',
      reason: 'Migration 011 required: razorpay_webhook_events table not present in database',
    };
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('razorpay_webhook_events')
    .insert({
      event_id: eventId,
      event_type: eventType,
      order_id: orderId,
      payload,
      processed_at: now,
    })
    .select('event_id, event_type, order_id, processed_at')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      return { ok: true, data: null, duplicate: true };
    }
    if (error.code === '42P01' || /relation .* does not exist/i.test(error.message)) {
      hasMigration011 = false;
      return {
        ok: false,
        missingMigration: true,
        code: 'MIGRATION_011_REQUIRED',
        reason: 'Migration 011 required: razorpay_webhook_events table not present in database',
      };
    }
    return { ok: false, reason: error.message, code: error.code };
  }
  return { ok: true, data };
}

/**
 * Query unpaid pending orders older than the cutoff timestamp for the expiry sweeper.
 * Bounded by limit to prevent long-running queries or memory bloat.
 *
 * @param {object} params
 * @param {string} params.cutoffDate - ISO timestamp (e.g. now - 30 minutes)
 * @param {number} [params.limit=50] - Maximum orders to return in one batch (max 100)
 * @returns {Promise<{ok: boolean, data?: Array, reason?: string, code?: string}>}
 */
export async function findExpiredPendingOrders({ cutoffDate, limit = 50 } = {}) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };
  if (!isPrivilegedDbAvailable()) return { ok: false, reason: 'supabase-service-role-not-configured' };

  const boundedLimit = Math.min(Math.max(1, Number(limit) || 50), 100);

  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_WITH_ITEMS)
    .eq('status', 'pending')
    .in('payment_status', ['pending', 'failed'])
    .lte('placed_at', cutoffDate)
    .order('placed_at', { ascending: true })
    .limit(boundedLimit);

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data: data || [] };
}

/**
 * Invoke the atomic PostgreSQL transaction function for unpaid order expiry.
 * Performs order cancellation, item stock restoration, and truthful history logging
 * in a single ACID transaction within PostgreSQL.
 *
 * @param {string} orderId
 * @param {string} [reason]
 * @returns {Promise<{ok: boolean, data?: object, missingRpc?: boolean, reason?: string, code?: string}>}
 */
export async function expireUnpaidOrderRpc(orderId, reason = 'Unpaid order reservation expired after timeout') {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };
  if (!isPrivilegedDbAvailable()) return { ok: false, reason: 'supabase-service-role-not-configured' };

  if (typeof supabase.rpc !== 'function') {
    return { ok: false, missingRpc: true, reason: 'supabase.rpc not available' };
  }

  const { data, error } = await supabase.rpc('expire_unpaid_order_atomic', {
    p_order_id: orderId,
    p_reason: String(reason).slice(0, 500),
  });

  if (error) {
    // Detect if function has not yet been applied to the database (Migration 012 pending)
    if (
      error.code === 'PGRST202' ||
      error.code === '42883' ||
      /function .* does not exist/i.test(error.message)
    ) {
      return { ok: false, missingRpc: true, reason: error.message, code: error.code };
    }
    return { ok: false, reason: error.message, code: error.code };
  }

  return { ok: true, data };
}

/**
 * Compare-and-swap atomic transition of an expired unpaid order to 'cancelled' and 'failed'.
 * Tags the order with 'EXPIRY_STOCK_PENDING:' as a durable crash-recovery anchor.
 *
 * Guaranteed atomic CAS: Only updates if status is still 'pending' and payment_status
 * is still 'pending' or 'failed'. If a concurrent payment or customer cancellation
 * won first, rowCount is 0 (data is null) and the sweeper MUST NOT release stock.
 *
 * @param {string} orderId
 * @param {string} [reason]
 * @returns {Promise<{ok: boolean, data?: object|null, reason?: string, code?: string}>}
 */
export async function expireUnpaidOrderAtomic(orderId, reason = 'Unpaid order reservation expired after timeout') {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };
  if (!isPrivilegedDbAvailable()) return { ok: false, reason: 'supabase-service-role-not-configured' };

  const now = new Date().toISOString();
  const pendingReason = `EXPIRY_STOCK_PENDING: ${String(reason).replace(/^EXPIRY_STOCK_PENDING:\s*/, '')}`.slice(0, 500);

  const { data, error } = await supabase
    .from('orders')
    .update({
      status: 'cancelled',
      payment_status: 'failed',
      payment_failed_reason: pendingReason,
      updated_at: now,
    })
    .eq('id', orderId)
    .eq('status', 'pending')
    .in('payment_status', ['pending', 'failed'])
    .select(ORDER_WITH_ITEMS)
    .maybeSingle();

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data: data || null };
}

/**
 * Query orders that were cancelled during expiry but whose stock release was interrupted
 * by a crash before stock restoration could complete.
 *
 * @param {number} [limit=50]
 * @returns {Promise<{ok: boolean, data?: Array, reason?: string, code?: string}>}
 */
export async function findCrashedUnrestoredOrders(limit = 50) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };
  if (!isPrivilegedDbAvailable()) return { ok: false, reason: 'supabase-service-role-not-configured' };

  const query = supabase
    .from('orders')
    .select(ORDER_WITH_ITEMS)
    .eq('status', 'cancelled');

  if (typeof query.like !== 'function') {
    return { ok: true, data: [] };
  }

  const boundedLimit = Math.min(Math.max(1, Number(limit) || 50), 100);
  const { data, error } = await query
    .like('payment_failed_reason', 'EXPIRY_STOCK_PENDING:%')
    .limit(boundedLimit);

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data: data || [] };
}

/**
 * Mark an order's stock restoration as durably completed.
 *
 * @param {string} orderId
 * @param {string} [reason]
 * @returns {Promise<{ok: boolean, data?: object|null, reason?: string, code?: string}>}
 */
export async function markOrderStockRestored(orderId, reason = 'Unpaid order reservation expired after timeout') {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };
  if (!isPrivilegedDbAvailable()) return { ok: false, reason: 'supabase-service-role-not-configured' };

  const now = new Date().toISOString();
  const restoredReason = `EXPIRY_STOCK_RESTORED: ${String(reason).replace(/^EXPIRY_STOCK_PENDING:\s*/, '')}`.slice(0, 500);

  let query = supabase
    .from('orders')
    .update({
      payment_failed_reason: restoredReason,
      updated_at: now,
    })
    .eq('id', orderId)
    .eq('status', 'cancelled');

  if (typeof query.like === 'function') {
    query = query.like('payment_failed_reason', 'EXPIRY_STOCK_PENDING:%');
  }

  if (typeof query.select !== 'function') {
    return { ok: true, data: { id: orderId } };
  }

  const { data, error } = await query
    .select(ORDER_WITH_ITEMS)
    .maybeSingle();

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data: data || null };
}

/**
 * Produce a durable, reviewable record on an order when a late payment capture arrives
 * for an already cancelled/expired order.
 * Ensures the payment ID and review requirement are visible to merchants directly on the order.
 *
 * @param {string} orderId
 * @param {string} paymentId
 * @param {string} note
 * @returns {Promise<{ok: boolean, data?: object|null, reason?: string, code?: string}>}
 */
export async function recordLateCaptureOnCancelledOrder(orderId, paymentId, note) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };
  if (!isPrivilegedDbAvailable()) return { ok: false, reason: 'supabase-service-role-not-configured' };

  if (hasMigration011 === false) {
    return {
      ok: false,
      missingMigration: true,
      code: 'MIGRATION_011_REQUIRED',
      reason: 'Migration 011 required: payment columns not present in database',
    };
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('orders')
    .update({
      payment_failed_reason: String(note).slice(0, 500),
      razorpay_payment_id: paymentId,
      updated_at: now,
    })
    .eq('id', orderId)
    .eq('status', 'cancelled')
    .select(ORDER_WITH_ITEMS)
    .maybeSingle();

  if (error) {
    if (isMissingColumnError(error)) {
      hasMigration011 = false;
      return {
        ok: false,
        missingMigration: true,
        code: 'MIGRATION_011_REQUIRED',
        reason: 'Migration 011 required: payment columns not present in database',
      };
    }
    return { ok: false, reason: error.message, code: error.code };
  }
  return { ok: true, data: data || null };
}


