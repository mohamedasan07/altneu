-- ============================================================================
-- ALTNEU — Migration 010: user token version for session invalidation
-- PostgreSQL 15+ (Supabase)
-- ============================================================================

alter table public.users
  add column if not exists token_version integer not null default 0;
