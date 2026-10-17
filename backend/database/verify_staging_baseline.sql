-- ============================================================================
-- ALTNEU-STAGING: Master Baseline Verification Script (Step 12)
-- File: backend/database/verify_staging_baseline.sql
-- Evaluates 7 Critical Subsystems (87 Individual Checks + 1 Summary Rollup)
-- Consolidated Single Result Set: All checks are returned in a single tabular
-- output for seamless execution and review in the Supabase SQL Editor.
-- Target: ALTNEU-STAGING (Run after 001–010 and 010b)
-- ============================================================================

WITH
-- ----------------------------------------------------------------------------
-- TEST 1: Required Tables & RLS Status (13 Tables)
-- ----------------------------------------------------------------------------
test1_required_tables AS (
  SELECT unnest(ARRAY[
    'categories', 'products', 'users', 'admins', 'addresses', 'wishlist',
    'cart', 'cart_items', 'orders', 'order_items', 'order_status_history',
    'contact_messages', 'password_reset_tokens'
  ]) AS table_name
),
test1_results AS (
  SELECT
    1 AS step_order,
    'TEST 1: TABLES & RLS'::text AS test_name,
    r.table_name::text AS table_name,
    'table_existence_and_rls'::text AS check_name,
    CASE
      WHEN t.table_name IS NULL THEN 'Table missing in public schema'
      WHEN p.rowsecurity = true THEN 'Table exists, row-level security enabled'
      ELSE 'Table exists, row-level security NOT enabled'
    END::text AS details,
    CASE
      WHEN t.table_name IS NULL THEN 'FAIL — TABLE MISSING'
      WHEN p.rowsecurity = true THEN 'PASS'
      ELSE 'FAIL — RLS NOT ENABLED'
    END::text AS status
  FROM test1_required_tables r
  LEFT JOIN information_schema.tables t
    ON t.table_schema = 'public' AND t.table_name = r.table_name
  LEFT JOIN pg_tables p
    ON p.schemaname = 'public' AND p.tablename = r.table_name
),

