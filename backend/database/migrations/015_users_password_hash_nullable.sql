-- ============================================================================
-- ALTNEU — Migration 015: Make users.password_hash nullable
-- Target: ALTNEU-STAGING & ALTNEU-PRODUCTION
-- PostgreSQL 15+ (Supabase)
--
-- Rationale:
-- Customers signing in via Supabase Magic-Link / OTP authentication do not
-- possess a local bcrypt password hash. The original 001_initial_schema.sql
-- declared:
--   password_hash text not null
-- which prevents passwordless customer identity provisioning.
--
-- Guarantees:
-- 1. Safe to rerun: ALTER TABLE ... ALTER COLUMN ... DROP NOT NULL is idempotent.
-- 2. Non-breaking: existing customer accounts with passwords retain their password_hash.
-- 3. Password login safety: users with NULL password_hash cannot authenticate via
--    password and must use passwordless login (OTP / Magic-Link).
-- ============================================================================

ALTER TABLE public.users
  ALTER COLUMN password_hash DROP NOT NULL;
