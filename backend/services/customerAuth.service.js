import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config/index.js';
import { ApiError } from '../utils/apiError.js';
import { logger } from '../utils/logger.js';
import { getJwtSecret, authError } from './auth.service.js';
import {
  findUserByEmail,
  insertUser,
  findUserById,
  touchLastLogin,
  setResetToken,
  findUserByResetToken,
  updatePasswordHash,
} from '../repositories/user.repository.js';
import {
  validateRegisterPayload,
  validateLoginPayload,
  validateResetRequestPayload,
  validateResetConfirmPayload,
} from '../validators/user.validator.js';

/**
 * Customer authentication service (Sprint 21.1).
 *
 * Owns all customer auth business logic: registration, credential validation
 * with bcrypt, JWT creation for customers, session restoration, and the
 * password-reset flow. Controllers and middleware stay thin and delegate here,
 * mirroring auth.service.js.
 *
 * Errors thrown by this module carry `status` and `expose: true` so the
 * centralized errorHandler renders the intended status code + message.
 */

const BCRYPT_ROUNDS = 10;
// One-time reset codes live for 1 hour; the stored value is the SHA-256 hash.
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const RESET_TOKEN_BYTES = 32;

/** Build a consistent 500 for failed database operations. */
function toDbError(action, result) {
  logger.error(`[customer-auth] ${action} failed: ${result?.reason || 'unknown error'}`);
  const err = new ApiError(500, `Unable to ${action}. Please try again.`);
  err.detail = result?.reason;
  return err;
}

/** Map a users row to the public customer profile shape (no credentials). */
export function normalizeCustomer(row) {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name ?? null,
    lastName: row.last_name ?? null,
    phone: row.phone ?? null,
    avatarUrl: row.avatar_url ?? null,
    role: row.role,
    isActive: row.is_active,
    tokenVersion: row.token_version ?? 0,
    createdAt: row.created_at ?? null,
    lastLoginAt: row.last_login_at ?? null,
  };
}

/** Compute a short, non-reversible thumbprint of the password hash to tie to the session. */
export function computePasswordThumbprint(passwordHash) {
  if (!passwordHash) return '';
  return crypto.createHash('sha256').update(passwordHash).digest('hex').slice(0, 16);
}

/** Sign a customer JWT with a longer lifetime than the admin token. */
export function signCustomerToken(customer, passwordHash = null) {
  const pwh = passwordHash ? computePasswordThumbprint(passwordHash) : (customer.pwh || '');
  return jwt.sign(
    {
      id: customer.id,
      email: customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName,
      role: customer.role,
      token_version: customer.tokenVersion ?? customer.token_version ?? 0,
      pwh,
    },
    getJwtSecret(),
    { expiresIn: config.auth.customerJwtExpiresIn }
  );
}

/**
 * Register a new customer account.
 *
 * @param {object} input  raw request body
 * @returns {Promise<{ token: string, user: object }>}
 * @throws {ApiError} 400 invalid payload, 409 email already registered.
 */
export async function registerCustomer(input = {}) {
  const payload = validateRegisterPayload(input);

  const passwordHash = await bcrypt.hash(payload.password, BCRYPT_ROUNDS);

  const result = await insertUser({
    email: payload.email,
    password_hash: passwordHash,
    first_name: payload.firstName,
    last_name: payload.lastName,
    phone: payload.phone ?? null,
    role: 'customer',
    is_active: true,
  });

  if (!result.ok) {
    if (result.code === '23505') {
      throw new ApiError(409, 'An account with this email already exists');
    }
    throw toDbError('create account', result);
  }

  const user = normalizeCustomer(result.data);
  return { token: signCustomerToken(user, passwordHash), user };
}

/**
 * Authenticate a customer with email + password.
 *
 * Anti-enumeration: any mismatch (unknown email, wrong password, disabled
 * account) returns the same 401 so callers cannot learn whether an email is
 * registered.
 *
 * @param {object} input  raw request body
 * @returns {Promise<{ token: string, user: object }>}
 * @throws {ApiError} 400 missing fields, 401 invalid credentials.
 */
export async function loginCustomer(input = {}) {
  const { email, password } = validateLoginPayload(input);

  const result = await findUserByEmail(email);
  if (!result.ok) throw toDbError('sign in', result);

  const row = result.data;
  const passwordMatches = row
    ? await bcrypt.compare(password, row.password_hash)
    : false;

  if (!row || !row.is_active || !passwordMatches) {
    throw authError(401, 'Invalid email or password');
  }

  // Best-effort bookkeeping — never fail a successful login over this.
  await touchLastLogin(row.id).catch(() => {});

  const user = normalizeCustomer(row);
  return { token: signCustomerToken(user, row.password_hash), user };
}

