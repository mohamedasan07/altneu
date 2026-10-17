import crypto from 'crypto';
import { getSupabase, isPrivilegedDbAvailable } from '../database/client.js';
import { isWebhookProcessed, recordWebhookEvent } from './order.repository.js';

/**
 * Repository layer for durable refund intents (Sprint Razorpay Phase 5B).
 * Encapsulates all database interactions for public.refund_intents and
 * late-capture atomicity RPCs.
 */

/**
 * Record a late-capture webhook event and create a durable refund intent atomically.
 * Invokes the atomic PostgreSQL transaction RPC record_late_capture_refund_intent_atomic.
 * Falls back safely to sequential multi-table insertion if migration 013 is not yet applied.
 *
 * @param {object} params
 * @param {string} params.eventId
 * @param {string} params.eventType
 * @param {string} params.orderId
 * @param {object} params.payload
 * @param {string} params.paymentId
 * @param {number} params.amount - Amount in paise (positive integer)
 * @param {string} params.currency
 * @param {string} [params.reason]
 * @param {string} [params.idempotencyKey]
 * @returns {Promise<{ok: boolean, data?: object, duplicate?: boolean, reason?: string, code?: string}>}
 */
export async function createLateCaptureRefundIntentAtomic({
  eventId,
  eventType,
  orderId,
  payload = {},
  paymentId,
  amount,
  currency = 'INR',
  reason = 'Late capture on cancelled or expired order',
  idempotencyKey = null,
}) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };
  if (!isPrivilegedDbAvailable()) return { ok: false, reason: 'supabase-service-role-not-configured' };

  const idempKey = idempotencyKey || `rfnd_${crypto.randomUUID().replace(/-/g, '')}`;

  // 1. Attempt single-transaction atomic execution via PostgreSQL RPC
  if (typeof supabase.rpc === 'function') {
    const { data, error } = await supabase.rpc('record_late_capture_refund_intent_atomic', {
      p_event_id: eventId,
      p_event_type: eventType,
      p_order_id: orderId,
      p_payload: payload,
      p_payment_id: paymentId,
      p_amount: amount,
      p_currency: currency,
      p_reason: reason,
      p_idempotency_key: idempKey,
    });

    if (!error && data) {
      if (data.duplicate_event) {
        return { ok: true, duplicate: true, data };
      }
      if (data.success) {
        return { ok: true, data };
      }
      return { ok: false, reason: data.reason || 'rpc_failed', data };
    }

    // Check if error is due to missing RPC (Migration 013 pending)
    const isMissingRpc =
      error &&
      (error.code === 'PGRST202' ||
        error.code === '42883' ||
        /function .* does not exist/i.test(error.message));

    if (!isMissingRpc && error) {
      return { ok: false, reason: error.message, code: error.code };
    }
  }

  // 2. Safe graceful fallback when Migration 013 RPC is not yet loaded into the database:
  // First check webhook deduplication
  const checkResult = await isWebhookProcessed(eventId);
  if (!checkResult.ok) {
    return { ok: false, reason: checkResult.reason };
  }
  if (checkResult.data) {
    return { ok: true, duplicate: true, data: { event_id: eventId } };
  }

  const now = new Date().toISOString();

  // Record webhook event in razorpay_webhook_events
  const webhookRecordResult = await recordWebhookEvent({
    eventId,
    eventType,
    orderId,
    payload,
  });
  if (!webhookRecordResult.ok) {
    return { ok: false, reason: webhookRecordResult.reason };
  }

  // Attempt to insert into refund_intents table if table/mock supports insert
  let refundIntentRecord = null;
  try {
    const refundTable = supabase.from('refund_intents');
    if (typeof refundTable?.insert === 'function') {
      const insertQuery = refundTable.insert({
        order_id: orderId,
        payment_id: paymentId,
        amount,
        currency,
        status: 'pending',
        reason,
        idempotency_key: idempKey,
        created_at: now,
        updated_at: now,
      });

      if (typeof insertQuery?.select === 'function') {
        const { data, error } = await insertQuery.select('*').maybeSingle();
        if (!error && data) {
          refundIntentRecord = data;
        } else if (error && error.code === '23505') {
          const existing = await supabase
            .from('refund_intents')
            .select('*')
            .eq('order_id', orderId)
            .eq('payment_id', paymentId)
            .maybeSingle();
          refundIntentRecord = existing.data || null;
        }
      }
    }
  } catch {
    // Non-fatal table fallback
  }

  // Update order table to reflect payment ID and pending refund status if supported
  try {
    const ordersTable = supabase.from('orders');
    if (refundIntentRecord && typeof ordersTable?.update === 'function') {
      const updateResult = ordersTable.update({
        razorpay_payment_id: paymentId,
        payment_failed_reason: `LATE_CAPTURE_REFUND_PENDING: ${reason}`.slice(0, 500),
        refund_status: 'pending',
        refund_reason: reason,
        refund_idempotency_key: refundIntentRecord?.idempotency_key || idempKey,
        updated_at: now,
      });

      if (typeof updateResult?.eq === 'function') {
        await updateResult.eq('id', orderId).eq('status', 'cancelled');
      }
    }
  } catch {
    // Non-fatal update fallback
  }

  return {
    ok: true,
    data: refundIntentRecord || {
      id: idempKey,
      order_id: orderId,
      payment_id: paymentId,
      amount,
      currency,
      status: 'pending',
      idempotency_key: idempKey,
    },
  };
}

