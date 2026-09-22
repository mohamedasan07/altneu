import { getSupabase } from '../database/client.js';

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

const ORDER_COLUMNS = `
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

/** Orders joined with their items (used by list/detail). */
export const ORDER_WITH_ITEMS = `
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

/**
 * @param {string} userId  user uuid
 * @returns {Promise<{ok: boolean, data?: Array, reason?: string, code?: string}>}
 */
export async function findOrdersByUser(userId) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

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

  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_WITH_ITEMS)
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

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

  const { data, error } = await supabase
    .from('orders')
    .insert(row)
    .select(ORDER_COLUMNS)
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
export async function restoreStock(productId, quantity) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  const read = await supabase
    .from('products')
    .select('id, stock_quantity')
    .eq('id', productId)
    .maybeSingle();

  if (read.error) return { ok: false, reason: read.error.message, code: read.error.code };
  if (!read.data) return { ok: true, data: true }; // product gone — nothing to restore

  const current = Number(read.data.stock_quantity) || 0;
  const { error } = await supabase
    .from('products')
    .update({ stock_quantity: current + quantity })
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