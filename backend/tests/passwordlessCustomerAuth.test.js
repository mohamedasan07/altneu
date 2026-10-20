import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

import { loginCustomer } from '../services/customerAuth.service.js';
import { resolveSupabaseIdentity } from '../services/identity.service.js';
import { setSupabaseClient } from '../database/client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migration015Path = path.resolve(__dirname, '../database/migrations/015_users_password_hash_nullable.sql');
const schemaSqlPath = path.resolve(__dirname, '../database/schema.sql');

describe('Passwordless Customer Auth & Schema Migration 015', () => {
  beforeEach(() => {
    setSupabaseClient(null);
  });

  afterEach(() => {
    setSupabaseClient(null);
  });

  describe('Migration 015: users.password_hash Nullable Schema', () => {
    test('Migration 015 file exists with correct naming convention', () => {
      assert.strictEqual(fs.existsSync(migration015Path), true, '015_users_password_hash_nullable.sql must exist');
    });

    test('Migration 015 executes safe ALTER COLUMN DROP NOT NULL on users.password_hash', () => {
      const sql = fs.readFileSync(migration015Path, 'utf8');

      assert.match(
        sql,
        /ALTER\s+TABLE\s+(?:public\.)?users\s+ALTER\s+COLUMN\s+password_hash\s+DROP\s+NOT\s+NULL/i,
        'Migration 015 must alter password_hash column to drop NOT NULL constraint'
      );

      // Must be purely schema constraint alteration without dropping tables
      const executableSql = sql.replace(/--.*$/gm, '');
      assert.strictEqual(/\bDROP\s+TABLE\b/i.test(executableSql), false, 'Migration 015 must not drop any table');
      assert.strictEqual(/\bTRUNCATE\b/i.test(executableSql), false, 'Migration 015 must not truncate any table');
    });

    test('Canonical schema.sql defines nullable password_hash on public.users', () => {
      const sql = fs.readFileSync(schemaSqlPath, 'utf8');
      assert.match(
        sql,
        /create\s+table\s+if\s+not\s+exists\s+public\.users\s*\([^;]*?password_hash\s+text,/is,
        'schema.sql must define password_hash text without NOT NULL constraint'
      );
    });
  });

  describe('Password Login with Passwordless (NULL password_hash) Accounts', () => {
    test('Password login on a user with NULL password_hash returns 401 without bcrypt crash', async () => {
      const passwordlessUser = {
        id: 'usr-pwdless-1111',
        email: 'magiclink@example.com',
        password_hash: null,
        first_name: 'Alex',
        last_name: 'Ray',
        role: 'customer',
        is_active: true,
        token_version: 0,
      };

      const mockClient = {
        from(table) {
          assert.strictEqual(table, 'users');
          return {
            select() {
              return {
                eq(col, val) {
                  return {
                    maybeSingle: async () => {
                      if (val === passwordlessUser.email) {
                        return { data: { ...passwordlessUser }, error: null };
                      }
                      return { data: null, error: null };
                    },
                  };
                },
              };
            },
          };
        },
      };

      setSupabaseClient(mockClient);

      await assert.rejects(
        async () => {
          await loginCustomer({
            email: 'magiclink@example.com',
            password: 'SomeRandomPassword123!',
          });
        },
        (err) => {
          assert.strictEqual(err.status, 401);
          assert.strictEqual(err.message, 'Invalid email or password');
          return true;
        },
        'Password login attempt on passwordless account must reject with 401'
      );
    });

    test('Password login on account with valid password_hash succeeds with correct credentials', async () => {
      const rawPassword = 'CorrectPassword123!';
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(rawPassword, salt);

      const standardUser = {
        id: 'usr-standard-2222',
        email: 'standard@example.com',
        password_hash: hash,
        first_name: 'John',
        last_name: 'Doe',
        role: 'customer',
        is_active: true,
        token_version: 0,
      };

      const mockClient = {
        from(table) {
          return {
            select() {
              return {
                eq(col, val) {
                  return {
                    maybeSingle: async () => {
                      if (val === standardUser.email) {
                        return { data: { ...standardUser }, error: null };
                      }
                      return { data: null, error: null };
                    },
                  };
                },
              };
            },
            update() {
              return {
                eq() {
                  return Promise.resolve({ data: null, error: null });
                },
              };
            },
          };
        },
      };

      setSupabaseClient(mockClient);

      const res = await loginCustomer({
        email: 'standard@example.com',
        password: rawPassword,
      });

      assert.strictEqual(typeof res.token, 'string');
      assert.strictEqual(res.user.email, 'standard@example.com');
      assert.strictEqual(res.user.firstName, 'John');
    });

    test('Password login on account with valid password_hash rejects incorrect password with 401', async () => {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash('CorrectPassword123!', salt);

      const standardUser = {
        id: 'usr-standard-3333',
        email: 'standard2@example.com',
        password_hash: hash,
        role: 'customer',
        is_active: true,
        token_version: 0,
      };

      const mockClient = {
        from() {
          return {
            select() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({ data: { ...standardUser }, error: null }),
                  };
                },
              };
            },
          };
        },
      };

      setSupabaseClient(mockClient);

      await assert.rejects(
        async () => {
          await loginCustomer({
            email: 'standard2@example.com',
            password: 'WrongPassword!',
          });
        },
        (err) => {
          assert.strictEqual(err.status, 401);
          assert.strictEqual(err.message, 'Invalid email or password');
          return true;
        }
      );
    });
  });

  describe('Magic-Link Customer Provisioning (resolveSupabaseIdentity)', () => {
    test('Provisions new internal user with password_hash omitted/null when user does not exist', async () => {
      const supabaseId = 'sub-magic-uuid-5555';
      const email = 'newcustomer@example.com';

      let insertedPayload = null;

      const mockClient = {
        from(table) {
          assert.strictEqual(table, 'users');
          return {
            select() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({ data: null, error: null }),
                  };
                },
              };
            },
            insert(row) {
              insertedPayload = row;
              return {
                select() {
                  return {
                    single: async () => ({
                      data: {
                        id: 'usr-internal-9999',
                        supabase_user_id: row.supabase_user_id,
                        email: row.email,
                        first_name: row.first_name,
                        last_name: row.last_name,
                        phone: null,
                        avatar_url: null,
                        role: row.role,
                        is_active: true,
                        token_version: 0,
                        created_at: new Date().toISOString(),
                      },
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        },
      };

      setSupabaseClient(mockClient);

      const user = await resolveSupabaseIdentity({
        id: supabaseId,
        email,
        email_confirmed_at: new Date().toISOString(),
        user_metadata: { first_name: 'Priya', last_name: 'Patel' },
      });

      assert.strictEqual(user.email, email);
      assert.strictEqual(user.supabase_user_id, supabaseId);
      assert.strictEqual(insertedPayload.password_hash, undefined, 'password_hash must be omitted or null for magic link user');
      assert.strictEqual(insertedPayload.email, email);
      assert.strictEqual(insertedPayload.role, 'customer');
    });

    test('Attaches detailed error information if insertUser fails', async () => {
      const supabaseId = 'sub-failing-uuid-6666';
      const email = 'failing@example.com';

      const mockClient = {
        from() {
          return {
            select() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({ data: null, error: null }),
                  };
                },
              };
            },
            insert() {
              return {
                select() {
                  return {
                    single: async () => ({
                      data: null,
                      error: { message: 'null value in column "password_hash" violates not-null constraint', code: '23502' },
                    }),
                  };
                },
              };
            },
          };
        },
      };

      setSupabaseClient(mockClient);

      await assert.rejects(
        async () => {
          await resolveSupabaseIdentity({
            id: supabaseId,
            email,
            email_confirmed_at: new Date().toISOString(),
          });
        },
        (err) => {
          assert.strictEqual(err.status, 500);
          assert.strictEqual(err.message, 'Failed to provision new user identity');
          assert.match(err.detail, /password_hash/);
          return true;
        }
      );
    });
  });
});
