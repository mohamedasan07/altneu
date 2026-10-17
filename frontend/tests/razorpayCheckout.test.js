/**
 * ALTNEU — Phase 4 Storefront Razorpay Checkout Test Suite
 * File: frontend/tests/razorpayCheckout.test.js
 * Run: npm test (node --test tests/*.test.js)
 *
 * Covers:
 * 1. Razorpay selected vs COD selected.
 * 2. Checkout script or SDK load failure handling.
 * 3. Successful order creation and modal initialization contracts.
 * 4. Modal dismissal and failed payment handling.
 * 5. Invalid signature and failed backend verification.
 * 6. Repeated submissions and duplicate-click protection.
 * 7. Guest and signed-in customer flows.
 * 8. Out-of-stock product guards at checkout.
 * 9. Network/server errors and retry behavior.
 * 10. Security: No secret keys exposed to frontend.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadRazorpayScript,
  resetRazorpayScriptCache,
} from '../src/utils/razorpay.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, '..');
const readFrontend = (rel) => fs.readFileSync(path.join(frontendRoot, rel), 'utf8');

describe('Phase 4: Payment Selector & Methods Contract', () => {
  const checkoutSrc = readFrontend('src/hooks/useCheckout.js');
  const badgeSrc = readFrontend('src/components/orders/OrderStatusBadge/OrderStatusBadge.jsx');
  const paymentSelectorSrc = readFrontend('src/components/checkout/PaymentSelector/PaymentSelector.jsx');

  test('Razorpay is available and enabled in PAYMENT_METHODS', () => {
    assert.match(checkoutSrc, /id:\s*'razorpay'/);
    // Must NOT be disabled
    assert.doesNotMatch(checkoutSrc, /id:\s*'razorpay'[^}]*disabled:\s*true/);
    assert.match(checkoutSrc, /label:\s*'Razorpay/);
  });

  test('Cash on Delivery (COD) is preserved in PAYMENT_METHODS', () => {
    assert.match(checkoutSrc, /id:\s*'cod'/);
    assert.match(checkoutSrc, /label:\s*'Cash on Delivery'/);
    assert.doesNotMatch(checkoutSrc, /id:\s*'cod'[^}]*disabled:\s*true/);
  });

  test('Card, UPI, and NetBanking options are preserved in PAYMENT_METHODS', () => {
    assert.match(checkoutSrc, /id:\s*'card'/);
    assert.match(checkoutSrc, /id:\s*'upi'/);
    assert.match(checkoutSrc, /id:\s*'netbanking'/);
  });

  test('PaymentSelector renders note and handles enabled state', () => {
    assert.match(paymentSelectorSrc, /method\.note/);
    assert.match(paymentSelectorSrc, /styles\.note/);
  });

  test('OrderStatusBadge includes refunded state with cancelled styling', () => {
    assert.match(badgeSrc, /refunded:\s*\{\s*label:\s*'Refunded',\s*className:\s*styles\.cancelled\s*\}/);
  });
});

describe('Phase 4: Razorpay Script Loader (src/utils/razorpay.js)', () => {
  beforeEach(() => {
    resetRazorpayScriptCache();
  });

  afterEach(() => {
    delete global.window;
    delete global.document;
    resetRazorpayScriptCache();
  });

  test('loadRazorpayScript resolves false safely when window is undefined (SSR)', async () => {
    delete global.window;
    const result = await loadRazorpayScript();
    assert.strictEqual(result, false, 'SSR invocation must resolve false safely');
  });

  test('loadRazorpayScript returns true immediately when window.Razorpay is already present', async () => {
    global.window = {
      Razorpay: function MockRazorpay() {},
    };
    const result = await loadRazorpayScript();
    assert.strictEqual(result, true, 'Pre-existing Razorpay SDK must resolve true immediately');
  });

  test('loadRazorpayScript injects script tag with official URL and resolves true on load', async () => {
    let appendedElement = null;
    global.document = {
      querySelector: () => null,
      createElement: (tag) => ({
        tagName: tag.toUpperCase(),
        src: '',
        async: false,
        onload: null,
        onerror: null,
      }),
      body: {
        appendChild: (el) => {
          appendedElement = el;
          global.window.Razorpay = function MockRazorpay() {};
          setTimeout(() => el.onload && el.onload(), 5);
        },
      },
    };
    global.window = {};

    const loadPromise = loadRazorpayScript();
    assert.ok(appendedElement, 'Script tag must be created and appended to document.body');
    assert.strictEqual(appendedElement.src, 'https://checkout.razorpay.com/v1/checkout.js');
    assert.strictEqual(appendedElement.async, true);

    const result = await loadPromise;
    assert.strictEqual(result, true);
  });

  test('loadRazorpayScript resolves false safely on network or script load error', async () => {
    let appendedElement = null;
    global.document = {
      querySelector: () => null,
      createElement: () => ({
        src: '',
        async: false,
        onload: null,
        onerror: null,
      }),
      body: {
        appendChild: (el) => {
          appendedElement = el;
          setTimeout(() => el.onerror && el.onerror(), 5);
        },
      },
    };
    global.window = {};

    const result = await loadRazorpayScript();
    assert.strictEqual(result, false, 'Failed script load must resolve false without throwing');
  });

  test('loadRazorpayScript deduplicates concurrent load requests (singleton promise)', async () => {
    let appendCount = 0;
    global.document = {
      querySelector: () => null,
      createElement: () => ({
        src: '',
        async: false,
        onload: null,
        onerror: null,
      }),
      body: {
        appendChild: (el) => {
          appendCount++;
          global.window.Razorpay = function MockRazorpay() {};
          setTimeout(() => el.onload && el.onload(), 5);
        },
      },
    };
    global.window = {};

    const [r1, r2, r3] = await Promise.all([
      loadRazorpayScript(),
      loadRazorpayScript(),
      loadRazorpayScript(),
    ]);

    assert.strictEqual(appendCount, 1, 'Script must only be appended once for concurrent calls');
    assert.strictEqual(r1, true);
    assert.strictEqual(r2, true);
    assert.strictEqual(r3, true);
  });
});

describe('Phase 4: Storefront Razorpay Checkout Flow Wiring', () => {
  const checkoutSrc = readFrontend('src/hooks/useCheckout.js');
  const paymentServiceSrc = readFrontend('src/services/payment.js');
  const successPageSrc = readFrontend('src/pages/OrderSuccessPage/OrderSuccessPage.jsx');
  const checkoutPageSrc = readFrontend('src/pages/CheckoutPage/CheckoutPage.jsx');

  test('useCheckout: Session-scoped idempotencyKey is maintained and stabilized', () => {
    assert.match(checkoutSrc, /const \[idempotencyKey,\s*setIdempotencyKey\] = useState\(newIdempotencyKey\)/);
    assert.match(checkoutSrc, /cartSignature/);
    assert.match(checkoutSrc, /prevCartSigRef/);
  });

  test('useCheckout: Duplicate-click protection guards against concurrent submissions', () => {
    assert.match(checkoutSrc, /if\s*\(placing\)\s*return;/);
  });

  test('useCheckout: Out-of-stock guard rejects placement before touching payment gateway', () => {
    assert.match(checkoutSrc, /getStockInfo\(item\)\.outOfStock/);
    assert.match(checkoutSrc, /setPlaceError\(/);
  });

  test('useCheckout: Distinct execution path for COD vs Razorpay', () => {
    assert.match(checkoutSrc, /if\s*\(payment\s*!==\s*'razorpay'\)\s*\{/);
    assert.match(checkoutSrc, /const\s*\{\s*order\s*\}\s*=\s*await\s*placeOrderApi\(payload\);/);
  });

  test('useCheckout: Razorpay flow verifies checkout script before order placement', () => {
    assert.match(checkoutSrc, /const\s*scriptReady\s*=\s*await\s*loadRazorpayScript\(\);/);
    assert.match(checkoutSrc, /if\s*\(!scriptReady\)\s*\{/);
  });

  test('useCheckout: Calls backend createRazorpayPaymentOrder with ALTNEU orderId', () => {
    assert.match(checkoutSrc, /createRazorpayPaymentOrder\(\s*\{\s*orderId:\s*order\.id/);
  });

  test('useCheckout: Opens Razorpay Checkout with server-computed amount, currency, order_id', () => {
    assert.match(checkoutSrc, /new\s*window\.Razorpay\(options\)/);
    assert.match(checkoutSrc, /amount:\s*rzpOrderData\.amount/);
    assert.match(checkoutSrc, /currency:\s*rzpOrderData\.currency/);
    assert.match(checkoutSrc, /order_id:\s*rzpOrderData\.razorpayOrderId/);
    assert.match(checkoutSrc, /key:\s*rzpKeyId/);
  });

  test('useCheckout: Handles modal dismissal without showing false success or corrupting cart', () => {
    assert.match(checkoutSrc, /ondismiss:\s*\(\)\s*=>\s*\{[\s\S]*?setPlacing\(false\)/);
  });

  test('useCheckout: Listens to payment.failed and surfaces error reason for retry', () => {
    assert.match(checkoutSrc, /rzpInstance\.on\('payment\.failed'/);
    assert.match(checkoutSrc, /setPlaceError\(/);
  });

  test('useCheckout: Authoritative verification contract — only navigates on backend success', () => {
    assert.match(checkoutSrc, /verifyRazorpayPayment\(\{/);
    assert.match(checkoutSrc, /if\s*\(verifyResult\?\.success\)\s*\{/);
    assert.match(checkoutSrc, /clearCart\(\);/);
    assert.match(checkoutSrc, /navigate\('\/checkout\/success'/);
    assert.match(checkoutSrc, /catch\s*\(verifyErr\)\s*\{/);
  });

  test('useCheckout: Passes guest session ID or authenticated user token to payment endpoints', () => {
    assert.match(checkoutSrc, /sessionId:\s*guestSessionId/);
    assert.match(paymentServiceSrc, /POST \/api\/payment\/razorpay\/create-order/);
    assert.match(paymentServiceSrc, /POST \/api\/payment\/razorpay\/verify/);
  });

  test('OrderSuccessPage: Displays Razorpay Payment ID and Verified status badge', () => {
    assert.match(successPageSrc, /order\.razorpayPaymentId/);
    assert.match(successPageSrc, /Paid \(Verified\)/);
  });

  test('CheckoutPage: Pay button reflects Razorpay mode and displays aria error alerts', () => {
    assert.match(checkoutPageSrc, /payment === 'razorpay' \? 'Pay with Razorpay' : 'Pay now'/);
    assert.match(checkoutPageSrc, /role="alert"/);
  });
});

describe('Phase 4: Security & Environment Integrity', () => {
  test('Frontend never imports or references Razorpay secret keys', () => {
    const filesToCheck = [
      'src/utils/razorpay.js',
      'src/services/payment.js',
      'src/hooks/useCheckout.js',
      'src/pages/CheckoutPage/CheckoutPage.jsx',
      'src/pages/OrderSuccessPage/OrderSuccessPage.jsx',
    ];

    for (const file of filesToCheck) {
      const content = readFrontend(file);
      assert.strictEqual(
        content.includes('RAZORPAY_KEY_SECRET'),
        false,
        `${file} must NEVER reference RAZORPAY_KEY_SECRET`
      );
      assert.strictEqual(
        content.includes('RAZORPAY_WEBHOOK_SECRET'),
        false,
        `${file} must NEVER reference RAZORPAY_WEBHOOK_SECRET`
      );
    }
  });

  test('frontend/.env.example documents VITE_RAZORPAY_KEY_ID as public only', () => {
    const example = readFrontend('.env.example');
    assert.match(example, /VITE_RAZORPAY_KEY_ID=/);
    assert.match(example, /NEVER expose RAZORPAY_KEY_SECRET/i);
  });
});
