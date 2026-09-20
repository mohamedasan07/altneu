import dotenv from 'dotenv';

// Load .env from the backend root. `dotenv` never overwrites variables that
// are already present in the environment (e.g. set by a host like Render/Vercel).
dotenv.config();

/**
 * Raw environment access. Everything the app reads goes through here so there
 * is a single, greppable place for environment variables.
 */
export function loadEnv() {
  const raw = process.env;

  return {
    NODE_ENV: raw.NODE_ENV || 'development',

    // Server
    PORT: raw.PORT || '3001',
    HOST: raw.HOST || '0.0.0.0',
    LOG_LEVEL: raw.LOG_LEVEL || 'info',

    // Customer-facing frontend origin (password-reset links, dev reset URL).
    FRONTEND_URL: raw.FRONTEND_URL || 'http://localhost:5173',

    // Supabase (PostgreSQL)
    SUPABASE_URL: raw.SUPABASE_URL || '',
    SUPABASE_ANON_KEY: raw.SUPABASE_ANON_KEY || '',
    // Optional. When present the backend uses the service-role key (bypasses
    // RLS, intended for server-side use only — never expose in the browser).
    SUPABASE_SERVICE_ROLE_KEY: raw.SUPABASE_SERVICE_ROLE_KEY || '',

    // Cloudinary (image storage)
    CLOUDINARY_CLOUD_NAME: raw.CLOUDINARY_CLOUD_NAME || '',
    CLOUDINARY_API_KEY: raw.CLOUDINARY_API_KEY || '',
    CLOUDINARY_API_SECRET: raw.CLOUDINARY_API_SECRET || '',
    // Folder inside the Cloudinary media library for admin uploads.
    CLOUDINARY_UPLOAD_FOLDER: raw.CLOUDINARY_UPLOAD_FOLDER || 'products',

    // CORS allow-list (server.js) + admin identity (auth.service.js).
    // ADMIN_PASSWORD is no longer used to verify logins — see ADMIN_PASSWORD_HASH.
    CORS_ORIGINS: raw.CORS_ORIGINS || '',
    ADMIN_EMAIL: raw.ADMIN_EMAIL || 'altneu07@gmail.com',
    ADMIN_PASSWORD: raw.ADMIN_PASSWORD || 'admin123',

    // Admin authentication (JWT, Sprint 15)
    // No default for JWT_SECRET — the auth service fails loudly when missing
    // so a misconfigured environment never silently issues unsigned tokens.
    JWT_SECRET: raw.JWT_SECRET || '',
    JWT_EXPIRES_IN: raw.JWT_EXPIRES_IN || '1d',
    // Customer tokens use a longer default lifetime (Sprint 21.1). Admin
    // tokens keep JWT_EXPIRES_IN above.
    JWT_EXPIRES_IN_CUSTOMER: raw.JWT_EXPIRES_IN_CUSTOMER || '7d',
    // REQUIRED bcrypt hash of the admin password (Sprint 22.6 P1). Admin login
    // refuses to authenticate without it: there is NO plaintext fallback and
    // the auth service fails loudly (500) when it is missing. ADMIN_PASSWORD
    // above is no longer used for verification and is kept only for docs/legacy
    // references.
    ADMIN_PASSWORD_HASH: raw.ADMIN_PASSWORD_HASH || '',
    ADMIN_NAME: raw.ADMIN_NAME || 'Administrator',
    ADMIN_ROLE: raw.ADMIN_ROLE || 'admin',

    // Rate limiting (Sprint 22.6 P1) — per-IP attempt caps for auth endpoints.
    // Windows are fixed (15 min for logins, 60 min for register/forgot-password);
    // the limits themselves are configurable. Requests over the cap get 429.
    RATE_LIMIT_ADMIN_LOGIN: raw.RATE_LIMIT_ADMIN_LOGIN || '10',
    RATE_LIMIT_CUSTOMER_LOGIN: raw.RATE_LIMIT_CUSTOMER_LOGIN || '20',
    RATE_LIMIT_REGISTER: raw.RATE_LIMIT_REGISTER || '10',
    RATE_LIMIT_FORGOT_PASSWORD: raw.RATE_LIMIT_FORGOT_PASSWORD || '5',
  };
}