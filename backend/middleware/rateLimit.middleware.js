import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';

/**
 * Per-IP rate limiting for public authentication endpoints (Sprint 22.6 P1).
 *
 * Auth endpoints are the only "expensive" public surfaces (bcrypt compare,
 * account creation, reset-token minting) and the primary brute-force targets,
 * so they get dedicated limiters. Normal authenticated API traffic is NOT
 * limited — nothing in this module is mounted on protected routes.
 *
 * Windows are fixed constants; the per-window request caps come from
 * config.rateLimit (env-configurable, see config/env.js).
 *
 * Response contract: HTTP 429 with `{ error }` shaped like the rest of the
 * API envelope. The message is deliberately generic and never reveals whether
 * an email/account exists (server-side 401/400 behavior is unchanged).
 *
 * Keying: per-IP via the default keyGenerator. Admin and customer limits are
 * intentionally independent (a single-operator admin login is allowed far
 * fewer guesses than the customer population).
 */

const WINDOW_15_MIN = 15 * 60 * 1000;
const WINDOW_60_MIN = 60 * 60 * 1000;

const RATE_LIMIT_MESSAGE = { error: 'Too many attempts. Please try again later.' };

function buildLimiter({ limit, windowMs }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: RATE_LIMIT_MESSAGE,
    handler: (_req, res, _next, options) => {
      res.status(options.statusCode).json(options.message);
    },
  });
}

/** POST /api/auth/login — admin credential guessing. */
export const adminLoginLimiter = buildLimiter({
  limit: config.rateLimit.adminLogin,
  windowMs: WINDOW_15_MIN,
});

/** POST /api/customer/auth/login — customer credential guessing. */
export const customerLoginLimiter = buildLimiter({
  limit: config.rateLimit.customerLogin,
  windowMs: WINDOW_15_MIN,
});

/** POST /api/customer/auth/register — account creation abuse / spam signups. */
export const registerLimiter = buildLimiter({
  limit: config.rateLimit.register,
  windowMs: WINDOW_60_MIN,
});

/** POST /api/customer/auth/forgot-password — reset-link spamming. */
export const forgotPasswordLimiter = buildLimiter({
  limit: config.rateLimit.forgotPassword,
  windowMs: WINDOW_60_MIN,
});
/** POST /api/public/track-order — prevent order enumeration. */
export const guestTrackingLimiter = buildLimiter({
  limit: config.rateLimit?.guestTracking || 15,
  windowMs: WINDOW_15_MIN,
});
