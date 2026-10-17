import crypto from 'crypto';
import Razorpay from 'razorpay';
import { config } from '../config/index.js';
import { isPrivilegedDbAvailable } from '../database/client.js';
import { ApiError } from '../utils/apiError.js';
import { logger } from '../utils/logger.js';
import {
  findOrderByIdRaw,
  findOrderByRazorpayOrderId,
  setOrderRazorpayOrderId,
  updateOrderPaymentSuccessAtomic,
  recordPaymentAttemptFailure,
  isWebhookProcessed,
  recordWebhookEvent,
  recordLateCaptureOnCancelledOrder,
  isMigration011Available,
} from '../repositories/order.repository.js';
import { createLateCaptureRefundIntent, handleRefundWebhookEvent } from './refund.service.js';
import { placeOrder, normalizeOrder } from './order.service.js';
import { recordOrderHistory } from './orderHistory.service.js';
import { sendOrderConfirmationEmail } from './email.service.js';
import {
  validatePaymentVerificationPayload,
  validateCreatePaymentOrderPayload,
} from '../validators/payment.validator.js';

let razorpayClientInstance = null;
const inflightOrderCreations = new Map();
const inflightWebhookEvents = new Map();

/**
 * Get or initialize the singleton Razorpay SDK instance.
 * @returns {Razorpay|null}
 */
export function getRazorpayClient() {
  if (razorpayClientInstance) return razorpayClientInstance;
  if (!config.razorpay.configured) {
    return null;
  }
  razorpayClientInstance = new Razorpay({
    key_id: config.razorpay.keyId,
    key_secret: config.razorpay.keySecret,
  });
  return razorpayClientInstance;
}

/**
 * Override or inject a mock Razorpay client (e.g. for unit and integration testing).
 * @param {object|null} client
 */
export function setRazorpayClient(client) {
  razorpayClientInstance = client;
}

/**
 * Verify Razorpay payment signature using timing-safe comparison.
 * Formula: HMAC-SHA256(razorpayOrderId + "|" + razorpayPaymentId, keySecret)
 *
 * @param {string} razorpayOrderId
 * @param {string} razorpayPaymentId
 * @param {string} razorpaySignature
 * @returns {boolean}
 * @throws {ApiError} 400 when invalid, 500 when secret key is unconfigured
 */
