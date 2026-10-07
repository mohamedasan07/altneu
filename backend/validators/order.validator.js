import { ApiError } from '../utils/apiError.js';

/**
 * Order payload validation + pricing rules (Sprint 21.3 Phase 3).
 *
 * Single source of truth for the fields the order module accepts, mirroring
 * the storefront checkout business rules (frontend/src/hooks/useCheckout.js
 * and utils/cartConfig.js): delivery options, payment methods, coupon codes,
 * tax/shipping rates, and the shipping snapshot fields. Because the backend
 * must NEVER trust client totals, the same module exports the server-side
 * pricing computation (computeOrderPricing) the service uses to re-derive
 * every money value from database prices.
 *
 * Stock availability is NOT validated here — that requires a product lookup
 * against the database, so the service does it with conditional decrements
 * (never trust client quantities/prices).
 */

export const CURRENCY = 'INR';

// Storefront pricing constants (mirror frontend/src/utils/cartConfig.js).
export const FLAT_SHIPPING_FEE = 69;
export const ESTIMATED_TAX_RATE = 0.05; // GST on apparel

// Delivery options (mirror DELIVERY_OPTIONS in useCheckout.js).
export const DELIVERY_OPTIONS = {
  standard: { id: 'standard', label: 'Standard Delivery', note: 'Doorstep · 5–7 business days', etaDays: 6 },
};

// Payment methods currently accepted (Razorpay is "coming soon" — disabled on
// the storefront and rejected here). Payments are a later sprint; we only
// record the chosen method with payment_status = 'pending'.
export const PAYMENT_METHODS = ['card', 'upi', 'netbanking', 'cod'];

