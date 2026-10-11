import { ApiError } from '../utils/apiError.js';
import { logger } from '../utils/logger.js';
import { findUserById, updateUserProfile, findUserCredentialsById } from '../repositories/user.repository.js';
import { validateProfilePayload } from '../validators/user.validator.js';
import { normalizeCustomer, signCustomerToken } from './customerAuth.service.js';

/**
 * Customer profile service (Sprint 21.2).
 *
 * Owns the GET/PUT /api/customer/profile business logic on top of the 21.1
 * auth service. Controllers stay thin; profile fields are normalized to the
 * same public shape as the auth module (normalizeCustomer) so the storefront
 * never sees a different user object per endpoint.
 *
 * PUT returns a freshly signed customer JWT because the token carries the
 * customer's firstName/lastName claims — a profile edit would otherwise leave
 * stale identity in the session.
 */

/** Build a consistent 500 for failed database operations. */
function toDbError(action, result) {
  logger.error(`[user] ${action} failed: ${result?.reason || 'unknown error'}`);
  const err = new ApiError(500, `Unable to ${action}. Please try again.`);
  err.detail = result?.reason;
  return err;
}

/**
 * GET /api/customer/profile — return the currently authenticated customer.
 * @param {string} userId  from the verified JWT (req.user.id)
 * @returns {Promise<object>} public customer profile
 * @throws {ApiError} 404 when the account no longer exists.
 */
export async function getProfile(userId) {
  const result = await findUserById(userId);
  if (!result.ok) throw toDbError('load profile', result);
  if (!result.data) throw new ApiError(404, 'Account not found');
  return normalizeCustomer(result.data);
}

/**
 * PUT /api/customer/profile — update editable profile fields and return the
 * refreshed profile plus a fresh JWT carrying the new identity claims.
 * @param {string} userId  from the verified JWT (req.user.id)
 * @param {object} input   raw request body
 * @returns {Promise<{ token: string, user: object }>}
 * @throws {ApiError} 400 invalid payload, 404 account missing.
 */
export async function updateProfile(userId, input) {
  const patch = validateProfilePayload(input);

  const result = await updateUserProfile(userId, patch);
  if (!result.ok) throw toDbError('update profile', result);
  if (!result.data) throw new ApiError(404, 'Account not found');

  const user = normalizeCustomer(result.data);
  const creds = await findUserCredentialsById(userId);
  return { token: signCustomerToken(user, creds?.data?.password_hash), user };
}
