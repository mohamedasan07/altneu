import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { config } from "../config/index.js";

import { getSupabase } from "../database/client.js";
import { logger } from "../utils/logger.js";

/**
 * Admin authentication service — Phase 1: DB-backed.
 *
 * Owns all auth business logic: credential validation, JWT creation and
 * verification. Controllers and middleware stay thin and delegate here.
 */

/** Build a typed error that the centralized errorHandler understands. */
export function authError(status, message) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  return err;
}

/**
 * Resolve the JWT signing secret.
 */
export function getJwtSecret() {
  if (!config.auth.jwtSecret) {
    throw authError(
      500,
      "JWT_SECRET is not configured. Add JWT_SECRET to the backend .env file before enabling admin authentication.",
    );
  }
  return config.auth.jwtSecret;
}

/**
 * Initialize the DB-backed admin account from environment variables exactly once.
 * (Phase 1 migration: safely transitions .env credentials to DB table).
 */
export async function bootstrapAdmin() {
  const supabase = getSupabase();
  if (!supabase) return;
  const { admin } = config.auth;
  if (!admin.email || !admin.passwordHash) return;

  try {
    const { data: existing, error: countErr } = await supabase
      .from("admins")
      .select("id")
      .limit(1);

    if (countErr) {
      if (countErr.code === "42P01") {
        // Table doesn't exist yet, wait for migrations to run
        return;
      }
      throw countErr;
    }

    // Admin already exists, do not overwrite
    if (existing && existing.length > 0) return;

    // Table is empty, safely bootstrap
    const { error: insertErr } = await supabase.from("admins").insert([
      {
        email: admin.email,
        password_hash: admin.passwordHash,
        name: admin.name,
        role: admin.role || "admin",
      },
    ]);

    if (insertErr && insertErr.code !== "23505") {
      throw insertErr;
    }
    logger.info(
      "Successfully bootstrapped admin account from environment into DB",
    );
  } catch (err) {
    logger.error("Failed to bootstrap admin account:", err);
  }
}

/**
 * Authenticate an admin with email + password from the DB.
 *
 * @param {{ email?: string, password?: string }} credentials
 * @returns {Promise<{ token: string, admin: object }>}
 * @throws {Error} 400 when fields are missing, 401 on invalid credentials.
 */
export async function loginAdmin({ email, password } = {}) {
  const cleanEmail = String(email ?? "").trim();
  const cleanPassword = String(password ?? "");

  if (!cleanEmail || !cleanPassword) {
    throw authError(400, "Email and password are required");
  }

  const supabase = getSupabase();
  if (!supabase) {
    throw authError(500, "Database not configured");
  }

  // Ensure bootstrap runs just in case it failed at startup
  await bootstrapAdmin();

  // Query the admin by email
  const { data: adminRecord, error: dbErr } = await supabase
    .from("admins")
    .select("id, email, password_hash, name, role, token_version")
    .ilike("email", cleanEmail)
    .single();

  // TEMPORARY FALLBACK: If the 'admins' table does not exist yet (code 42P01 or PGRST205),
  // fall back to the environment variables so login doesn't break before migration runs.
  // The DB remains the authoritative source once the table is created.
  let activeAdmin = adminRecord;

  if (dbErr) {
    if (dbErr.code === "42P01" || dbErr.code === "PGRST205") {
      logger.warn(
        "Admins table not found. Falling back to environment variables (Phase 1)",
      );
      const { admin: envAdmin } = config.auth;
      if (cleanEmail === envAdmin.email) {
        activeAdmin = {
          id: envAdmin.id,
          email: envAdmin.email,
          password_hash: envAdmin.passwordHash,
          name: envAdmin.name,
          role: envAdmin.role || "admin",
          token_version: 0,
        };
      }
    } else if (dbErr.code !== "PGRST116") {
      // PGRST116 means no rows found (expected if wrong email), otherwise actual error
      throw authError(500, "Database error during authentication");
    }
  }

  // To protect against timing attacks/account enumeration, always verify a hash
  // even if the user wasn't found (use a dummy hash).
  const dummyHash =
    "$2a$10$XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
  const hashToVerify = activeAdmin ? activeAdmin.password_hash : dummyHash;

  const passwordMatches = bcrypt.compareSync(cleanPassword, hashToVerify);

  // If no record or password mismatch, fail safely
  if (!activeAdmin || !passwordMatches) {
    throw authError(401, "Invalid email or password");
  }

  // Construct the safe public admin profile
  const safeAdmin = {
    id: activeAdmin.id,
    name: activeAdmin.name,
    email: activeAdmin.email,
    role: activeAdmin.role,
  };

  // Sign a short-lived token carrying only non-sensitive admin claims.
  const token = jwt.sign(
    { ...safeAdmin, token_version: activeAdmin.token_version },
    getJwtSecret(),
    { expiresIn: config.auth.jwtExpiresIn },
  );

  return { token, admin: safeAdmin };
}

