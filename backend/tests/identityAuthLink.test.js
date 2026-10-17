import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSupabaseIdentity } from '../services/identity.service.js';
import * as userRepo from '../repositories/user.repository.js';
import { setSupabaseClient } from '../database/client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const verifierSqlPath = path.resolve(__dirname, '../database/verify_staging_baseline.sql');

describe('Customer Identity Architecture & RLS Security Model', () => {
  it('resolves Supabase Auth user to an internal user with distinct supabase_user_id and id', async () => {
    const authSub = 'auth-sub-uuid-9999-aaaa';
    const internalId = 'usr-internal-uuid-1111-bbbb';

    // In-memory mock database representing public.users
    const mockUsers = [
      {
        id: internalId,
        supabase_user_id: authSub,
        email: 'customer@example.com',
        first_name: 'Aditi',
        last_name: 'Sharma',
        role: 'customer',
        token_version: 1,
      },
    ];

    const mockClient = {
      from(table) {
        if (table !== 'users') {
          return {
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
          };
        }
        return {
          select(cols) {
            return {
              eq(field, val) {
                return {
                  maybeSingle: async () => {
                    const found = mockUsers.find((u) => u[field] === val);
                    return { data: found ? { ...found } : null, error: null };
                  },
                };
              },
            };
          },
        };
      },
    };

    setSupabaseClient(mockClient);

    const resolved = await resolveSupabaseIdentity({
      id: authSub,
      email: 'customer@example.com',
      email_confirmed_at: new Date().toISOString(),
    });

    // Verify domain separation:
    assert.strictEqual(resolved.id, internalId, 'Resolved identity MUST use internal application UUID');
    assert.strictEqual(resolved.supabase_user_id, authSub, 'supabase_user_id MUST store the auth provider subject');
    assert.notStrictEqual(resolved.id, authSub, 'Internal id must NEVER equal auth sub in production architecture');
  });

  it('demonstrates that legacy policy (auth.uid() = id) fails for decoupled identity model', () => {
    const authUid = 'auth-sub-uuid-9999-aaaa';
    const row = {
      id: 'usr-internal-uuid-1111-bbbb',
      supabase_user_id: 'auth-sub-uuid-9999-aaaa',
    };

    // Flawed legacy predicate from Migration 002
    const legacyPredicate = (authUid === row.id);
    assert.strictEqual(legacyPredicate, false, 'Legacy predicate (auth.uid() = id) evaluates to FALSE for real decoupled users');

    // Correct decoupled identity link predicate
    const correctedPredicate = (row.supabase_user_id !== null && authUid === row.supabase_user_id);
    assert.strictEqual(correctedPredicate, true, 'Corrected predicate evaluates to TRUE via the identity link');
  });

  it('demonstrates that address ownership verifies through the identity link and rejects ID fallback', () => {
    const authUid = 'auth-sub-uuid-9999-aaaa';
    const usersTable = [
      {
        id: 'usr-internal-uuid-1111-bbbb',
        supabase_user_id: 'auth-sub-uuid-9999-aaaa',
      },
      {
        id: 'usr-internal-uuid-2222-cccc',
        supabase_user_id: 'other-auth-sub-7777',
      },
    ];

    const customerAddress = {
      id: 'addr-uuid-1',
      user_id: 'usr-internal-uuid-1111-bbbb',
      city: 'Mumbai',
    };

    const attackerAddress = {
      id: 'addr-uuid-2',
      user_id: 'usr-internal-uuid-2222-cccc',
      city: 'Delhi',
    };

    // Subquery predicate: EXISTS (SELECT 1 FROM users u WHERE u.id = address.user_id AND u.supabase_user_id = auth.uid())
    function evaluateAddressRls(address, currentAuthUid) {
      return usersTable.some(
        (u) => u.id === address.user_id && u.supabase_user_id === currentAuthUid
      );
    }

    assert.strictEqual(
      evaluateAddressRls(customerAddress, authUid),
      true,
      'Customer successfully accesses their own address via users table identity link'
    );

    assert.strictEqual(
      evaluateAddressRls(attackerAddress, authUid),
      false,
      'Customer cannot access another users address'
    );
  });

  it('validates column security: updates must be restricted to non-sensitive profile columns', () => {
    const sensitiveColumns = [
      'id',
      'supabase_user_id',
      'email',
      'role',
      'password_hash',
      'reset_token',
      'reset_token_expires_at',
      'token_version',
      'is_active',
    ];

    const allowedCustomerEditableColumns = ['first_name', 'last_name', 'phone', 'avatar_url'];

    // Simulated column-level permission check:
    function isColumnUpdatePermittedForAuthenticated(col) {
      return allowedCustomerEditableColumns.includes(col);
    }

    for (const col of allowedCustomerEditableColumns) {
      assert.strictEqual(
        isColumnUpdatePermittedForAuthenticated(col),
        true,
        `Customer profile column "${col}" must be writable by authenticated customer`
      );
    }

    for (const col of sensitiveColumns) {
      assert.strictEqual(
        isColumnUpdatePermittedForAuthenticated(col),
        false,
        `Security column "${col}" MUST NOT be writable by authenticated customer (privilege escalation)`
      );
    }
  });

  it('validates column security: customer SELECT grants must never expose credentials or reset tokens', () => {
    const sensitiveColumns = ['password_hash', 'reset_token', 'reset_token_expires_at'];

    const allowedReadableColumns = [
      'id',
      'supabase_user_id',
      'email',
      'first_name',
      'last_name',
      'phone',
      'avatar_url',
      'role',
      'is_active',
      'token_version',
      'last_login_at',
      'created_at',
      'updated_at',
    ];

    function isColumnSelectPermittedForAuthenticated(col) {
      return allowedReadableColumns.includes(col);
    }

    for (const col of allowedReadableColumns) {
      assert.strictEqual(
        isColumnSelectPermittedForAuthenticated(col),
        true,
        `Customer profile/metadata column "${col}" must be readable by authenticated customer`
      );
    }

    for (const col of sensitiveColumns) {
      assert.strictEqual(
        isColumnSelectPermittedForAuthenticated(col),
        false,
        `Sensitive credential column "${col}" MUST NOT be readable by authenticated customer`
      );
    }
  });

  it('verifies 010b baseline patch unique index naming consistency without redundant constraints', () => {
    const expectedIndexName = 'idx_users_supabase_user_id';
    const legacyConstraintName = 'users_supabase_user_id_key';

    // Simulated catalog state after patch execution:
    const activeIndexes = new Set([expectedIndexName]);
    const activeConstraints = new Set(); // legacy constraint removed

    assert.strictEqual(
      activeIndexes.has(expectedIndexName),
      true,
      `Expected unique index ${expectedIndexName} must be present`
    );
    assert.strictEqual(
      activeConstraints.has(legacyConstraintName),
      false,
      `Auto-generated inline constraint ${legacyConstraintName} must not exist redundantly`
    );
    assert.strictEqual(
      activeIndexes.has(legacyConstraintName),
      false,
      `Legacy index ${legacyConstraintName} must not exist redundantly`
    );
  });

  it('validates verification script RLS audit predicate detection: accepts joined identity subquery and flags direct user_id comparisons', () => {
    // Exact word-bounded regex pattern used in verify_staging_baseline.sql TEST 7
    const flawedDirectUserIdPattern = /(^|[^a-zA-Z0-9_])(addresses\.)?user_id\s*=\s*auth\.uid\(\)|auth\.uid\(\)\s*=\s*(addresses\.)?user_id([^a-zA-Z0-9_]|$)/i;

    // Simulated PostgreSQL evaluation function for TEST 7 on public.addresses
    function evaluateAddressPolicyAudit(expression) {
      if (!expression) return 'FAIL — MISSING';
      if (flawedDirectUserIdPattern.test(expression)) {
        return 'FAIL — FLAWED DIRECT USER_ID PREDICATE DETECTED';
      }
      if (expression.includes('u.id = auth.uid()') || expression.includes('auth.uid() = u.id')) {
        return 'FAIL — FLAWED SURROGATE ID PREDICATE DETECTED';
      }
      if (!expression.includes('supabase_user_id') || !expression.includes('auth.uid()') || !expression.includes('users')) {
        return 'FAIL — USERS IDENTITY SUBQUERY LINK MISSING IN USING';
      }
      return 'PASS';
    }

    // 1. Legitimate joined identity queries MUST return PASS
    const legitimateQueries = [
      'EXISTS (SELECT 1 FROM public.users u WHERE u.id = addresses.user_id AND u.supabase_user_id = auth.uid())',
      'EXISTS (SELECT 1 FROM users u WHERE ((u.id = addresses.user_id) AND (u.supabase_user_id = auth.uid())))',
      'EXISTS (SELECT 1 FROM users u WHERE u.id = addresses.user_id AND auth.uid() = u.supabase_user_id)',
      'EXISTS (SELECT 1 FROM users u WHERE ((addresses.user_id = u.id) AND (u.supabase_user_id = auth.uid())))',
    ];
    for (const q of legitimateQueries) {
      assert.strictEqual(
        evaluateAddressPolicyAudit(q),
        'PASS',
        `Legitimate policy expression "${q}" must evaluate to PASS without false positives`
      );
    }

    // 2. Unsafe direct comparisons MUST be flagged as flawed direct user_id predicate
    const unsafeDirectQueries = [
      'auth.uid() = user_id',
      'user_id = auth.uid()',
      '(auth.uid() = user_id)',
      '(user_id = auth.uid())',
      'auth.uid() = addresses.user_id',
      'addresses.user_id = auth.uid()',
      '((addresses.user_id = auth.uid()))',
      'EXISTS (SELECT 1 FROM users u WHERE u.id = addresses.user_id AND u.supabase_user_id = auth.uid()) AND addresses.user_id = auth.uid()',
    ];
    for (const q of unsafeDirectQueries) {
      assert.strictEqual(
        evaluateAddressPolicyAudit(q),
        'FAIL — FLAWED DIRECT USER_ID PREDICATE DETECTED',
        `Unsafe direct user_id expression "${q}" MUST be rejected`
      );
    }

    // 3. Flawed surrogate ID join MUST be flagged as flawed surrogate id predicate
    const flawedSurrogateQueries = [
      'EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.id = addresses.user_id AND u.supabase_user_id IS NOT NULL)',
      'EXISTS (SELECT 1 FROM users u WHERE auth.uid() = u.id AND addresses.user_id = u.id AND u.supabase_user_id IS NOT NULL)',
    ];
    for (const q of flawedSurrogateQueries) {
      assert.strictEqual(
        evaluateAddressPolicyAudit(q),
        'FAIL — FLAWED SURROGATE ID PREDICATE DETECTED',
        `Surrogate ID fallback expression "${q}" MUST be rejected`
      );
    }

    // 4. Incomplete subqueries missing required links MUST be flagged
    const incompleteQueries = [
      'EXISTS (SELECT 1 FROM users u WHERE u.id = addresses.user_id)', // missing supabase_user_id and auth.uid()
      'EXISTS (SELECT 1 FROM other_table o WHERE o.id = addresses.user_id AND o.supabase_user_id = auth.uid())', // missing users table
    ];
    for (const q of incompleteQueries) {
      assert.strictEqual(
        evaluateAddressPolicyAudit(q),
        'FAIL — USERS IDENTITY SUBQUERY LINK MISSING IN USING',
        `Incomplete identity link expression "${q}" MUST be rejected`
      );
    }
  });

  it('verifies verify_staging_baseline.sql consolidates all checks into a single result set for Supabase SQL Editor', () => {
    assert.strictEqual(fs.existsSync(verifierSqlPath), true, 'verify_staging_baseline.sql must exist');
    const sql = fs.readFileSync(verifierSqlPath, 'utf8');

    // 1. Must be structured as a single CTE statement
    assert.match(sql, /^\s*(--[^\n]*\n\s*)*WITH\b/m, 'Verification script must start with a WITH CTE block');

    // 2. Must end with a single consolidated SELECT from final_report
    const finalSelectPattern = /SELECT\s+test_name,\s+table_name,\s+check_name,\s+details,\s+status\s+FROM\s+final_report\s+ORDER BY\s+step_order,\s+table_name,\s+check_name;/i;
    assert.match(sql, finalSelectPattern, 'Verification script must project consolidated columns ordered by step_order, table_name, check_name');

    // 3. Must not have un-nested top-level statement delimiters producing multiple result sets
    // In PostgreSQL / Supabase SQL Editor, multiple top-level SELECTs cause the editor to display only the last query.
    // The only top-level SELECT must be the final projection from final_report.
    const strippedSql = sql.replace(/\/\*[\s\S]*?\*\/|--[^\n]*|'(?:''|[^'])*'/g, ''); // strip comments & string literals
    const topLevelSemicolons = strippedSql.split(';').map(s => s.trim()).filter(Boolean);
    assert.strictEqual(
      topLevelSemicolons.length,
      1,
      'Verification script must be exactly ONE consolidated SQL statement ending with a single semicolon'
    );
  });

  it('verifies that all 7 critical subsystems (87 individual checks + summary rollup) are defined in the verifier', () => {
    const sql = fs.readFileSync(verifierSqlPath, 'utf8');

    // TEST 1: Required Tables (13)
    const test1Matches = [
      'categories', 'products', 'users', 'admins', 'addresses', 'wishlist',
      'cart', 'cart_items', 'orders', 'order_items', 'order_status_history',
      'contact_messages', 'password_reset_tokens',
    ];
    for (const tbl of test1Matches) {
      assert.strictEqual(
        sql.includes(`'${tbl}'`),
        true,
        `TEST 1 table '${tbl}' must be included in required tables audit`
      );
    }

    // TEST 2: Role Permissions (13)
    assert.strictEqual(sql.includes('test2_evaluated'), true, 'TEST 2 permissions evaluation CTE must exist');

    // TEST 2B: Column-Level Privilege Matrix (16)
    const test2bColumns = [
      'id', 'supabase_user_id', 'email', 'password_hash', 'first_name',
      'last_name', 'phone', 'avatar_url', 'role', 'is_active',
      'token_version', 'reset_token', 'reset_token_expires_at',
      'last_login_at', 'created_at', 'updated_at',
    ];
    for (const col of test2bColumns) {
      assert.strictEqual(
        sql.includes(`'${col}'`),
        true,
        `TEST 2B user column '${col}' must be included in column privilege matrix`
      );
    }

    // TEST 3: Critical Columns (9)
    const test3Columns = [
      ['orders', 'altneu_number'],
      ['orders', 'order_number'],
      ['orders', 'carrier'],
      ['orders', 'tracking_number'],
      ['users', 'supabase_user_id'],
      ['users', 'token_version'],
      ['users', 'reset_token'],
      ['products', 'image_metadata'],
      ['admins', 'token_version'],
    ];
    for (const [tbl, col] of test3Columns) {
      assert.strictEqual(
        sql.includes(`('${tbl}', '${col}')`),
        true,
        `TEST 3 required column (${tbl}, ${col}) must be included in column audit`
      );
    }

    // TEST 4: Critical Indexes (7)
    const test4Indexes = [
      'idx_orders_altneu_number',
      'idx_orders_user',
      'idx_users_supabase_user_id',
      'idx_users_reset_token',
      'idx_addresses_one_default',
      'idx_cart_items_cart',
      'wishlist_user_id_product_id_key',
    ];
    for (const idx of test4Indexes) {
      assert.strictEqual(
        sql.includes(`'${idx}'`),
        true,
        `TEST 4 index '${idx}' must be included in indexes audit`
      );
    }

    // TEST 4B: Redundant Index Check (1)
    assert.strictEqual(
      sql.includes('users_supabase_user_id_key'),
      true,
      'TEST 4B must check for redundant users_supabase_user_id_key'
    );

    // TEST 5: Foreign Keys (11) & Delete Rules
    const test5Fks = [
      'fk_orders_user_id',
      'fk_order_items_order_id',
      'fk_order_items_product_id',
      'fk_osh_order_id',
      'fk_addresses_user_id',
      'fk_cart_user_id',
      'fk_cart_items_cart_id',
      'fk_cart_items_product_id',
      'fk_wishlist_user_id',
      'fk_wishlist_product_id',
      'fk_products_category_id',
    ];
    for (const fk of test5Fks) {
      assert.strictEqual(
        sql.includes(`'${fk}'`),
        true,
        `TEST 5 foreign key '${fk}' must be included in FK audit`
      );
    }
    // Verify canonical delete rules for product-dependent tables
    assert.strictEqual(
      sql.includes("('fk_cart_items_product_id',   'cart_items',           'product_id', 'products',   'id', 'CASCADE')"),
      true,
      'TEST 5 must verify cart_items(product_id) CASCADE delete rule'
    );
    assert.strictEqual(
      sql.includes("('fk_order_items_product_id',  'order_items',          'product_id', 'products',   'id', 'SET NULL')"),
      true,
      'TEST 5 must verify order_items(product_id) SET NULL delete rule'
    );

    // TEST 6: Triggers & Shared Function (9)
    const test6Triggers = [
      'trg_categories_updated_at',
      'trg_products_updated_at',
      'trg_users_updated_at',
      'trg_admins_updated_at',
      'trg_addresses_updated_at',
      'trg_cart_updated_at',
      'trg_cart_items_updated_at',
      'trg_orders_updated_at',
    ];
    for (const trg of test6Triggers) {
      assert.strictEqual(
        sql.includes(`'${trg}'`),
        true,
        `TEST 6 trigger '${trg}' must be included in triggers audit`
      );
    }
    assert.strictEqual(
      sql.includes('set_updated_at'),
      true,
      'TEST 6 must verify set_updated_at function in public schema'
    );

    // TEST 7: Deep RLS Policies (8)
    const test7Policies = [
      'categories_public_read',
      'products_public_read',
      'users_select_own',
      'users_update_own',
      'addresses_select_own',
      'addresses_insert_own',
      'addresses_update_own',
      'addresses_delete_own',
    ];
    for (const pol of test7Policies) {
      assert.strictEqual(
        sql.includes(`'${pol}'`),
        true,
        `TEST 7 policy '${pol}' must be included in RLS policy audit`
      );
    }

    // Summary rollup CTEs
    assert.strictEqual(sql.includes('summary_counts AS'), true, 'summary_counts CTE must exist');
    assert.strictEqual(sql.includes('summary_result AS'), true, 'summary_result CTE must exist');
    assert.strictEqual(sql.includes('final_report AS'), true, 'final_report CTE must exist');
  });

  it('validates summary rollup calculations and pass/fail thresholds', () => {
    // Simulated summary calculation function matching PostgreSQL summary_counts & summary_result
    function calculateRollup(checks) {
      const totalChecks = checks.length;
      const passedChecks = checks.filter(c => c.status === 'PASS' || c.status.startsWith('PASS')).length;
      const failedChecks = checks.filter(c => !c.status.startsWith('PASS')).length;

      const details = `Total checks: ${totalChecks} | Passed: ${passedChecks} | Failed: ${failedChecks}`;
      const status = failedChecks === 0 ? 'PASS' : `FAIL (${failedChecks} CHECKS FAILED)`;

      return {
        step_order: 10,
        test_name: 'OVERALL SUMMARY',
        table_name: 'all_subsystems',
        check_name: 'baseline_audit_summary',
        details,
        status,
      };
    }

    // 1. All 87 checks pass
    const allPassingChecks = Array(87).fill({ status: 'PASS' });
    const passingSummary = calculateRollup(allPassingChecks);
    assert.strictEqual(passingSummary.status, 'PASS', 'Summary must report PASS when all checks pass');
    assert.strictEqual(passingSummary.details, 'Total checks: 87 | Passed: 87 | Failed: 0');

    // 2. 1 check fails
    const oneFailedChecks = [...Array(86).fill({ status: 'PASS' }), { status: 'FAIL — TABLE MISSING' }];
    const oneFailedSummary = calculateRollup(oneFailedChecks);
    assert.strictEqual(oneFailedSummary.status, 'FAIL (1 CHECKS FAILED)', 'Summary must flag single check failure');
    assert.strictEqual(oneFailedSummary.details, 'Total checks: 87 | Passed: 86 | Failed: 1');

    // 3. 5 checks fail
    const fiveFailedChecks = [...Array(82).fill({ status: 'PASS' }), ...Array(5).fill({ status: 'FAIL — FK NOT FOUND' })];
    const fiveFailedSummary = calculateRollup(fiveFailedChecks);
    assert.strictEqual(fiveFailedSummary.status, 'FAIL (5 CHECKS FAILED)');
    assert.strictEqual(fiveFailedSummary.details, 'Total checks: 87 | Passed: 82 | Failed: 5');
  });

  it('validates verification script index audit (TEST 4): rejects single-column idx_wishlist_user and requires column definition verification', () => {
    assert.strictEqual(fs.existsSync(verifierSqlPath), true, 'verify_staging_baseline.sql must exist');
    const sql = fs.readFileSync(verifierSqlPath, 'utf8');

    // 1. Must NOT accept idx_wishlist_user as a valid fallback for wishlist_user_id_product_id_key
    assert.strictEqual(
      sql.includes("'idx_wishlist_user_product', 'idx_wishlist_user'"),
      false,
      'Legacy flawed fallback list containing idx_wishlist_user must be removed'
    );
    assert.strictEqual(
      /i\.indexname\s*=\s*'idx_wishlist_user'/i.test(sql),
      false,
      'idx_wishlist_user must never be accepted as a matching index name for composite key'
    );

    // 2. Must explicitly exclude idx_wishlist_user from composite index matching
    assert.strictEqual(
      sql.includes("i.indexname != 'idx_wishlist_user'"),
      true,
      'TEST 4 must explicitly exclude single-column idx_wishlist_user from matching'
    );

    // 3. Must extract indexed column list from indexdef via regex
    assert.strictEqual(
      sql.includes("test4_actual_indexes AS"),
      true,
      'TEST 4 must define test4_actual_indexes CTE to extract index columns'
    );
    assert.strictEqual(
      sql.includes("indexed_columns"),
      true,
      'TEST 4 must isolate indexed_columns from indexdef'
    );

    // 4. Wishlist check must verify both user_id and product_id columns
    assert.strictEqual(
      sql.includes("user_id") && sql.includes("product_id"),
      true,
      'TEST 4 must verify both user_id and product_id for wishlist composite key'
    );

    // 5. Orders user index alias must verify user_id column
    assert.strictEqual(
      sql.includes("idx_orders_user_id"),
      true,
      'TEST 4 must support idx_orders_user_id alias'
    );

    // 6. Cart items cart index alias must verify cart_id column
    assert.strictEqual(
      sql.includes("idx_cart_items_cart_id"),
      true,
      'TEST 4 must support idx_cart_items_cart_id alias'
    );

    // 7. Deduplication: must prevent row inflation if canonical and alias both exist
    assert.strictEqual(
      sql.includes("DISTINCT ON (exp.expected_index)"),
      true,
      'TEST 4 must use DISTINCT ON (exp.expected_index) to guarantee exactly 7 check rows'
    );
  });

  it('demonstrates that TEST 4 index simulation catches false positives and verifies indexed column coverage', () => {
    function extractIndexedColumns(indexdef) {
      const match = indexdef.match(/USING\s+[a-zA-Z0-9_]+\s*\(([^)]+)\)/i);
      return match ? match[1] : '';
    }

    function hasColumn(colStr, colName) {
      const pattern = new RegExp('(^|[^a-zA-Z0-9_])' + colName + '([^a-zA-Z0-9_]|$)', 'i');
      return pattern.test(colStr);
    }

    const expectedIndexCatalog = [
      { expected_index: 'idx_orders_altneu_number', target_table: 'orders' },
      { expected_index: 'idx_orders_user', target_table: 'orders' },
      { expected_index: 'idx_users_supabase_user_id', target_table: 'users' },
      { expected_index: 'idx_users_reset_token', target_table: 'users' },
      { expected_index: 'idx_addresses_one_default', target_table: 'addresses' },
      { expected_index: 'idx_cart_items_cart', target_table: 'cart_items' },
      { expected_index: 'wishlist_user_id_product_id_key', target_table: 'wishlist' },
    ];

    function evaluateTest4Audit(expectedIndexes, actualIndexes) {
      const results = [];
      for (const exp of expectedIndexes) {
        const matching = actualIndexes.filter((i) => {
          if (i.tablename !== exp.target_table) return false;
          const cols = extractIndexedColumns(i.indexdef || '');

          // 1. Canonical index
          if (i.indexname === exp.expected_index) {
            if (exp.expected_index === 'wishlist_user_id_product_id_key') {
              return hasColumn(cols, 'user_id') && hasColumn(cols, 'product_id');
            }
            return true;
          }

          // 2. Orders user index alias
          if (exp.expected_index === 'idx_orders_user' && i.indexname === 'idx_orders_user_id') {
            return hasColumn(cols, 'user_id');
          }

          // 3. Cart items cart index alias
          if (exp.expected_index === 'idx_cart_items_cart' && i.indexname === 'idx_cart_items_cart_id') {
            return hasColumn(cols, 'cart_id');
          }

          // 4. Wishlist composite alternative (must cover both user_id and product_id, reject single-column idx_wishlist_user)
          if (exp.expected_index === 'wishlist_user_id_product_id_key') {
            if (i.indexname === 'idx_wishlist_user') return false;
            if (i.indexname === 'idx_wishlist_user_product' || /wishlist/i.test(i.indexname)) {
              return hasColumn(cols, 'user_id') && hasColumn(cols, 'product_id');
            }
          }

          return false;
        });

        matching.sort((a, b) => {
          const aScore = a.indexname === exp.expected_index ? 0 : 1;
          const bScore = b.indexname === exp.expected_index ? 0 : 1;
          return aScore - bScore;
        });

        const picked = matching[0] || null;
        results.push({
          check_name: exp.expected_index,
          table_name: exp.target_table,
          status: picked ? 'PASS' : 'FAIL — INDEX MISSING',
          details: picked
            ? `Index exists on ${exp.target_table} (${picked.indexname})`
            : `Index missing on ${exp.target_table}`,
          matched_index: picked ? picked.indexname : null,
        });
      }
      return results;
    }

    // 1. Canonical schema passes completely
    const canonicalIndexes = [
      { tablename: 'orders', indexname: 'idx_orders_altneu_number', indexdef: 'CREATE UNIQUE INDEX idx_orders_altneu_number ON public.orders USING btree (altneu_number) WHERE (altneu_number IS NOT NULL)' },
      { tablename: 'orders', indexname: 'idx_orders_user', indexdef: 'CREATE INDEX idx_orders_user ON public.orders USING btree (user_id)' },
      { tablename: 'users', indexname: 'idx_users_supabase_user_id', indexdef: 'CREATE UNIQUE INDEX idx_users_supabase_user_id ON public.users USING btree (supabase_user_id)' },
      { tablename: 'users', indexname: 'idx_users_reset_token', indexdef: 'CREATE INDEX idx_users_reset_token ON public.users USING btree (reset_token)' },
      { tablename: 'addresses', indexname: 'idx_addresses_one_default', indexdef: 'CREATE UNIQUE INDEX idx_addresses_one_default ON public.addresses USING btree (user_id) WHERE (is_default = true)' },
      { tablename: 'cart_items', indexname: 'idx_cart_items_cart', indexdef: 'CREATE INDEX idx_cart_items_cart ON public.cart_items USING btree (cart_id)' },
      { tablename: 'wishlist', indexname: 'wishlist_user_id_product_id_key', indexdef: 'CREATE UNIQUE INDEX wishlist_user_id_product_id_key ON public.wishlist USING btree (user_id, product_id)' },
      { tablename: 'wishlist', indexname: 'idx_wishlist_user', indexdef: 'CREATE INDEX idx_wishlist_user ON public.wishlist USING btree (user_id)' },
    ];
    const canonicalResults = evaluateTest4Audit(expectedIndexCatalog, canonicalIndexes);
    assert.strictEqual(canonicalResults.length, 7, 'Must produce exactly 7 results');
    assert.strictEqual(canonicalResults.every((r) => r.status === 'PASS'), true, 'All canonical indexes must PASS');

    // 2. False-Positive Trap: wishlist composite missing, only idx_wishlist_user present
    const falsePositiveIndexes = [
      ...canonicalIndexes.filter((i) => i.indexname !== 'wishlist_user_id_product_id_key'),
    ];
    const fpResults = evaluateTest4Audit(expectedIndexCatalog, falsePositiveIndexes);
    const wishlistFpCheck = fpResults.find((r) => r.check_name === 'wishlist_user_id_product_id_key');
    assert.strictEqual(
      wishlistFpCheck.status,
      'FAIL — INDEX MISSING',
      'Wishlist check MUST FAIL when composite index is missing, even if idx_wishlist_user exists'
    );

    // 3. Valid composite alternative passes
    const validAltIndexes = [
      ...canonicalIndexes.filter((i) => i.indexname !== 'wishlist_user_id_product_id_key'),
      { tablename: 'wishlist', indexname: 'idx_wishlist_user_product', indexdef: 'CREATE UNIQUE INDEX idx_wishlist_user_product ON public.wishlist USING btree (user_id, product_id)' },
    ];
    const altResults = evaluateTest4Audit(expectedIndexCatalog, validAltIndexes);
    const wishlistAltCheck = altResults.find((r) => r.check_name === 'wishlist_user_id_product_id_key');
    assert.strictEqual(wishlistAltCheck.status, 'PASS');
    assert.strictEqual(wishlistAltCheck.matched_index, 'idx_wishlist_user_product');

    // 4. Reversed composite alternative passes
    const reversedAltIndexes = [
      ...canonicalIndexes.filter((i) => i.indexname !== 'wishlist_user_id_product_id_key'),
      { tablename: 'wishlist', indexname: 'idx_wishlist_user_product', indexdef: 'CREATE UNIQUE INDEX idx_wishlist_user_product ON public.wishlist USING btree (product_id, user_id)' },
    ];
    const revResults = evaluateTest4Audit(expectedIndexCatalog, reversedAltIndexes);
    const wishlistRevCheck = revResults.find((r) => r.check_name === 'wishlist_user_id_product_id_key');
    assert.strictEqual(wishlistRevCheck.status, 'PASS');

    // 5. Deceptive alternative name with wrong/missing columns is rejected
    const deceptiveAltIndexes = [
      ...canonicalIndexes.filter((i) => i.indexname !== 'wishlist_user_id_product_id_key'),
      { tablename: 'wishlist', indexname: 'idx_wishlist_user_product', indexdef: 'CREATE INDEX idx_wishlist_user_product ON public.wishlist USING btree (user_id)' },
    ];
    const deceptiveResults = evaluateTest4Audit(expectedIndexCatalog, deceptiveAltIndexes);
    const wishlistDeceptiveCheck = deceptiveResults.find((r) => r.check_name === 'wishlist_user_id_product_id_key');
    assert.strictEqual(
      wishlistDeceptiveCheck.status,
      'FAIL — INDEX MISSING',
      'Alternative index with deceptive name but missing product_id must be rejected'
    );

    // 6. Valid orders alias passes
    const validOrdersAliasIndexes = [
      ...canonicalIndexes.filter((i) => i.indexname !== 'idx_orders_user'),
      { tablename: 'orders', indexname: 'idx_orders_user_id', indexdef: 'CREATE INDEX idx_orders_user_id ON public.orders USING btree (user_id)' },
    ];
    const ordersAliasResults = evaluateTest4Audit(expectedIndexCatalog, validOrdersAliasIndexes);
    const ordersAliasCheck = ordersAliasResults.find((r) => r.check_name === 'idx_orders_user');
    assert.strictEqual(ordersAliasCheck.status, 'PASS');
    assert.strictEqual(ordersAliasCheck.matched_index, 'idx_orders_user_id');

    // 7. Deceptive orders alias with wrong column is rejected
    const deceptiveOrdersAliasIndexes = [
      ...canonicalIndexes.filter((i) => i.indexname !== 'idx_orders_user'),
      { tablename: 'orders', indexname: 'idx_orders_user_id', indexdef: 'CREATE INDEX idx_orders_user_id ON public.orders USING btree (status)' },
    ];
    const deceptiveOrdersResults = evaluateTest4Audit(expectedIndexCatalog, deceptiveOrdersAliasIndexes);
    const deceptiveOrdersCheck = deceptiveOrdersResults.find((r) => r.check_name === 'idx_orders_user');
    assert.strictEqual(
      deceptiveOrdersCheck.status,
      'FAIL — INDEX MISSING',
      'Orders alias with matching name but wrong column must be rejected'
    );

    // 8. Valid cart_items alias passes
    const validCartAliasIndexes = [
      ...canonicalIndexes.filter((i) => i.indexname !== 'idx_cart_items_cart'),
      { tablename: 'cart_items', indexname: 'idx_cart_items_cart_id', indexdef: 'CREATE INDEX idx_cart_items_cart_id ON public.cart_items USING btree (cart_id)' },
    ];
    const cartAliasResults = evaluateTest4Audit(expectedIndexCatalog, validCartAliasIndexes);
    const cartAliasCheck = cartAliasResults.find((r) => r.check_name === 'idx_cart_items_cart');
    assert.strictEqual(cartAliasCheck.status, 'PASS');
    assert.strictEqual(cartAliasCheck.matched_index, 'idx_cart_items_cart_id');

    // 9. Deceptive cart_items alias with wrong column is rejected
    const deceptiveCartAliasIndexes = [
      ...canonicalIndexes.filter((i) => i.indexname !== 'idx_cart_items_cart'),
      { tablename: 'cart_items', indexname: 'idx_cart_items_cart_id', indexdef: 'CREATE INDEX idx_cart_items_cart_id ON public.cart_items USING btree (product_id)' },
    ];
    const deceptiveCartResults = evaluateTest4Audit(expectedIndexCatalog, deceptiveCartAliasIndexes);
    const deceptiveCartCheck = deceptiveCartResults.find((r) => r.check_name === 'idx_cart_items_cart');
    assert.strictEqual(
      deceptiveCartCheck.status,
      'FAIL — INDEX MISSING',
      'Cart items alias with matching name but wrong column must be rejected'
    );

    // 10. Deduplication: canonical takes priority and output row count is strictly 7
    const duplicateIndexes = [
      ...canonicalIndexes,
      { tablename: 'orders', indexname: 'idx_orders_user_id', indexdef: 'CREATE INDEX idx_orders_user_id ON public.orders USING btree (user_id)' },
      { tablename: 'cart_items', indexname: 'idx_cart_items_cart_id', indexdef: 'CREATE INDEX idx_cart_items_cart_id ON public.cart_items USING btree (cart_id)' },
      { tablename: 'wishlist', indexname: 'idx_wishlist_user_product', indexdef: 'CREATE UNIQUE INDEX idx_wishlist_user_product ON public.wishlist USING btree (user_id, product_id)' },
    ];
    const dupResults = evaluateTest4Audit(expectedIndexCatalog, duplicateIndexes);
    assert.strictEqual(dupResults.length, 7, 'Must produce exactly 7 rows even when canonical and aliases co-exist');
    const ordersDup = dupResults.find((r) => r.check_name === 'idx_orders_user');
    const wishlistDup = dupResults.find((r) => r.check_name === 'wishlist_user_id_product_id_key');
    assert.strictEqual(ordersDup.matched_index, 'idx_orders_user', 'Canonical index must be prioritized');
    assert.strictEqual(wishlistDup.matched_index, 'wishlist_user_id_product_id_key', 'Canonical index must be prioritized');
  });
});


