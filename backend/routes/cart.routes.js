import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authorize, optionalAuth } from '../middleware/auth.middleware.js';
import { cartLimiter, cartUserLimiter } from '../middleware/rateLimit.middleware.js';
import {
  getCartHandler,
  addItemHandler,
  updateItemHandler,
  removeItemHandler,
  mergeCartHandler,
} from '../controllers/cart.controller.js';

/**
 * Cart routes (Sprint 21.3).
 * Mounted at /api/customer/cart via routes/index.js.
 *
 * The four CRUD routes are guest + customer compatible: `optionalAuth` leaves
 * req.user set for authenticated requests (customer cart) and unset for
 * guests, who identify themselves with a `sessionId` (body or query).
 * Merge always requires a real customer token.
 *
 *   GET    /                 — read the cart
 *   POST   /items            — add an item
 *   PUT    /items/:itemId    — set an exact quantity
 *   DELETE /items/:itemId    — remove an item
 *   POST   /merge            — fold a guest session cart into the customer's
 */
const router = Router();

router.get('/', optionalAuth, asyncHandler(getCartHandler));
// Mutation routes: per-IP abuse ceiling first (covers guests), then optionalAuth
// so the per-identity fairness cap (cartUserLimiter) can key on req.user.
router.post('/items', cartLimiter, optionalAuth, cartUserLimiter, asyncHandler(addItemHandler));
router.put('/items/:itemId', cartLimiter, optionalAuth, cartUserLimiter, asyncHandler(updateItemHandler));
router.delete('/items/:itemId', cartLimiter, optionalAuth, cartUserLimiter, asyncHandler(removeItemHandler));
router.post('/merge', cartLimiter, authorize('customer'), cartUserLimiter, asyncHandler(mergeCartHandler));

export default router;