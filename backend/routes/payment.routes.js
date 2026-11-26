import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { optionalAuth } from '../middleware/auth.middleware.js';
import {
  createOrderHandler,
  verifyPaymentHandler,
  webhookHandler,
} from '../controllers/payment.controller.js';

/**
 * Razorpay payment routes (Phase 2 Backend Core & Phase 3 Webhooks).
 * Mounted at /api/payment via routes/index.js.
 *
 *   POST /razorpay/create-order — Initialize / reuse Razorpay gateway order (optionalAuth)
 *   POST /razorpay/verify       — Dual-layer signature & gateway verification (optionalAuth)
 *   POST /razorpay/webhook      — Ingest & process Razorpay webhooks (cryptographic HMAC signature verified)
 */
const router = Router();

router.post('/razorpay/create-order', optionalAuth, asyncHandler(createOrderHandler));
router.post('/razorpay/verify', optionalAuth, asyncHandler(verifyPaymentHandler));
router.post('/razorpay/webhook', asyncHandler(webhookHandler));

export default router;