export function verifySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature) {
  const secret = config.razorpay.keySecret;
  if (!secret) {
    throw new ApiError(500, 'Razorpay gateway secret is not configured');
  }

  const payload = `${razorpayOrderId}|${razorpayPaymentId}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  const expectedBuf = Buffer.from(expectedSignature, 'utf8');
  const actualBuf = Buffer.from(String(razorpaySignature || ''), 'utf8');

  if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
    throw new ApiError(400, 'Invalid payment signature. Verification failed.');
  }

  return true;
}

/**
 * Assert caller ownership over an order.
 * Registered users are verified against order.user_id.
 * Guest checkout orders (user_id === null) require a matching session identifier.
 * Does not rely on possession of order ID alone.
 *
 * @param {object} order
 * @param {object} caller
 */
function assertOrderOwnership(order, caller) {
  if (order.user_id) {
    if (!caller.user_id || order.user_id !== caller.user_id) {
      throw new ApiError(403, 'Unauthorized access to this order');
    }
    return;
  }

  // Guest order (user_id is null)
  const orderGuestSession =
    order.guest_session_id ||
    order.guestSessionId ||
    order.session_id ||
    order.sessionId ||
    order.contact?.sessionId ||
    order.contact?.session_id;

  if (!caller.session_id || !orderGuestSession || caller.session_id !== orderGuestSession) {
    throw new ApiError(403, 'Unauthorized access to this guest order');
  }
}

/**
 * Create or reuse a Razorpay payment order for an ALTNEU order.
 * - Enforces server-side price computation (never accepts client money totals).
 * - Binds the Razorpay order ID directly to the ALTNEU order in the database.
 * - Idempotently returns existing Razorpay order ID if already initialized, preventing double-reservations.
 * - Uses in-flight single-flight coalescing and database atomic CAS to prevent race conditions.
 *
 * @param {object} body   request body (contains orderId or checkout parameters)
 * @param {object} caller { user_id, session_id }
 * @returns {Promise<object>}
 */
export async function createPaymentOrder(body = {}, caller = {}) {
  if (!isPrivilegedDbAvailable()) {
    logger.error('[payment] Cannot initialize payment order: SUPABASE_SERVICE_ROLE_KEY is not configured');
    throw new ApiError(500, 'Payment service is unavailable due to missing database credentials');
  }

  if (isMigration011Available() === false) {
    logger.warn('[payment] Cannot initialize payment order: database migration 011 is required');
    throw new ApiError(503, 'Payment gateway unavailable: database migration 011 required');
  }

  const { orderId } = validateCreatePaymentOrderPayload(body);

  let order;
  if (orderId) {
    const orderResult = await findOrderByIdRaw(orderId);
    if (!orderResult.ok) {
      logger.error(`[payment] Failed to load order ${orderId}: ${orderResult.reason}`);
      throw new ApiError(500, 'Failed to retrieve order');
    }
    order = orderResult.data;
    if (!order) {
      throw new ApiError(404, 'Order not found');
    }
  } else if (body.shipping) {
    // 1-step checkout: place the ALTNEU order first with payment_method: 'razorpay'
    const owner = caller.user_id ? { user_id: caller.user_id } : { session_id: caller.session_id };
    const placement = await placeOrder(owner, { ...body, payment: 'razorpay' });
    order = placement.order;
  } else {
    throw new ApiError(400, 'orderId is required to initialize payment');
  }

  assertOrderOwnership(order, caller);

  // Status check: must be pending and unpaid/failed
  if (order.payment_status === 'paid' || order.paymentStatus === 'paid') {
    throw new ApiError(400, 'Order has already been paid');
  }

  const currentStatus = order.status;
  const currentPaymentStatus = order.payment_status || order.paymentStatus;
  if (currentStatus !== 'pending' || !['pending', 'failed'].includes(currentPaymentStatus)) {
    throw new ApiError(400, `Order is not eligible for payment (status: ${currentStatus}, payment_status: ${currentPaymentStatus})`);
  }

  // Derive exact amount in paise and currency strictly from server-side order calculation
  const grandTotal = Number(order.grand_total ?? order.totals?.grandTotal);
  if (!Number.isFinite(grandTotal) || grandTotal <= 0) {
    throw new ApiError(400, 'Invalid order grand total');
  }
  const amountPaise = Math.round(grandTotal * 100);
  const currency = order.currency || 'INR';

  // Idempotency: If Razorpay order is already linked, reuse it verbatim
  const existingRzpOrderId = order.razorpay_order_id || order.razorpayOrderId;
  if (existingRzpOrderId) {
    return {
      success: true,
      orderId: order.id,
      orderNumber: order.order_number || order.orderNumber,
      razorpayOrderId: existingRzpOrderId,
      amount: amountPaise,
      currency,
      keyId: config.razorpay.keyId,
      reused: true,
    };
  }

  // Coalesce in-flight requests for the same orderId within the process
  if (inflightOrderCreations.has(order.id)) {
    return inflightOrderCreations.get(order.id);
  }

  const creationTask = (async () => {
    // Re-check DB in case another process already completed initialization
    const freshOrderResult = await findOrderByIdRaw(order.id);
    const freshRzpId = freshOrderResult.data?.razorpay_order_id || freshOrderResult.data?.razorpayOrderId;
    if (freshRzpId) {
      return {
        success: true,
        orderId: order.id,
        orderNumber: order.order_number || order.orderNumber,
        razorpayOrderId: freshRzpId,
        amount: amountPaise,
        currency,
        keyId: config.razorpay.keyId,
        reused: true,
      };
    }

    const razorpay = getRazorpayClient();
    if (!razorpay) {
      throw new ApiError(500, 'Razorpay payment gateway is not configured');
    }

    const orderNumber = order.order_number || order.orderNumber;
    let razorpayOrder;
    try {
      razorpayOrder = await razorpay.orders.create({
        amount: amountPaise,
        currency,
        receipt: String(orderNumber).slice(0, 40),
        notes: {
          altneu_order_id: order.id,
          order_number: orderNumber,
        },
      });
    } catch (err) {
      logger.error(`[payment] Razorpay orders.create failed for order ${order.id}: ${err.message}`);
      throw new ApiError(502, `Payment gateway failed to initialize order: ${err.message}`);
    }

    // Persist razorpay_order_id link atomically (CAS: only updates if razorpay_order_id IS NULL)
    const linkResult = await setOrderRazorpayOrderId(order.id, razorpayOrder.id);
    if (!linkResult.ok) {
      if (linkResult.missingMigration) {
        logger.warn(`[payment] Failed to bind razorpay_order_id to order ${order.id}: Migration 011 required`);
        throw new ApiError(503, 'Payment gateway unavailable: database migration 011 required');
      }
      logger.error(`[payment] Failed to bind razorpay_order_id to order ${order.id}: ${linkResult.reason}`);
      throw new ApiError(500, 'Failed to associate payment gateway order');
    }

    // If linkResult.data is null, another concurrent process won the atomic link race
    if (!linkResult.data) {
      const winner = await findOrderByIdRaw(order.id);
      const winnerRzpId = winner.data?.razorpay_order_id || winner.data?.razorpayOrderId;
      if (winnerRzpId) {
        return {
          success: true,
          orderId: order.id,
          orderNumber,
          razorpayOrderId: winnerRzpId,
          amount: amountPaise,
          currency,
          keyId: config.razorpay.keyId,
          reused: true,
        };
      }
      throw new ApiError(409, 'Conflict initializing payment gateway order');
    }

    return {
      success: true,
      orderId: order.id,
      orderNumber,
      razorpayOrderId: razorpayOrder.id,
      amount: amountPaise,
      currency,
      keyId: config.razorpay.keyId,
      reused: false,
    };
  })();

  inflightOrderCreations.set(order.id, creationTask);
  try {
    return await creationTask;
  } finally {
    inflightOrderCreations.delete(order.id);
  }
}

/**
 * Dual-layer payment verification:
 * 1. Cryptographic HMAC SHA256 signature verification with timing-attack safety.
 * 2. Server-to-server Razorpay API status fetch (amount, currency, order_id, captured status).
 * 3. Atomic compare-and-swap state transition to 'paid' / 'confirmed'.
 * 4. Payment-gated confirmation email dispatch (only on winning transition).
 *
 * @param {object} body   { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature }
 * @param {object} caller { user_id, session_id }
 * @returns {Promise<object>}
 */
export async function verifyPayment(body = {}, caller = {}) {
  if (!isPrivilegedDbAvailable()) {
    logger.error('[payment] Cannot verify payment: SUPABASE_SERVICE_ROLE_KEY is not configured');
    throw new ApiError(500, 'Payment service is unavailable due to missing database credentials');
  }

  if (isMigration011Available() === false) {
    logger.warn('[payment] Cannot verify payment: database migration 011 is required');
    throw new ApiError(503, 'Payment gateway unavailable: database migration 011 required');
  }

  const {
    orderId,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  } = validatePaymentVerificationPayload(body);

  // 1. Fetch internal order
  const orderResult = await findOrderByIdRaw(orderId);
  if (!orderResult.ok) {
    logger.error(`[payment] Failed to load order ${orderId} during verification: ${orderResult.reason}`);
    throw new ApiError(500, 'Failed to retrieve order for verification');
  }
  const order = orderResult.data;
  if (!order) {
    throw new ApiError(404, 'Order not found');
  }

  // 2. Ownership assert
  assertOrderOwnership(order, caller);

  // 3. Bound order check
  if (order.razorpay_order_id && order.razorpay_order_id !== razorpayOrderId) {
    throw new ApiError(400, 'Razorpay Order ID mismatch for this order');
  }

  // 4. Duplicate verification idempotency guard
  if (order.payment_status === 'paid') {
    if (order.razorpay_payment_id === razorpayPaymentId) {
      // Replay success safely without duplicate emails or history writes
      return {
        success: true,
        alreadyPaid: true,
        order: normalizeOrder(order),
      };
    }
    throw new ApiError(400, 'Order is already marked paid with a different payment ID');
  }

  if (order.status === 'cancelled') {
    throw new ApiError(400, 'Order has been cancelled and cannot be paid');
  }
  if (order.status === 'refunded' || order.payment_status === 'refunded') {
    throw new ApiError(400, 'Order has been refunded and cannot be paid');
  }

  try {
    // 5. Layer 1: Cryptographic HMAC SHA256 Signature Verification
    verifySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);

    // 6. Layer 2: Server-to-Server Gateway Cross-Check (Razorpay API)
    const razorpay = getRazorpayClient();
    if (!razorpay) {
      throw new ApiError(500, 'Razorpay payment gateway is not configured');
    }

    let paymentRecord;
    try {
      paymentRecord = await razorpay.payments.fetch(razorpayPaymentId);
    } catch (err) {
      logger.error(`[payment] Razorpay payments.fetch failed for ${razorpayPaymentId}: ${err.message}`);
      throw new ApiError(400, 'Payment transaction not found on Razorpay');
    }

    if (!paymentRecord) {
      throw new ApiError(400, 'Payment transaction not found on Razorpay');
    }

    const expectedPaise = Math.round(Number(order.grand_total) * 100);
    if (paymentRecord.amount !== expectedPaise) {
      throw new ApiError(400, 'Payment amount mismatch between gateway and order');
    }

    const expectedCurrency = order.currency || 'INR';
    if (paymentRecord.currency !== expectedCurrency) {
      throw new ApiError(400, 'Invalid transaction currency');
    }

    if (paymentRecord.order_id !== razorpayOrderId) {
      throw new ApiError(400, 'Payment entity does not correspond to this Razorpay order');
    }

    if (paymentRecord.status !== 'captured' && paymentRecord.status !== 'authorized') {
      throw new ApiError(400, `Payment is not in captured state (current status: ${paymentRecord.status})`);
    }

    // 7. Atomic Compare-And-Swap Database Transition
    const updateResult = await updateOrderPaymentSuccessAtomic({
      orderId: order.id,
      razorpayPaymentId,
      razorpaySignature,
    });

    if (!updateResult.ok) {
      if (updateResult.missingMigration) {
        logger.warn(`[payment] DB update failed for order ${order.id}: Migration 011 required`);
        throw new ApiError(503, 'Payment gateway unavailable: database migration 011 required');
      }
      logger.error(`[payment] DB update failed for order ${order.id}: ${updateResult.reason}`);
      throw new ApiError(500, 'Database error while marking order as paid');
    }

    let updatedOrder = updateResult.data;
    let isWinningTransition = Boolean(updatedOrder);

    // If update returned null, a concurrent call or webhook may have won
    if (!updatedOrder) {
      const freshResult = await findOrderByIdRaw(order.id);
      if (freshResult.ok && freshResult.data?.payment_status === 'paid') {
        updatedOrder = freshResult.data;
        isWinningTransition = false;
      } else {
        throw new ApiError(409, 'Concurrent state conflict while updating order payment status');
      }
    }

    const normalized = normalizeOrder(updatedOrder);

    // 8. Winning transition side effects: dispatch confirmation email & record history
    if (isWinningTransition) {
      sendOrderConfirmationEmail(normalized).catch((err) => {
        logger.error('[email] Error sending post-verification order confirmation email:', err);
      });

      recordOrderHistory(order.id, 'confirmed', 'system').catch((err) => {
        logger.warn(`[orders] Confirmed history record failed for order ${order.id}: ${err.message}`);
      });
    }

    return {
      success: true,
      alreadyPaid: !isWinningTransition,
      order: normalized,
    };
  } catch (err) {
    // Attempt failure logging (preserves pending order & stock for retries)
    if (err.status === 400 || err.statusCode === 400) {
      recordPaymentAttemptFailure(order.id, err.message).catch((logErr) => {
        logger.warn(`[payment] Failed to log payment attempt failure for order ${order.id}: ${logErr.message}`);
      });
    }
    throw err;
  }
}

/**
 * Verify Razorpay Webhook signature using HMAC SHA-256 against the exact raw request body.
 * Never uses re-serialized JSON.
 *
 * @param {Buffer|string} rawBody Exact raw request body Buffer captured by body parser
 * @param {string} signature Value of X-Razorpay-Signature header
 * @returns {boolean}
 * @throws {ApiError} 400 when signature/rawBody is missing or invalid, 500 when webhook secret is unconfigured
 */
export function verifyWebhookSignature(rawBody, signature) {
  const secret = config.razorpay.webhookSecret;
  if (!secret) {
    throw new ApiError(500, 'Razorpay webhook secret is not configured');
  }

  if (!rawBody || (Buffer.isBuffer(rawBody) && rawBody.length === 0) || (typeof rawBody === 'string' && rawBody.trim() === '')) {
    throw new ApiError(400, 'Missing raw request body for webhook verification');
  }

  if (!signature || typeof signature !== 'string' || signature.trim() === '') {
    throw new ApiError(400, 'Missing X-Razorpay-Signature header');
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const expectedBuf = Buffer.from(expectedSignature, 'utf8');
  const actualBuf = Buffer.from(signature.trim(), 'utf8');

  if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
    throw new ApiError(400, 'Invalid webhook signature');
  }

  return true;
}

/**
 * Ingest, deduplicate, and process Razorpay webhook events.
 *
 * Supported events:
 *  - payment.captured: verifies order association, amount, currency, and performs atomic transition to 'paid'
 *  - payment.failed: records attempt-level failure diagnostics on pending orders; never downgrades paid orders
 *
 * Out-of-order & concurrency guarantees:
 *  - In-flight promise map coalesces concurrent requests within the process.
 *  - Database deduplication table `razorpay_webhook_events` prevents reprocessing.
 *  - CAS atomic database updates prevent duplicate payment confirmation or race conditions.
 *  - Side effects (confirmation email & order history) are only executed on winning transitions.
 *  - Safe policy for late capture on cancelled orders: flags for manual triage, does not resurrect or auto-refund.
 *
 * @param {object|Buffer|string} arg1 { rawBody, signature, eventId, payload } or rawBody
 * @param {string} [arg2] signature
 * @param {string} [arg3] eventId
 * @param {object} [arg4] payload
 * @returns {Promise<object>}
 */
export async function handleWebhookEvent(arg1, arg2, arg3, arg4) {
  let rawBody, signature, eventId, payload;
  if (typeof arg1 === 'object' && arg1 !== null && !Buffer.isBuffer(arg1) && ('rawBody' in arg1 || 'signature' in arg1)) {
    ({ rawBody, signature, eventId, payload } = arg1);
  } else {
    rawBody = arg1;
    signature = arg2;
    eventId = arg3;
    payload = arg4;
  }

  // 1. Webhook Signature Verification against raw request body
  verifyWebhookSignature(rawBody, signature);

  // 2. Validate Event ID
  if (!eventId || typeof eventId !== 'string' || eventId.trim() === '') {
    throw new ApiError(400, 'Missing Razorpay event ID');
  }
  const cleanEventId = eventId.trim();

  // 3. Ensure database service-role privileges are available
  if (!isPrivilegedDbAvailable()) {
    logger.error('[payment] Cannot process webhook: SUPABASE_SERVICE_ROLE_KEY is not configured');
    throw new ApiError(500, 'Webhook processing unavailable due to missing database credentials');
  }

  // 4. Coalesce concurrent in-flight deliveries within this process
  if (inflightWebhookEvents.has(cleanEventId)) {
    return await inflightWebhookEvents.get(cleanEventId);
  }

  const executionTask = (async () => {
    // 5. Database-level deduplication check via public.razorpay_webhook_events
    const checkResult = await isWebhookProcessed(cleanEventId);
    if (!checkResult.ok) {
      if (checkResult.missingMigration) {
        logger.warn(`[webhook] Webhook deduplication check failed: Migration 011 required`);
        throw new ApiError(503, 'Payment webhook processing unavailable: database migration 011 required');
      }
      logger.error(`[webhook] Error checking deduplication for event ${cleanEventId}: ${checkResult.reason}`);
      throw new ApiError(500, 'Database error checking webhook deduplication');
    }
    if (checkResult.data) {
      return {
        received: true,
        duplicate: true,
        eventId: cleanEventId,
        processedAt: checkResult.record?.processed_at,
      };
    }

    // 6. Safely resolve payload
    let parsedPayload = payload;
    if (!parsedPayload) {
      try {
        const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
        parsedPayload = JSON.parse(bodyStr);
      } catch (parseErr) {
        throw new ApiError(400, 'Malformed webhook payload JSON');
      }
    }

    const eventType = parsedPayload?.event;
    if (!eventType) {
      throw new ApiError(400, 'Missing event type in webhook payload');
    }

    // 7. Event Routing
    if (eventType === 'payment.captured') {
      return await processPaymentCapturedEvent(cleanEventId, eventType, parsedPayload);
    }

    if (eventType === 'payment.failed') {
      return await processPaymentFailedEvent(cleanEventId, eventType, parsedPayload);
    }

    if (
      eventType === 'refund.created' ||
      eventType === 'refund.processed' ||
      eventType === 'refund.failed' ||
      eventType === 'refund.speed_changed'
    ) {
      return await handleRefundWebhookEvent(cleanEventId, eventType, parsedPayload);
    }

    // Unsupported event types (e.g., payment.authorized, order.paid):
    // Record event as received and return 200 ignored to avoid redelivery loops
    const recordResult = await recordWebhookEvent({
      eventId: cleanEventId,
      eventType,
      orderId: null,
      payload: parsedPayload,
    });
    if (!recordResult.ok) {
      logger.error(`[webhook] Failed to record ignored webhook event ${cleanEventId}: ${recordResult.reason}`);
      throw new ApiError(500, 'Database error recording webhook event');
    }

    return {
      received: true,
      ignored: true,
      event: eventType,
      eventId: cleanEventId,
    };
  })();

  inflightWebhookEvents.set(cleanEventId, executionTask);
  try {
    return await executionTask;
  } finally {
    inflightWebhookEvents.delete(cleanEventId);
  }
}

/**
 * Process a verified payment.captured event.
 */
async function processPaymentCapturedEvent(eventId, eventType, payload) {
  const paymentEntity = payload?.payload?.payment?.entity;
  if (!paymentEntity || typeof paymentEntity !== 'object') {
    throw new ApiError(400, 'Malformed webhook payment entity');
  }

  const { id: paymentId, order_id: rzpOrderId, status, amount, currency } = paymentEntity;

  if (!paymentId || typeof paymentId !== 'string' || paymentId.trim() === '') {
    throw new ApiError(400, 'Malformed webhook payment entity: missing or invalid payment ID');
  }

  if (!rzpOrderId || typeof rzpOrderId !== 'string' || rzpOrderId.trim() === '') {
    throw new ApiError(400, 'Malformed webhook payment entity: missing or invalid order ID');
  }

  // Verify that the payment status is actually captured
  if (status !== 'captured') {
    throw new ApiError(400, `Payment entity status is not captured (received: ${status})`);
  }

  // Validate amount format (positive integer paise)
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
    throw new ApiError(400, 'Malformed webhook payment entity: invalid amount');
  }

  // Validate currency format
  if (!currency || typeof currency !== 'string') {
    throw new ApiError(400, 'Malformed webhook payment entity: invalid currency');
  }

  // Look up order associated with the Razorpay order ID
  const orderResult = await findOrderByRazorpayOrderId(rzpOrderId);
  if (!orderResult.ok) {
    if (orderResult.missingMigration) {
      logger.warn(`[webhook] Razorpay webhook failed for order ${rzpOrderId}: Migration 011 required`);
      throw new ApiError(503, 'Payment gateway processing unavailable: database migration 011 required');
    }
    logger.error(`[webhook] Database lookup failed for Razorpay order ${rzpOrderId}: ${orderResult.reason}`);
    throw new ApiError(500, 'Database error retrieving order for webhook');
  }

  const order = orderResult.data;
  if (!order) {
    logger.warn(`[webhook] Order not found for Razorpay order ID: ${rzpOrderId}`);
    throw new ApiError(404, 'No matching order found for Razorpay order ID');
  }

  // Explicit check on order relationship
  if (order.razorpay_order_id && order.razorpay_order_id !== rzpOrderId) {
    throw new ApiError(400, 'Razorpay Order ID mismatch for this order');
  }

  // Validate amount in paise against ALTNEU order
  const expectedPaise = Math.round(Number(order.grand_total) * 100);
  if (amount !== expectedPaise) {
    logger.warn(`[webhook] Amount mismatch on order ${order.id}: expected ${expectedPaise}, received ${amount}`);
    throw new ApiError(400, 'Payment amount mismatch between gateway and order');
  }

  // Validate currency against ALTNEU order
  const expectedCurrency = order.currency || 'INR';
  if (currency !== expectedCurrency) {
    logger.warn(`[webhook] Currency mismatch on order ${order.id}: expected ${expectedCurrency}, received ${currency}`);
    throw new ApiError(400, 'Payment currency mismatch between gateway and order');
  }

  // Handle cancelled order: Durable recovery policy for late capture (Phase 5B)
  // Guarantees:
  // - A late capture must NOT resurrect a cancelled order or restore its stock again.
  // - Ingests webhook event and creates durable public.refund_intents record atomically.
  // - Enforces database uniqueness on (order_id, payment_id).
  // - Flagged for review / durable recovery; never marks completed merely because request was sent.
  if (order.status === 'cancelled') {
    logger.warn(`[webhook] Late capture on cancelled order ${order.id} (payment: ${paymentEntity.id}). Creating durable refund intent.`);
    const auditPayload = {
      ...payload,
      audit_note: 'Late capture on cancelled order: manual review required / refund intent created',
    };

    const intentResult = await createLateCaptureRefundIntent({
      eventId,
      eventType,
      orderId: order.id,
      payload: auditPayload,
      paymentId: paymentEntity.id,
      amount,
      currency,
      reason: 'Late capture on cancelled or expired order',
    });

    if (!intentResult.ok) {
      logger.error(`[webhook] Failed to record refund intent for cancelled order ${order.id}: ${intentResult.reason}`);
      throw new ApiError(500, 'Database error recording late capture refund intent');
    }

    return {
      received: true,
      status: 'late_capture_on_cancelled_order',
      isWinningTransition: false,
      orderId: order.id,
      eventId,
      refundIntentId: intentResult.data?.id,
      refundIntentStatus: intentResult.data?.status || 'pending',
    };
  }

  // If already paid with this payment ID, idempotent acknowledgment
  if (order.payment_status === 'paid') {
    if (order.razorpay_payment_id === paymentEntity.id) {
      const recordResult = await recordWebhookEvent({
        eventId,
        eventType,
        orderId: order.id,
        payload,
      });
      if (!recordResult.ok) {
        throw new ApiError(500, 'Database error recording webhook event');
      }
      return {
        received: true,
        alreadyPaid: true,
        isWinningTransition: false,
        orderId: order.id,
        eventId,
      };
    }

    // Already paid with a different payment ID
    logger.warn(`[webhook] Order ${order.id} already paid with payment ID ${order.razorpay_payment_id}, received ${paymentEntity.id}`);
    const recordResult = await recordWebhookEvent({
      eventId,
      eventType,
      orderId: order.id,
      payload: { ...payload, audit_note: 'Ignored: order already paid with different payment ID' },
    });
    if (!recordResult.ok) {
      throw new ApiError(500, 'Database error recording webhook event');
    }
    return {
      received: true,
      ignored: true,
      isWinningTransition: false,
      reason: 'already_paid_with_different_payment_id',
      orderId: order.id,
      eventId,
    };
  }

  // Atomic state transition: marks order as 'paid' and 'confirmed'
  const updateResult = await updateOrderPaymentSuccessAtomic({
    orderId: order.id,
    razorpayPaymentId: paymentEntity.id,
    razorpaySignature: 'webhook_verified',
  });

  if (!updateResult.ok) {
    logger.error(`[webhook] Failed to update payment status for order ${order.id}: ${updateResult.reason}`);
    throw new ApiError(500, 'Database error updating order payment status');
  }

  const updatedOrder = updateResult.data;
  const isWinningTransition = Boolean(updatedOrder);

  // If update returned null, check whether another handler won the transition
  if (!updatedOrder) {
    const freshResult = await findOrderByIdRaw(order.id);
    if (!freshResult.ok || !freshResult.data || freshResult.data.payment_status !== 'paid') {
      throw new ApiError(409, 'Concurrent state conflict while updating order payment status');
    }
  }

  // Dispatch side effects ONLY on winning transition
  if (isWinningTransition && updatedOrder) {
    const normalized = normalizeOrder(updatedOrder);
    sendOrderConfirmationEmail(normalized).catch((err) => {
      logger.error('[email] Error sending post-verification order confirmation email:', err);
    });

    recordOrderHistory(order.id, 'confirmed', 'system').catch((err) => {
      logger.warn(`[orders] Confirmed history record failed for order ${order.id}: ${err.message}`);
    });
  }

  // Persist webhook event in public.razorpay_webhook_events
  const recordResult = await recordWebhookEvent({
    eventId,
    eventType,
    orderId: order.id,
    payload,
  });

  if (!recordResult.ok) {
    logger.error(`[webhook] Failed to record webhook event ${eventId}: ${recordResult.reason}`);
    throw new ApiError(500, 'Database error recording webhook event');
  }

  return {
    received: true,
    success: true,
    isWinningTransition,
    orderId: order.id,
    eventId,
  };
}

/**
 * Process a verified payment.failed event.
 */
async function processPaymentFailedEvent(eventId, eventType, payload) {
  const paymentEntity = payload?.payload?.payment?.entity;
  if (!paymentEntity || typeof paymentEntity !== 'object') {
    throw new ApiError(400, 'Malformed webhook payment entity');
  }

  const { order_id: rzpOrderId, status } = paymentEntity;

  if (!rzpOrderId || typeof rzpOrderId !== 'string' || rzpOrderId.trim() === '') {
    throw new ApiError(400, 'Malformed webhook payment entity: missing or invalid order ID');
  }

  if (status && status !== 'failed') {
    throw new ApiError(400, `Payment entity status is not failed (received: ${status})`);
  }

  const orderResult = await findOrderByRazorpayOrderId(rzpOrderId);
  if (!orderResult.ok) {
    if (orderResult.missingMigration) {
      logger.warn(`[webhook] Razorpay payment.failed handling failed for order ${rzpOrderId}: Migration 011 required`);
      throw new ApiError(503, 'Payment gateway processing unavailable: database migration 011 required');
    }
    logger.error(`[webhook] Database lookup failed for Razorpay order ${rzpOrderId}: ${orderResult.reason}`);
    throw new ApiError(500, 'Database error retrieving order for webhook');
  }

  const order = orderResult.data;
  if (!order) {
    logger.warn(`[webhook] Order not found for Razorpay order ID: ${rzpOrderId}`);
    throw new ApiError(404, 'No matching order found for Razorpay order ID');
  }

  if (order.razorpay_order_id && order.razorpay_order_id !== rzpOrderId) {
    throw new ApiError(400, 'Razorpay Order ID mismatch for this order');
  }

  // Out-of-order safety: failure event must NEVER downgrade a confirmed paid order
  if (order.payment_status === 'paid' || order.status === 'confirmed') {
    logger.info(`[webhook] Received payment.failed for order ${order.id} which is already paid/confirmed. Ignored to prevent status downgrade.`);
    const recordResult = await recordWebhookEvent({
      eventId,
      eventType,
      orderId: order.id,
      payload,
    });
    if (!recordResult.ok) {
      throw new ApiError(500, 'Database error recording webhook event');
    }
    return {
      received: true,
      ignored: true,
      reason: 'order_already_paid',
      orderId: order.id,
      eventId,
    };
  }

  if (order.status === 'cancelled') {
    logger.info(`[webhook] Received payment.failed for cancelled order ${order.id}.`);
    const recordResult = await recordWebhookEvent({
      eventId,
      eventType,
      orderId: order.id,
      payload,
    });
    if (!recordResult.ok) {
      throw new ApiError(500, 'Database error recording webhook event');
    }
    return {
      received: true,
      ignored: true,
      reason: 'order_already_cancelled',
      orderId: order.id,
      eventId,
    };
  }

  // Pending order: Record attempt failure diagnostics without releasing stock or cancelling order
  const reason = paymentEntity.error_description || paymentEntity.error_reason || 'Payment failed at gateway';
  const failResult = await recordPaymentAttemptFailure(order.id, reason);
  if (!failResult.ok) {
    logger.error(`[webhook] Failed to record payment attempt failure for order ${order.id}: ${failResult.reason}`);
    throw new ApiError(500, 'Database error recording payment attempt failure');
  }

  const recordResult = await recordWebhookEvent({
    eventId,
    eventType,
    orderId: order.id,
    payload,
  });
  if (!recordResult.ok) {
    logger.error(`[webhook] Failed to record webhook event ${eventId}: ${recordResult.reason}`);
    throw new ApiError(500, 'Database error recording webhook event');
  }

  return {
    received: true,
    success: true,
    paymentFailed: true,
    orderId: order.id,
    eventId,
  };
}

// Re-export Phase 5B refund recovery methods
export {
  executeIdempotentRefund,
  setRefundHttpTransport,
  getRefundHttpTransport,
  createLateCaptureRefundIntent,
  processRefundIntent,
  processPendingRefundIntents,
  reconcileRefundWithGateway,
  handleRefundWebhookEvent,
} from './refund.service.js';

