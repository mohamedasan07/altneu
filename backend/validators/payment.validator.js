import { ApiError } from '../utils/apiError.js';
import { parseOrderId } from './order.validator.js';

const RAZORPAY_ID_RE = /^[A-Za-z0-9_]{6,64}$/;
const HEX_SIG_RE = /^[0-9a-fA-F]{64}$/;

/**
 * Validate Razorpay client verification payload:
 * { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature }
 * Accepts both camelCase and snake_case property keys from frontend clients.
 *
 * @param {object} body
 * @returns {{ orderId: string, razorpayOrderId: string, razorpayPaymentId: string, razorpaySignature: string }}
 * @throws {ApiError} 400 when validation fails
 */
export function validatePaymentVerificationPayload(body = {}) {
  const errors = [];

  const rawOrderId = body.orderId ?? body.order_id;
  let orderId = null;
  try {
    orderId = parseOrderId(rawOrderId);
  } catch (_err) {
    errors.push('A valid ALTNEU orderId is required');
  }

  const razorpayOrderId = String(body.razorpayOrderId ?? body.razorpay_order_id ?? '').trim();
  if (!razorpayOrderId) {
    errors.push('razorpayOrderId is required');
  } else if (!RAZORPAY_ID_RE.test(razorpayOrderId)) {
    errors.push('Invalid razorpayOrderId format');
  }

  const razorpayPaymentId = String(body.razorpayPaymentId ?? body.razorpay_payment_id ?? '').trim();
  if (!razorpayPaymentId) {
    errors.push('razorpayPaymentId is required');
  } else if (!RAZORPAY_ID_RE.test(razorpayPaymentId)) {
    errors.push('Invalid razorpayPaymentId format');
  }

  const razorpaySignature = String(body.razorpaySignature ?? body.razorpay_signature ?? '').trim();
  if (!razorpaySignature) {
    errors.push('razorpaySignature is required');
  } else if (!HEX_SIG_RE.test(razorpaySignature)) {
    errors.push('Invalid razorpaySignature format (expected 64-character hexadecimal HMAC SHA256 string)');
  }

  if (errors.length > 0) {
    throw new ApiError(400, errors.join('; '));
  }

  return {
    orderId,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  };
}

/**
 * Validate Razorpay create order payload.
 * Expects an orderId or checkout order parameters.
 *
 * @param {object} body
 * @returns {{ orderId: string|null }}
 */
export function validateCreatePaymentOrderPayload(body = {}) {
  const rawOrderId = body.orderId ?? body.order_id;
  if (rawOrderId) {
    return { orderId: parseOrderId(rawOrderId) };
  }
  return { orderId: null };
}
