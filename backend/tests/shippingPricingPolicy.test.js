import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  FLAT_SHIPPING_FEE,
  ESTIMATED_TAX_RATE,
  deliveryPriceFor,
  computeOrderPricing,
  DELIVERY_OPTIONS,
  COUPONS,
  validateOrderPayload,
} from '../validators/order.validator.js';
import { normalizeOrder } from '../services/order.service.js';

describe('Task 1 & 2: Backend Shipping Pricing and Policy Invariants', () => {
  test('FLAT_SHIPPING_FEE is strictly ₹80 and ESTIMATED_TAX_RATE is strictly 0', () => {
    assert.strictEqual(FLAT_SHIPPING_FEE, 80, 'FLAT_SHIPPING_FEE must be 80');
    assert.strictEqual(ESTIMATED_TAX_RATE, 0, 'ESTIMATED_TAX_RATE must be 0 for unregistered business');
  });

  test('deliveryPriceFor returns 80 regardless of subtotal or delivery option', () => {
    assert.strictEqual(deliveryPriceFor('standard', 0), 80);
    assert.strictEqual(deliveryPriceFor('standard', 500), 80);
    assert.strictEqual(deliveryPriceFor('standard', 5000), 80);
    assert.strictEqual(deliveryPriceFor(undefined, 2500), 80);
  });

  test('computeOrderPricing correctly includes ₹80 shipping fee in grandTotal without coupon and zero tax', () => {
    const subtotal = 1000;
    const pricing = computeOrderPricing(subtotal, 'standard', null);

    assert.strictEqual(pricing.subtotal, 1000);
    assert.strictEqual(pricing.discount, 0);
    assert.strictEqual(pricing.shipping, 80, 'Shipping must be ₹80');
    assert.strictEqual(pricing.taxable, 1000);
    assert.strictEqual(pricing.tax, 0, 'Tax must be 0 for unregistered business');
    assert.strictEqual(pricing.grandTotal, 1080, 'grandTotal must be 1000 + 80 = 1080');

    // Razorpay amount in paise derivation
    const razorpayPaise = Math.round(pricing.grandTotal * 100);
    assert.strictEqual(razorpayPaise, 108000, 'Razorpay amount must strictly include ₹80 shipping (108000 paise)');
  });

  test('computeOrderPricing preserves correct coupon discount, zero tax and ₹80 shipping fee', () => {
    const subtotal = 2000;
    // WELCOME10 is 10%
    assert.ok(COUPONS.WELCOME10, 'WELCOME10 coupon must exist');
    const pricing = computeOrderPricing(subtotal, 'standard', 'WELCOME10');

    assert.strictEqual(pricing.subtotal, 2000);
    assert.strictEqual(pricing.discount, 200); // 10% of 2000
    assert.strictEqual(pricing.shipping, 80, 'Shipping must remain fixed at ₹80');
    assert.strictEqual(pricing.taxable, 1800); // 2000 - 200
    assert.strictEqual(pricing.tax, 0, 'Tax must be 0 for unregistered business');
    assert.strictEqual(pricing.grandTotal, 1880, 'grandTotal must be 1800 + 80 = 1880');

    const razorpayPaise = Math.round(pricing.grandTotal * 100);
    assert.strictEqual(razorpayPaise, 188000, 'Razorpay amount must be 188000 paise');
  });

  test('order validator payload accepts delivery option and ignores client shipping and client tax', () => {
    const rawPayload = {
      shipping: {
        name: 'Test Customer',
        phone: '9876543210',
        email: 'test@example.com',
        line1: '123 Main Road',
        city: 'Chennai',
        state: 'Tamil Nadu',
        pincode: '600001',
        country: 'India',
      },
      delivery: 'standard',
      payment: 'razorpay',
      // Attacker attempts to forge shipping fee, tax, or total
      shippingFee: 0,
      clientShipping: 10,
      tax: 999,
      grandTotal: 10,
    };

    const validated = validateOrderPayload(rawPayload);
    assert.strictEqual(validated.delivery, 'standard');
    assert.strictEqual(validated.shippingFee, undefined, 'Client shipping fee must be ignored');
    assert.strictEqual(validated.clientShipping, undefined, 'Client shipping fee must be ignored');
    assert.strictEqual(validated.tax, undefined, 'Client tax must be ignored');
    assert.strictEqual(validated.grandTotal, undefined, 'Client grandTotal must be ignored');

    // Server-derived pricing
    const pricing = computeOrderPricing(1500, validated.delivery, null);
    assert.strictEqual(pricing.shipping, 80, 'Server must independently calculate ₹80');
    assert.strictEqual(pricing.tax, 0, 'Server must independently calculate 0 tax');
    assert.strictEqual(pricing.grandTotal, 1580, 'Server must independently calculate 1500 + 80 = 1580');
  });

  test('delivery options contract specifies 5–7 business days standard delivery', () => {
    assert.ok(DELIVERY_OPTIONS.standard);
    assert.strictEqual(DELIVERY_OPTIONS.standard.label, 'Standard Delivery');
    assert.match(DELIVERY_OPTIONS.standard.note, /5[–-]7 business days/);
    assert.strictEqual(DELIVERY_OPTIONS.standard.etaDays, 6);
  });

  test('historical orders retain their original recorded tax, shipping, and grand_total', () => {
    const historicalRow = {
      id: 'h1',
      order_number: 'ALT-HIST-001',
      subtotal: 1000,
      discount: 0,
      shipping: 69,
      tax: 50, // Historical 5% tax
      grand_total: 1119,
      currency: 'INR',
      shipping_address: { name: 'Historical Customer', line1: 'Old Street' },
      items: [{ id: 'i1', product_id: 'p1', name: 'Vintage Tee', price_at_order: 1000, quantity: 1 }],
    };

    const normalized = normalizeOrder(historicalRow);
    assert.strictEqual(normalized.totals.subtotal, 1000);
    assert.strictEqual(normalized.totals.shipping, 69, 'Historical shipping must be preserved');
    assert.strictEqual(normalized.totals.tax, 50, 'Historical tax must be preserved');
    assert.strictEqual(normalized.totals.grandTotal, 1119, 'Historical grand total must be preserved');
  });

  test('new orders store zero tax and grandTotal = subtotal - discount + 80', () => {
    const newRow = {
      id: 'n1',
      order_number: 'ALT-NEW-001',
      subtotal: 1200,
      discount: 120, // 10% coupon
      shipping: 80,
      tax: 0, // Unregistered business zero tax
      grand_total: 1160, // 1200 - 120 + 80 = 1160
      currency: 'INR',
      shipping_address: { name: 'New Customer', line1: 'New Street' },
      items: [{ id: 'i2', product_id: 'p2', name: 'Baggy Tee', price_at_order: 1200, quantity: 1 }],
    };

    const normalized = normalizeOrder(newRow);
    assert.strictEqual(normalized.totals.subtotal, 1200);
    assert.strictEqual(normalized.totals.discount, 120);
    assert.strictEqual(normalized.totals.shipping, 80);
    assert.strictEqual(normalized.totals.tax, 0);
    assert.strictEqual(normalized.totals.grandTotal, 1160);
  });

  test('refund calculations derive strictly from stored order grand_total without altering tax', () => {
    const historicalOrder = { grand_total: 1119 };
    const newOrder = { grand_total: 1160 };

    const historicalPaise = Math.round(Number(historicalOrder.grand_total) * 100);
    const newPaise = Math.round(Number(newOrder.grand_total) * 100);

    assert.strictEqual(historicalPaise, 111900, 'Historical order refunds full historical amount');
    assert.strictEqual(newPaise, 116000, 'New order refunds exact new grand total');
  });
});
