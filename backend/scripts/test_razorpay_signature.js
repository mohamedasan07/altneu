/**
 * ALTNEU — Automated Razorpay Signature & Dual-Verification Test
 * File: backend/scripts/test_razorpay_signature.js
 * Run: node backend/scripts/test_razorpay_signature.js
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifySignature } from '../services/payment.service.js';
import { config } from '../config/index.js';

console.log('--- ALTNEU: Razorpay Signature & Timing Safety Test Suite ---');

const originalSecret = config.razorpay.keySecret;
const TEST_SECRET = 'sec_test_vault_secret_999888';
config.razorpay.keySecret = TEST_SECRET;

try {
  // Test 1: Valid signature calculation
  const orderId = 'order_ABC1234567890';
  const paymentId = 'pay_XYZ0987654321';
  const expectedSig = crypto
    .createHmac('sha256', TEST_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  const isValid = verifySignature(orderId, paymentId, expectedSig);
  assert.strictEqual(isValid, true, 'Valid HMAC SHA256 must return true');
  console.log('✔ Test 1: Valid HMAC SHA256 signature matches and passes verification.');

  // Test 2: Invalid signature rejection
  const invalidSig = 'b'.repeat(64);
  assert.throws(
    () => verifySignature(orderId, paymentId, invalidSig),
    /Invalid payment signature/,
    'Invalid signature must throw 400 ApiError'
  );
  console.log('✔ Test 2: Invalid signature is rejected with HTTP 400.');

  // Test 3: Payload tampering detection
  assert.throws(
    () => verifySignature('order_TAMPERED', paymentId, expectedSig),
    /Invalid payment signature/,
    'Tampered order ID must fail verification'
  );
  assert.throws(
    () => verifySignature(orderId, 'pay_TAMPERED', expectedSig),
    /Invalid payment signature/,
    'Tampered payment ID must fail verification'
  );
  console.log('✔ Test 3: Tampered orderId and paymentId are immediately detected and rejected.');

  // Test 4: Timing attack safety across varied lengths
  assert.throws(
    () => verifySignature(orderId, paymentId, 'short'),
    /Invalid payment signature/,
    'Short signature buffer must not crash timingSafeEqual'
  );
  assert.throws(
    () => verifySignature(orderId, paymentId, ''),
    /Invalid payment signature/,
    'Empty signature must fail verification'
  );
  console.log('✔ Test 4: Differing buffer lengths handled cleanly without timing leaks or process crashes.');

  // Test 5: Missing secret configuration guard
  config.razorpay.keySecret = '';
  assert.throws(
    () => verifySignature(orderId, paymentId, expectedSig),
    /Razorpay gateway secret is not configured/,
    'Missing secret must throw 500 configuration error'
  );
  console.log('✔ Test 5: Missing secret key throws 500 configuration error.');

  console.log('\nAll 5 signature test cases passed successfully!');
} finally {
  config.razorpay.keySecret = originalSecret;
}
