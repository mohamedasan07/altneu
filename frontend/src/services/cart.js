// UNSORTED — cart API client + guest session management (Sprint 21.3 Phase 2).
//
// Every function talks to the backend cart API (backend Phase 1, mounted at
// /api/customer/cart). The shared `request()` helper attaches the customer JWT
// automatically when present, so:
//   - authenticated customers  → the backend routes to their cart (req.user)
//   - guests                   → we send a sessionId; the backend routes to the
//                                session cart
// The same functions are used for both — the caller just passes/omits
// sessionId. Server responses are authoritative; callers replace local state
// with the returned cart.

import { request } from './api';

const OLD_LEGACY_SESSION_KEY = 'unsorted_cart_session_v1';
const LEGACY_SESSION_KEY = 'altnue_cart_session_v1';
const SESSION_KEY = 'altneu_cart_session_v1';

/** RFC-4122 v4 UUID with a safe fallback for non-secure contexts. */
function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // eslint-disable-next-line no-bitwise
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Read the stored guest session id. Returns null when none exists. */
export function getStoredGuestSessionId() {
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (id) return id;

    id = localStorage.getItem(LEGACY_SESSION_KEY);
    if (id) {
      localStorage.setItem(SESSION_KEY, id);
      return id;
    }

    id = localStorage.getItem(OLD_LEGACY_SESSION_KEY);
    if (id) {
      localStorage.setItem(SESSION_KEY, id);
      return id;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Return the guest session id, creating + persisting one the first time.
 * Reused for the guest's entire shopping trip until login merge clears it.
 */
export function ensureGuestSessionId() {
  const existing = getStoredGuestSessionId();
  if (existing) return existing;
  const id = newId();
  try {
    localStorage.setItem(SESSION_KEY, id);
    localStorage.setItem(LEGACY_SESSION_KEY, id);
    localStorage.setItem(OLD_LEGACY_SESSION_KEY, id);
  } catch {
    /* storage unavailable — session runs in memory only */
  }
  return id;
}

/** Drop the guest session after a successful login merge. */
export function clearGuestSessionId() {
  try {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(LEGACY_SESSION_KEY);
    localStorage.removeItem(OLD_LEGACY_SESSION_KEY);
  } catch {
    /* noop */
  }
}

const withSession = (obj, sessionId) => (sessionId ? { ...obj, sessionId } : obj);

/**
 * GET /api/customer/cart — the current cart.
 * @param {string|null} sessionId  guest session id, or null for a logged-in customer
 */
export async function fetchCart(sessionId) {
  const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
  const res = await request(`/api/customer/cart${query}`);
  return res.cart;
}

/**
 * POST /api/customer/cart/items — add a product line.
 * @param {{ sessionId?: string|null, productId: number, size: string, color: string, colorName?: string, quantity: number }} input
 */
export async function addCartItem(input) {
  const { sessionId, ...payload } = input;
  const res = await request('/api/customer/cart/items', {
    method: 'POST',
    body: JSON.stringify(withSession(payload, sessionId)),
  });
  return res.cart;
}

/**
 * PUT /api/customer/cart/items/:itemId — set an exact quantity.
 * @param {{ sessionId?: string|null, itemId: string, quantity: number }} input
 */
export async function updateCartItem(input) {
  const { sessionId, itemId, quantity } = input;
  const res = await request(`/api/customer/cart/items/${itemId}`, {
    method: 'PUT',
    body: JSON.stringify(withSession({ quantity }, sessionId)),
  });
  return res.cart;
}

/**
 * DELETE /api/customer/cart/items/:itemId — remove a line.
 * @param {{ sessionId?: string|null, itemId: string }} input
 */
export async function removeCartItem(input) {
  const { sessionId, itemId } = input;
  const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
  const res = await request(`/api/customer/cart/items/${itemId}${query}`, {
    method: 'DELETE',
  });
  return res.cart;
}

/**
 * POST /api/customer/cart/merge — fold the guest cart into the customer cart.
 * Caller must be authenticated (the shared request() attaches the JWT).
 * @param {{ sessionId: string }} input
 */
export async function mergeCart(input) {
  const res = await request('/api/customer/cart/merge', {
    method: 'POST',
    body: JSON.stringify({ sessionId: input.sessionId }),
  });
  return res.cart;
}