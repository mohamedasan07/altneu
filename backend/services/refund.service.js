import crypto from 'crypto';
import { config } from '../config/index.js';
import { isPrivilegedDbAvailable } from '../database/client.js';
import { ApiError } from '../utils/apiError.js';
import { logger } from '../utils/logger.js';
import { findOrderByIdRaw, recordWebhookEvent } from '../repositories/order.repository.js';
import {
  createLateCaptureRefundIntentAtomic,
  claimRefundIntentAtomic,
  findRefundIntents,
  findRefundIntentById,
  findRefundIntentByOrderAndPayment,
  findRefundIntentByPaymentId,
  findRefundIntentByRazorpayRefundId,
  markRefundIntentCompleted,
  markRefundIntentManualReview,
  markRefundIntentFailed,
  recordRefundInitiated,
  releaseRefundIntentClaim,
} from '../repositories/refund.repository.js';
import { getRazorpayClient } from './payment.service.js';

/**
 * Sprint Razorpay Phase 5B — Durable Refund Recovery Service
 *
 * Official Razorpay Gateway API Reference:
 * - https://razorpay.com/docs/api-reference/refunds/#create-a-normal-refund-idempotent-request
 * - Endpoint: POST https://api.razorpay.com/v1/payments/:id/refund
 * - Header: X-Refund-Idempotency (minimum 10 alphanumeric characters, hyphens, underscores)
 *
 * SDK Finding:
 * The official Razorpay Node SDK (razorpay@^2.9.8) does NOT transmit X-Refund-Idempotency:
 * 1. payments.refund(paymentId, params) does not accept custom per-request headers.
 * 2. Underlying API._createConfig filters headers through an allowedHeaders whitelist
 *    that only permits 'X-Razorpay-Account' and 'Content-Type', stripping all other headers.
 * Therefore, executeIdempotentRefund uses a direct, authenticated server-side HTTPS call.
 */

let refundHttpTransport = null;

/**
 * Override or inject a mock HTTP transport for executeIdempotentRefund (unit/integration testing).
 * @param {Function|null} transportFn - Async function (url, options) => { status, json, ok }
 */
export function setRefundHttpTransport(transportFn) {
  refundHttpTransport = transportFn;
}

/**
 * Retrieve active HTTP transport.
 * @returns {Function|null}
 */
export function getRefundHttpTransport() {
  return refundHttpTransport;
}

/**
 * Direct, authenticated HTTPS helper for Razorpay refunds enforcing X-Refund-Idempotency.
 * Bypasses Node SDK header-stripping to guarantee gateway-level idempotency.
 *
 * @param {object} params
 * @param {string} params.paymentId - Razorpay payment ID (e.g. 'pay_...')
 * @param {number} params.amount - Amount in paise (integer > 0)
 * @param {string} params.idempotencyKey - Minimum 10 alphanumeric characters, '-' or '_'
 * @param {object} [params.notes] - Key-value metadata notes
 * @param {string} [params.speed='optimum'] - Refund speed ('optimum' or 'normal')
 * @returns {Promise<{ok: boolean, status: number, data?: object, error?: object, conflict?: boolean}>}
 */
export async function executeIdempotentRefund({
  paymentId,
  amount,
  idempotencyKey,
  notes = {},
  speed = 'optimum',
}) {
  const keyId = config.razorpay.keyId;
  const keySecret = config.razorpay.keySecret;

  if (!keyId || !keySecret) {
    throw new ApiError(500, 'Razorpay credentials not configured for refund execution');
  }

  if (!paymentId || typeof paymentId !== 'string') {
    throw new ApiError(400, 'paymentId is required for refund execution');
  }

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new ApiError(400, 'amount must be a positive integer in paise');
  }

  // Enforce Razorpay idempotency key requirements: min 10 chars, [A-Za-z0-9_-]
  if (
    !idempotencyKey ||
    typeof idempotencyKey !== 'string' ||
    idempotencyKey.length < 10 ||
    !/^[a-zA-Z0-9_-]+$/.test(idempotencyKey)
  ) {
    throw new ApiError(
      400,
      'idempotencyKey must be at least 10 characters and contain only letters, numbers, hyphens, and underscores'
    );
  }

  const endpoint = `https://api.razorpay.com/v1/payments/${paymentId}/refund`;
  const authHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;

  const payload = {
    amount,
    speed,
    notes,
  };

  const headers = {
    Authorization: authHeader,
    'Content-Type': 'application/json',
    'X-Refund-Idempotency': idempotencyKey,
  };

  // If a mock transport is injected (tests), invoke it directly
  if (refundHttpTransport) {
    return await refundHttpTransport(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  }

  // Real production call using native Node fetch with 15-second timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const status = response.status;
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (response.ok) {
      return { ok: true, status, data };
    }

    if (status === 409) {
      return {
        ok: false,
        status: 409,
        conflict: true,
        error: data?.error || { description: 'Refund request already in progress at gateway' },
      };
    }

    return {
      ok: false,
      status,
      conflict: false,
      error: data?.error || data || { description: `HTTP ${status}` },
    };
  } catch (netErr) {
    logger.error(`[refundService] Network error during refund execution for ${paymentId}: ${netErr.message}`);
    const isTimeout = netErr.name === 'AbortError' || /timeout/i.test(netErr.message);
    return {
      ok: false,
      status: 0,
      timeout: isTimeout,
      networkError: true,
      error: { description: netErr.message, name: netErr.name },
    };
  }
}

