import crypto from 'crypto';
import { getSupabase, isPrivilegedDbAvailable } from '../database/client.js';
import { ORDER_WITH_ITEMS } from './order.repository.js';
import { logger } from '../utils/logger.js';

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

/**
 * PATCH /api/admin/orders/:id/tracking — set the tracking fields.
 * Returns the updated row (with items) so the service can normalize it.
 * @param {string} id            order uuid
 * @param {object} trackingData  allowlisted by the validator before it reaches here
 * @returns {Promise<{ok: boolean, data?: object|null, reason?: string, code?: string}>}
 */
export async function updateOrderTracking(id, trackingData) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  const { data, error } = await supabase
    .from('orders')
    .update({
      carrier: trackingData.carrier,
      carrier_service: trackingData.carrierService,
      tracking_number: trackingData.trackingNumber,
      tracking_url: trackingData.trackingUrl,
      shipped_at: trackingData.shippedAt,
    })
    .eq('id', id)
    .select(ORDER_WITH_ITEMS)
    .maybeSingle();

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}

/**
 * Atomically cancel an order by an authorized administrator (Migration 016).
 * Encapsulates status transition, inventory restoration, refund intent creation,
 * and status history recording into a single ACID transaction via PostgreSQL RPC.
 *
 * FAILS CLOSED: Requires Migration 016 (admin_cancel_order_atomic). Does NOT perform
 * non-atomic multi-step fallback writes when the RPC is missing, preventing partial
 * state corruption or lost refund intents.
 *
 * @param {object} params
 * @param {string} params.orderId
 * @param {string} [params.reason]
 * @param {string} [params.idempotencyKey]
 * @returns {Promise<{ok: boolean, alreadyCancelled?: boolean, missingRpc?: boolean, data?: object, reason?: string, code?: string}>}
 */
export async function adminCancelOrderAtomic({
  orderId,
  reason = 'Admin-initiated order cancellation',
  idempotencyKey = null,
} = {}) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };
  if (!isPrivilegedDbAvailable()) return { ok: false, reason: 'supabase-service-role-not-configured' };

  if (typeof supabase.rpc !== 'function') {
    return {
      ok: false,
      missingRpc: true,
      code: 'MIGRATION_016_REQUIRED',
      reason: 'Atomic cancellation RPC is unavailable: database migration 016 required',
    };
  }

  const idempKey = idempotencyKey || `rfnd_adm_${crypto.randomUUID().replace(/-/g, '')}`;

  const { data, error } = await supabase.rpc('admin_cancel_order_atomic', {
    p_order_id: orderId,
    p_reason: reason,
    p_idempotency_key: idempKey,
  });

  if (error) {
    const isMissingRpc =
      error.code === 'PGRST202' ||
      error.code === '42883' ||
      /function .* does not exist/i.test(error.message);

    if (isMissingRpc) {
      return {
        ok: false,
        missingRpc: true,
        code: 'MIGRATION_016_REQUIRED',
        reason: 'Migration 016 (admin_cancel_order_atomic) required for safe atomic cancellation',
      };
    }
    return { ok: false, reason: error.message, code: error.code };
  }

  if (data) {
    if (data.already_cancelled) {
      return { ok: true, alreadyCancelled: true, data };
    }
    if (data.success) {
      return { ok: true, data };
    }
    return { ok: false, reason: data.reason || 'rpc_failed', data };
  }

  return { ok: false, reason: 'No data returned from atomic cancellation RPC' };
}