-- ----------------------------------------------------------------------------
-- TEST 2: Role Permissions & Table Isolation Audit (13 Tables)
-- ----------------------------------------------------------------------------
test2_tables AS (
  SELECT * FROM (VALUES
    ('categories'), ('products'), ('users'), ('admins'), ('addresses'),
    ('wishlist'), ('cart'), ('cart_items'), ('orders'), ('order_items'),
    ('order_status_history'), ('contact_messages'), ('password_reset_tokens')
  ) AS t(table_name)
),
test2_evaluated AS (
  SELECT
    t.table_name,
    CASE
      WHEN has_table_privilege('service_role', 'public.' || t.table_name, 'SELECT')
       AND has_table_privilege('service_role', 'public.' || t.table_name, 'INSERT')
       AND has_table_privilege('service_role', 'public.' || t.table_name, 'UPDATE')
       AND has_table_privilege('service_role', 'public.' || t.table_name, 'DELETE')
      THEN 'PASS'
      ELSE 'FAIL — SERVICE_ROLE MISSING DML'
    END AS service_role_dml,
    CASE
      WHEN t.table_name IN ('categories', 'products') THEN
        CASE
          WHEN has_table_privilege('anon', 'public.' || t.table_name, 'SELECT')
           AND NOT has_table_privilege('anon', 'public.' || t.table_name, 'INSERT')
           AND NOT has_table_privilege('anon', 'public.' || t.table_name, 'UPDATE')
           AND NOT has_table_privilege('anon', 'public.' || t.table_name, 'DELETE')
          THEN 'PASS'
          ELSE 'FAIL — ANON INVALID CATALOG PRIVILEGES'
        END
      ELSE
        CASE
          WHEN NOT has_table_privilege('anon', 'public.' || t.table_name, 'SELECT')
           AND NOT has_table_privilege('anon', 'public.' || t.table_name, 'INSERT')
           AND NOT has_table_privilege('anon', 'public.' || t.table_name, 'UPDATE')
           AND NOT has_table_privilege('anon', 'public.' || t.table_name, 'DELETE')
          THEN 'PASS'
          ELSE 'FAIL — ANON HAS LEAKED ACCESS'
        END
    END AS anon_isolation,
    CASE
      WHEN t.table_name IN ('categories', 'products') THEN
        CASE
          WHEN has_table_privilege('authenticated', 'public.' || t.table_name, 'SELECT')
           AND NOT has_table_privilege('authenticated', 'public.' || t.table_name, 'INSERT')
           AND NOT has_table_privilege('authenticated', 'public.' || t.table_name, 'UPDATE')
           AND NOT has_table_privilege('authenticated', 'public.' || t.table_name, 'DELETE')
          THEN 'PASS'
          ELSE 'FAIL — AUTH INVALID CATALOG PRIVILEGES'
        END
      WHEN t.table_name = 'users' THEN
        CASE
          -- Authenticated must have NO broad table-level privileges (purely column-level)
          WHEN NOT EXISTS (
                 SELECT 1 FROM information_schema.table_privileges
                 WHERE grantee = 'authenticated'
                   AND table_schema = 'public'
                   AND table_name = 'users'
               )
           AND NOT has_table_privilege('authenticated', 'public.users', 'INSERT')
           AND NOT has_table_privilege('authenticated', 'public.users', 'DELETE')
           -- Safe profile fields and metadata accessible for SELECT
           AND has_column_privilege('authenticated', 'public.users', 'id', 'SELECT')
           AND has_column_privilege('authenticated', 'public.users', 'supabase_user_id', 'SELECT')
           AND has_column_privilege('authenticated', 'public.users', 'email', 'SELECT')
           AND has_column_privilege('authenticated', 'public.users', 'first_name', 'SELECT')
           AND has_column_privilege('authenticated', 'public.users', 'last_name', 'SELECT')
           AND has_column_privilege('authenticated', 'public.users', 'phone', 'SELECT')
           AND has_column_privilege('authenticated', 'public.users', 'avatar_url', 'SELECT')
           AND has_column_privilege('authenticated', 'public.users', 'role', 'SELECT')
           AND has_column_privilege('authenticated', 'public.users', 'is_active', 'SELECT')
           AND has_column_privilege('authenticated', 'public.users', 'token_version', 'SELECT')
           AND has_column_privilege('authenticated', 'public.users', 'last_login_at', 'SELECT')
           AND has_column_privilege('authenticated', 'public.users', 'created_at', 'SELECT')
           AND has_column_privilege('authenticated', 'public.users', 'updated_at', 'SELECT')
           -- Sensitive credential & reset fields NOT readable
           AND NOT has_column_privilege('authenticated', 'public.users', 'password_hash', 'SELECT')
           AND NOT has_column_privilege('authenticated', 'public.users', 'reset_token', 'SELECT')
           AND NOT has_column_privilege('authenticated', 'public.users', 'reset_token_expires_at', 'SELECT')
           -- Editable profile fields accessible for UPDATE
           AND has_column_privilege('authenticated', 'public.users', 'first_name', 'UPDATE')
           AND has_column_privilege('authenticated', 'public.users', 'last_name', 'UPDATE')
           AND has_column_privilege('authenticated', 'public.users', 'phone', 'UPDATE')
           AND has_column_privilege('authenticated', 'public.users', 'avatar_url', 'UPDATE')
           -- Sensitive, identity, & credential fields NOT writable
           AND NOT has_column_privilege('authenticated', 'public.users', 'password_hash', 'UPDATE')
           AND NOT has_column_privilege('authenticated', 'public.users', 'reset_token', 'UPDATE')
           AND NOT has_column_privilege('authenticated', 'public.users', 'reset_token_expires_at', 'UPDATE')
           AND NOT has_column_privilege('authenticated', 'public.users', 'role', 'UPDATE')
           AND NOT has_column_privilege('authenticated', 'public.users', 'supabase_user_id', 'UPDATE')
           AND NOT has_column_privilege('authenticated', 'public.users', 'token_version', 'UPDATE')
           AND NOT has_column_privilege('authenticated', 'public.users', 'id', 'UPDATE')
           AND NOT has_column_privilege('authenticated', 'public.users', 'email', 'UPDATE')
           AND NOT has_column_privilege('authenticated', 'public.users', 'is_active', 'UPDATE')
          THEN 'PASS'
          ELSE 'FAIL — USERS COLUMN-LEVEL PERMISSIONS MISCONFIGURED'
        END
      WHEN t.table_name = 'addresses' THEN
        CASE
          WHEN has_table_privilege('authenticated', 'public.addresses', 'SELECT')
           AND has_table_privilege('authenticated', 'public.addresses', 'INSERT')
           AND has_table_privilege('authenticated', 'public.addresses', 'UPDATE')
           AND has_table_privilege('authenticated', 'public.addresses', 'DELETE')
          THEN 'PASS'
          ELSE 'FAIL — AUTH ADDRESSES PRIVILEGES MISCONFIGURED'
        END
      ELSE
        CASE
          WHEN NOT has_table_privilege('authenticated', 'public.' || t.table_name, 'SELECT')
           AND NOT has_table_privilege('authenticated', 'public.' || t.table_name, 'INSERT')
           AND NOT has_table_privilege('authenticated', 'public.' || t.table_name, 'UPDATE')
           AND NOT has_table_privilege('authenticated', 'public.' || t.table_name, 'DELETE')
          THEN 'PASS'
          ELSE 'FAIL — AUTH HAS LEAKED ACCESS'
        END
    END AS auth_isolation
  FROM test2_tables t
),
test2_results AS (
  SELECT
    2 AS step_order,
    'TEST 2: PERMISSIONS'::text AS test_name,
    te.table_name::text AS table_name,
    'role_privileges_and_isolation'::text AS check_name,
    CASE
      WHEN te.table_name IN ('categories', 'products') THEN 'service_role: DML, anon: SELECT, auth: SELECT'
      WHEN te.table_name = 'users' THEN 'service_role: DML, anon: NONE, auth: strict column-level profile'
      WHEN te.table_name = 'addresses' THEN 'service_role: DML, anon: NONE, auth: full DML protected by RLS'
      ELSE 'service_role: DML, anon: NONE, auth: NONE'
    END::text AS details,
    CASE
      WHEN te.service_role_dml != 'PASS' THEN te.service_role_dml
      WHEN te.anon_isolation != 'PASS' THEN te.anon_isolation
      WHEN te.auth_isolation != 'PASS' THEN te.auth_isolation
      ELSE 'PASS'
    END::text AS status
  FROM test2_evaluated te
),