/**
 * Record a late-capture webhook event and its durable refund intent atomically.
 *
 * @param {object} params
 * @returns {Promise<{ok: boolean, data?: object, duplicate?: boolean, reason?: string}>}
 */
export async function createLateCaptureRefundIntent(params) {
  return await createLateCaptureRefundIntentAtomic(params);
}

/**
 * Reconcile refund state directly against the Razorpay gateway.
 * Queries payments.fetchMultipleRefund to find if a refund was already created
 * for this payment, even if an earlier request timed out or returned ambiguous response.
 *
 * @param {string} paymentId
 * @param {number} expectedAmountPaise
 * @returns {Promise<{found: boolean, refund?: object, amountRefunded?: number, totalRefunds?: number}>}
 */
export async function reconcileRefundWithGateway(paymentId, expectedAmountPaise) {
  const razorpay = getRazorpayClient();
  if (!razorpay) {
    return { found: false, error: 'Razorpay client not configured' };
  }

  try {
    // 1. Fetch payment to inspect amount_refunded
    const payment = await razorpay.payments.fetch(paymentId);
    if (!payment) return { found: false };

    const amountRefunded = Number(payment.amount_refunded) || 0;

    // 2. Fetch list of refunds for this payment
    if (typeof razorpay.payments.fetchMultipleRefund === 'function') {
      const refundList = await razorpay.payments.fetchMultipleRefund(paymentId, { count: 10 });
      const items = refundList?.items || [];

      // Find refund matching expected amount
      const matching = items.find((r) => r.amount === expectedAmountPaise);
      if (matching) {
        return {
          found: true,
          refund: matching,
          amountRefunded,
          totalRefunds: items.length,
        };
      }

      if (items.length > 0) {
        return {
          found: true,
          refund: items[0],
          amountRefunded,
          totalRefunds: items.length,
        };
      }
    }

    if (amountRefunded >= expectedAmountPaise) {
      return {
        found: true,
        refund: {
          id: payment.refund_id || `rfnd_reconciled_${paymentId.slice(-6)}`,
          status: 'processed',
          amount: amountRefunded,
        },
        amountRefunded,
        totalRefunds: 1,
      };
    }

    return { found: false, amountRefunded, totalRefunds: 0 };
  } catch (err) {
    logger.error(`[refundService] Error during gateway reconciliation for ${paymentId}: ${err.message}`);
    return { found: false, error: err.message };
  }
}

/**
 * Process a single claimed refund intent through the durable refund recovery state machine.
 *
 * Safety lifecycle:
 * 1. Pre-flight verification: order must exist, be cancelled, amount & currency must match.
 * 2. Gateway pre-flight: payment must exist on Razorpay, be in 'captured' state, order_id must match.
 * 3. Existing refund guard:
 *    - If already fully refunded, link existing refund ID and mark completed (no duplicate request).
 *    - If partial refund exists, flag for manual review (never over-refund).
 * 4. Execute idempotent refund via executeIdempotentRefund with X-Refund-Idempotency header.
 * 5. Handle response:
 *    - 200/201 'processed': mark completed and cascade to orders table.
 *    - 200/201 'pending': keep processing (never mark completed prematurely).
 *    - 409 Conflict: gateway processing in-flight; release claim for retry with SAME idempotency key.
 *    - Timeout/Ambiguous: attempt gateway reconciliation via fetchMultipleRefund.
 *    - Gateway error / Insufficient balance: flag for manual review.
 *
 * @param {object} intent - Row from public.refund_intents
 * @param {string} [workerId]
 * @returns {Promise<object>}
 */
