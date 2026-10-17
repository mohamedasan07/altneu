import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateProductPayload } from '../validators/product.validator.js';
import {
  listProducts,
  listAllProducts,
  getProduct,
  createProduct,
  updateProduct,
} from '../services/product.service.js';
import { setSupabaseClient } from '../database/client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migration014Path = path.resolve(__dirname, '../database/migrations/014_product_sizes.sql');
const schemaSqlPath = path.resolve(__dirname, '../database/schema.sql');
const verifySqlPath = path.resolve(__dirname, '../database/verify_staging_baseline.sql');

describe('Product Sizes Schema & Persistence Regression Tests', () => {
  beforeEach(() => {
    setSupabaseClient(null);
  });

  afterEach(() => {
    setSupabaseClient(null);
  });

  describe('Migration 014 & Canonical Schema Integrity', () => {
    test('Migration 014 file exists and defines safe, idempotent column addition', () => {
      assert.strictEqual(fs.existsSync(migration014Path), true, '014_product_sizes.sql must exist');
      const sql = fs.readFileSync(migration014Path, 'utf8');

      assert.match(
        sql,
        /ALTER\s+TABLE\s+(?:public\.)?products\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+sizes\s+jsonb\s+NOT\s+NULL\s+DEFAULT\s+'\[\]'::jsonb/i,
        'Migration 014 must add sizes as jsonb NOT NULL DEFAULT "[]"::jsonb with IF NOT EXISTS'
      );

      // Must be purely additive and non-destructive in SQL statements
      const executableSql = sql.replace(/--.*$/gm, '');
      assert.strictEqual(/\bDROP\b/i.test(executableSql), false, 'Migration 014 must not contain DROP statements');
      assert.strictEqual(/\bTRUNCATE\b/i.test(executableSql), false, 'Migration 014 must not contain TRUNCATE statements');
    });

    test('Canonical schema.sql defines sizes column on public.products', () => {
      assert.strictEqual(fs.existsSync(schemaSqlPath), true, 'schema.sql must exist');
      const sql = fs.readFileSync(schemaSqlPath, 'utf8');

      assert.match(
        sql,
        /sizes\s+jsonb\s+not\s+null\s+default\s+'\[\]'::jsonb/i,
        'Canonical schema.sql must define sizes jsonb not null default "[]"::jsonb on products table'
      );
    });

    test('Verification script verify_staging_baseline.sql checks products.sizes presence and type', () => {
      assert.strictEqual(fs.existsSync(verifySqlPath), true, 'verify_staging_baseline.sql must exist');
      const sql = fs.readFileSync(verifySqlPath, 'utf8');

      // TEST 3 must contain ('products', 'sizes')
      assert.match(
        sql,
        /\(\s*'products'\s*,\s*'sizes'\s*\)/,
        'verify_staging_baseline.sql TEST 3 must check products.sizes'
      );

      // TEST 3 must verify jsonb data type
      assert.match(
        sql,
        /r\.table_name\s*=\s*'products'\s*AND\s*r\.column_name\s*=\s*'sizes'\s*AND\s*c\.data_type\s*!=\s*'jsonb'/i,
        'verify_staging_baseline.sql must verify products.sizes data_type is jsonb'
      );

      // Total check count must be 88
      assert.match(
        sql,
        /88\s+Individual\s+Checks/i,
        'verify_staging_baseline.sql header must document 88 individual checks'
      );
      assert.match(
        sql,
        /Combine\s+all\s+88\s+subsystem\s+checks/i,
        'verify_staging_baseline.sql consolidation must document 88 subsystem checks'
      );
      assert.match(
        sql,
        /Output\s+contains\s+all\s+88\s+individual\s+validations/i,
        'verify_staging_baseline.sql output note must document 88 individual validations'
      );
    });
  });

  describe('Product Validation: sizes attribute', () => {
    const validBase = {
      name: 'ALTNEU Heavyweight Oversized Tee',
      category: 'shirts',
      price: 2499,
      stockQuantity: 20,
      imageUrl: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518',
    };

    test('accepts valid size arrays from VALID_SIZES and deduplicates while preserving order', () => {
      const payload = {
        ...validBase,
        sizes: ['M', 'L', 'XL', 'M', ' 28 '],
      };
      const validated = validateProductPayload(payload);
      assert.deepEqual(validated.sizes, ['M', 'L', 'XL', '28']);
    });

    test('accepts empty sizes array', () => {
      const payload = { ...validBase, sizes: [] };
      const validated = validateProductPayload(payload);
      assert.deepEqual(validated.sizes, []);
    });

    test('rejects non-array sizes', () => {
      assert.throws(
        () => validateProductPayload({ ...validBase, sizes: 'M,L,XL' }),
        (err) => {
          assert.strictEqual(err.status, 400);
          assert.match(err.message, /sizes must be an array/i);
          return true;
        }
      );
    });

    test('rejects invalid size tokens not present in VALID_SIZES', () => {
      assert.throws(
        () => validateProductPayload({ ...validBase, sizes: ['M', 'CUSTOM_SIZE', '48'] }),
        (err) => {
          assert.strictEqual(err.status, 400);
          assert.match(err.message, /invalid sizes: CUSTOM_SIZE, 48/i);
          return true;
        }
      );
    });

    test('omits sizes when undefined in partial update', () => {
      const validated = validateProductPayload({ price: 2999 }, { partial: true });
      assert.strictEqual(validated.sizes, undefined);
    });
  });

  describe('Product Service & Repository Persistence with sizes', () => {
    function stubClient(productsData = []) {
      const state = {
        products: Array.isArray(productsData) ? [...productsData] : productsData,
        lastInsert: null,
        lastUpdate: null,
      };

      const client = {
        from(table) {
          if (table === 'categories') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: 1, name: 'shirts', slug: 'shirts' },
                    error: null,
                  }),
                }),
              }),
            };
          }

          if (table === 'products') {
            const builder = {
              select: (cols) => {
                builder._cols = cols;
                return builder;
              },
              order: () => builder,
              eq: (col, val) => {
                builder._filterCol = col;
                builder._filterVal = val;
                return builder;
              },
              then: (onFulfilled, onRejected) => {
                return Promise.resolve({ data: state.products, error: null }).then(onFulfilled, onRejected);
              },
              maybeSingle: async () => {
                if (Array.isArray(state.products)) {
                  const match = state.products.find((p) => p.id === Number(builder._filterVal));
                  return { data: match || null, error: null };
                }
                return { data: state.products, error: null };
              },
              single: async () => {
                return { data: state.lastInsert, error: null };
              },
              insert: (row) => {
                const inserted = { id: 99, ...row, created_at: new Date().toISOString() };
                state.lastInsert = inserted;
                return builder;
              },
              update: (patch) => {
                state.lastUpdate = patch;
                const existing = Array.isArray(state.products)
                  ? state.products.find((p) => p.id === Number(builder._filterVal)) || {}
                  : {};
                const updated = { ...existing, ...patch, updated_at: new Date().toISOString() };
                return {
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => ({ data: updated, error: null }),
                    }),
                  }),
                };
              },
            };
            return builder;
          }

          throw new Error(`Unexpected table: ${table}`);
        },
      };

      return { client, state };
    }

    test('listProducts normalizes product sizes from database', async () => {
      const mockRows = [
        {
          id: 1,
          name: 'Classic Boxy Tee',
          slug: 'classic-boxy-tee',
          price: 1999,
          stock_quantity: 15,
          is_active: true,
          sizes: ['S', 'M', 'L', 'XL'],
          category: { name: 'shirts' },
        },
        {
          id: 2,
          name: 'Accessory Belt',
          slug: 'accessory-belt',
          price: 999,
          stock_quantity: 5,
          is_active: true,
          sizes: null, // non-array in DB
          category: { name: 'accessories' },
        },
      ];
      const { client } = stubClient(mockRows);
      setSupabaseClient(client);

      const products = await listProducts();
      assert.strictEqual(products.length, 2);
      assert.deepEqual(products[0].sizes, ['S', 'M', 'L', 'XL']);
      assert.deepEqual(products[1].sizes, [], 'Non-array sizes in DB safely normalizes to []');
    });

    test('createProduct persists sizes array to database and returns normalized product', async () => {
      const { client, state } = stubClient([]);
      setSupabaseClient(client);

      const input = {
        name: 'Acid Wash Hoodie',
        category: 'hoodies',
        price: 3999,
        stockQuantity: 12,
        imageUrl: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2',
        sizes: ['M', 'L', 'XL'],
      };

      const created = await createProduct(input);
      assert.strictEqual(created.name, 'Acid Wash Hoodie');
      assert.deepEqual(created.sizes, ['M', 'L', 'XL']);
      assert.deepEqual(state.lastInsert.sizes, ['M', 'L', 'XL'], 'sizes must be passed to DB insert row');
    });

    test('createProduct defaults sizes to empty array when omitted', async () => {
      const { client, state } = stubClient([]);
      setSupabaseClient(client);

      const input = {
        name: 'Canvas Tote Bag',
        category: 'accessories',
        price: 799,
        stockQuantity: 50,
        imageUrl: 'https://images.unsplash.com/photo-1544816155-12df9643f363',
      };

      const created = await createProduct(input);
      assert.deepEqual(created.sizes, []);
      assert.deepEqual(state.lastInsert.sizes, [], 'sizes must default to [] in DB insert row');
    });

    test('updateProduct updates sizes patch in database', async () => {
      const mockProduct = {
        id: 42,
        name: 'Oversized Cargo Pants',
        slug: 'oversized-cargo-pants',
        price: 3499,
        stock_quantity: 8,
        is_active: true,
        sizes: ['30', '32'],
        category: { name: 'pants' },
      };
      const { client, state } = stubClient([mockProduct]);
      setSupabaseClient(client);

      const updated = await updateProduct(42, { sizes: ['30', '32', '34', '36'] });
      assert.deepEqual(state.lastUpdate.sizes, ['30', '32', '34', '36'], 'patch must include updated sizes');
      assert.deepEqual(updated.sizes, ['30', '32', '34', '36']);
    });
  });
});
