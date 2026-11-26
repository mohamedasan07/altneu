import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FLAT_SHIPPING_FEE,
  shippingFor,
  cartTotals,
  calcSubtotal,
} from '../src/utils/cartConfig.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(here, '..', rel), 'utf8');

describe('Task 1 & 2: Frontend Shipping Pricing & Display Invariants', () => {
  test('cartConfig: FLAT_SHIPPING_FEE is strictly ₹80', () => {
    assert.strictEqual(FLAT_SHIPPING_FEE, 80, 'FLAT_SHIPPING_FEE in cartConfig must be 80');
  });

  test('cartConfig: shippingFor returns 80', () => {
    assert.strictEqual(shippingFor(0), 80);
    assert.strictEqual(shippingFor(500), 80);
    assert.strictEqual(shippingFor(2500), 80);
  });

  test('cartConfig: cartTotals correctly includes ₹80 shipping fee in grand total with zero tax', () => {
    const items = [
      { id: '1', price: 999, quantity: 2 },
    ];
    const totals = cartTotals(items);
    assert.strictEqual(totals.subtotal, 1998);
    assert.strictEqual(totals.shipping, 80, 'Shipping must be ₹80');
    assert.strictEqual(totals.tax, 0, 'Tax must be 0 for unregistered business');
    assert.strictEqual(totals.grandTotal, 1998 + 80);
  });

  test('useCheckout: static contract verifies deliveryPriceFor and checkoutTotals logic', () => {
    const src = read('src/hooks/useCheckout.js');
    assert.match(src, /import\s*\{[^}]*\bshippingFor\b[^}]*\}\s*from\s*['"]\.\.\/utils\/cartConfig['"]/);
    assert.match(src, /export\s+function\s+deliveryPriceFor\s*\([^)]*\)\s*\{[\s\S]*?return\s+shippingFor\(subtotal\);/);
    assert.match(src, /const\s+grandTotal\s*=\s*taxable\s*\+\s*shipping;/);
    assert.match(src, /Doorstep\s*·\s*5[–-]7\s*business\s*days/);
  });

  test('CartSummary: dynamic delivery note includes shipping amount and no GST label', () => {
    const src = read('src/components/cart/CartSummary/CartSummary.jsx');
    assert.match(src, /Standard delivery \(\{shipping === 0 \? 'Free' : formatINR\(shipping\)\}\)/);
    assert.doesNotMatch(src, /GST/);
    assert.doesNotMatch(src, /₹69/);
  });

  test('DeliveryInfo: specifies ST Courier and ₹80 shipping across India', () => {
    const src = read('src/components/product/DeliveryInfo.jsx');
    assert.match(src, /ST Courier/);
    assert.match(src, /Fixed ₹80 shipping/);
    assert.doesNotMatch(src, /₹69/);
    assert.doesNotMatch(src, /Tamil Nadu only|Only in Tamil Nadu/i);
  });

  test('ShippingProgress: specifies ST Courier, ₹80 fee, and pan-India delivery', () => {
    const src = read('src/components/cart/ShippingProgress/ShippingProgress.jsx');
    assert.match(src, /FLAT_SHIPPING_FEE/);
    assert.match(src, /ST Courier/);
    assert.match(src, /across India/);
    assert.doesNotMatch(src, /Tamil Nadu only|Only in Tamil Nadu/i);
  });

  test('ProductPage: specifies 5–7 business days, ST Courier and ₹80 shipping', () => {
    const src = read('src/pages/ProductPage/ProductPage.jsx');
    assert.match(src, /5[–-]7 business days via ST Courier/);
    assert.match(src, /Fixed shipping fee of ₹80/);
    assert.doesNotMatch(src, /₹69/);
    assert.doesNotMatch(src, /Tamil Nadu only|Only in Tamil Nadu/i);
  });

  test('ShippingPage: reflects ST Courier, ₹80 fixed fee, and tracking after dispatch', () => {
    const src = read('src/pages/ShippingPage/ShippingPage.jsx');
    assert.match(src, /ST Courier/);
    assert.match(src, /fixed shipping fee of ₹80/);
    assert.match(src, /Harshan/);
    assert.match(src, /June 2026/);
    assert.doesNotMatch(src, /₹69/);
    assert.doesNotMatch(src, /Tamil Nadu only|Only in Tamil Nadu/i);
  });

  test('AboutPage: reflects June 2026 founding, Harshan as founder, and ST Courier', () => {
    const src = read('src/pages/AboutPage/AboutPage.jsx');
    assert.match(src, /June 2026/);
    assert.match(src, /founder Harshan/);
    assert.match(src, /ST Courier/);
  });
});