export async function processRefundIntent(intent, workerId = 'worker_default') {
  if (!intent || !intent.id) {
    throw new ApiError(400, 'Invalid refund intent');
  }

  const { id: intentId, order_id: orderId, payment_id: paymentId, amount, currency, idempotency_key: idempotencyKey } = intent;

  logger.info(`[refundService] Processing refund intent ${intentId} for order ${orderId} (payment ${paymentId}, amount: ${amount})`);

  // 1. Pre-flight DB verification: order check
  const orderResult = await findOrderByIdRaw(orderId);
  if (!orderResult.ok || !orderResult.data) {
    const reason = `Referenced order ${orderId} not found in database`;
    logger.error(`[refundService] ${reason}`);
    await markRefundIntentManualReview({
      intentId,
      reason: 'Order not found',
      errorMessage: reason,
    });
    return { success: false, status: 'manual_review', reason: 'order_not_found' };
  }

  const order = orderResult.data;

  // Order must remain cancelled/failed; late capture MUST NOT resurrect order or release stock
  if (order.status !== 'cancelled' && order.status !== 'refunded') {
    const reason = `Order ${orderId} status is ${order.status} (expected cancelled). Automated refund halted for security review.`;
    logger.error(`[refundService] ${reason}`);
    await markRefundIntentManualReview({
      intentId,
      reason: 'Order status anomalous',
      errorMessage: reason,
    });
    return { success: false, status: 'manual_review', reason: 'order_not_cancelled' };
  }

  // Amount & currency verification against order
  const expectedPaise = Math.round(Number(order.grand_total) * 100);
  if (amount !== expectedPaise) {
    const reason = `Refund intent amount (${amount}) does not match order grand total (${expectedPaise})`;
    logger.error(`[refundService] ${reason}`);
    await markRefundIntentManualReview({
      intentId,
      reason: 'Amount mismatch with order',
      errorMessage: reason,
    });
    return { success: false, status: 'manual_review', reason: 'amount_mismatch' };
  }

  const expectedCurrency = order.currency || 'INR';
  if (currency !== expectedCurrency) {
    const reason = `Refund intent currency (${currency}) does not match order currency (${expectedCurrency})`;
    logger.error(`[refundService] ${reason}`);
    await markRefundIntentManualReview({
      intentId,
      reason: 'Currency mismatch with order',
      errorMessage: reason,
    });
    return { success: false, status: 'manual_review', reason: 'currency_mismatch' };
  }

  // 2. Gateway Pre-flight Cross-check
  const razorpay = getRazorpayClient();
  if (!razorpay) {
    logger.warn('[refundService] Razorpay client unconfigured; releasing claim');
    await releaseRefundIntentClaim({ intentId, errorMessage: 'Razorpay gateway not configured' });
    return { success: false, status: 'gateway_unconfigured' };
  }

  let paymentRecord;
  try {
    paymentRecord = await razorpay.payments.fetch(paymentId);
  } catch (fetchErr) {
    logger.error(`[refundService] payments.fetch failed for ${paymentId}: ${fetchErr.message}`);
    // If payment does not exist on gateway, flag for manual review
    if (fetchErr.statusCode === 400 || fetchErr.statusCode === 404) {
      await markRefundIntentManualReview({
        intentId,
        reason: 'Payment transaction not found on Razorpay',
        errorMessage: fetchErr.message,
      });
      return { success: false, status: 'manual_review', reason: 'payment_not_found_on_gateway' };
    }
    // Transient gateway error: release claim for retry
    await releaseRefundIntentClaim({ intentId, errorMessage: fetchErr.message });
    return { success: false, status: 'retryable_error', reason: fetchErr.message };
  }

  if (!paymentRecord) {
    await markRefundIntentManualReview({
      intentId,
      reason: 'Payment transaction not found on Razorpay',
      errorMessage: 'Gateway returned empty payment record',
    });
    return { success: false, status: 'manual_review', reason: 'payment_not_found_on_gateway' };
  }

  // Validate gateway payment association with order
  if (order.razorpay_order_id && paymentRecord.order_id !== order.razorpay_order_id) {
    const reason = `Payment order_id (${paymentRecord.order_id}) does not match order razorpay_order_id (${order.razorpay_order_id})`;
    logger.error(`[refundService] ${reason}`);
    await markRefundIntentManualReview({
      intentId,
      reason: 'Gateway order ID mismatch',
      errorMessage: reason,
    });
    return { success: false, status: 'manual_review', reason: 'gateway_order_id_mismatch' };
  }

  // Validate payment amount on gateway
  if (paymentRecord.amount !== amount) {
    const reason = `Gateway payment amount (${paymentRecord.amount}) does not match intent amount (${amount})`;
    logger.error(`[refundService] ${reason}`);
    await markRefundIntentManualReview({
      intentId,
      reason: 'Gateway payment amount mismatch',
      errorMessage: reason,
    });
    return { success: false, status: 'manual_review', reason: 'gateway_amount_mismatch' };
  }

  // Validate payment currency on gateway
  if (paymentRecord.currency !== currency) {
    const reason = `Gateway payment currency (${paymentRecord.currency}) does not match intent currency (${currency})`;
    logger.error(`[refundService] ${reason}`);
    await markRefundIntentManualReview({
      intentId,
      reason: 'Gateway payment currency mismatch',
      errorMessage: reason,
    });
    return { success: false, status: 'manual_review', reason: 'gateway_currency_mismatch' };
  }

  // 3. Existing Refund Checks (Prevent duplicate / exceeding refunds)
  // Check gateway for pre-existing refund if intent already has razorpay_refund_id
  let gatewayExistingRefund = null;

  if (intent.razorpay_refund_id) {
    if (typeof razorpay.refunds?.fetch === 'function') {
      try {
        gatewayExistingRefund = await razorpay.refunds.fetch(intent.razorpay_refund_id);
      } catch (rErr) {
        logger.warn(`[refundService] refunds.fetch non-critical lookup failure for ${intent.razorpay_refund_id}: ${rErr.message}`);
      }
    }

    if (!gatewayExistingRefund && typeof razorpay.payments.fetchMultipleRefund === 'function') {
      try {
        const multiple = await razorpay.payments.fetchMultipleRefund(paymentId, { count: 10 });
        const items = multiple?.items || [];
        gatewayExistingRefund = items.find((r) => r.id === intent.razorpay_refund_id || r.amount === amount) || null;
      } catch (mErr) {
        logger.warn(`[refundService] fetchMultipleRefund non-critical lookup failure: ${mErr.message}`);
      }
    }
  }

  // If a matching gateway refund was found for the existing razorpay_refund_id:
  if (gatewayExistingRefund) {
    if (gatewayExistingRefund.status === 'processed') {
      logger.info(`[refundService] Found existing processed refund ${gatewayExistingRefund.id} on gateway. Linking and marking completed.`);
      await markRefundIntentCompleted({
        intentId,
        orderId,
        razorpayRefundId: gatewayExistingRefund.id,
        gatewayResponse: gatewayExistingRefund,
      });
      return {
        success: true,
        status: 'completed',
        alreadyRefunded: true,
        refundId: gatewayExistingRefund.id,
      };
    }

    if (gatewayExistingRefund.status === 'pending') {
      logger.info(`[refundService] Found existing pending refund ${gatewayExistingRefund.id} on gateway. Keeping processing.`);
      return {
        success: true,
        status: 'processing',
        refundId: gatewayExistingRefund.id,
        pendingGatewayProcessing: true,
      };
    }

    if (gatewayExistingRefund.status === 'failed') {
      const failReason = gatewayExistingRefund.error_description || gatewayExistingRefund.error_reason || 'Gateway refund is in failed state';
      logger.warn(`[refundService] Found existing failed refund ${gatewayExistingRefund.id} on gateway: ${failReason}`);
      await markRefundIntentManualReview({
        intentId,
        reason: 'existing_gateway_refund_failed',
        errorMessage: failReason,
        gatewayResponse: gatewayExistingRefund,
      });
      return {
        success: false,
        status: 'manual_review',
        reason: 'existing_gateway_refund_failed',
        refundId: gatewayExistingRefund.id,
      };
    }

    // Unknown, incomplete, or corrupted gateway refund status (e.g. status is undefined, null, or unrecognized)
    const unknownStatusMsg = `Gateway refund ${gatewayExistingRefund.id} has unknown or incomplete status: '${gatewayExistingRefund.status}'. Flagging for manual review to prevent premature completion.`;
    logger.warn(`[refundService] ${unknownStatusMsg}`);
    await markRefundIntentManualReview({
      intentId,
      reason: 'unknown_gateway_refund_status',
      errorMessage: unknownStatusMsg,
      gatewayResponse: gatewayExistingRefund,
    });
    return {
      success: false,
      status: 'manual_review',
      reason: 'unknown_gateway_refund_status',
      refundId: gatewayExistingRefund.id,
    };
  }

  const amountRefunded = Number(paymentRecord.amount_refunded) || 0;

  if (amountRefunded >= amount) {
    // Payment was already 100% refunded!
    logger.info(`[refundService] Payment ${paymentId} is already fully refunded on gateway (${amountRefunded}/${amount} paise). Linking existing refund.`);
    let existingRefundId = paymentRecord.refund_id || null;

    if (!existingRefundId && typeof razorpay.payments.fetchMultipleRefund === 'function') {
      try {
        const multiple = await razorpay.payments.fetchMultipleRefund(paymentId, { count: 1 });
        existingRefundId = multiple?.items?.[0]?.id || null;
      } catch (mErr) {
        logger.warn(`[refundService] fetchMultipleRefund non-critical lookup failure: ${mErr.message}`);
      }
    }

    const finalRefundId = existingRefundId || `rfnd_existing_${paymentId.slice(-8)}`;

    await markRefundIntentCompleted({
      intentId,
      orderId,
      razorpayRefundId: finalRefundId,
      gatewayResponse: {
        note: 'Payment was already fully refunded on gateway prior to intent processing',
        amount_refunded: amountRefunded,
      },
    });

    return {
      success: true,
      status: 'completed',
      alreadyRefunded: true,
      refundId: finalRefundId,
    };
  }

  if (amountRefunded > 0 && amountRefunded < amount) {
    // Payment has partial refund outside this workflow: STOP and flag for manual review
    const reason = `Existing partial refund detected (${amountRefunded}/${amount} paise). Automated full refund halted to prevent exceeding captured total.`;
    logger.warn(`[refundService] ${reason}`);
    await markRefundIntentManualReview({
      intentId,
      reason: 'existing_partial_refund_detected',
      errorMessage: reason,
      gatewayResponse: { amount_refunded: amountRefunded },
    });
    return {
      success: false,
      status: 'manual_review',
      reason: 'existing_partial_refund_detected',
    };
  }

  // Verify payment status is 'captured'
  if (paymentRecord.status !== 'captured') {
    const reason = `Payment status is '${paymentRecord.status}' (expected 'captured')`;
    logger.error(`[refundService] ${reason}`);
    await markRefundIntentManualReview({
      intentId,
      reason: 'Payment not in captured state',
      errorMessage: reason,
    });
    return { success: false, status: 'manual_review', reason: 'payment_not_captured' };
  }

  // 4. Execute Idempotent Refund Request via Direct HTTPS Helper
  const refundResult = await executeIdempotentRefund({
    paymentId,
    amount,
    idempotencyKey,
    notes: {
      altneu_order_id: orderId,
      refund_intent_id: intentId,
      order_number: order.order_number,
    },
  });

  // 5. Handle Response & Durable State Transitions
  if (refundResult.ok && refundResult.data) {
    const refundData = refundResult.data;

    // RULE: "Never mark a refund completed merely because the request was sent."
    // Only mark completed if status is strictly 'processed'
    if (refundData.status === 'processed') {
      logger.info(`[refundService] Refund ${refundData.id} confirmed processed by gateway for intent ${intentId}`);
      await markRefundIntentCompleted({
        intentId,
        orderId,
        razorpayRefundId: refundData.id,
        gatewayResponse: refundData,
      });
      return {
        success: true,
        status: 'completed',
        refundId: refundData.id,
      };
    }

    if (refundData.status === 'failed') {
      const failReason = refundData.error_description || refundData.error_reason || 'Gateway refund returned failed status';
      logger.error(`[refundService] Refund ${refundData.id} failed for intent ${intentId}: ${failReason}`);
      await markRefundIntentManualReview({
        intentId,
        reason: 'Gateway refund returned failed status',
        errorMessage: failReason,
        gatewayResponse: refundData,
      });
      return {
        success: false,
        status: 'manual_review',
        reason: 'gateway_refund_failed',
        refundId: refundData.id,
      };
    }

    // Status is 'pending' or queued (e.g. instant refund pending bank settlement)
    logger.info(`[refundService] Refund ${refundData.id} initiated with status '${refundData.status}'. Awaiting gateway completion webhook.`);
    await recordRefundInitiated({
      intentId,
      razorpayRefundId: refundData.id,
      gatewayResponse: refundData,
    });
    return {
      success: true,
      status: 'processing',
      refundId: refundData.id,
      pendingGatewayProcessing: true,
    };
  }

  // 6. Handle HTTP 409 Conflict
  // Razorpay returns 409 when the initial request is still being processed
  if (refundResult.conflict || refundResult.status === 409) {
    logger.warn(`[refundService] HTTP 409 Conflict for intent ${intentId}. Request currently in progress at gateway. Releasing claim for subsequent retry.`);
    await releaseRefundIntentClaim({
      intentId,
      errorMessage: 'HTTP 409 Conflict: Gateway request in progress. Retrying with identical idempotency key.',
    });
    return {
      success: false,
      status: 'conflict_retryable',
      reason: 'gateway_processing_409',
    };
  }

  // 7. Handle Network Timeout / Ambiguous Network Disconnection
  if (refundResult.timeout || refundResult.networkError) {
    logger.warn(`[refundService] Network timeout/drop while calling refund API for intent ${intentId}. Reconciling gateway state...`);

    const reconciliation = await reconcileRefundWithGateway(paymentId, amount);
    if (reconciliation.found && reconciliation.refund) {
      const recRefund = reconciliation.refund;
      if (recRefund.status === 'processed') {
        logger.info(`[refundService] Timeout reconciled! Found completed refund ${recRefund.id} on gateway.`);
        await markRefundIntentCompleted({
          intentId,
          orderId,
          razorpayRefundId: recRefund.id,
          gatewayResponse: recRefund,
        });
        return {
          success: true,
          status: 'completed',
          reconciled: true,
          refundId: recRefund.id,
        };
      }
    }

    // Reconciliation could not confirm completion -> Flag for manual review to avoid double charges
    const timeoutMsg = `Network timeout during refund request. Gateway state uncertain: ${refundResult.error?.description || 'Timeout'}`;
    await markRefundIntentManualReview({
      intentId,
      reason: 'Ambiguous network timeout during refund request',
      errorMessage: timeoutMsg,
    });
    return {
      success: false,
      status: 'manual_review',
      reason: 'timeout_uncertain',
    };
  }

  // 8. Handle Gateway Errors & Insufficient Balance
  const errDesc = refundResult.error?.description || refundResult.error?.message || `HTTP ${refundResult.status}`;
  const errCode = refundResult.error?.code || '';

  // Insufficient balance error from Razorpay
  const isInsufficientBalance =
    errCode === 'BAD_REQUEST_PAYMENT_REFUND_AMOUNT_GREATER_THAN_BALANCE' ||
    /balance/i.test(errDesc);

  if (isInsufficientBalance) {
    const balMsg = `Gateway error: Insufficient merchant account balance to process refund (${errDesc})`;
    logger.error(`[refundService] ${balMsg}`);
    await markRefundIntentManualReview({
      intentId,
      reason: 'Insufficient merchant balance',
      errorMessage: balMsg,
      gatewayResponse: refundResult.error,
    });
    return {
      success: false,
      status: 'manual_review',
      reason: 'insufficient_balance',
    };
  }

  // Terminal 4xx Bad Request or unauthorized errors
  if (refundResult.status >= 400 && refundResult.status < 500) {
    logger.error(`[refundService] Terminal gateway rejection HTTP ${refundResult.status} for intent ${intentId}: ${errDesc}`);
    await markRefundIntentManualReview({
      intentId,
      reason: `Gateway rejected refund: ${errDesc}`,
      errorMessage: errDesc,
      gatewayResponse: refundResult.error,
    });
    return {
      success: false,
      status: 'manual_review',
      reason: 'gateway_rejection',
    };
  }

  // 5xx Gateway server errors: retry with backoff if attempts < 3
  if (intent.attempts && intent.attempts >= 3) {
    const maxRetryMsg = `Exceeded max retry attempts (3) after gateway 5xx errors: ${errDesc}`;
    logger.error(`[refundService] ${maxRetryMsg}`);
    await markRefundIntentManualReview({
      intentId,
      reason: 'Gateway 5xx retry limit reached',
      errorMessage: maxRetryMsg,
      gatewayResponse: refundResult.error,
    });
    return {
      success: false,
      status: 'manual_review',
      reason: 'max_retries_exceeded',
    };
  }

  // Release claim for retry with identical idempotency key
  logger.warn(`[refundService] Temporary 5xx gateway error (${errDesc}). Releasing claim for retry.`);
  await releaseRefundIntentClaim({
    intentId,
    errorMessage: `Temporary gateway error (${refundResult.status}): ${errDesc}`,
  });
  return {
    success: false,
    status: 'retryable_error',
    reason: errDesc,
  };
}