-- ----------------------------------------------------------------------------
-- TEST 2B: Public.Users Column-Level Privilege Matrix (16 Columns)
-- ----------------------------------------------------------------------------
test2b_results AS (
  SELECT
    3 AS step_order,
    'TEST 2B: USERS COLUMN PRIVILEGES'::text AS test_name,
    'users'::text AS table_name,
    col.column_name::text AS check_name,
    ('SELECT: ' ||
      CASE WHEN has_column_privilege('authenticated', 'public.users', col.column_name, 'SELECT') THEN 'ALLOWED' ELSE 'DENIED' END ||
      ' (expected ' || col.expected_select || '), UPDATE: ' ||
      CASE WHEN has_column_privilege('authenticated', 'public.users', col.column_name, 'UPDATE') THEN 'ALLOWED' ELSE 'DENIED' END ||
      ' (expected ' || col.expected_update || ')')::text AS details,
    CASE
      WHEN (has_column_privilege('authenticated', 'public.users', col.column_name, 'SELECT') = (col.expected_select = 'ALLOWED'))
       AND (has_column_privilege('authenticated', 'public.users', col.column_name, 'UPDATE') = (col.expected_update = 'ALLOWED'))
      THEN 'PASS'
      ELSE 'FAIL — PRIVILEGE MISMATCH'
    END::text AS status
  FROM (VALUES
    ('id',                     'ALLOWED', 'DENIED'),
    ('supabase_user_id',       'ALLOWED', 'DENIED'),
    ('email',                  'ALLOWED', 'DENIED'),
    ('password_hash',          'DENIED',  'DENIED'),
    ('first_name',             'ALLOWED', 'ALLOWED'),
    ('last_name',              'ALLOWED', 'ALLOWED'),
    ('phone',                  'ALLOWED', 'ALLOWED'),
    ('avatar_url',             'ALLOWED', 'ALLOWED'),
    ('role',                   'ALLOWED', 'DENIED'),
    ('is_active',              'ALLOWED', 'DENIED'),
    ('token_version',          'ALLOWED', 'DENIED'),
    ('reset_token',            'DENIED',  'DENIED'),
    ('reset_token_expires_at', 'DENIED',  'DENIED'),
    ('last_login_at',          'ALLOWED', 'DENIED'),
    ('created_at',             'ALLOWED', 'DENIED'),
    ('updated_at',             'ALLOWED', 'DENIED')
  ) AS col(column_name, expected_select, expected_update)
),

