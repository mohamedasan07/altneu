import crypto from 'crypto';
import { config } from '../config/index.js';
import { ApiError } from '../utils/apiError.js';
import { logger } from '../utils/logger.js';

/**
 * Middleware protecting internal scheduler / cron endpoints.
 * Requires: Authorization: Bearer <INTERNAL_CRON_SECRET>
 *
 * Security requirements:
 * 1. Fail closed when INTERNAL_CRON_SECRET is not configured (500).
 * 2. Fail closed when Authorization header is missing or malformed (401).
 * 3. Timing-attack resistant constant-time comparison via SHA-256 + crypto.timingSafeEqual.
 */
export function requireInternalCronAuth(req, res, next) {
  const secret = config.cron?.secret;
  if (!secret) {
    logger.error('[internalAuth] Request rejected: INTERNAL_CRON_SECRET is not configured');
    throw new ApiError(500, 'Internal authorization is not configured on this server');
  }

  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (!authHeader || scheme?.toLowerCase() !== 'bearer' || !token) {
    throw new ApiError(401, 'Unauthorized: Missing or malformed Bearer authorization token');
  }

  // Constant-time comparison using fixed-length SHA-256 hashes to prevent timing attacks
  const tokenHash = crypto.createHash('sha256').update(token).digest();
  const secretHash = crypto.createHash('sha256').update(secret).digest();

  if (!crypto.timingSafeEqual(tokenHash, secretHash)) {
    logger.warn(`[internalAuth] Invalid internal cron token attempt from IP: ${req.ip}`);
    throw new ApiError(401, 'Unauthorized: Invalid internal authorization token');
  }

  next();
}