// Coupon codes are a server-owned config map (not a client value). Codes move
// from useCheckout.js COUPONS here so the discount is always re-derived
// server-side at placement time.
export const COUPONS = {
  WELCOME10: { percent: 0.1, label: '10% off — WELCOME10' },
  UNFILTERED15: { percent: 0.15, label: '15% off — UNFILTERED15' },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[6-9]\d{9}$/;
const PIN_RE = /^\d{6}$/;
const PIN_INTL_RE = /^\d{4,12}$/;
const IDEMPOTENCY_RE = /^[A-Za-z0-9_-]{8,64}$/;
const COUNTRIES = ['India'];

/**
 * Validate an order id (UUID) path param before it reaches the database.
 * @param {string} value
 * @returns {string} the trimmed id
 * @throws {ApiError} 400 when invalid
 */
export function parseOrderId(value) {
  const id = String(value ?? '').trim();
  if (!UUID_RE.test(id)) {
    throw new ApiError(400, 'Invalid order id');
  }
  return id;
}

/**
 * Compute the full order pricing from a server-derived subtotal.
 * Mirrors checkoutTotals() in useCheckout.js so the storefront and backend
 * agree, but always runs on database prices.
 * @param {number} subtotal     sum of product.price * quantity (server-computed)
 * @param {string} deliveryId   'standard' | 'express' | 'pickup'
 * @param {string|null} couponCode  known coupon code or null
 * @returns {{ subtotal: number, discount: number, shipping: number, tax: number, taxable: number, grandTotal: number }}
 */
export function computeOrderPricing(subtotal, deliveryId, couponCode) {
  const discount = couponCode
    ? Math.min(subtotal, Math.round(subtotal * COUPONS[couponCode].percent))
    : 0;
  const shipping = deliveryPriceFor(deliveryId, subtotal);
  const taxable = subtotal - discount;
  const tax = Math.round(taxable * ESTIMATED_TAX_RATE);
  const grandTotal = taxable + shipping + tax;
  return { subtotal, discount, shipping, tax, taxable, grandTotal };
}

/** Delivery fee for a selected method given the running subtotal. */
export function deliveryPriceFor(deliveryId, subtotal) {
  return FLAT_SHIPPING_FEE;
}

/**
 * Validate a "place order" payload and return a normalized object.
 * @param {object} body  request body
 * @returns {{
 *   shipping: { name, phone, email, line1, line2, city, state, pincode, country },
 *   delivery: 'standard' | 'express' | 'pickup',
 *   payment: string,
 *   couponCode: string|null,
 *   notes: string,
 *   idempotencyKey: string|null,
 * }}
 * @throws {ApiError} 400 when validation fails
 */
export function validateOrderPayload(body = {}) {
  const errors = [];
  const data = {};

  // --- shipping snapshot (mirrors the checkout shipping form) ---
  const shipping = {};
  const name = String(body.shipping?.name ?? '').trim();
  if (!name) {
    errors.push('name is required');
  } else if (name.length < 2) {
    errors.push('name must be at least 2 characters');
  } else if (name.length > 100) {
    errors.push('name is too long');
  } else {
    shipping.name = name;
  }

  const phone = String(body.shipping?.phone ?? '').trim();
  if (!phone) {
    errors.push('phone is required');
  } else if (!PHONE_RE.test(phone)) {
    errors.push('phone must be a valid phone number');
  } else {
    shipping.phone = phone;
  }

  const email = String(body.shipping?.email ?? '').trim();
  if (!email) {
    errors.push('email is required');
  } else if (!EMAIL_RE.test(email)) {
    errors.push('Enter a valid email address');
  } else {
    shipping.email = email;
  }

  const line1 = String(body.shipping?.line1 ?? '').trim();
  if (!line1) {
    errors.push('address is required');
  } else if (line1.length < 8) {
    errors.push('Enter your full street address');
  } else if (line1.length > 250) {
    errors.push('address is too long');
  } else {
    shipping.line1 = line1;
  }

  shipping.line2 = String(body.shipping?.line2 ?? '').trim();

  const city = String(body.shipping?.city ?? '').trim();
  if (!city) {
    errors.push('city is required');
  } else if (city.length < 2) {
    errors.push('city must be at least 2 characters');
  } else if (city.length > 100) {
    errors.push('city is too long');
  } else {
    shipping.city = city;
  }

  const locality = String(body.shipping?.locality ?? '').trim();
  if (locality.length > 100) {
    errors.push('locality is too long');
  } else if (locality) {
    shipping.locality = locality;
  }

  const state = String(body.shipping?.state ?? '').trim();
  if (!state) {
    errors.push('state is required');
  } else if (state.length < 2) {
    errors.push('state must be at least 2 characters');
  } else if (state.length > 100) {
    errors.push('state is too long');
  } else {
    shipping.state = state;
  }

  const country = String(body.shipping?.country ?? 'India').trim() || 'India';
  const pincode = String(body.shipping?.pincode ?? '').trim();
  if (!pincode) {
    errors.push('pincode is required');
  } else if (country === 'India') {
    if (!PIN_RE.test(pincode)) errors.push('Enter a valid 6-digit pincode');
    else shipping.pincode = pincode;
  } else {
    if (!PIN_INTL_RE.test(pincode)) errors.push('Enter a valid postcode');
    else shipping.pincode = pincode;
  }

  if (!COUNTRIES.includes(country)) {
    errors.push('Unsupported country');
  } else {
    shipping.country = country;
  }
  data.shipping = shipping;

  // --- delivery (must be a known option) ---
  const delivery = String(body.delivery ?? 'standard').trim();
  if (!DELIVERY_OPTIONS[delivery]) {
    errors.push('Invalid delivery option');
  } else {
    data.delivery = delivery;
  }

  // --- payment method (Razorpay disabled — not accepted yet) ---
  const payment = String(body.payment ?? '').trim();
  if (!payment) {
    errors.push('A payment method is required');
  } else if (!PAYMENT_METHODS.includes(payment)) {
    errors.push('Invalid payment method');
  } else {
    data.payment = payment;
  }

  // --- coupon (optional, must be a known code) ---
  const couponRaw = body.coupon === null || body.coupon === undefined ? '' : String(body.coupon).trim();
  const couponCode = couponRaw.toUpperCase();
  if (couponCode) {
    if (!COUPONS[couponCode]) {
      errors.push(`"${couponRaw}" isn't a valid coupon code`);
    } else {
      data.couponCode = couponCode;
    }
  } else {
    data.couponCode = null;
  }

  // --- notes (optional, bounded) ---
  data.notes = String(body.notes ?? '').slice(0, 500);

  // --- idempotency key (optional, used to protect against double-submit) ---
  const idempotencyRaw = String(body.idempotencyKey ?? '').trim();
  if (idempotencyRaw) {
    if (!IDEMPOTENCY_RE.test(idempotencyRaw)) {
      errors.push('Invalid idempotency key');
    } else {
      data.idempotencyKey = idempotencyRaw;
    }
  } else {
    data.idempotencyKey = null;
  }

  if (errors.length > 0) {
    throw new ApiError(400, errors.join('; '));
  }

  return data;
}
/**
 * Validate a guest tracking lookup.
 */
export function validateGuestTrackingPayload(body = {}) {
  const altneuNumber = String(body.orderNumber ?? '').trim().toUpperCase();
  const contactRaw = String(body.contact ?? '').trim();

  if (!altneuNumber) {
    throw new ApiError(400, 'Order number is required');
  }
  if (!contactRaw) {
    throw new ApiError(400, 'Email or phone number is required');
  }

  return { altneuNumber, contactRaw };
}