/**
 * GET /api/customer/auth/me — restore the currently authenticated customer.
 *
 * @param {string} userId  from the verified JWT (req.user.id)
 * @returns {Promise<object>} public customer profile
 * @throws {ApiError} 404 when the account no longer exists.
 */
export async function getCurrentCustomer(userId) {
  const result = await findUserById(userId);
  if (!result.ok) throw toDbError('load account', result);
  if (!result.data) throw new ApiError(404, 'Account not found');
  return normalizeCustomer(result.data);
}

// ============================================================================
// Password reset (Sprint 21.1)
//
// The one-time code is returned only to the email (simulated here), never
// stored in plaintext — only its SHA-256 hash goes into reset_token.
// ============================================================================

/** SHA-256 of a one-time reset code. */
function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Build the customer-facing reset URL for the raw (un-hashed) code. */
function buildResetUrl(rawToken) {
  const base = (config.frontend.url || 'http://localhost:5173').replace(/\/+$/, '');
  return `${base}/reset-password?token=${encodeURIComponent(rawToken)}`;
}

/**
 * POST /api/customer/auth/forgot-password — request a password reset.
 *
 * Anti-enumeration: the response is identical whether or not the email exists,
 * so callers cannot probe registered addresses. Only when an account is found
 * do we mint a token and persist its hash.
 *
 * In development the reset URL is returned inline (there is no mail server);
 * in production it should be emailed — the service only logs it.
 *
 * @param {object} input  raw request body { email }
 * @returns {Promise<{ success: true, devResetUrl?: string }>}
 * @throws {ApiError} 400 invalid email, 500 DB failure.
 */
export async function requestPasswordReset(input = {}) {
  const { email } = validateResetRequestPayload(input);

  const result = await findUserByEmail(email);
  if (!result.ok) throw toDbError('look up account', result);

  // Unknown email → pretend success (anti-enumeration).
  const row = result.data;
  if (!row || !row.is_active) return { success: true };

  const rawToken = crypto.randomBytes(RESET_TOKEN_BYTES).toString('hex');
  const tokenHash = hashResetToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();

  const stored = await setResetToken(row.id, { tokenHash, expiresAt });
  if (!stored.ok) throw toDbError('store reset token', stored);

  const resetUrl = buildResetUrl(rawToken);

  // Security: Never log reset tokens/URLs in production.
  if (!config.isProduction) {
    logger.info(`[customer-auth] reset link for ${email}: ${resetUrl}`);
  }

  // Dispatch password reset email via Brevo asynchronously (anti-enumeration safe).
  import('./email.service.js')
    .then(({ sendCustomerPasswordReset }) => {
      if (typeof sendCustomerPasswordReset === 'function') {
        const customerName = [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Customer';
        sendCustomerPasswordReset(email, customerName, rawToken).catch((err) => {
          logger.error(`[customer-auth] failed to send password reset email to ${email}:`, err);
        });
      }
    })
    .catch((err) => {
      logger.error('[customer-auth] failed to import email service:', err);
    });

  // Dev-only: return the URL so the flow can be exercised without a mailer.
  return config.isProduction
    ? { success: true }
    : { success: true, devResetUrl: resetUrl };
}

/**
 * POST /api/customer/auth/reset-password — set a new password from a token.
 *
 * The token is hashed and matched against the stored value; the link is
 * invalid when no match exists, the token has expired, or it was already used
 * (its hash is cleared on success — single-use).
 *
 * @param {object} input  raw request body { token, password }
 * @returns {Promise<{ success: true }>}
 * @throws {ApiError} 400 invalid token/password, 500 DB failure.
 */
export async function resetPassword(input = {}) {
  const { token, password } = validateResetConfirmPayload(input);

  const tokenHash = hashResetToken(token);
  const result = await findUserByResetToken(tokenHash);
  if (!result.ok) throw toDbError('find reset token', result);

  const row = result.data;
  const now = Date.now();
  const expiresAt = row?.reset_token_expires_at
    ? new Date(row.reset_token_expires_at).getTime()
    : 0;

  // One message for every failure mode — never leak which part was wrong.
  if (!row || !row.is_active || !expiresAt || expiresAt < now) {
    throw new ApiError(400, 'This reset link is invalid or has expired');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const updated = await updatePasswordHash(row.id, passwordHash);
  if (!updated.ok) throw toDbError('update password', updated);

  return { success: true };
}