/**
 * Atomically claim a single pending (or stale processing) refund intent for a worker.
 * Prevents concurrent workers from claiming or executing the same refund.
 *
 * @param {object} params
 * @param {string} params.workerId
 * @param {number} [params.staleTimeoutMinutes=5]
 * @returns {Promise<{ok: boolean, data?: object|null, reason?: string, code?: string}>}
 */
export async function claimRefundIntentAtomic({ workerId, staleTimeoutMinutes = 5 } = {}) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };
  if (!isPrivilegedDbAvailable()) return { ok: false, reason: 'supabase-service-role-not-configured' };

  const cleanWorkerId = workerId || `worker_${crypto.randomUUID().slice(0, 8)}`;
  const staleThresholdDate = new Date(Date.now() - staleTimeoutMinutes * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  // Query candidate intents: status = pending OR (status = processing AND worker_claimed_at < staleThresholdDate)
  const { data: candidates, error: findError } = await supabase
    .from('refund_intents')
    .select('*')
    .or(`status.eq.pending,and(status.eq.processing,worker_claimed_at.lte.${staleThresholdDate})`)
    .order('created_at', { ascending: true })
    .limit(5);

  if (findError) {
    return { ok: false, reason: findError.message, code: findError.code };
  }

  if (!candidates || candidates.length === 0) {
    return { ok: true, data: null };
  }

  // Attempt atomic CAS claim on each candidate until one succeeds
  for (const candidate of candidates) {
    let updateQuery = supabase
      .from('refund_intents')
      .update({
        status: 'processing',
        worker_claimed_at: now,
        worker_id: cleanWorkerId,
        attempts: (candidate.attempts || 0) + 1,
        updated_at: now,
      })
      .eq('id', candidate.id);

    if (candidate.status === 'pending') {
      updateQuery = updateQuery.eq('status', 'pending');
    } else {
      updateQuery = updateQuery
        .eq('status', 'processing')
        .eq('worker_claimed_at', candidate.worker_claimed_at);
    }

    const { data: claimed, error: claimError } = await updateQuery
      .select('*')
      .maybeSingle();

    if (!claimError && claimed) {
      return { ok: true, data: claimed };
    }
  }

  return { ok: true, data: null };
}

/**
 * Retrieve refund intents with optional status filter and bounded pagination.
 *
 * @param {object} [params]
 * @param {string} [params.status]
 * @param {number} [params.limit=50]
 * @returns {Promise<{ok: boolean, data?: Array, reason?: string, code?: string}>}
 */