/**
 * Sweeper/Worker to process a batch of pending refund intents sequentially.
 * Uses atomic CAS claiming so multiple concurrent workers never process the same intent.
 *
 * NOTE: As per project policy, this worker is not auto-scheduled in production
 * until review approval.
 *
 * @param {object} [params]
 * @param {number} [params.batchSize=10]
 * @param {string} [params.workerId]
 * @returns {Promise<object>}
 */
export async function processPendingRefundIntents({ batchSize = 10, workerId } = {}) {
  if (!isPrivilegedDbAvailable()) {
    logger.error('[refundService] Cannot run refund worker: SUPABASE_SERVICE_ROLE_KEY is unconfigured');
    throw new ApiError(500, 'Database credentials unconfigured for refund worker');
  }

  const boundedBatch = Math.min(Math.max(1, Number(batchSize) || 10), 50);
  const cleanWorkerId = workerId || `worker_${crypto.randomUUID().slice(0, 8)}`;

  const summary = {
    scanned: 0,
    processed: 0,
    completed: 0,
    manualReview: 0,
    retried: 0,
    errors: 0,
    items: [],
  };

  logger.info(`[refundService] Starting refund worker run: batchSize=${boundedBatch}, workerId=${cleanWorkerId}`);

  for (let i = 0; i < boundedBatch; i++) {
    const claimResult = await claimRefundIntentAtomic({ workerId: cleanWorkerId });
    if (!claimResult.ok) {
      logger.error(`[refundService] Error during refund intent claim: ${claimResult.reason}`);
      summary.errors++;
      break;
    }

    const intent = claimResult.data;
    if (!intent) {
      // No pending intents available to claim
      break;
    }

    summary.scanned++;

    try {
      const result = await processRefundIntent(intent, cleanWorkerId);
      summary.processed++;

      if (result.status === 'completed') {
        summary.completed++;
      } else if (result.status === 'manual_review') {
        summary.manualReview++;
      } else if (result.status === 'conflict_retryable' || result.status === 'retryable_error') {
        summary.retried++;
      }

      summary.items.push({
        intentId: intent.id,
        orderId: intent.order_id,
        paymentId: intent.payment_id,
        result,
      });
    } catch (procErr) {
      logger.error(`[refundService] Unexpected exception processing intent ${intent.id}: ${procErr.message}`);
      summary.errors++;
      await releaseRefundIntentClaim({
        intentId: intent.id,
        errorMessage: `Worker error: ${procErr.message}`,
      }).catch(() => {});
    }
  }

  logger.info(`[refundService] Completed refund worker run: scanned=${summary.scanned}, completed=${summary.completed}, manualReview=${summary.manualReview}, retried=${summary.retried}, errors=${summary.errors}`);
  return summary;
}

