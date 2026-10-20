/**
 * ALTNEU — API Configuration & Environment Resolution Utilities
 * File: frontend/src/utils/apiConfig.js
 */

export const PRODUCTION_BACKEND_URL = 'https://altneu-backend.onrender.com';

/** Check if the current environment is local development (localhost). */
export function isLocalhost(hostname = '') {
  const host = String(hostname || '').toLowerCase();
  return (
    !host ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.localhost')
  );
}

/** Check if the current environment is a staging or preview deployment. */
export function isStagingPreview({
  env = (typeof import.meta !== 'undefined' ? import.meta.env : {}),
  hostname = (typeof window !== 'undefined' ? window.location?.hostname : ''),
} = {}) {
  const host = String(hostname || '').toLowerCase();
  const mode = String(env?.MODE || env?.VITE_APP_ENV || env?.VITE_VERCEL_ENV || '').toLowerCase();

  // Explicit staging/preview mode in Vite or hosting platform
  if (mode === 'staging' || mode === 'preview') {
    return true;
  }

  // Common staging/preview host patterns
  if (
    host.includes('staging') ||
    host.includes('preview') ||
    host.includes('-pr-') ||
    host.endsWith('.onrender.com') ||
    host.endsWith('.vercel.app') ||
    host.endsWith('.netlify.app')
  ) {
    return true;
  }

  return false;
}

/**
 * Resolve the API base URL based on environment and hostname:
 * - Localhost: returns '' (empty string) to route through Vite dev server proxy (/api -> backend).
 * - Hosted Staging / Preview: uses VITE_API_BASE_URL (or VITE_API_URL). Throws if missing to prevent
 *   accidental silent fallback to production backend.
 * - Production: uses VITE_API_BASE_URL if configured, otherwise falls back to production backend.
 */
export function resolveApiBase({
  env = (typeof import.meta !== 'undefined' ? import.meta.env : {}),
  hostname = (typeof window !== 'undefined' ? window.location?.hostname : ''),
} = {}) {
  // 1. Local development uses the Vite dev server proxy (/api -> backend)
  if (isLocalhost(hostname)) {
    return '';
  }

  // 2. Explicit environment override takes precedence in all hosted environments
  const configuredUrl = (env?.VITE_API_BASE_URL || env?.VITE_API_URL || '').trim();
  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, '');
  }

  // 3. Staging and preview environments must NOT silently fall back to production
  if (isStagingPreview({ env, hostname })) {
    throw new Error(
      `[ALTNEU Config] Missing VITE_API_BASE_URL for staging preview environment (${hostname || env?.MODE || 'staging'}). ` +
      `Staging previews must not fall back to the production backend. ` +
      `Please configure VITE_API_BASE_URL in your hosting environment settings.`
    );
  }

  // 4. Production fallback
  return PRODUCTION_BACKEND_URL;
}
