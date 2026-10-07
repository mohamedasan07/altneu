-- ============================================================================
-- ALTNEU — Migration 007: order tracking fields
-- PostgreSQL 15+ (Supabase)
-- ============================================================================

alter table public.orders
  add column if not exists carrier text,
  add column if not exists carrier_service text,
  add column if not exists tracking_number text,
  add column if not exists tracking_url text,
  add column if not exists shipped_at timestamptz;