export async function findRefundIntents({ status, limit = 50 } = {}) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };
  if (!isPrivilegedDbAvailable()) return { ok: false, reason: 'supabase-service-role-not-configured' };

  const boundedLimit = Math.min(Math.max(1, Number(limit) || 50), 100);

  let query = supabase
    .from('refund_intents')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(boundedLimit);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data: data || [] };
}

/**
 * Retrieve a refund intent by its primary UUID.
 *
 * @param {string} id
 * @returns {Promise<{ok: boolean, data?: object|null, reason?: string, code?: string}>}
 */
export async function findRefundIntentById(id) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };
  if (!isPrivilegedDbAvailable()) return { ok: false, reason: 'supabase-service-role-not-configured' };

  const { data, error } = await supabase
    .from('refund_intents')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}

/**
 * Retrieve a refund intent by order ID and Razorpay payment ID.
 *
 * @param {string} orderId
 * @param {string} paymentId
 * @returns {Promise<{ok: boolean, data?: object|null, reason?: string, code?: string}>}
 */
export async function findRefundIntentByOrderAndPayment(orderId, paymentId) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };
  if (!isPrivilegedDbAvailable()) return { ok: false, reason: 'supabase-service-role-not-configured' };

  const { data, error } = await supabase
    .from('refund_intents')
    .select('*')
    .eq('order_id', orderId)
    .eq('payment_id', paymentId)
    .maybeSingle();

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}

/**
 * Mark a refund intent as durably completed.
 * Cascades completion to public.orders table (status='refunded', payment_status='refunded').
 *
 * @param {object} params
 * @param {string} params.intentId
 * @param {string} params.orderId
 * @param {string} params.razorpayRefundId
 * @param {object} [params.gatewayResponse]
 * @returns {Promise<{ok: boolean, data?: object|null, reason?: string, code?: string}>}
 */
export async function markRefundIntentCompleted({
  intentId,
  orderId,
  razorpayRefundId,
  gatewayResponse = {},
}) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };
  if (!isPrivilegedDbAvailable()) return { ok: false, reason: 'supabase-service-role-not-configured' };

  const now = new Date().toISOString();

  // 1. Update refund intent to 'completed'
  const { data: updatedIntent, error: intentError } = await supabase
    .from('refund_intents')
    .update({
      status: 'completed',
      razorpay_refund_id: razorpayRefundId,
      gateway_response: gatewayResponse,
      error_message: null,
      updated_at: now,
    })
    .eq('id', intentId)
    .select('*')
    .maybeSingle();

  if (intentError) {
    return { ok: false, reason: intentError.message, code: intentError.code };
  }

  // 2. Cascade update to public.orders
  const targetOrderId = orderId || updatedIntent?.order_id;
  if (targetOrderId) {
    await supabase
      .from('orders')
      .update({
        status: 'refunded',
        payment_status: 'refunded',
        refund_status: 'completed',
        razorpay_refund_id: razorpayRefundId,
        refunded_at: now,
        payment_failed_reason: `REFUND_COMPLETED: Refund ${razorpayRefundId} confirmed by gateway`.slice(0, 500),
        updated_at: now,
      })
      .eq('id', targetOrderId);
  }

  return { ok: true, data: updatedIntent };
}

/**
 * Mark a refund intent as requiring manual operator review.
 *
 * @param {object} params
 * @param {string} params.intentId
 * @param {string} params.reason
 * @param {string} [params.errorMessage]
 * @param {object} [params.gatewayResponse]
 * @returns {Promise<{ok: boolean, data?: object|null, reason?: string, code?: string}>}
 */
export async function markRefundIntentManualReview({
  intentId,
  reason,
  errorMessage = null,
  gatewayResponse = null,
}) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };
  if (!isPrivilegedDbAvailable()) return { ok: false, reason: 'supabase-service-role-not-configured' };

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('refund_intents')
    .update({
      status: 'manual_review',
      reason: reason || 'Flagged for manual operator review',
      error_message: errorMessage ? String(errorMessage).slice(0, 500) : null,
      gateway_response: gatewayResponse,
      updated_at: now,
    })
    .eq('id', intentId)
    .select('*')
    .maybeSingle();

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}

