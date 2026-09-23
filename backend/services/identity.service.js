import {
  findUserBySupabaseId,
  findUserByEmail,
  linkSupabaseId,
  insertUser,
} from '../repositories/user.repository.js';
import { ApiError } from '../utils/apiError.js';
import { logger } from '../utils/logger.js';

/**
 * Resolve a Supabase authenticated user to an internal user identity.
 * Handles one-time migration linking, new user provisioning, and race conditions.
 *
 * @param {object} supabaseUser The decoded user object from supabase.auth.getUser()
 * @returns {Promise<object>} The internal user row
 */
export async function resolveSupabaseIdentity(supabaseUser) {
  if (!supabaseUser || !supabaseUser.id) {
    throw new ApiError(401, 'Invalid Supabase identity');
  }

  // 1. Check if already linked
  let result = await findUserBySupabaseId(supabaseUser.id);
  if (!result.ok) throw new ApiError(500, 'Database error during identity resolution');
  if (result.data) return result.data;

  // 2. Strict verified email requirement for linking or creating
  const email = supabaseUser.email;
  const isEmailVerified = !!supabaseUser.email_confirmed_at;

  if (!email || !isEmailVerified) {
    logger.warn(`[identity] Supabase user ${supabaseUser.id} rejected: missing or unverified email`);
    throw new ApiError(401, 'A verified email is required to log in');
  }

  // Normalize email for internal lookups
  const normalizedEmail = email.trim().toLowerCase();

  // 3. Search for existing internal user by email
  result = await findUserByEmail(normalizedEmail);
  if (!result.ok) throw new ApiError(500, 'Database error during email lookup');

  if (result.data) {
    // Found existing user - link them
    const linkRes = await linkSupabaseId(result.data.id, supabaseUser.id);
    if (linkRes.ok && linkRes.data) return linkRes.data;

    // Handle race condition (someone else just linked this user)
    if (linkRes.code === '23505') {
      const recheck = await findUserBySupabaseId(supabaseUser.id);
      if (recheck.ok && recheck.data) return recheck.data;
    }
    throw new ApiError(500, 'Failed to link existing user identity');
  }

  // 4. Create new internal user
  const insertRes = await insertUser({
    email: normalizedEmail,
    supabase_user_id: supabaseUser.id,
    first_name: supabaseUser.user_metadata?.first_name || null,
    last_name: supabaseUser.user_metadata?.last_name || null,
    role: 'customer' // default role
    // password_hash is omitted (now nullable in DB)
  });

  if (insertRes.ok && insertRes.data) return insertRes.data;

  // 5. Handle concurrent first-login races safely
  if (insertRes.code === '23505') {
    // Unique constraint violation on email or supabase_user_id
    // Another request beat us to creating or linking this user.
    const retrySupabase = await findUserBySupabaseId(supabaseUser.id);
    if (retrySupabase.ok && retrySupabase.data) return retrySupabase.data;

    const retryEmail = await findUserByEmail(normalizedEmail);
    if (retryEmail.ok && retryEmail.data) return retryEmail.data;
  }

  throw new ApiError(500, 'Failed to provision new user identity');
}