-- ----------------------------------------------------------------------------
-- TEST 3: Critical Columns & Synchronization Fields Audit (9 Fields)
-- ----------------------------------------------------------------------------
test3_required_columns AS (
  SELECT * FROM (VALUES
    ('orders', 'altneu_number'),
    ('orders', 'order_number'),
    ('orders', 'carrier'),
    ('orders', 'tracking_number'),
    ('users', 'supabase_user_id'),
    ('users', 'token_version'),
    ('users', 'reset_token'),
    ('products', 'image_metadata'),
    ('admins', 'token_version')
  ) AS c(table_name, column_name)
),
test3_results AS (
  SELECT
    4 AS step_order,
    'TEST 3: COLUMNS'::text AS test_name,
    r.table_name::text AS table_name,
    r.column_name::text AS check_name,
    COALESCE('Data type: ' || c.data_type, 'Column missing in table')::text AS details,
    CASE WHEN c.column_name IS NOT NULL THEN 'PASS' ELSE 'FAIL — COLUMN MISSING' END::text AS status
  FROM test3_required_columns r
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public' AND c.table_name = r.table_name AND c.column_name = r.column_name
),

-- ----------------------------------------------------------------------------
-- TEST 4: Critical Indexes & Uniqueness Constraints Audit (7 Indexes)
-- ----------------------------------------------------------------------------
test4_expected_indexes AS (
  SELECT * FROM (VALUES
    ('idx_orders_altneu_number',        'orders'),
    ('idx_orders_user',                 'orders'),
    ('idx_users_supabase_user_id',      'users'),
    ('idx_users_reset_token',            'users'),
    ('idx_addresses_one_default',        'addresses'),
    ('idx_cart_items_cart',             'cart_items'),
    ('wishlist_user_id_product_id_key', 'wishlist')
  ) AS exp(expected_index, target_table)
),
test4_actual_indexes AS (
  SELECT
    schemaname,
    tablename,
    indexname,
    indexdef,
    substring(indexdef from '(?i)USING\s+[a-zA-Z0-9_]+\s*\(([^)]+)\)') AS indexed_columns
  FROM pg_indexes
  WHERE schemaname = 'public'
),
test4_results AS (
  SELECT DISTINCT ON (exp.expected_index)
    5 AS step_order,
    'TEST 4: INDEXES'::text AS test_name,
    exp.target_table::text AS table_name,
    exp.expected_index::text AS check_name,
    CASE
      WHEN i.indexname IS NOT NULL THEN 'Index exists on ' || exp.target_table || ' (' || i.indexname || ')'
      ELSE 'Index missing on ' || exp.target_table
    END::text AS details,
    CASE WHEN i.indexname IS NOT NULL THEN 'PASS' ELSE 'FAIL — INDEX MISSING' END::text AS status
  FROM test4_expected_indexes exp
  LEFT JOIN test4_actual_indexes i
    ON i.tablename = exp.target_table
   AND (
     -- Canonical index name match (for wishlist, verifies composite user_id and product_id columns)
     (i.indexname = exp.expected_index
      AND (
        exp.expected_index != 'wishlist_user_id_product_id_key'
        OR (
          i.indexed_columns ~* '(^|[^a-zA-Z0-9_])user_id([^a-zA-Z0-9_]|$)'
          AND i.indexed_columns ~* '(^|[^a-zA-Z0-9_])product_id([^a-zA-Z0-9_]|$)'
        )
      )
     )
     -- Orders user index alias: idx_orders_user_id (verified covering user_id)
     OR (
       exp.expected_index = 'idx_orders_user'
       AND i.indexname = 'idx_orders_user_id'
       AND i.indexed_columns ~* '(^|[^a-zA-Z0-9_])user_id([^a-zA-Z0-9_]|$)'
     )
     -- Cart items cart index alias: idx_cart_items_cart_id (verified covering cart_id)
     OR (
       exp.expected_index = 'idx_cart_items_cart'
       AND i.indexname = 'idx_cart_items_cart_id'
       AND i.indexed_columns ~* '(^|[^a-zA-Z0-9_])cart_id([^a-zA-Z0-9_]|$)'
     )
     -- Wishlist composite index alternative: accepts idx_wishlist_user_product or alternative
     -- ONLY after verifying that its actual index definition covers both user_id and product_id.
     -- Single-column idx_wishlist_user is strictly excluded and cannot satisfy the composite check.
     OR (
       exp.expected_index = 'wishlist_user_id_product_id_key'
       AND i.indexname != exp.expected_index
       AND i.indexname != 'idx_wishlist_user'
       AND (i.indexname = 'idx_wishlist_user_product' OR i.indexname ~* 'wishlist')
       AND i.indexed_columns ~* '(^|[^a-zA-Z0-9_])user_id([^a-zA-Z0-9_]|$)'
       AND i.indexed_columns ~* '(^|[^a-zA-Z0-9_])product_id([^a-zA-Z0-9_]|$)'
     )
   )
  ORDER BY exp.expected_index, (CASE WHEN i.indexname = exp.expected_index THEN 0 WHEN i.indexname IS NOT NULL THEN 1 ELSE 2 END)
),

