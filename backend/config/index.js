import { loadEnv } from './env.js';

const env = loadEnv();

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

  // Per-IP rate limits for public auth endpoints (Sprint 22.6 P1).
  // Windows are fixed in the rate-limit middleware; limits are env-configurable.
  rateLimit: {
    adminLogin: Number(env.RATE_LIMIT_ADMIN_LOGIN) || 10,
    customerLogin: Number(env.RATE_LIMIT_CUSTOMER_LOGIN) || 20,
    register: Number(env.RATE_LIMIT_REGISTER) || 10,
    forgotPassword: Number(env.RATE_LIMIT_FORGOT_PASSWORD) || 5,
    cart: Number(env.RATE_LIMIT_CART) || 120,
  },
};