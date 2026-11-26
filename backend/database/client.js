import { createClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

let client = null;
let isMockClient = false;

/**
 * Reusable Supabase (PostgreSQL) client — lazily created, then cached.
 *
 * Prefers the service-role key when present (server-side only — it bypasses
 * RLS so the backend can manage any table). Falls back to the anon key.
 * Returns null when the environment is not configured so the rest of the app
 * can degrade gracefully during local development.
 */
export function getSupabase() {
  if (client) return client;

  if (!config.supabase.configured) {
    logger.warn('Supabase is not configured — set SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY) in .env');
    return null;
  }

  client = createClient(config.supabase.url, config.supabase.key, {
    auth: {
      // Server-side client: no browser storage, no token refresh loop.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  logger.info('Supabase client initialized');
  return client;
}

/**
 * Check if the active environment has the service-role key configured.
 * @returns {boolean}
 */
export function isServiceRoleConfigured() {
  return config.supabase.serviceRoleConfigured;
}

/**
 * Check if database operations requiring service-role privileges can proceed.
 * Returns true if an explicit test mock has been injected or if the real service-role key is present.
 * Prevents payment writes from silently falling back to the anon key where RLS blocks mutations.
 * @returns {boolean}
 */
export function isPrivilegedDbAvailable() {
  if (isMockClient) return true;
  return config.supabase.serviceRoleConfigured;
}

/**
 * Set or override the active Supabase client (e.g. for testing with isolated data).
 * @param {object|null} mockClient
 */
export function setSupabaseClient(mockClient, { isPrivileged = true } = {}) {
  client = mockClient;
  isMockClient = Boolean(mockClient) && Boolean(isPrivileged);
}