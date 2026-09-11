// ALTNEU — Cart business rules & pricing helpers.
// Single source of truth for shipping thresholds, tax, and totals so the
// drawer, cart page, and badges always agree.

export const FREE_SHIPPING_THRESHOLD = 2499;
export const FLAT_SHIPPING_FEE = 99;
export const ESTIMATED_TAX_RATE = 0.05; // GST on apparel
export const MAX_ITEM_QTY = 10;

export const DEFAULT_SIZE = 'M';
export const DEFAULT_COLOR = 'black';

export const COLOR_NAMES = {
  black: 'Black',
  white: 'Off-White',
  olive: 'Olive',
  rust: 'Rust',
};

export const colorNameFor = (value) => COLOR_NAMES[value] || value || 'Default';

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

export function calcSubtotal(items = []) {
  return items.reduce(
    (sum, item) => sum + num(item.price) * Math.max(0, num(item.quantity)),
    0
  );
}

export function shippingFor(subtotal) {
  return subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_FEE;
}

export function taxFor(subtotal) {
  return Math.round(subtotal * ESTIMATED_TAX_RATE);
}

export function cartTotals(items = []) {
  const subtotal = calcSubtotal(items);
  const shipping = shippingFor(subtotal);
  const tax = taxFor(subtotal);
  return {
    count: items.reduce((sum, item) => sum + Math.max(0, num(item.quantity)), 0),
    subtotal,
    shipping,
    tax,
    grandTotal: subtotal + shipping + tax,
  };
}

export function shippingRemaining(subtotal) {
  return Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);
}

/** 0 → 100 based on how close the cart is to free shipping. */
export function shippingProgress(subtotal) {
  if (subtotal <= 0) return 0;
  return Math.min(100, (subtotal / FREE_SHIPPING_THRESHOLD) * 100);
}