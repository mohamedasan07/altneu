import { test } from 'node:test';
import assert from 'node:assert/strict';

import { setSupabaseClient } from '../database/client.js';
import { addItem } from '../services/cart.service.js';

/**
 * Backend out-of-stock / availability enforcement for cart adds.
 *
 * The storefront disables the Add to Cart button, but the client is never
 * trusted: POST /api/customer/cart/items must reject sold-out products on the
 * server. These tests drive the real cart service through the repository layer
 * using the `setSupabaseClient` test hook (backend/database/client.js), so no
 * database or network is involved.
 *
 * The products query is the only table touched before every rejection below —
 * the stub throws on any other table, which also proves the request is refused
 * *before* any cart row is read or written.
 */
const OWNER = { session_id: 'sess-test-0001' };

function stubProduct(product) {
  const calls = [];
  const builder = {
    select(columns) {
      calls.push({ op: 'select', columns });
      return builder;
    },
    eq(column, value) {
      calls.push({ op: 'eq', column, value });
      return builder;
    },
    maybeSingle: async () => ({ data: product ?? null, error: null }),
  };

  const client = {
    from(table) {
      if (table !== 'products') {
        throw new Error(
          `Unexpected table "${table}" — the product guard should reject before any cart query`
        );
      }
      calls.push({ op: 'from', table });
      return builder;
    },
  };

  return { client, calls };
}

test('addItem rejects a product with zero stock', async () => {
  setSupabaseClient(stubProduct({ id: 1, is_active: true, stock_quantity: 0 }).client);

  await assert.rejects(
    () => addItem(OWNER, { productId: 1, size: 'M', color: 'black', quantity: 1 }),
    (err) => {
      assert.equal(err.name, 'ApiError');
      assert.equal(err.status, 400);
      assert.match(err.message, /out of stock/i);
      return true;
    }
  );
});

test('addItem rejects an inactive product even when stock remains', async () => {
  setSupabaseClient(stubProduct({ id: 1, is_active: false, stock_quantity: 25 }).client);

  await assert.rejects(
    () => addItem(OWNER, { productId: 1 }),
    (err) => {
      assert.equal(err.name, 'ApiError');
      assert.equal(err.status, 400);
      assert.match(err.message, /no longer available/i);
      return true;
    }
  );
});

test('addItem rejects a quantity greater than available stock', async () => {
  setSupabaseClient(stubProduct({ id: 1, is_active: true, stock_quantity: 3 }).client);

  await assert.rejects(
    () => addItem(OWNER, { productId: 1, quantity: 5 }),
    (err) => {
      assert.equal(err.name, 'ApiError');
      assert.equal(err.status, 400);
      assert.match(err.message, /Only 3 units available/i);
      return true;
    }
  );
});

test('addItem 404s for an unknown product', async () => {
  setSupabaseClient(stubProduct(null).client);

  await assert.rejects(
    () => addItem(OWNER, { productId: 999 }),
    (err) => {
      assert.equal(err.name, 'ApiError');
      assert.equal(err.status, 404);
      assert.match(err.message, /Product not found/i);
      return true;
    }
  );
});

test('the product lookup is scoped to the requested id', async () => {
  const { client, calls } = stubProduct({ id: 7, is_active: true, stock_quantity: 0 });
  setSupabaseClient(client);

  await assert.rejects(() => addItem(OWNER, { productId: 7 }));

  const eq = calls.find((c) => c.op === 'eq');
  assert.deepEqual(eq, { op: 'eq', column: 'id', value: 7 });
});
