import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireInternalCronAuth } from '../middleware/internalAuth.js';
import {
  expireUnpaidOrdersHandler,
  processRefundIntentsHandler,
} from '../controllers/internal.controller.js';

/**
 * Internal system routes (maintenance, scheduled jobs, sweeper tasks).
 * All endpoints in this router are protected by requireInternalCronAuth
 * and require a valid Bearer token matching INTERNAL_CRON_SECRET.
 */
const router = Router();

// Protect all internal routes with timing-safe bearer token check
router.use(requireInternalCronAuth);

// POST /api/internal/orders/expire-unpaid
router.post('/orders/expire-unpaid', asyncHandler(expireUnpaidOrdersHandler));

// POST /api/internal/refunds/process-intents
router.post('/refunds/process-intents', asyncHandler(processRefundIntentsHandler));

export default router;

