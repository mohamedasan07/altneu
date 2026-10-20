/**
 * ALTNEU — Checkout Payment & Error Handling Utilities
 * File: frontend/src/utils/checkoutPayment.js
 */

export const CHECKOUT_DISMISSAL_MESSAGE =
  'Payment was not completed. You can click Place Order to try again.';

export const ORDER_EXPIRED_MESSAGE =
  'Your previous order reservation expired. Please click Place Order again to start a new order.';

export const VERIFY_EXPIRED_ORDER_MESSAGE =
  'Your order reservation expired before payment verification completed. If your account was debited, please do not pay again yet. Check your payment status or contact support for assistance with a possible refund.';

/**
 * Detects whether an API error specifically indicates that the existing order
 * has expired or been cancelled, making it permanently ineligible for payment.
 *
 * Checks HTTP 400 status and exact backend message structure:
 * - createRazorpayPaymentOrder rejection: "Order is not eligible for payment (status: cancelled...)"
 * - verifyRazorpayPayment rejection: "Order has been cancelled and cannot be paid"
 *
 * Avoids broad keyword checks like searching for "cancelled" or "expired" alone.
 *
 * @param {object|Error} err
 * @returns {boolean}
 */
export function isOrderIneligibleError(err) {
  if (!err) return false;
  const status = err.status || err.statusCode;
  // Backend ApiError exposes 400 for order eligibility and cancellation violations
  if (status !== 400) return false;

  const msg = typeof err.message === 'string' ? err.message.trim() : '';
  if (!msg) return false;

  // Specific check 1: createRazorpayPaymentOrder rejection for cancelled/expired orders
  // Backend format: `Order is not eligible for payment (status: ${currentStatus}, payment_status: ${currentPaymentStatus})`
  if (msg.startsWith('Order is not eligible for payment') && msg.includes('status: cancelled')) {
    return true;
  }

  // Specific check 2: verifyRazorpayPayment rejection for cancelled orders
  // Backend format: 'Order has been cancelled and cannot be paid'
  if (msg === 'Order has been cancelled and cannot be paid') {
    return true;
  }

  return false;
}