-- ----------------------------------------------------------------------------
-- TEST 4B: Redundant / Duplicate Index Audit (1 Check)
-- ----------------------------------------------------------------------------
test4b_results AS (
  SELECT
    6 AS step_order,
    'TEST 4B: REDUNDANT INDEXES'::text AS test_name,
    'users'::text AS table_name,
    'users_supabase_user_id_key'::text AS check_name,
    CASE
      WHEN i.indexname IS NULL THEN 'No redundant inline constraint index detected on users'
      ELSE 'Redundant constraint index detected on users (must be dropped)'
    END::text AS details,
    CASE
      WHEN i.indexname IS NULL THEN 'PASS'
      ELSE 'FAIL — REDUNDANT INDEX DETECTED (MUST BE DROPPED)'
    END::text AS status
  FROM (SELECT 1) _
  LEFT JOIN pg_indexes i
    ON i.schemaname = 'public'
   AND i.tablename = 'users'
   AND i.indexname = 'users_supabase_user_id_key'
),

-- ----------------------------------------------------------------------------
-- TEST 5: Foreign Key Relationships & Delete Rules Audit (11 Foreign Keys)
-- ----------------------------------------------------------------------------
test5_expected_fks AS (
  SELECT * FROM (VALUES
    ('fk_orders_user_id',          'orders',               'user_id',    'users',      'id', 'SET NULL'),
    ('fk_order_items_order_id',    'order_items',          'order_id',   'orders',     'id', 'CASCADE'),
    ('fk_order_items_product_id',  'order_items',          'product_id', 'products',   'id', 'SET NULL'),
    ('fk_osh_order_id',            'order_status_history', 'order_id',   'orders',     'id', 'CASCADE'),
    ('fk_addresses_user_id',       'addresses',            'user_id',    'users',      'id', 'CASCADE'),
    ('fk_cart_user_id',            'cart',                 'user_id',    'users',      'id', 'CASCADE'),
    ('fk_cart_items_cart_id',      'cart_items',           'cart_id',    'cart',       'id', 'CASCADE'),
    ('fk_cart_items_product_id',   'cart_items',           'product_id', 'products',   'id', 'CASCADE'),
    ('fk_wishlist_user_id',        'wishlist',             'user_id',    'users',      'id', 'CASCADE'),
    ('fk_wishlist_product_id',     'wishlist',             'product_id', 'products',   'id', 'CASCADE'),
    ('fk_products_category_id',    'products',             'category_id','categories', 'id', 'SET NULL')
  ) AS f(fk_id, src_table, src_col, tgt_table, tgt_col, exp_delete_rule)
),
test5_actual_fks AS (
  SELECT
    tc.table_name AS src_table,
    kcu.column_name AS src_col,
    ccu.table_name AS tgt_table,
    ccu.column_name AS tgt_col,
    rc.delete_rule AS actual_delete_rule
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
  JOIN information_schema.referential_constraints rc
    ON tc.constraint_name = rc.constraint_name
  JOIN information_schema.constraint_column_usage ccu
    ON rc.unique_constraint_name = ccu.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
),
test5_results AS (
  SELECT
    7 AS step_order,
    'TEST 5: FOREIGN KEYS'::text AS test_name,
    e.src_table::text AS table_name,
    e.fk_id::text AS check_name,
    (e.src_table || '(' || e.src_col || ') -> ' || e.tgt_table || '(' || e.tgt_col || ') | Exp: ' || e.exp_delete_rule || ', Actual: ' || COALESCE(a.actual_delete_rule, 'MISSING'))::text AS details,
    CASE
      WHEN a.src_table IS NULL THEN 'FAIL — FK NOT FOUND'
      WHEN a.actual_delete_rule != e.exp_delete_rule THEN 'FAIL — DELETE RULE MISMATCH'
      ELSE 'PASS'
    END::text AS status
  FROM test5_expected_fks e
  LEFT JOIN test5_actual_fks a
    ON a.src_table = e.src_table
   AND a.src_col = e.src_col
   AND a.tgt_table = e.tgt_table
   AND a.tgt_col = e.tgt_col
),

