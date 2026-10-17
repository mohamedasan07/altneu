-- ============================================================================
-- ALTNEU — Step 11: Staging Baseline Synchronization & Permission Patch
-- File: database/migrations/010b_baseline_sync_patch.sql
-- Target: ALTNEU-STAGING (Run immediately after 010_user_token_version.sql)
--
-- Corrections applied:
-- 1. Syncs orders.altneu_number and users.supabase_user_id columns.
-- 2. Enables RLS on order_status_history with service-role-only access.
-- 3. Enforces least-privilege customer identity RLS (auth.uid() = supabase_user_id)
--    with NO fallback to internal surrogate ID (auth.uid() = id removed).
-- 4. Enforces least-privilege customer address ownership via users table identity link
--    (auth.uid() = user_id and u.id = auth.uid() removed).
-- 5. Implements column-level UPDATE permissions on public.users to strictly prevent
--    privilege escalation (role), account hijacking (supabase_user_id), and
--    credential/session tampering (password_hash, token_version, reset_token).
-- 6. Grants operational DML to service_role and explicit SELECT on catalog to anon.
-- 7. Revokes backend-only tables from anon, authenticated, and public.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Orders: Human-readable order identifier & unique lookup index
-- ----------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS altneu_number varchar(8)
    CHECK (altneu_number ~ '^ALT[0-9]{2}[0-9A-Z]{3}$');

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_altneu_number
  ON public.orders (altneu_number)
  WHERE altneu_number IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. Users: Supabase Auth identity link & unique lookup index
-- ----------------------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS supabase_user_id uuid;

-- Drop auto-generated constraint/index from previous unpatched runs to prevent redundant indexes
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_supabase_user_id_key;

DROP INDEX IF EXISTS public.users_supabase_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_supabase_user_id
  ON public.users (supabase_user_id);

-- ----------------------------------------------------------------------------
-- 3. Order Status History: Enable RLS (Internal Backend-Only)
-- ----------------------------------------------------------------------------
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 4. Corrected Customer Identity RLS Policies (Users)
--    Enforces auth.uid() = supabase_user_id strictly without surrogate id fallback.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "users_select_own" ON public.users;
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT TO authenticated
  USING (supabase_user_id IS NOT NULL AND auth.uid() = supabase_user_id);

DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE TO authenticated
  USING (supabase_user_id IS NOT NULL AND auth.uid() = supabase_user_id)
  WITH CHECK (supabase_user_id IS NOT NULL AND auth.uid() = supabase_user_id);

-- ----------------------------------------------------------------------------
-- 5. Corrected Customer Address Ownership Policies (Addresses)
--    Verifies ownership via users table join: addresses.user_id = users.id
--    WHERE users.supabase_user_id = auth.uid().
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "addresses_select_own" ON public.addresses;
CREATE POLICY "addresses_select_own" ON public.addresses
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = addresses.user_id
        AND u.supabase_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "addresses_insert_own" ON public.addresses;
CREATE POLICY "addresses_insert_own" ON public.addresses
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = addresses.user_id
        AND u.supabase_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "addresses_update_own" ON public.addresses;
CREATE POLICY "addresses_update_own" ON public.addresses
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = addresses.user_id
        AND u.supabase_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = addresses.user_id
        AND u.supabase_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "addresses_delete_own" ON public.addresses;
CREATE POLICY "addresses_delete_own" ON public.addresses
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = addresses.user_id
        AND u.supabase_user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 6. Schema Usage Grants
-- ----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7. Full Operational DML for service_role on Application Tables & Sequences
-- ----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.categories,
  public.products,
  public.users,
  public.admins,
  public.addresses,
  public.wishlist,
  public.cart,
  public.cart_items,
  public.orders,
  public.order_items,
  public.order_status_history,
  public.contact_messages,
  public.password_reset_tokens
TO service_role;

GRANT USAGE, SELECT ON SEQUENCE
  public.categories_id_seq,
  public.products_id_seq
TO service_role;

GRANT EXECUTE ON FUNCTION public.set_updated_at() TO postgres, service_role;

-- ----------------------------------------------------------------------------
-- 8. Explicit Public Catalog Grants
-- ----------------------------------------------------------------------------
GRANT SELECT ON TABLE public.categories, public.products TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 9. Explicit Customer Self-Service & Column-Level Security Grants
--    Revokes broad table-level UPDATE on public.users.
--    Grants UPDATE strictly on non-sensitive editable profile fields.
-- ----------------------------------------------------------------------------
-- Public.users column protection:
REVOKE ALL ON TABLE public.users FROM anon, authenticated, public;

-- Grant safe SELECT on non-credential columns to authenticated users
GRANT SELECT (
  id,
  supabase_user_id,
  email,
  first_name,
  last_name,
  phone,
  avatar_url,
  role,
  is_active,
  token_version,
  last_login_at,
  created_at,
  updated_at
) ON TABLE public.users TO authenticated;

-- Grant column-level UPDATE strictly on editable identity columns
GRANT UPDATE (
  first_name,
  last_name,
  phone,
  avatar_url
) ON TABLE public.users TO authenticated;

-- Full customer self-service DML on addresses (gated by RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.addresses TO authenticated;

-- ----------------------------------------------------------------------------
-- 10. Explicit Revocation of Backend-Only Tables from anon/authenticated/public
-- ----------------------------------------------------------------------------
REVOKE ALL ON TABLE
  public.admins,
  public.password_reset_tokens,
  public.orders,
  public.order_items,
  public.order_status_history,
  public.cart,
  public.cart_items,
  public.wishlist,
  public.contact_messages
FROM anon, authenticated, public;
