// ALTNEU — wishlist API client (Sprint 22.4 Phase 2).
//
// Every function talks to the customer wishlist API, mounted at
// /api/customer/wishlist. The shared request() helper attaches the customer JWT
// automatically, so these calls only work for authenticated customers — guests
// keep using the localStorage wishlist (WishlistStorage) and never hit these
// endpoints.
//
// The backend returns:
//   GET    → { success, items: [ { id, productId, name, price, imageUrl,
//                                 category, stockQuantity, isActive } ] }
//   POST   → { success, item: { ...same item shape... } }   (idempotent)
//   DELETE → { success }                                    (idempotent)
// Callers map the returned items into the existing WishlistContext product
// representation.

import { request } from './api';

/** GET /api/customer/wishlist — the current customer's saved items. */
export async function fetchWishlist() {
  const data = await request('/api/customer/wishlist');
  return Array.isArray(data.items) ? data.items : [];
}

/**
 * POST /api/customer/wishlist — add a product (idempotent).
 * @param {number} productId products.id
 * @returns {Promise<object|null>} the saved wishlist item
 */
export async function addWishlistItem(productId) {
  const data = await request('/api/customer/wishlist', {
    method: 'POST',
    body: JSON.stringify({ productId }),
  });
  return data.item || null;
}

/**
 * DELETE /api/customer/wishlist/:productId — remove a product (idempotent).
 * @param {number} productId products.id
 */
export async function removeWishlistItem(productId) {
  await request(`/api/customer/wishlist/${productId}`, {
    method: 'DELETE',
  });
}