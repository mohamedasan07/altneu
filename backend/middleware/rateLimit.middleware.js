import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { config } from '../config/index.js';

/**
 * Rate limiting for public / guest-reachable endpoints (Sprint 22.6 P1;
 * extended with order-creation and user-aware cart limiters).
 *
 * Dedicated limiter per surface (each is its own instance, so buckets are
 * independent):
 *   - auth: admin login, admin forgot/reset, customer login/register/forgot
 *   - guest order tracking (order enumeration)
 *   - cart mutations: per-IP abuse ceiling + per-identity fairness cap
 *   - order creation (email spam / inventory-hold abuse)
 *
 * Windows are fixed constants; the per-window request caps come from
 * config.rateLimit (env-configurable + validated — see config/index.js).
 *
 * Response contract: HTTP 429 with `{ error }` shaped like the rest of the API
 * envelope, plus draft-8 `RateLimit` / `RateLimit-Policy` and `Retry-After`
 * headers. The message is deliberately generic and never reveals whether an
 * email/account exists (server-side 401/400 behavior is unchanged).
 *
 * Keying: per-IP by default (the library masks IPv6 to a /56 key). Admin,
 * customer and password-reset buckets are independent instances. Cart adds a
 * second, per-identity bucket for authenticated shoppers so one busy NAT does
 * not throttle an individual account, while the per-IP ceiling still bounds
 * anonymous abuse.
 */

const WINDOW_15_MIN = 15 * 60 * 1000;
const WINDOW_60_MIN = 60 * 60 * 1000;

const RATE_LIMIT_MESSAGE = { error: 'Too many attempts. Please try again later.' };

function buildLimiter({ limit, windowMs, keyGenerator, skip }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: RATE_LIMIT_MESSAGE,
    ...(keyGenerator ? { keyGenerator } : {}),
    ...(skip ? { skip } : {}),
    handler: (_req, res, _next, options) => {
      res.status(options.statusCode).json(options.message);
    },
  });
}

/**
 * Key authenticated requests by user id (so a shared NAT/mobile IP cannot
 * exhaust one customer's cart quota for them) and fall back to the IPv6-safe
 * per-IP key for guests. Only used where `req.user` may be set.
 */
function userKeyGenerator(req) {
  return req.user?.id ? `user:${req.user.id}` : ipKeyGenerator(req.ip);
}

/** POST /api/auth/login — admin credential guessing. */
export const adminLoginLimiter = buildLimiter({
  limit: config.rateLimit.adminLogin,
  windowMs: WINDOW_15_MIN,
});

/**
 * POST /api/auth/forgot-password — admin reset-link minting. Its own instance
 * (separate bucket from login) so exhausting one flow cannot lock out another.
 */
export const adminForgotPasswordLimiter = buildLimiter({
  limit: config.rateLimit.forgotPassword,
  windowMs: WINDOW_60_MIN,
});

/** POST /api/auth/reset-password — admin token redemption. Separate bucket. */
export const adminResetPasswordLimiter = buildLimiter({
  limit: config.rateLimit.forgotPassword,
  windowMs: WINDOW_60_MIN,
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
  limit: config.rateLimit.guestTracking,
  windowMs: WINDOW_15_MIN,
});

/**
 * Cart mutations — per-IP abuse ceiling. Deliberately generous: shoppers behind
 * one NAT/CGNAT share this bucket, so it is an abuse brake, not a fairness
 * quota. Authenticated fairness is enforced by cartUserLimiter below.
 */
export const cartLimiter = buildLimiter({
  limit: config.rateLimit.cartIp,
  windowMs: WINDOW_15_MIN,
});

/**
 * Cart mutations — per-identity fairness cap for authenticated shoppers.
 * Guests are skipped (the IP ceiling above covers them). MUST be mounted AFTER
 * the auth middleware so `req.user` is populated.
 */
export const cartUserLimiter = buildLimiter({
  limit: config.rateLimit.cart,
  windowMs: WINDOW_15_MIN,
  keyGenerator: userKeyGenerator,
  skip: (req) => !req.user?.id,
});

/**
 * POST /api/customer/orders — order-creation abuse. Unbounded placement would
 * allow confirmation-email spam and inventory holds (pending orders reserve
 * stock), so creation gets a dedicated per-IP cap. Read/track routes are
 * intentionally not limited.
 */
export const orderLimiter = buildLimiter({
  limit: config.rateLimit.order,
  windowMs: WINDOW_15_MIN,
});