/**
 * Handle verified refund webhook events (refund.created, refund.processed, refund.failed).
 *
 * Guarantees:
 * - Verified webhook signature against raw request body (caller handles verifyWebhookSignature).
 * - Deduplicates event processing using razorpay_webhook_events.
 * - Associates event with refund intent via notes.refund_intent_id, payment_id, or razorpay_refund_id.
 * - Idempotent and safe for concurrent deliveries.
 * - Out-of-order safety: Delayed events never overwrite completed or manual_review state.
 * - Treats webhook notifications as input for reconciliation rather than blindly trusting event order.
 * - Never marks completed unless gateway confirms status 'processed' and amount matches.
 *
 * @param {string} eventId
 * @param {string} eventType - 'refund.created' | 'refund.processed' | 'refund.failed'
 * @param {object} payload
 * @returns {Promise<object>}
 */
export async function handleRefundWebhookEvent(eventId, eventType, payload) {
  const refundEntity = payload?.payload?.refund?.entity;
  if (!refundEntity || typeof refundEntity !== 'object') {
    throw new ApiError(400, 'Malformed webhook refund entity');
  }

  const { id: refundId, payment_id: paymentId, status: refundStatus, amount, currency } = refundEntity;

  if (!refundId || typeof refundId !== 'string' || refundId.trim() === '') {
    throw new ApiError(400, 'Malformed webhook refund entity: missing or invalid refund ID');
  }

  if (!paymentId || typeof paymentId !== 'string' || paymentId.trim() === '') {
    throw new ApiError(400, 'Malformed webhook refund entity: missing or invalid payment ID');
  }

  const cleanRefundId = refundId.trim();
  const cleanPaymentId = paymentId.trim();
  const notes = refundEntity.notes || {};
  const intentId = notes.refund_intent_id;
  const altneuOrderId = notes.altneu_order_id;

  // 1. Locate refund intent
  let intent = null;
  if (intentId) {
    const byIdResult = await findRefundIntentById(intentId);
    if (byIdResult.ok && byIdResult.data) {
      intent = byIdResult.data;
    }
  }

  if (!intent) {
    const byRefundIdResult = await findRefundIntentByRazorpayRefundId(cleanRefundId);
    if (byRefundIdResult.ok && byRefundIdResult.data) {
      intent = byRefundIdResult.data;
    }
  }

  if (!intent && altneuOrderId) {
    const byOrderAndPayment = await findRefundIntentByOrderAndPayment(altneuOrderId, cleanPaymentId);
    if (byOrderAndPayment.ok && byOrderAndPayment.data) {
      intent = byOrderAndPayment.data;
    }
  }

  if (!intent) {
    const byPaymentResult = await findRefundIntentByPaymentId(cleanPaymentId);
    if (byPaymentResult.ok && byPaymentResult.data) {
      intent = byPaymentResult.data;
    }
  }

  // If no matching intent found in database
  if (!intent) {
    logger.warn(`[refundWebhook] No matching refund intent found for payment ${cleanPaymentId}, refund ${cleanRefundId}`);
    const recordResult = await recordWebhookEvent({
      eventId,
      eventType,
      orderId: altneuOrderId || null,
      payload,
    });
    if (!recordResult.ok) {
      throw new ApiError(500, 'Database error recording webhook event');
    }
    return {
      received: true,
      unmatchedIntent: true,
      eventId,
      refundId: cleanRefundId,
      paymentId: cleanPaymentId,
    };
  }

  // 2. Out-of-order & terminal state safety
  // If intent is already completed:
  if (intent.status === 'completed') {
    logger.info(`[refundWebhook] Intent ${intent.id} is already completed. Event ${eventType} acknowledged idempotently.`);
    const recordResult = await recordWebhookEvent({
      eventId,
      eventType,
      orderId: intent.order_id,
      payload,
    });
    if (!recordResult.ok) {
      throw new ApiError(500, 'Database error recording webhook event');
    }

    if (eventType === 'refund.failed') {
      logger.error(`[refundWebhook] CRITICAL: Received refund.failed for already completed intent ${intent.id}! Flagging for manual review.`);
      await markRefundIntentManualReview({
        intentId: intent.id,
        reason: 'Gateway reported refund.failed after completion',
        errorMessage: refundEntity.error_description || 'Refund failed at gateway after completion',
        gatewayResponse: refundEntity,
      });
      return {
        received: true,
        alreadyCompleted: true,
        anomaly: 'refund_failed_after_completed',
        intentId: intent.id,
        orderId: intent.order_id,
        eventId,
      };
    }

    return {
      received: true,
      alreadyCompleted: true,
      intentId: intent.id,
      orderId: intent.order_id,
      eventId,
    };
  }

  // If intent is in manual_review:
  if (intent.status === 'manual_review') {
    logger.warn(`[refundWebhook] Intent ${intent.id} is in manual_review. Event ${eventType} recorded without resetting status.`);
    const recordResult = await recordWebhookEvent({
      eventId,
      eventType,
      orderId: intent.order_id,
      payload,
    });
    if (!recordResult.ok) {
      throw new ApiError(500, 'Database error recording webhook event');
    }

    return {
      received: true,
      manualReviewPreserved: true,
      intentId: intent.id,
      orderId: intent.order_id,
      eventId,
    };
  }

  // 3. Process according to event type and status
  if (eventType === 'refund.processed' || (eventType === 'refund.created' && refundStatus === 'processed')) {
    // Validate amount matches expected paise
    if (typeof amount === 'number' && amount !== intent.amount) {
      const mismatchMsg = `Webhook refund amount (${amount}) does not match intent amount (${intent.amount})`;
      logger.error(`[refundWebhook] ${mismatchMsg}`);
      await markRefundIntentManualReview({
        intentId: intent.id,
        reason: 'Refund amount mismatch on webhook',
        errorMessage: mismatchMsg,
        gatewayResponse: refundEntity,
      });
      await recordWebhookEvent({ eventId, eventType, orderId: intent.order_id, payload });
      return {
        received: true,
        status: 'manual_review',
        reason: 'amount_mismatch',
        intentId: intent.id,
        orderId: intent.order_id,
        eventId,
      };
    }

    logger.info(`[refundWebhook] Marking refund intent ${intent.id} completed via gateway webhook ${eventId}`);
    await markRefundIntentCompleted({
      intentId: intent.id,
      orderId: intent.order_id,
      razorpayRefundId: cleanRefundId,
      gatewayResponse: refundEntity,
    });

    await recordWebhookEvent({
      eventId,
      eventType,
      orderId: intent.order_id,
      payload,
    });

    return {
      received: true,
      success: true,
      status: 'completed',
      refundId: cleanRefundId,
      intentId: intent.id,
      orderId: intent.order_id,
      eventId,
    };
  }

  if (eventType === 'refund.failed') {
    const errorReason = refundEntity.error_description || refundEntity.error_reason || 'Gateway refund failed';
    logger.error(`[refundWebhook] Refund ${cleanRefundId} failed for intent ${intent.id}: ${errorReason}`);

    await markRefundIntentManualReview({
      intentId: intent.id,
      reason: `Gateway refund failed: ${errorReason}`,
      errorMessage: errorReason,
      gatewayResponse: refundEntity,
    });

    await recordWebhookEvent({
      eventId,
      eventType,
      orderId: intent.order_id,
      payload,
    });

    return {
      received: true,
      success: true,
      status: 'failed',
      reason: errorReason,
      refundId: cleanRefundId,
      intentId: intent.id,
      orderId: intent.order_id,
      eventId,
    };
  }

  if (eventType === 'refund.created' && refundStatus === 'pending') {
    logger.info(`[refundWebhook] Refund ${cleanRefundId} created with status pending for intent ${intent.id}`);
    await recordRefundInitiated({
      intentId: intent.id,
      razorpayRefundId: cleanRefundId,
      gatewayResponse: refundEntity,
    });

    await recordWebhookEvent({
      eventId,
      eventType,
      orderId: intent.order_id,
      payload,
    });

    return {
      received: true,
      status: 'processing',
      refundId: cleanRefundId,
      intentId: intent.id,
      orderId: intent.order_id,
      eventId,
    };
  }

  if (eventType === 'refund.speed_changed') {
    const speedRequested = refundEntity.speed_requested || 'optimum';
    const speedProcessed = refundEntity.speed_processed || 'normal';
    logger.info(`[refundWebhook] Refund ${cleanRefundId} speed changed from ${speedRequested} to ${speedProcessed} for intent ${intent.id}`);

    // Update gateway_response with speed metadata without altering core lifecycle status
    await recordRefundInitiated({
      intentId: intent.id,
      razorpayRefundId: cleanRefundId,
      gatewayResponse: {
        ...(intent.gateway_response || {}),
        speed_requested: speedRequested,
        speed_processed: speedProcessed,
        speed_changed_at: new Date().toISOString(),
      },
    });

    await recordWebhookEvent({
      eventId,
      eventType,
      orderId: intent.order_id,
      payload,
    });

    return {
      received: true,
      success: true,
      speedChanged: true,
      speedRequested,
      speedProcessed,
      refundId: cleanRefundId,
      intentId: intent.id,
      orderId: intent.order_id,
      eventId,
    };
  }

  // Default fallback for any other refund event
  await recordWebhookEvent({
    eventId,
    eventType,
    orderId: intent.order_id,
    payload,
  });

  return {
    received: true,
    ignored: true,
    event: eventType,
    eventId,
  };
}