-- ----------------------------------------------------------------------------
-- TEST 6: Triggers, Target Tables & Shared Function Audit (8 Triggers + 1 Function)
-- ----------------------------------------------------------------------------
test6_expected_triggers AS (
  SELECT * FROM (VALUES
    ('trg_categories_updated_at', 'categories'),
    ('trg_products_updated_at',   'products'),
    ('trg_users_updated_at',      'users'),
    ('trg_admins_updated_at',     'admins'),
    ('trg_addresses_updated_at',  'addresses'),
    ('trg_cart_updated_at',       'cart'),
    ('trg_cart_items_updated_at', 'cart_items'),
    ('trg_orders_updated_at',     'orders')
  ) AS t(trigger_name, target_table)
),
test6_results AS (
  SELECT
    8 AS step_order,
    'TEST 6: TRIGGERS & FUNCTIONS'::text AS test_name,
    e.target_table::text AS table_name,
    e.trigger_name::text AS check_name,
    ('Trigger on ' || e.target_table || ' calling set_updated_at')::text AS details,
    CASE
      WHEN tg.tgname IS NOT NULL THEN 'PASS'
      ELSE 'FAIL — TRIGGER MISSING ON TARGET TABLE'
    END::text AS status
  FROM test6_expected_triggers e
  LEFT JOIN pg_class c
    ON c.relname = e.target_table AND c.relnamespace = 'public'::regnamespace
  LEFT JOIN pg_trigger tg
    ON tg.tgname = e.trigger_name AND tg.tgrelid = c.oid AND tg.tgisinternal = false
  UNION ALL
  SELECT
    8 AS step_order,
    'TEST 6: TRIGGERS & FUNCTIONS'::text AS test_name,
    'public (schema)'::text AS table_name,
    'set_updated_at'::text AS check_name,
    'Shared trigger function in public schema'::text AS details,
    CASE
      WHEN p.proname IS NOT NULL THEN 'PASS'
      ELSE 'FAIL — FUNCTION MISSING'
    END::text AS status
  FROM (SELECT 'set_updated_at' AS fn_name) f
  LEFT JOIN pg_proc p
    ON p.proname = f.fn_name AND p.pronamespace = 'public'::regnamespace
),

