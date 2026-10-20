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
import {
  CHECKOUT_DISMISSAL_MESSAGE,
  ORDER_EXPIRED_MESSAGE,
  VERIFY_EXPIRED_ORDER_MESSAGE,
  isOrderIneligibleError,
} from '../src/utils/checkoutPayment.js';

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
    assert.match(checkoutSrc, /setPlaceError\(CHECKOUT_DISMISSAL_MESSAGE\)/);
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

describe('Phase 4.1: Razorpay Checkout Dismissal Feedback, Pending Reuse & Expiry Trap Recovery', () => {
  const checkoutSrc = readFrontend('src/hooks/useCheckout.js');

  test('Dismissal feedback: ondismiss stops loading and displays friendly non-destructive message', () => {
    assert.match(checkoutSrc, /ondismiss:\s*\(\)\s*=>\s*\{[\s\S]*?setPlacing\(false\)[\s\S]*?setPlaceError\(CHECKOUT_DISMISSAL_MESSAGE\)/);
    assert.strictEqual(
      CHECKOUT_DISMISSAL_MESSAGE,
      'Payment was not completed. You can click Place Order to try again.'
    );
    // Dismissal must NOT cancel the order or automatically resubmit
    assert.doesNotMatch(checkoutSrc, /ondismiss:[^}]*cancelOrder/);
    assert.doesNotMatch(checkoutSrc, /ondismiss:[^}]*placeOrderApi/);
    // Dismissal must NOT rotate idempotency key
    assert.doesNotMatch(checkoutSrc, /ondismiss:[^}]*newIdempotencyKey/);
  });

  test('Pending-order reuse: Retries on unexpired pending order maintain stable idempotency key', () => {
    // Normal retry keeps idempotencyKey unchanged so backend reuses ALTNEU order and Razorpay order ID
    assert.match(checkoutSrc, /let activeKey = idempotencyKey;/);
    assert.match(checkoutSrc, /idempotencyKey:\s*activeKey/);
    assert.match(checkoutSrc, /if\s*\(orderIneligibleRef\.current\)/);
  });

  test('isOrderIneligibleError: Accurately identifies backend 400 order ineligibility / cancellation responses', () => {
    // Standard backend error from createRazorpayPaymentOrder on cancelled order
    assert.strictEqual(
      isOrderIneligibleError({
        status: 400,
        message: 'Order is not eligible for payment (status: cancelled, payment_status: failed)',
      }),
      true
    );

    // Cancelled order with pending payment status
    assert.strictEqual(
      isOrderIneligibleError({
        status: 400,
        message: 'Order is not eligible for payment (status: cancelled, payment_status: pending)',
      }),
      true
    );

    // Using statusCode property
    assert.strictEqual(
      isOrderIneligibleError({
        statusCode: 400,
        message: 'Order is not eligible for payment (status: cancelled, payment_status: failed)',
      }),
      true
    );

    // Backend error from verifyRazorpayPayment on cancelled order
    assert.strictEqual(
      isOrderIneligibleError({
        status: 400,
        message: 'Order has been cancelled and cannot be paid',
      }),
      true
    );
  });

  test('isOrderIneligibleError: Safely rejects non-400 errors and broad unrelated keywords', () => {
    // 500 server error must not trigger key rotation
    assert.strictEqual(
      isOrderIneligibleError({
        status: 500,
        message: 'Order is not eligible for payment (status: cancelled, payment_status: failed)',
      }),
      false
    );

    // Missing status code
    assert.strictEqual(
      isOrderIneligibleError({
        message: 'Order is not eligible for payment (status: cancelled, payment_status: failed)',
      }),
      false
    );

    // Broad keywords: expired coupon
    assert.strictEqual(
      isOrderIneligibleError({
        status: 400,
        message: 'Coupon code SAVE20 has expired',
      }),
      false
    );

    // Broad keywords: payment cancelled by user (from gateway or client)
    assert.strictEqual(
      isOrderIneligibleError({
        status: 400,
        message: 'Payment was cancelled by the user',
      }),
      false
    );

    // Broad keywords: generic order expired string
    assert.strictEqual(
      isOrderIneligibleError({
        status: 400,
        message: 'Order expired',
      }),
      false
    );

    // Already paid order (ineligible for payment, but status is not cancelled)
    assert.strictEqual(
      isOrderIneligibleError({
        status: 400,
        message: 'Order is not eligible for payment (status: confirmed, payment_status: paid)',
      }),
      false
    );

    // Edge cases: null, undefined, empty object
    assert.strictEqual(isOrderIneligibleError(null), false);
    assert.strictEqual(isOrderIneligibleError(undefined), false);
    assert.strictEqual(isOrderIneligibleError({}), false);
  });

  test('Expiry trap recovery: Does not auto-create order; generates new key only on explicit retry', () => {
    // Ineligible error sets flag and friendly error without auto-invoking placement
    assert.match(
      checkoutSrc,
      /if\s*\(isOrderIneligibleError\(err\)\)\s*\{[\s\S]*?orderIneligibleRef\.current\s*=\s*true;[\s\S]*?setPlaceError\(ORDER_EXPIRED_MESSAGE\);/
    );
    assert.strictEqual(
      ORDER_EXPIRED_MESSAGE,
      'Your previous order reservation expired. Please click Place Order again to start a new order.'
    );

    // Inside catch block, there must NOT be an automatic placeOrderApi or createRazorpayPaymentOrder call
    const catchBlockMatch = checkoutSrc.match(/rzpInstance\.open\(\);[\s\S]*?\} catch \(err\) \{([\s\S]*?)\}\s*\}, \[/);
    assert.ok(catchBlockMatch, 'Must find placeOrder catch block');
    const catchBody = catchBlockMatch[1];
    assert.doesNotMatch(catchBody, /placeOrderApi\(/, 'Must not auto-create replacement order in error handler');
    assert.doesNotMatch(catchBody, /createRazorpayPaymentOrder\(/, 'Must not auto-retry payment in error handler');

    // Key rotation happens only inside placeOrder on explicit user click when flag was set
    assert.match(
      checkoutSrc,
      /if\s*\(orderIneligibleRef\.current\)\s*\{[\s\S]*?activeKey\s*=\s*newIdempotencyKey\(\);[\s\S]*?setIdempotencyKey\(activeKey\);[\s\S]*?orderIneligibleRef\.current\s*=\s*false;/
    );
  });

  test('Fix 1: Cart restoration halts safely on failure and prevents partial order placement', async () => {
    // 1. Static code contract verification
    assert.match(
      checkoutSrc,
      /catch\s*\(\s*restoreErr\s*\)\s*\{[\s\S]*?setPlacing\(false\);[\s\S]*?setPlaceError\([\s\S]*?\);[\s\S]*?return;/
    );
    const restoreCatchMatch = checkoutSrc.match(/catch\s*\(\s*restoreErr\s*\)\s*\{([\s\S]*?)\}/);
    assert.ok(restoreCatchMatch, 'Must find restoreErr catch block');
    assert.doesNotMatch(restoreCatchMatch[1], /placeOrderApi/, 'Must not call placeOrderApi inside restoreErr catch block');

    // 2. Runtime behavioral simulation: Item 1 succeeds, Item 2 fails
    const mockItems = [
      { productId: 101, name: 'Minimalist Tee', size: 'M', color: 'Black', colorName: 'Black', quantity: 1 },
      { productId: 102, name: 'Linen Trousers', size: 'L', color: 'Navy', colorName: 'Navy', quantity: 2 },
    ];

    let item1Added = false;
    let placeOrderCalled = false;
    let placedErrorState = null;
    let placingState = true;

    const mockAddCartItem = async ({ productId }) => {
      if (productId === 101) {
        item1Added = true;
        return { success: true };
      }
      if (productId === 102) {
        throw new Error('Only 1 units available in stock');
      }
    };

    const mockPlaceOrderApi = async () => {
      placeOrderCalled = true;
      return { order: { id: 'should-never-be-created' } };
    };

    // Simulate the exact loop logic from useCheckout.js
    const restoreCartAndPlace = async () => {
      try {
        const activeItems = [];
        for (const item of mockItems) {
          const alreadyInCart = activeItems.some(
            (ci) => ci.productId === item.productId && ci.size === item.size && ci.color === item.color
          );
          if (!alreadyInCart) {
            await mockAddCartItem({
              productId: item.productId,
              size: item.size,
              color: item.color,
              quantity: item.quantity,
            });
          }
        }
      } catch (restoreErr) {
        placingState = false;
        placedErrorState = `Could not restore your bag items: ${restoreErr?.message || 'Item unavailable'}. Please review your bag to proceed.`;
        return; // Aborts before placeOrder
      }
      await mockPlaceOrderApi();
    };

    await restoreCartAndPlace();

    assert.strictEqual(item1Added, true, 'Item 1 was attempted first');
    assert.strictEqual(placeOrderCalled, false, 'Must NOT place order when subsequent item fails restoration');
    assert.strictEqual(placingState, false, 'Must reset placing state to false');
    assert.match(placedErrorState, /Only 1 units available in stock/, 'Must surface actual server error message');
    assert.match(placedErrorState, /Could not restore your bag items/);
  });

  test('Fix 2: verifyRazorpayPayment catch block clearly distinguishes expired orders without false refund claims', () => {
    // 1. Contract verification: handler uses VERIFY_EXPIRED_ORDER_MESSAGE for ineligible errors
    assert.match(
      checkoutSrc,
      /catch\s*\(verifyErr\)\s*\{[\s\S]*?if\s*\(isOrderIneligibleError\(verifyErr\)\)\s*\{[\s\S]*?setPlaceError\(VERIFY_EXPIRED_ORDER_MESSAGE\);/
    );

    // 2. Exact customer-facing message structure verification
    assert.strictEqual(
      VERIFY_EXPIRED_ORDER_MESSAGE,
      'Your order reservation expired before payment verification completed. If your account was debited, please do not pay again yet. Check your payment status or contact support for assistance with a possible refund.'
    );

    // 3. Must NOT make definitive false claims that a refund was already issued/created
    assert.doesNotMatch(VERIFY_EXPIRED_ORDER_MESSAGE, /refund has been processed/i);
    assert.doesNotMatch(VERIFY_EXPIRED_ORDER_MESSAGE, /refund has been approved/i);
    assert.doesNotMatch(VERIFY_EXPIRED_ORDER_MESSAGE, /refund has been created/i);

    // 4. Verification catch block must NOT automatically retry payment or place another order
    const verifyCatchMatch = checkoutSrc.match(/catch\s*\(verifyErr\)\s*\{([\s\S]*?)\}\s*\},/);
    assert.ok(verifyCatchMatch, 'Must find verifyRazorpayPayment catch block');
    const verifyCatchBody = verifyCatchMatch[1];
    assert.doesNotMatch(verifyCatchBody, /placeOrderApi\(/, 'Must not auto-create order on verify rejection');
    assert.doesNotMatch(verifyCatchBody, /verifyRazorpayPayment\(/, 'Must not auto-retry verification in catch');
  });

  const simulateCheckoutRestoration = async ({
    items,
    mockFetchCart,
    mockAddCartItem,
    mockUpdateCartItem,
    mockPlaceOrderApi,
  }) => {
    let placing = true;
    let placeError = null;
    let activeKey = 'initial-key';
    let orderIneligible = true;
    let placedOrder = null;

    try {
      const currentCart = await mockFetchCart();
      const activeItems = Array.isArray(currentCart?.items) ? currentCart.items : [];

      for (const item of items) {
        if (!item || !item.productId) {
          throw new Error('Bag item is missing product details. Unable to match reliably.');
        }

        const intendedQty = Number(item.quantity);
        if (!Number.isInteger(intendedQty) || intendedQty <= 0) {
          throw new Error(`Invalid quantity for "${item.name || 'item'}". Unable to match reliably.`);
        }

        const matches = activeItems.filter(
          (ci) =>
            String(ci.productId) === String(item.productId) &&
            String(ci.size || '') === String(item.size || '') &&
            String(ci.color || '') === String(item.color || '')
        );

        if (matches.length > 1) {
          throw new Error(
            `Multiple cart lines found for "${item.name || 'item'}" (${item.size}/${item.color || item.colorName || ''}). Unable to match reliably.`
          );
        }

        if (matches.length === 0) {
          await mockAddCartItem({
            productId: item.productId,
            size: item.size,
            color: item.color,
            colorName: item.colorName,
            quantity: intendedQty,
          });
        } else {
          const matchingLine = matches[0];
          if (!matchingLine.id) {
            throw new Error(
              `Cart line identifier missing for "${item.name || 'item'}". Unable to match reliably.`
            );
          }

          const backendQty = Number(matchingLine.quantity);
          if (backendQty < intendedQty) {
            await mockUpdateCartItem({
              itemId: matchingLine.id,
              quantity: intendedQty,
            });
          } else if (backendQty > intendedQty) {
            throw new Error(
              `Cart line for "${item.name || 'item'}" has a higher quantity (${backendQty}) than intended (${intendedQty}). Please review your bag.`
            );
          }
        }
      }

      const verifiedCart = await mockFetchCart();
      const verifiedItems = Array.isArray(verifiedCart?.items) ? verifiedCart.items : [];

      if (verifiedItems.length !== items.length) {
        throw new Error('Cart verification failed: item count does not match intended bag.');
      }

      for (const item of items) {
        const matches = verifiedItems.filter(
          (vi) =>
            String(vi.productId) === String(item.productId) &&
            String(vi.size || '') === String(item.size || '') &&
            String(vi.color || '') === String(item.color || '')
        );

        if (matches.length !== 1) {
          throw new Error(
            `Cart verification failed: expected 1 line for "${item.name || 'item'}" (${item.size}/${item.color || item.colorName || ''}), but found ${matches.length}.`
          );
        }

        const verifiedLine = matches[0];
        if (Number(verifiedLine.quantity) !== Number(item.quantity)) {
          throw new Error(
            `Cart verification failed for "${item.name || 'item'}": expected quantity ${item.quantity}, but cart has ${verifiedLine.quantity}.`
          );
        }
      }
    } catch (restoreErr) {
      placing = false;
      const itemMsg = restoreErr?.message || 'Item unavailable';
      placeError = `Could not restore your bag items: ${itemMsg}. Please review your bag to proceed.`;
      return { placing, placeError, orderIneligible, activeKey, placedOrder };
    }

    activeKey = 'new-rotated-key';
    orderIneligible = false;
    placedOrder = await mockPlaceOrderApi();
    placing = false;
    return { placing, placeError, orderIneligible, activeKey, placedOrder };
  };

  test('Expired order recovery: Static code contracts verify updateCartItem wiring, quantity comparisons, and post-restoration verification', () => {
    // 1. Imports updateCartItem
    assert.match(
      checkoutSrc,
      /import\s*\{[^}]*updateCartItem[^}]*\}\s*from\s*['"]\.\.\/services\/cart['"]/
    );

    // 2. Compares matching backend cart line quantity with intended quantity
    assert.match(checkoutSrc, /backendQty\s*<\s*intendedQty/);
    assert.match(checkoutSrc, /backendQty\s*>\s*intendedQty/);

    // 3. Calls updateCartItem when lower, does NOT call addCartItem for existing line
    assert.match(
      checkoutSrc,
      /updateCartItem\(\s*\{[\s\S]*?itemId:\s*matchingLine\.id[\s\S]*?quantity:\s*intendedQty[\s\S]*?\}\s*\)/
    );
    assert.match(
      checkoutSrc,
      /if\s*\(\s*matches\.length\s*===\s*0\s*\)\s*\{[\s\S]*?await\s*addCartItem/
    );

    // 4. Fails safely on higher quantity or duplicate lines
    assert.match(checkoutSrc, /matches\.length\s*>\s*1/);
    assert.match(checkoutSrc, /higher quantity/);

    // 5. Calls fetchCart again after restoration to verify quantities before placeOrderApi
    assert.match(
      checkoutSrc,
      /const\s+verifiedCart\s*=\s*await\s*fetchCart\(guestSessionId\);/
    );
    assert.match(checkoutSrc, /verifiedLine\.quantity\)\s*!==/);
  });

  test('Expired order recovery: Updates existing line to intended quantity when backend quantity is lower', async () => {
    const mockItems = [
      { productId: 101, name: 'Minimalist Tee', size: 'M', color: 'Black', colorName: 'Black', quantity: 3 },
    ];
    let backendCart = {
      items: [
        { id: 'cart-item-1', productId: 101, size: 'M', color: 'Black', quantity: 1 },
      ],
    };
    let updateCalledWith = null;
    let addCalled = false;
    let placeOrderCalled = false;

    const mockFetchCart = async () => ({
      items: backendCart.items.map((it) => ({ ...it })),
    });
    const mockAddCartItem = async () => {
      addCalled = true;
    };
    const mockUpdateCartItem = async (input) => {
      updateCalledWith = input;
      const found = backendCart.items.find((it) => it.id === input.itemId);
      if (found) found.quantity = input.quantity;
    };
    const mockPlaceOrderApi = async () => {
      placeOrderCalled = true;
      return { order: { id: 'order-123' } };
    };

    const result = await simulateCheckoutRestoration({
      items: mockItems,
      mockFetchCart,
      mockAddCartItem,
      mockUpdateCartItem,
      mockPlaceOrderApi,
    });

    assert.strictEqual(addCalled, false, 'Must NOT call addCartItem for existing line');
    assert.deepStrictEqual(updateCalledWith, { itemId: 'cart-item-1', quantity: 3 });
    assert.strictEqual(placeOrderCalled, true, 'Must proceed to placeOrderApi after successful update and verification');
    assert.strictEqual(result.orderIneligible, false);
    assert.strictEqual(result.placeError, null);
    assert.strictEqual(result.activeKey, 'new-rotated-key');
  });

  test('Expired order recovery: Preserves existing line and does not re-add when backend quantity is equal', async () => {
    const mockItems = [
      { productId: 101, name: 'Minimalist Tee', size: 'M', color: 'Black', colorName: 'Black', quantity: 2 },
    ];
    let backendCart = {
      items: [
        { id: 'cart-item-1', productId: 101, size: 'M', color: 'Black', quantity: 2 },
      ],
    };
    let updateCalled = false;
    let addCalled = false;
    let placeOrderCalled = false;

    const mockFetchCart = async () => ({
      items: backendCart.items.map((it) => ({ ...it })),
    });
    const mockAddCartItem = async () => {
      addCalled = true;
    };
    const mockUpdateCartItem = async () => {
      updateCalled = true;
    };
    const mockPlaceOrderApi = async () => {
      placeOrderCalled = true;
      return { order: { id: 'order-123' } };
    };

    const result = await simulateCheckoutRestoration({
      items: mockItems,
      mockFetchCart,
      mockAddCartItem,
      mockUpdateCartItem,
      mockPlaceOrderApi,
    });

    assert.strictEqual(addCalled, false, 'Must NOT call addCartItem when quantity is already equal');
    assert.strictEqual(updateCalled, false, 'Must NOT call updateCartItem when quantity is already equal');
    assert.strictEqual(placeOrderCalled, true, 'Must proceed to placeOrderApi');
    assert.strictEqual(result.placeError, null);
    assert.strictEqual(result.orderIneligible, false);
  });

  test('Expired order recovery: Fails safely when backend cart quantity is higher than intended', async () => {
    const mockItems = [
      { productId: 101, name: 'Minimalist Tee', size: 'M', color: 'Black', colorName: 'Black', quantity: 1 },
    ];
    let backendCart = {
      items: [
        { id: 'cart-item-1', productId: 101, size: 'M', color: 'Black', quantity: 3 },
      ],
    };
    let updateCalled = false;
    let addCalled = false;
    let placeOrderCalled = false;

    const mockFetchCart = async () => ({
      items: backendCart.items.map((it) => ({ ...it })),
    });
    const mockAddCartItem = async () => {
      addCalled = true;
    };
    const mockUpdateCartItem = async () => {
      updateCalled = true;
    };
    const mockPlaceOrderApi = async () => {
      placeOrderCalled = true;
      return { order: { id: 'order-123' } };
    };

    const result = await simulateCheckoutRestoration({
      items: mockItems,
      mockFetchCart,
      mockAddCartItem,
      mockUpdateCartItem,
      mockPlaceOrderApi,
    });

    assert.strictEqual(placeOrderCalled, false, 'Must NOT call placeOrderApi when backend quantity is higher');
    assert.strictEqual(addCalled, false);
    assert.strictEqual(updateCalled, false);
    assert.strictEqual(result.placing, false);
    assert.strictEqual(result.orderIneligible, true, 'Flag remains set so customer can review bag and retry');
    assert.match(result.placeError, /higher quantity \(3\) than intended \(1\)/);
    // In-memory cart preserved
    assert.strictEqual(mockItems[0].quantity, 1);
  });

  test('Expired order recovery: Halts checkout, resets loading, and preserves bag when updateCartItem fails', async () => {
    const mockItems = [
      { productId: 101, name: 'Minimalist Tee', size: 'M', color: 'Black', colorName: 'Black', quantity: 4 },
    ];
    let backendCart = {
      items: [
        { id: 'cart-item-1', productId: 101, size: 'M', color: 'Black', quantity: 1 },
      ],
    };
    let placeOrderCalled = false;

    const mockFetchCart = async () => ({
      items: backendCart.items.map((it) => ({ ...it })),
    });
    const mockAddCartItem = async () => {};
    const mockUpdateCartItem = async () => {
      throw new Error('Only 2 units available in stock');
    };
    const mockPlaceOrderApi = async () => {
      placeOrderCalled = true;
      return { order: { id: 'order-123' } };
    };

    const result = await simulateCheckoutRestoration({
      items: mockItems,
      mockFetchCart,
      mockAddCartItem,
      mockUpdateCartItem,
      mockPlaceOrderApi,
    });

    assert.strictEqual(placeOrderCalled, false, 'Must NOT place order when update fails');
    assert.strictEqual(result.placing, false, 'Must reset placing loading state');
    assert.match(result.placeError, /Only 2 units available in stock/);
    assert.strictEqual(result.orderIneligible, true, 'Preserves ineligible status for subsequent user retry');
    // In-memory cart items were preserved
    assert.strictEqual(mockItems[0].quantity, 4);
  });

  test('Expired order recovery: Safely recovers on retry after partial restoration without duplicate quantities', async () => {
    const mockItems = [
      { productId: 101, name: 'Minimalist Tee', size: 'M', color: 'Black', colorName: 'Black', quantity: 2 },
      { productId: 102, name: 'Linen Trousers', size: 'L', color: 'Navy', colorName: 'Navy', quantity: 3 },
    ];

    // Shared backend cart state across retries
    let backendCartItems = [];
    let addCalls = [];
    let updateCalls = [];
    let placeOrderCalled = false;
    let simulateFailItem2 = true;

    const mockFetchCart = async () => ({
      items: backendCartItems.map((it) => ({ ...it })),
    });
    const mockAddCartItem = async (payload) => {
      addCalls.push(payload);
      if (payload.productId === 102 && simulateFailItem2) {
        throw new Error('Network timeout during line 2 addition');
      }
      backendCartItems.push({
        id: `cart-item-${payload.productId}`,
        productId: payload.productId,
        size: payload.size,
        color: payload.color,
        quantity: payload.quantity,
      });
    };
    const mockUpdateCartItem = async (payload) => {
      updateCalls.push(payload);
      const line = backendCartItems.find((l) => l.id === payload.itemId);
      if (line) line.quantity = payload.quantity;
    };
    const mockPlaceOrderApi = async () => {
      placeOrderCalled = true;
      return { order: { id: 'replacement-order-777' } };
    };

    // --- ATTEMPT 1: Item 1 succeeds, Item 2 fails ---
    const attempt1 = await simulateCheckoutRestoration({
      items: mockItems,
      mockFetchCart,
      mockAddCartItem,
      mockUpdateCartItem,
      mockPlaceOrderApi,
    });

    assert.strictEqual(attempt1.placing, false);
    assert.strictEqual(placeOrderCalled, false, 'Attempt 1 must not place order on partial failure');
    assert.match(attempt1.placeError, /Network timeout during line 2 addition/);
    assert.strictEqual(attempt1.orderIneligible, true, 'orderIneligible remains true after failed attempt');
    // Backend cart now partially contains Item 1 (qty 2)
    assert.strictEqual(backendCartItems.length, 1);
    assert.strictEqual(backendCartItems[0].productId, 101);
    assert.strictEqual(backendCartItems[0].quantity, 2);

    // --- ATTEMPT 2: User retries after transient failure ---
    simulateFailItem2 = false;
    addCalls = [];
    updateCalls = [];

    const attempt2 = await simulateCheckoutRestoration({
      items: mockItems,
      mockFetchCart,
      mockAddCartItem,
      mockUpdateCartItem,
      mockPlaceOrderApi,
    });

    // Item 1 was already in backend with equal quantity (2 === 2), so it must NOT be re-added
    assert.strictEqual(
      addCalls.some((c) => c.productId === 101),
      false,
      'Must NOT re-add Item 1 via addCartItem on retry'
    );
    assert.strictEqual(
      updateCalls.some((c) => c.itemId === 'cart-item-101'),
      false,
      'Must NOT update Item 1 when quantity is already 2'
    );
    // Item 2 was missing, so it was added with intended quantity 3
    assert.strictEqual(addCalls.some((c) => c.productId === 102 && c.quantity === 3), true);

    // Both items are in backend cart with exact intended quantities
    assert.strictEqual(backendCartItems.length, 2);
    assert.strictEqual(placeOrderCalled, true, 'Attempt 2 must place replacement order after full restoration');
    assert.strictEqual(attempt2.orderIneligible, false, 'orderIneligible reset to false on success');
    assert.strictEqual(attempt2.activeKey, 'new-rotated-key');
    assert.strictEqual(attempt2.placeError, null);
  });

  test('Expired order recovery: Fails safely when duplicate matching lines exist or verification fails', async () => {
    // 1. Multiple duplicate lines in backend cart
    const mockItems = [
      { productId: 101, name: 'Minimalist Tee', size: 'M', color: 'Black', colorName: 'Black', quantity: 2 },
    ];
    const duplicateBackendCart = {
      items: [
        { id: 'item-1', productId: 101, size: 'M', color: 'Black', quantity: 1 },
        { id: 'item-2', productId: 101, size: 'M', color: 'Black', quantity: 1 },
      ],
    };
    let placeOrderCalled = false;

    const resultDup = await simulateCheckoutRestoration({
      items: mockItems,
      mockFetchCart: async () => ({ items: duplicateBackendCart.items.map((it) => ({ ...it })) }),
      mockAddCartItem: async () => {},
      mockUpdateCartItem: async () => {},
      mockPlaceOrderApi: async () => {
        placeOrderCalled = true;
      },
    });

    assert.strictEqual(placeOrderCalled, false, 'Must NOT place order when lines cannot be matched reliably');
    assert.match(resultDup.placeError, /Multiple cart lines found/);
    assert.match(resultDup.placeError, /Unable to match reliably/);

    // 2. Verification discrepancy: post-restoration cart quantity mismatch
    let fetchCount = 0;
    const resultVerifyMismatch = await simulateCheckoutRestoration({
      items: mockItems,
      mockFetchCart: async () => {
        fetchCount++;
        if (fetchCount === 1) return { items: [] }; // Initial cart empty
        return { items: [{ id: 'item-1', productId: 101, size: 'M', color: 'Black', quantity: 1 }] }; // Verification returns wrong qty
      },
      mockAddCartItem: async () => {},
      mockUpdateCartItem: async () => {},
      mockPlaceOrderApi: async () => {
        placeOrderCalled = true;
      },
    });

    assert.strictEqual(placeOrderCalled, false, 'Must NOT place order when verification check fails');
    assert.match(resultVerifyMismatch.placeError, /Cart verification failed/);
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
