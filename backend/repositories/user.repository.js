import { getSupabase } from '../database/client.js';

/**
 * User data access — all reads AND writes go to Supabase (PostgreSQL).
 *
 * Same conventions as product.repository.js: the service-role key is used
 * (bypasses RLS), and every method returns the shared result envelope:
 *   { ok: true,  data }
 *   { ok: false, reason, [code] }
 * so callers never touch Supabase error objects directly. `code` carries the
 * Postgres error code (e.g. '23505' unique violation for 409 mapping).
 *
 * IMPORTANT: this module deliberately avoids exposing password_hash or reset
 * tokens in any public profile — those columns are only selected here, inside
 * the data-access layer, and mapped to safe shapes by the service.
 */

// Safe columns for anything that may be returned to a client.
export const USER_SAFE_COLUMNS = `
  id,
  supabase_user_id,
  email,
  first_name,
  last_name,
  phone,
  avatar_url,
  role,
  is_active,
  last_login_at,
  created_at
`;

// Full row (includes credential columns) — internal lookups only.
const USER_AUTH_COLUMNS = `
  id,
  supabase_user_id,
  email,
  password_hash,
  first_name,
  last_name,
  phone,
  avatar_url,
  role,
  is_active,
  last_login_at,
  created_at
`;

/**
 * @param {string} email  already trimmed/lowercased by the caller
 * @returns {Promise<{ok: boolean, data?: object|null, reason?: string, code?: string}>}
 */
export async function findUserByEmail(email) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  const { data, error } = await supabase
    .from('users')
    .select(USER_AUTH_COLUMNS)
    .eq('email', email)
    .maybeSingle();

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}

/**
 * @param {object} row  DB-ready user row (email, password_hash, first_name,
 *   last_name, phone, role, is_active)
 * @returns {Promise<{ok: boolean, data?: object|null, reason?: string, code?: string}>}
 */
export async function insertUser(row) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  const { data, error } = await supabase
    .from('users')
    .insert(row)
    .select(USER_SAFE_COLUMNS)
    .single();

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}

/**
 * @param {string} id  user uuid
 * @returns {Promise<{ok: boolean, data?: object|null, reason?: string, code?: string}>}
 */
export async function findUserById(id) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  const { data, error } = await supabase
    .from('users')
    .select(USER_SAFE_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}

/**
 * Update a user's profile fields (Sprint 21.2). Whitelisted columns only —
 * identity fields the customer may edit: first_name, last_name, phone,
 * avatar_url. Email and role are never writable here.
 * @param {string} id
 * @param {object} patch  partial DB row (snake_case keys)
 * @returns {Promise<{ok: boolean, data?: object|null, reason?: string, code?: string}>}
 */
export async function updateUserProfile(id, patch) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  const { data, error } = await supabase
    .from('users')
    .update(patch)
    .eq('id', id)
    .select(USER_SAFE_COLUMNS)
    .maybeSingle();

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}

/**
 * Record a successful sign-in (updates last_login_at).
 * @param {string} id
 * @returns {Promise<{ok: boolean, reason?: string, code?: string}>}
 */
export async function touchLastLogin(id) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  const { error } = await supabase
    .from('users')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data: true };
}

// ============================================================================
// Password reset (Sprint 21.1)
//
// reset_token stores the SHA-256 HASH of the one-time code, never the code
// itself, so a leaked database never yields working reset links. reset_payload
// is the full row lookup used to validate a token + expiry in one query.
// ============================================================================

/**
 * Attach a hashed one-time reset token to a user.
 * @param {string} id  user uuid
 * @param {{ tokenHash: string, expiresAt: string }} opts  ISO timestamp
 * @returns {Promise<{ok: boolean, reason?: string, code?: string}>}
 */
export async function setResetToken(id, { tokenHash, expiresAt }) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  const { error } = await supabase
    .from('users')
    .update({ reset_token: tokenHash, reset_token_expires_at: expiresAt })
    .eq('id', id);

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data: true };
}

/**
 * Find a user by their hashed reset token (used to validate a reset link).
 * Includes reset_token_expires_at so the service can enforce the TTL.
 * @param {string} tokenHash  SHA-256 of the raw one-time code
 * @returns {Promise<{ok: boolean, data?: object|null, reason?: string, code?: string}>}
 */
export async function findUserByResetToken(tokenHash) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  const { data, error } = await supabase
    .from('users')
    .select(`${USER_AUTH_COLUMNS}, reset_token, reset_token_expires_at`)
    .eq('reset_token', tokenHash)
    .maybeSingle();

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}

/**
 * Set a user's password and clear their consumed reset token (single-use).
 * @param {string} id  user uuid
 * @param {string} passwordHash  bcrypt hash of the new password
 * @returns {Promise<{ok: boolean, reason?: string, code?: string}>}
 */
export async function updatePasswordHash(id, passwordHash) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  const { error } = await supabase
    .from('users')
    .update({ password_hash: passwordHash, reset_token: null, reset_token_expires_at: null })
    .eq('id', id);

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data: true };
}

/**
 * @param {string} supabaseUserId  supabase auth user id
 * @returns {Promise<{ok: boolean, data?: object|null, reason?: string, code?: string}>}
 */
export async function findUserBySupabaseId(supabaseUserId) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  const { data, error } = await supabase
    .from('users')
    .select(USER_SAFE_COLUMNS)
    .eq('supabase_user_id', supabaseUserId)
    .maybeSingle();

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}

/**
 * @param {string} id internal user id
 * @param {string} supabaseUserId supabase auth user id
 * @returns {Promise<{ok: boolean, data?: object|null, reason?: string, code?: string}>}
 */
export async function linkSupabaseId(id, supabaseUserId) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  const { data, error } = await supabase
    .from('users')
    .update({ supabase_user_id: supabaseUserId })
    .eq('id', id)
    .select(USER_SAFE_COLUMNS)
    .single();

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}