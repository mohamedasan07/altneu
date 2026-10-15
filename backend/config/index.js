import { loadEnv } from './env.js';

const env = loadEnv();

/**
 * Parse a positive-integer rate-limit cap from an env value.
 *
 * A missing, empty, whitespace, non-numeric, fractional, zero or negative value
 * falls back to the safe default. This matters because express-rate-limit
 * treats `0` as "block every request" and a non-positive/NaN cap would either
 * break the limiter or, worse, look like protection is disabled. Exported so
 * the behaviour is unit-testable without booting the app.
 */
export function positiveInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/**
 * Centralized, typed application configuration. Single import point for any
 * module that needs configuration — never read process.env directly outside
 * this folder.
 */
export const config = {
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',

  server: {
    port: Number(env.PORT) || 3001,
    host: env.HOST,
    logLevel: env.LOG_LEVEL,
  },

  // Customer-facing origin used to build password-reset links.
  frontend: {
    url: env.FRONTEND_URL,
  },

  supabase: {
    url: env.SUPABASE_URL,
    anonKey: env.SUPABASE_ANON_KEY,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    key: env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY,
    get configured() {
      return Boolean(env.SUPABASE_URL && (env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY));
    },
  },

  cloudinary: {
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
    apiSecret: env.CLOUDINARY_API_SECRET,
    uploadFolder: env.CLOUDINARY_UPLOAD_FOLDER,
    get configured() {
      return Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
    },
  },

  // Admin authentication — JWT (Sprint 15).
  auth: {
    jwtSecret: env.JWT_SECRET,
    jwtExpiresIn: env.JWT_EXPIRES_IN,
    // Customer tokens (Sprint 21.1) — default 7d, overridable via env.
    customerJwtExpiresIn: env.JWT_EXPIRES_IN_CUSTOMER,
    admin: {
      id: 1,
      email: env.ADMIN_EMAIL,
      // REQUIRED bcrypt hash (Sprint 22.6 P1). Login fails safely (500) when
      // absent — there is no plaintext fallback anymore.
      passwordHash: env.ADMIN_PASSWORD_HASH,
      // Kept for documentation only — no longer used for verification.
      password: env.ADMIN_PASSWORD,
      name: env.ADMIN_NAME,
      role: env.ADMIN_ROLE,
    },
  },

  // Rate limits for public / guest-reachable endpoints (Sprint 22.6 P1).
  // Windows are fixed in the rate-limit middleware; only the caps are
  // env-configurable. Parsed through positiveInt so an invalid value (empty,
  // zero, negative, non-numeric) falls back to a safe default rather than
  // silently disabling protection.
  rateLimit: {
    adminLogin: positiveInt(env.RATE_LIMIT_ADMIN_LOGIN, 10),
    customerLogin: positiveInt(env.RATE_LIMIT_CUSTOMER_LOGIN, 20),
    register: positiveInt(env.RATE_LIMIT_REGISTER, 10),
    forgotPassword: positiveInt(env.RATE_LIMIT_FORGOT_PASSWORD, 5),
    guestTracking: positiveInt(env.RATE_LIMIT_GUEST_TRACKING, 15),
    order: positiveInt(env.RATE_LIMIT_ORDER, 30),
    // Per-identity cap for authenticated cart mutations.
    cart: positiveInt(env.RATE_LIMIT_CART, 120),
    // Per-IP abuse ceiling for cart mutations (guests + authenticated traffic).
    cartIp: positiveInt(env.RATE_LIMIT_CART_IP, 300),
  },
};