-- ----------------------------------------------------------------------------
-- TEST 7: Deep RLS Policies, Roles, Commands & Predicate Security Audit (8 Policies)
-- Inspects cmd, roles, qual (USING clause), and with_check (WITH CHECK clause).
-- Enforces correct identity links and REJECTS flawed fallback predicates.
-- ----------------------------------------------------------------------------
test7_expected_policies AS (
  SELECT * FROM (VALUES
    ('categories', 'categories_public_read', 'SELECT', 'public',        true,  false),
    ('products',   'products_public_read',   'SELECT', 'public',        true,  false),
    ('users',      'users_select_own',       'SELECT', 'authenticated', false, true),
    ('users',      'users_update_own',       'UPDATE', 'authenticated', false, true),
    ('addresses',  'addresses_select_own',   'SELECT', 'authenticated', false, true),
    ('addresses',  'addresses_insert_own',   'INSERT', 'authenticated', false, true),
    ('addresses',  'addresses_update_own',   'UPDATE', 'authenticated', false, true),
    ('addresses',  'addresses_delete_own',   'DELETE', 'authenticated', false, true)
  ) AS p(table_name, policy_name, exp_cmd, exp_role, is_public, is_auth_owned)
),
test7_results AS (
  SELECT
    9 AS step_order,
    'TEST 7: RLS PREDICATES & ROLES'::text AS test_name,
    ep.table_name::text AS table_name,
    ep.policy_name::text AS check_name,
    ('Command: ' || ep.exp_cmd || ', Role: ' || ep.exp_role || ', Identity predicate verified')::text AS details,
    CASE
      -- 1. Existence check
      WHEN pol.policyname IS NULL THEN 'FAIL — POLICY MISSING'

      -- 2. Command check
      WHEN pol.cmd != ep.exp_cmd THEN 'FAIL — COMMAND MISMATCH (' || pol.cmd || ' vs ' || ep.exp_cmd || ')'

      -- 3. Role check
      WHEN ep.is_public AND NOT ('public' = ANY(pol.roles)) THEN 'FAIL — PUBLIC ROLE MISSING'
      WHEN NOT ep.is_public AND NOT ('authenticated' = ANY(pol.roles)) THEN 'FAIL — AUTHENTICATED ROLE MISSING'

      -- 4. Public catalog policy check (qual must be true)
      WHEN ep.is_public AND (pol.qual NOT LIKE '%true%') THEN 'FAIL — CATALOG ACCESS RESTRICTED'

      -- 5. Users table policy checks
      WHEN ep.table_name = 'users' AND ep.policy_name = 'users_select_own' THEN
        CASE
          WHEN pol.qual ~* '(^|[^a-zA-Z0-9_])(users\.)?id\s*=\s*auth\.uid\(\)|auth\.uid\(\)\s*=\s*(users\.)?id([^a-zA-Z0-9_]|$)'
            THEN 'FAIL — FLAWED SURROGATE ID PREDICATE DETECTED'
          WHEN pol.qual NOT LIKE '%supabase_user_id%' OR pol.qual NOT LIKE '%auth.uid()%'
            THEN 'FAIL — SUPABASE_USER_ID LINK MISSING IN USING'
          ELSE 'PASS'
        END

      WHEN ep.table_name = 'users' AND ep.policy_name = 'users_update_own' THEN
        CASE
          WHEN pol.qual ~* '(^|[^a-zA-Z0-9_])(users\.)?id\s*=\s*auth\.uid\(\)|auth\.uid\(\)\s*=\s*(users\.)?id([^a-zA-Z0-9_]|$)'
            OR pol.with_check ~* '(^|[^a-zA-Z0-9_])(users\.)?id\s*=\s*auth\.uid\(\)|auth\.uid\(\)\s*=\s*(users\.)?id([^a-zA-Z0-9_]|$)'
            THEN 'FAIL — FLAWED SURROGATE ID PREDICATE DETECTED'
          WHEN pol.qual NOT LIKE '%supabase_user_id%' OR pol.with_check NOT LIKE '%supabase_user_id%'
            THEN 'FAIL — SUPABASE_USER_ID LINK MISSING IN USING/WITH CHECK'
          ELSE 'PASS'
        END

      -- 6. Addresses table policy checks
      -- Enforces decoupled ownership via users table identity link.
      -- Uses word-bounded matching to flag direct addresses.user_id = auth.uid()
      -- without false-positive matching on legitimate u.supabase_user_id = auth.uid().
      WHEN ep.table_name = 'addresses' AND ep.exp_cmd IN ('SELECT', 'DELETE') THEN
        CASE
          WHEN pol.qual ~* '(^|[^a-zA-Z0-9_])(addresses\.)?user_id\s*=\s*auth\.uid\(\)|auth\.uid\(\)\s*=\s*(addresses\.)?user_id([^a-zA-Z0-9_]|$)'
            THEN 'FAIL — FLAWED DIRECT USER_ID PREDICATE DETECTED'
          WHEN pol.qual LIKE '%u.id = auth.uid()%' OR pol.qual LIKE '%auth.uid() = u.id%'
            THEN 'FAIL — FLAWED SURROGATE ID PREDICATE DETECTED'
          WHEN pol.qual NOT LIKE '%supabase_user_id%' OR pol.qual NOT LIKE '%auth.uid()%' OR pol.qual NOT LIKE '%users%'
            THEN 'FAIL — USERS IDENTITY SUBQUERY LINK MISSING IN USING'
          ELSE 'PASS'
        END

      WHEN ep.table_name = 'addresses' AND ep.exp_cmd = 'INSERT' THEN
        CASE
          WHEN pol.with_check ~* '(^|[^a-zA-Z0-9_])(addresses\.)?user_id\s*=\s*auth\.uid\(\)|auth\.uid\(\)\s*=\s*(addresses\.)?user_id([^a-zA-Z0-9_]|$)'
            THEN 'FAIL — FLAWED DIRECT USER_ID PREDICATE DETECTED'
          WHEN pol.with_check LIKE '%u.id = auth.uid()%' OR pol.with_check LIKE '%auth.uid() = u.id%'
            THEN 'FAIL — FLAWED SURROGATE ID PREDICATE DETECTED'
          WHEN pol.with_check NOT LIKE '%supabase_user_id%' OR pol.with_check NOT LIKE '%auth.uid()%' OR pol.with_check NOT LIKE '%users%'
            THEN 'FAIL — USERS IDENTITY SUBQUERY LINK MISSING IN WITH CHECK'
          ELSE 'PASS'
        END

      WHEN ep.table_name = 'addresses' AND ep.exp_cmd = 'UPDATE' THEN
        CASE
          WHEN pol.qual ~* '(^|[^a-zA-Z0-9_])(addresses\.)?user_id\s*=\s*auth\.uid\(\)|auth\.uid\(\)\s*=\s*(addresses\.)?user_id([^a-zA-Z0-9_]|$)'
            OR pol.with_check ~* '(^|[^a-zA-Z0-9_])(addresses\.)?user_id\s*=\s*auth\.uid\(\)|auth\.uid\(\)\s*=\s*(addresses\.)?user_id([^a-zA-Z0-9_]|$)'
            THEN 'FAIL — FLAWED DIRECT USER_ID PREDICATE DETECTED'
          WHEN pol.qual LIKE '%u.id = auth.uid()%' OR pol.qual LIKE '%auth.uid() = u.id%'
            OR pol.with_check LIKE '%u.id = auth.uid()%' OR pol.with_check LIKE '%auth.uid() = u.id%'
            THEN 'FAIL — FLAWED SURROGATE ID PREDICATE DETECTED'
          WHEN pol.qual NOT LIKE '%supabase_user_id%' OR pol.qual NOT LIKE '%auth.uid()%' OR pol.qual NOT LIKE '%users%'
            OR pol.with_check NOT LIKE '%supabase_user_id%' OR pol.with_check NOT LIKE '%auth.uid()%' OR pol.with_check NOT LIKE '%users%'
            THEN 'FAIL — USERS IDENTITY SUBQUERY LINK MISSING IN USING/WITH CHECK'
          ELSE 'PASS'
        END

      ELSE 'PASS'
    END::text AS status
  FROM test7_expected_policies ep
  LEFT JOIN pg_policies pol
    ON pol.schemaname = 'public'
   AND pol.tablename = ep.table_name
   AND pol.policyname = ep.policy_name
),

