import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authorize } from '../middleware/auth.middleware.js';
import {
  adminLoginLimiter,
  adminForgotPasswordLimiter,
  adminResetPasswordLimiter,
} from '../middleware/rateLimit.middleware.js';
import { login, me, forgotPassword, resetPassword } from '../controllers/auth.controller.js';

/**
 * Admin authentication routes (Sprint 15).
 * Mounted at /api/auth via routes/index.js.
 */
const router = Router();

// POST /api/auth/login — public, issues a JWT on valid credentials.
// Rate-limited per IP (Sprint 22.6 P1) to blunt admin credential guessing.
router.post('/login', adminLoginLimiter, asyncHandler(login));

// GET /api/auth/me — protected. Lets the admin frontend restore a session from
// a stored token.
router.get('/me', authorize('admin'), asyncHandler(me));

// POST /api/auth/forgot-password — initiates password reset.
// Dedicated per-IP limiter, separate from the login bucket.
router.post('/forgot-password', adminForgotPasswordLimiter, asyncHandler(forgotPassword));

// POST /api/auth/reset-password — completes password reset.
// Dedicated per-IP limiter (its own bucket, separate from login too).
router.post('/reset-password', adminResetPasswordLimiter, asyncHandler(resetPassword));

export default router;
