-- ============================================================================
-- ALTNEU — Migration 004: truthful order status history
-- PostgreSQL 15+ (Supabase)
--
-- Sprint 22.5 Phase 1 — additive foundation for customer order self-service
-- and truthful order status timelines. Every status/payment transition on an
-- order gets a row here: {order_id, status, by_role ('customer'|'admin'|'system'),
-- created_at}. Placement records a 'pending'/'system' row; customer-cancel and
-- admin status/payment transitions record theirs in later phases. Order detail
-- endpoints gain an additive `history` array — no existing order shape changes.
--
-- Idempotent: safe to re-run (IF NOT EXISTS + backfill guarded by NOT EXISTS).
-- Apply via the Supabase SQL Editor or:
--   psql "$SUPABASE_DB_URL" -f database/migrations/004_order_status_history.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Order status history
--
-- One row per transition. The FK cascades so deleting an order removes its
-- history. The index serves both the per-order timeline reads and the backfill
-- dedupe. `by_role` records who performed the transition — 'system' for
-- placement and backfilled rows, 'customer' for customer cancellations, 'admin'
-- for admin status/payment updates.
-- ----------------------------------------------------------------------------
create table if not exists public.order_status_history (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders (id) on delete cascade,
  status     text not null,
  by_role    text not null check (by_role in ('customer', 'admin', 'system')),
  created_at timestamptz not null default now()
);

create index if not exists idx_order_status_history_order
  on public.order_status_history (order_id);

-- ----------------------------------------------------------------------------
-- 2. Backfill existing orders
--
-- Every existing order gets exactly one 'pending' row stamped with its
-- placed_at so pre-migration orders read the same timeline shape as new ones.
-- Guarded by NOT EXISTS: re-running the migration never duplicates rows and
-- never overwrites rows already recorded by later phases.
-- ----------------------------------------------------------------------------
insert into public.order_status_history (order_id, status, by_role, created_at)
select o.id, 'pending', 'system', o.placed_at
from public.orders o
where not exists (
  select 1
  from public.order_status_history h
  where h.order_id = o.id
);