-- ----------------------------------------------------------------------------
-- CONSOLIDATION: Combine all 87 subsystem checks
-- ----------------------------------------------------------------------------
all_checks AS (
  SELECT * FROM test1_results
  UNION ALL
  SELECT * FROM test2_results
  UNION ALL
  SELECT * FROM test2b_results
  UNION ALL
  SELECT * FROM test3_results
  UNION ALL
  SELECT * FROM test4_results
  UNION ALL
  SELECT * FROM test4b_results
  UNION ALL
  SELECT * FROM test5_results
  UNION ALL
  SELECT * FROM test6_results
  UNION ALL
  SELECT * FROM test7_results
),

-- ----------------------------------------------------------------------------
-- ROLLUP: Overall Summary Metrics
-- ----------------------------------------------------------------------------
summary_counts AS (
  SELECT
    COUNT(*) AS total_checks,
    COUNT(*) FILTER (WHERE status = 'PASS' OR status LIKE 'PASS%') AS passed_checks,
    COUNT(*) FILTER (WHERE status NOT LIKE 'PASS%') AS failed_checks
  FROM all_checks
),
summary_result AS (
  SELECT
    10 AS step_order,
    'OVERALL SUMMARY'::text AS test_name,
    'all_subsystems'::text AS table_name,
    'baseline_audit_summary'::text AS check_name,
    ('Total checks: ' || total_checks || ' | Passed: ' || passed_checks || ' | Failed: ' || failed_checks)::text AS details,
    CASE
      WHEN failed_checks = 0 THEN 'PASS'
      ELSE 'FAIL (' || failed_checks || ' CHECKS FAILED)'
    END::text AS status
  FROM summary_counts
),

final_report AS (
  SELECT * FROM all_checks
  UNION ALL
  SELECT * FROM summary_result
)

-- ----------------------------------------------------------------------------
-- FINAL CONSOLIDATED RESULT SET
-- Output contains all 87 individual validations followed by the summary row.
-- ----------------------------------------------------------------------------
SELECT
  test_name,
  table_name,
  check_name,
  details,
  status
FROM final_report
ORDER BY step_order, table_name, check_name;
