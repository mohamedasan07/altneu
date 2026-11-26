import {
  createPaymentOrder,
  verifyPayment,
  handleWebhookEvent,
} from '../services/payment.service.js';

/**
 * Resolve caller identity: customer JWT user id, or guest session id.
 */
function resolveCaller(req) {
  return {
    user_id: req.user?.id || null,
    session_id: req.body?.sessionId || req.query?.sessionId || req.headers['x-session-id'] || null,
  };
}

/**
 * POST /api/payment/razorpay/create-order
 * Initializes or reuses a Razorpay order for an ALTNEU order.
 */
export async function createOrderHandler(req, res) {
  const result = await createPaymentOrder(req.body, resolveCaller(req));
  res.status(200).json(result);
}

/**
 * POST /api/payment/razorpay/verify
 * Verifies Razorpay checkout payment signature and cross-checks gateway status.
 */
export async function verifyPaymentHandler(req, res) {
  const result = await verifyPayment(req.body, resolveCaller(req));
  res.status(200).json(result);
}

/**
 * POST /api/payment/razorpay/webhook
 * Ingests, verifies, and processes Razorpay webhook notifications.
 * Verifies X-Razorpay-Signature against rawBody using RAZORPAY_WEBHOOK_SECRET.
 * Customer authentication is bypassed; the cryptographic webhook signature ensures authenticity.
 */
export async function webhookHandler(req, res) {
  const rawBody = req.rawBody;
  const signature = req.headers['x-razorpay-signature'] || req.headers['X-Razorpay-Signature'];
  const eventId = req.headers['x-razorpay-event-id'] || req.headers['X-Razorpay-Event-Id'] || req.body?.id || null;

  const result = await handleWebhookEvent({
    rawBody,
    signature,
    eventId,
    payload: req.body,
  });

  res.status(200).json(result);
}

