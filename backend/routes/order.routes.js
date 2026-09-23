import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authorize, optionalAuth } from '../middleware/auth.middleware.js';
import {
  listOrdersHandler,
  getOrderHandler,
  createOrderHandler,
  cancelOrderHandler,
} from '../controllers/order.controller.js';

/**
 * Order routes (Sprint 21.3 Phase 3, Sprint 22.5 Phase 2 cancellation,
 * Sprint 23.x Guest Checkout).
 * Mounted at /api/customer/orders via routes/index.js.
 *
 *   POST   /            — place an order from the active cart (optionalAuth)
 *   GET    /            — list the customer's order history
 *   GET    /:id         — a single order with its items
 *   PATCH  /:id/cancel  — cancel an own, cancellable order (restores stock)
 */
const router = Router();

// Guest checkout enabled: optional auth for placing orders
router.post('/', optionalAuth, asyncHandler(createOrderHandler));

// Strict authorization for order history and cancellation
router.use(authorize('customer'));
router.get('/', asyncHandler(listOrdersHandler));
router.get('/:id', asyncHandler(getOrderHandler));
router.patch('/:id/cancel', asyncHandler(cancelOrderHandler));

export default router;