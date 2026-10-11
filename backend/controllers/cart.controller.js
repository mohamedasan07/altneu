import {
  getCart,
  addItem,
  updateItem,
  removeItem,
  mergeGuestCart,
} from '../services/cart.service.js';
import { parseSessionId } from '../validators/cart.validator.js';
import { ApiError } from '../utils/apiError.js';

/**
 * Cart HTTP handlers (Sprint 21.3).
 * Controllers stay thin: resolve the cart owner (customer JWT or guest
 * session), delegate to the service, shape the response. Errors thrown by the
 * service (400/404/500) are forwarded to the centralized errorHandler by the
 * asyncHandler wrapper in the route file.
 *
 * Identity: a request with a valid customer JWT (req.user set by the optional
 * auth middleware) acts on the customer's cart; otherwise a `sessionId` from
 * the body or query string identifies the guest cart.
 */

/** Resolve who owns this cart: customer JWT wins, else validated guest sessionId. */
function resolveOwner(req) {
  if (req.user?.id) return { user_id: req.user.id };
  const raw = req.body?.sessionId ?? req.query?.sessionId ?? req.headers['x-session-id'];
  if (!raw) return { session_id: null };
  const sessionId = parseSessionId(raw);
  return { session_id: sessionId };
}

/** GET /api/customer/cart — the current cart. */
export async function getCartHandler(req, res) {
  const cart = await getCart(resolveOwner(req));
  res.json({ success: true, cart });
}

/** POST /api/customer/cart/items — add a product to the cart. */
export async function addItemHandler(req, res) {
  const cart = await addItem(resolveOwner(req), req.body);
  res.status(201).json({ success: true, cart });
}

/** PUT /api/customer/cart/items/:itemId — set an exact quantity. */
export async function updateItemHandler(req, res) {
  const cart = await updateItem(resolveOwner(req), req.params.itemId, req.body);
  res.json({ success: true, cart });
}

/** DELETE /api/customer/cart/items/:itemId — remove a line. */
export async function removeItemHandler(req, res) {
  const cart = await removeItem(resolveOwner(req), req.params.itemId);
  res.json({ success: true, cart });
}

/** POST /api/customer/cart/merge — fold a guest cart into the customer's. */
export async function mergeCartHandler(req, res) {
  if (!req.user?.id) {
    throw new ApiError(401, 'Authentication required to merge a cart');
  }
  const cart = await mergeGuestCart(req.user.id, req.body?.sessionId);
  res.json({ success: true, cart });
}