/**
 * Handle a forgot password request.
 */
export async function requestPasswordReset(email) {
  const cleanEmail = String(email ?? "").trim();
  if (!cleanEmail) {
    throw authError(400, "Email is required");
  }

  const supabase = getSupabase();
  if (!supabase) {
    throw authError(500, "Database not configured");
  }

  // Look up admin by email (case-insensitive)
  const { data: admin, error: dbErr } = await supabase
    .from("admins")
    .select("id, name")
    .ilike("email", cleanEmail)
    .single();

  if (dbErr && dbErr.code !== "PGRST116") {
    throw authError(500, "Database error during forgot password");
  }

  // If admin exists, generate a token and send email.
  // ALWAYS return a generic success message.
  if (admin) {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    // Invalidate previous unused reset tokens for this admin by marking them used_at or deleting.
    await supabase
      .from("password_reset_tokens")
      .delete()
      .eq("admin_id", admin.id)
      .is("used_at", null);

    // 15-minute expiry
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const { error: insertErr } = await supabase
      .from("password_reset_tokens")
      .insert([
        {
          admin_id: admin.id,
          token_hash: tokenHash,
          expires_at: expiresAt,
        },
      ]);

    if (insertErr) {
      logger.error("Failed to insert reset token:", insertErr);
      // Still don't reveal error to user
    } else {
      // Send email
      import("./email.service.js").then(({ sendAdminPasswordReset }) => {
        sendAdminPasswordReset(cleanEmail, admin.name, rawToken).catch(
          (err) => {
            logger.error("Failed to send password reset email:", err);
          },
        );
      });
    }
  }

  // Return generic response
  return { success: true };
}

/**
 * Reset password using a valid token.
 */
export async function resetPassword(token, newPassword) {
  if (!token) throw authError(400, "Reset token is required");
  if (!newPassword || newPassword.length < 8) {
    throw authError(400, "Password must be at least 8 characters long");
  }

  const supabase = getSupabase();
  if (!supabase) throw authError(500, "Database not configured");

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  // Look up the token
  const { data: resetToken, error: tokenErr } = await supabase
    .from("password_reset_tokens")
    .select("id, admin_id")
    .eq("token_hash", tokenHash)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (tokenErr || !resetToken) {
    throw authError(400, "Invalid or expired reset token");
  }

  const newHash = await bcrypt.hash(newPassword, 10);

  // Update the admin password and increment token_version
  // We cannot do `token_version = token_version + 1` directly via Supabase JS without RPC,
  // so we fetch the admin first (or just fetch it all, but since we are admin, we can fetch).
  const { data: adminData } = await supabase
    .from("admins")
    .select("token_version")
    .eq("id", resetToken.admin_id)
    .single();

  const newTokenVersion = (adminData?.token_version || 0) + 1;

  const { error: updateAdminErr } = await supabase
    .from("admins")
    .update({
      password_hash: newHash,
      token_version: newTokenVersion,
    })
    .eq("id", resetToken.admin_id);

  if (updateAdminErr) {
    throw authError(500, "Failed to update password");
  }

  // Mark token as used
  await supabase
    .from("password_reset_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", resetToken.id);

  return { success: true };
}

/**
 * Verify a JWT and return its decoded admin claims.
 *
 * @param {string} token
 * @returns {object} decoded payload
 * @throws {Error} 401 for malformed/expired tokens, 500 if JWT_SECRET unset.
 */
export async function verifyToken(token) {
  try {
    const payload = jwt.verify(token, getJwtSecret());

    // Phase 2: Check token_version against database for admins to invalidate old sessions on password reset
    if (
      payload.role === "admin" &&
      typeof payload.token_version !== "undefined"
    ) {
      const supabase = getSupabase();
      if (supabase) {
        const { data: adminRecord, error: dbErr } = await supabase
          .from("admins")
          .select("token_version")
          .eq("id", payload.id)
          .single();

        if (!dbErr && adminRecord) {
          if (adminRecord.token_version !== payload.token_version) {
            throw authError(
              401,
              "Session expired — password was changed. Please sign in again.",
            );
          }
        }
      }
    }

    return payload;
  } catch (err) {
    if (err.status) throw err; // rethrow authError
    if (err instanceof jwt.TokenExpiredError) {
      throw authError(401, "Session expired — please sign in again");
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw authError(401, "Invalid or malformed token");
    }
    throw err;
  }
}
