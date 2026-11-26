/**
 * ALTNEU — Storefront Payment Service Client (Phase 4 Razorpay Integration)
 *
 * Talks to backend endpoints mounted at /api/payment/razorpay.
 * Uses shared request() client from ./api which attaches customer JWT automatically.
 * Supports guest sessions by forwarding sessionId in payload.
 */

import { request } from './api';

/**
 * Initialize or reuse a Razorpay gateway order for an ALTNEU order.
 * Calls POST /api/payment/razorpay/create-order.
 *
 * @param {{
 *   orderId: string,
 *   sessionId?: string,
 * }} payload
 * @returns {Promise<{
 *   success: boolean,
 *   orderId: string,
 *   orderNumber: string,
 *   razorpayOrderId: string,
 *   amount: number,
 *   currency: string,
 *   keyId: string,
 *   reused: boolean,
 * }>}
 */
export async function createRazorpayPaymentOrder(payload) {
  return await request('/api/payment/razorpay/create-order', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Authoritatively verify payment on the backend after checkout modal completion.
 * Calls POST /api/payment/razorpay/verify.
 *
 * @param {{
 *   orderId: string,
 *   razorpayOrderId: string,
 *   razorpayPaymentId: string,
 *   razorpaySignature: string,
 *   sessionId?: string,
 * }} payload
 * @returns {Promise<{
 *   success: boolean,
 *   alreadyPaid?: boolean,
 *   order: object,
 * }>}
 */
export async function verifyRazorpayPayment(payload) {
  return await request('/api/payment/razorpay/verify', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
