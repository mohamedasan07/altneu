// ALTNEU — Product stock/availability helpers.
//
// Single source of truth for the "sold out" decision across every product entry
// point (cards, quick view, product page, wishlist). Derived from the product
// API shape returned by GET /api/products (backend services/product.service.js
// `normalizeProduct`): `stockQuantity` mirrors products.stock_quantity and
// `is_active` mirrors products.is_active.
//
// Intentionally a plain module (no JSX/CSS imports) so it can be unit-tested
// with the Node test runner and reused anywhere.

export const LOW_STOCK_THRESHOLD = 5;

/**
 * Normalise a product into its availability state.
 * @param {object} [product]
 * @returns {{ stockQuantity: number, inactive: boolean, outOfStock: boolean, lowStock: boolean, canPurchase: boolean }}
 */
export function getStockInfo(product) {
  const stockQuantity = Number(product?.stockQuantity) || 0;
  const inactive = product?.is_active === false;
  const outOfStock = inactive || stockQuantity <= 0;
  const lowStock = !outOfStock && stockQuantity <= LOW_STOCK_THRESHOLD;

  return {
    stockQuantity,
    inactive,
    outOfStock,
    lowStock,
    canPurchase: !outOfStock,
  };
}

/** Convenience predicate for the most common check. */
export function isSoldOut(product) {
  return getStockInfo(product).outOfStock;
}
