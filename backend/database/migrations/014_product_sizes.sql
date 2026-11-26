-- ============================================================================
-- ALTNEU — Migration 014: Product Sizes Column
-- PostgreSQL 15+ (Supabase)
--
-- Adds public.products.sizes (JSONB) to support per-product size arrays
-- with default '[]'::jsonb.
--
-- Guarantees:
-- 1. Safe to rerun: uses ADD COLUMN IF NOT EXISTS.
-- 2. Non-breaking: does not drop, alter, or recreate any existing tables,
--    indexes, or columns.
-- 3. Default preserved: existing product rows automatically receive '[]'::jsonb.
-- ============================================================================

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS sizes jsonb NOT NULL DEFAULT '[]'::jsonb;
