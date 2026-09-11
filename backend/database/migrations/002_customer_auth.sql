-- ============================================================================
-- ALTNEU — Migration 002: customer authentication
-- PostgreSQL 15+ (Supabase)
--
-- Sprint 21.1 — adds the columns the password-reset flow needs on the users
-- table, plus the indexes and row-level-security policies that make customer
-- accounts safe once the anon key is used for user-scoped reads/writes.
--
-- Idempotent: safe to re-run (all DDL uses IF NOT EXISTS / DROP POLICY IF
-- EXISTS + CREATE POLICY).
-- Apply via the Supabase SQL Editor or:
--   psql "$SUPABASE_DB_URL" -f database/migrations/002_customer_auth.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Password-reset columns on public.users
-- ----------------------------------------------------------------------------
alter table public.users
  add column if not exists reset_token         text,
  add column if not exists reset_token_expires_at timestamptz;

-- ----------------------------------------------------------------------------
-- 2. Partial unique index — guarantees a reset token can only ever belong to
--    one user, while NULL rows (accounts without an active reset) stay out of
--    the index.
-- ----------------------------------------------------------------------------
create unique index if not exists idx_users_reset_token
  on public.users (reset_token)
  where reset_token is not null;

-- ----------------------------------------------------------------------------
-- 3. Row Level Security for public.users
--
-- The backend writes through the service-role key, which bypasses RLS, so
-- Sprint 20 behavior is unchanged. These policies are defense-in-depth for
-- the anon key: a logged-in customer (supabase.auth session) may read and
-- update only their own row — never anyone else's.
-- ----------------------------------------------------------------------------

-- Allow the authenticated owner to read their own account.
drop policy if exists "users_select_own" on public.users;
create policy "users_select_own" on public.users
  for select
  using (auth.uid() = id);

-- Allow the authenticated owner to update their own account.
drop policy if exists "users_update_own" on public.users;
create policy "users_update_own" on public.users
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