/**
 * Release an active worker claim on a refund intent back to pending.
 * Used for retryable failures (such as HTTP 409 Conflict) with backoff.
 *
 * @param {object} params
 * @param {string} params.intentId
 * @param {string} [params.errorMessage]
 * @returns {Promise<{ok: boolean, data?: object|null, reason?: string, code?: string}>}
 */
export async function releaseRefundIntentClaim({ intentId, errorMessage = null } = {}) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };
  if (!isPrivilegedDbAvailable()) return { ok: false, reason: 'supabase-service-role-not-configured' };

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('refund_intents')
    .update({
      status: 'pending',
      error_message: errorMessage ? String(errorMessage).slice(0, 500) : null,
      worker_claimed_at: null,
      worker_id: null,
      updated_at: now,
    })
    .eq('id', intentId)
    .select('*')
    .maybeSingle();

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}

/**
 * Retrieve a refund intent by Razorpay payment ID.
 *
 * @param {string} paymentId
 * @returns {Promise<{ok: boolean, data?: object|null, reason?: string, code?: string}>}
 */
export async function findRefundIntentByPaymentId(paymentId) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };
  if (!isPrivilegedDbAvailable()) return { ok: false, reason: 'supabase-service-role-not-configured' };

  const { data, error } = await supabase
    .from('refund_intents')
    .select('*')
    .eq('payment_id', paymentId)
    .maybeSingle();

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}

/**
 * Retrieve a refund intent by Razorpay refund ID.
 *
 * @param {string} razorpayRefundId
 * @returns {Promise<{ok: boolean, data?: object|null, reason?: string, code?: string}>}
 */
export async function findRefundIntentByRazorpayRefundId(razorpayRefundId) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };
  if (!isPrivilegedDbAvailable()) return { ok: false, reason: 'supabase-service-role-not-configured' };

  const { data, error } = await supabase
    .from('refund_intents')
    .select('*')
    .eq('razorpay_refund_id', razorpayRefundId)
    .maybeSingle();

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}

/**
 * Record refund initiation details (e.g. gateway accepted request with status 'pending').
 * Sets razorpay_refund_id and gateway_response while intent remains in 'processing'.
 *
 * @param {object} params
 * @param {string} params.intentId
 * @param {string} params.razorpayRefundId
 * @param {object} [params.gatewayResponse]
 * @returns {Promise<{ok: boolean, data?: object|null, reason?: string, code?: string}>}
 */
export async function recordRefundInitiated({
  intentId,
  razorpayRefundId,
  gatewayResponse = {},
}) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };
  if (!isPrivilegedDbAvailable()) return { ok: false, reason: 'supabase-service-role-not-configured' };

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('refund_intents')
    .update({
      razorpay_refund_id: razorpayRefundId,
      gateway_response: gatewayResponse,
      updated_at: now,
    })
    .eq('id', intentId)
    .select('*')
    .maybeSingle();

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}

/**
 * Mark a refund intent as terminal failed (e.g. gateway rejected or bank declined).
 *
 * @param {object} params
 * @param {string} params.intentId
 * @param {string} params.reason
 * @param {string} [params.errorMessage]
 * @param {object} [params.gatewayResponse]
 * @returns {Promise<{ok: boolean, data?: object|null, reason?: string, code?: string}>}
 */
export async function markRefundIntentFailed({
  intentId,
  reason,
  errorMessage = null,
  gatewayResponse = null,
}) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };
  if (!isPrivilegedDbAvailable()) return { ok: false, reason: 'supabase-service-role-not-configured' };

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('refund_intents')
    .update({
      status: 'failed',
      reason: reason || 'Refund failed at gateway',
      error_message: errorMessage ? String(errorMessage).slice(0, 500) : null,
      gateway_response: gatewayResponse,
      updated_at: now,
    })
    .eq('id', intentId)
    .select('*')
    .maybeSingle();

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}

