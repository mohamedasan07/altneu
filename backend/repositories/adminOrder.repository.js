import { getSupabase } from '../database/client.js';
import { ORDER_WITH_ITEMS } from './order.repository.js';

/**
 * Admin order data access (Sprint 22.1 Phases 1–2).
 *
 * Admin queries against the same orders/order_items tables the customer module
 * uses — no ownership scope (an admin sees every order). Same conventions as
 * every repository: the service-role key (bypasses RLS) and the shared result
 * envelope
 *   { ok: true,  data, [count] }
 *   { ok: false, reason, [code] }
 * so callers never touch Supabase error objects directly.
 *
 * Pagination uses PostgREST's range + exact count: the `count` returned by the
 * query is the total of rows matching the filters BEFORE the range is applied,
 * which is what the list endpoint exposes as `pagination.total`.
 *
 * The embedded `items:order_items` projection (exported from
 * order.repository.js) keeps the admin and customer order shapes identical.
 * The update helpers return the freshly updated row with the same projection,
 * so the service can normalize the response directly.
 */

/**
 * GET /api/admin/orders — paginated, filtered, searchable order list.
 * @param {{
 *   status?: string|null,
 *   paymentStatus?: string|null,
 *   search?: string|null,   // order_number substring (ilike)
 *   sort?: string,          // allowlisted column: placed_at|order_number|grand_total|status
 *   order?: 'asc'|'desc',
 *   offset?: number,
 *   limit?: number,
 * }} options
 * @returns {Promise<{ok: boolean, data?: Array, count?: number, reason?: string, code?: string}>}
 */
export async function findAllOrders({
  status = null,
  paymentStatus = null,
  search = null,
  sort = 'placed_at',
  order = 'desc',
  offset = 0,
  limit = 20,
} = {}) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  let query = supabase
    .from('orders')
    .select(ORDER_WITH_ITEMS, { count: 'exact' })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);
  if (paymentStatus) query = query.eq('payment_status', paymentStatus);
  if (search) query = query.or(`order_number.ilike.%${search}%,altneu_number.ilike.%${search}%`);

  query = query.order(sort, { ascending: order === 'asc' });

  const { data, error, count } = await query;
  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data, count };
}

/**
 * GET /api/admin/orders/:id — one order with its items, no ownership scope.
 * @param {string} id  order uuid (already validated by the service)
 * @returns {Promise<{ok: boolean, data?: object|null, reason?: string, code?: string}>}
 */
export async function findOrderByIdAdmin(id) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_WITH_ITEMS)
    .eq('id', id)
    .maybeSingle();

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}

/**
 * PATCH /api/admin/orders/:id/status — set the fulfilment status.
 * Returns the updated row (with items) so the service can normalize it.
 * A non-existent id matches no rows and returns data: null (no error).
 * @param {string} id      order uuid
 * @param {string} status  allowlisted by the validator before it reaches here
 * @returns {Promise<{ok: boolean, data?: object|null, reason?: string, code?: string}>}
 */
export async function updateOrderStatus(id, status) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  const { data, error } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', id)
    .select(ORDER_WITH_ITEMS)
    .maybeSingle();

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}

/**
 * PATCH /api/admin/orders/:id/payment — set the payment status.
 * Returns the updated row (with items) so the service can normalize it.
 * @param {string} id            order uuid
 * @param {string} paymentStatus allowlisted by the validator before it reaches here
 * @returns {Promise<{ok: boolean, data?: object|null, reason?: string, code?: string}>}
 */
export async function updateOrderPaymentStatus(id, paymentStatus) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  const { data, error } = await supabase
    .from('orders')
    .update({ payment_status: paymentStatus })
    .eq('id', id)
    .select(ORDER_WITH_ITEMS)
    .maybeSingle();

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}