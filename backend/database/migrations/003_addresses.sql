-- ============================================================================
-- ALTNEU — Migration 003: customer profile & address book
-- PostgreSQL 15+ (Supabase)
--
-- Sprint 21.2 — makes the addresses table safe for customer-scoped access and
-- enforces the "exactly one default address per user" invariant at the
-- database level, so a concurrent set-default race can never corrupt data.
--
-- Idempotent: safe to re-run (all DDL uses IF NOT EXISTS / DROP POLICY IF
-- EXISTS + CREATE POLICY).
-- Apply via the Supabase SQL Editor or:
--   psql "$SUPABASE_DB_URL" -f database/migrations/003_addresses.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Row Level Security for public.addresses
--
-- The backend writes through the service-role key, which bypasses RLS, so
-- Sprint 20 behavior is unchanged. These policies are defense-in-depth for
-- the anon key: a logged-in customer may select/insert/update/delete only
-- their own addresses — never anyone else's.
-- ----------------------------------------------------------------------------

alter table public.addresses enable row level security;

drop policy if exists "addresses_select_own" on public.addresses;
create policy "addresses_select_own" on public.addresses
  for select
  using (auth.uid() = user_id);

drop policy if exists "addresses_insert_own" on public.addresses;
create policy "addresses_insert_own" on public.addresses
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "addresses_update_own" on public.addresses;
create policy "addresses_update_own" on public.addresses
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "addresses_delete_own" on public.addresses;
create policy "addresses_delete_own" on public.addresses
  for delete
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 2. Exactly one default address per user
--
-- Partial unique index: at most one row per user may have is_default = true.
-- Backed by the address.service default-promotion logic for a clean UX, and
-- by this constraint for hard integrity under concurrency.
-- ----------------------------------------------------------------------------
create unique index if not exists idx_addresses_one_default
  on public.addresses (user_id)
  where is_default = true;