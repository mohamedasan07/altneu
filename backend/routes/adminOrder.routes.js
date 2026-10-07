import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authorize } from '../middleware/auth.middleware.js';
import {
  listAdminOrdersHandler,
  getAdminOrderHandler,
  updateOrderStatusHandler,
  updateOrderPaymentStatusHandler,
  updateOrderTrackingHandler,
} from '../controllers/adminOrder.controller.js';

/**
 * Admin order routes (Sprint 22.1 Phases 1–2).
 * Mounted at /api/admin/orders via routes/index.js. Every route is
 * admin-authenticated (authorize('admin')), so only accounts with role
 * "admin" can list, view or update orders.
 *
 *   GET    /            — paginated order list (search / filter / sort)
 *   GET    /:id         — a single order with its items
 *   PATCH  /:id/status  — update the fulfilment status
 *   PATCH  /:id/payment — update the payment status
 */
const router = Router();

router.use(authorize('admin'));

router.get('/', asyncHandler(listAdminOrdersHandler));
router.get('/:id', asyncHandler(getAdminOrderHandler));
router.patch('/:id/status', asyncHandler(updateOrderStatusHandler));
router.patch('/:id/payment', asyncHandler(updateOrderPaymentStatusHandler));
router.patch('/:id/tracking', asyncHandler(updateOrderTrackingHandler));

export default router;