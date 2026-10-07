import { Router } from 'express';
import { trackOrderHandler } from '../controllers/public.controller.js';
import { guestTrackingLimiter } from '../middleware/rateLimit.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.post('/track-order', guestTrackingLimiter, asyncHandler(trackOrderHandler));

export default router;
