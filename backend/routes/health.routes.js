import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { health } from '../controllers/health.controller.js';

const router = Router();

router.get('/health', asyncHandler(health));

export default router;