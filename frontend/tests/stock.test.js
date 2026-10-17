import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  getStockInfo,
  isSoldOut,
  LOW_STOCK_THRESHOLD,
} from '../src/utils/stock.js';

/**
 * Sold-out / availability logic used by every product entry point
 * (ProductCard, QuickView, ProductPage, WishlistGrid, CartContext).
 *
 * The UI wires these booleans directly:
 *   - <span>SOLD OUT</span> badge + image overlay render when outOfStock
 *   - the Add to Cart button is `disabled={outOfStock}`
 * so asserting the booleans here covers the card rendering decision without a
 * DOM/browser test runner.
 */

test('in-stock product is purchasable and not low', () => {
  const info = getStockInfo({ stockQuantity: 10 });
  assert.equal(info.outOfStock, false);
  assert.equal(info.lowStock, false);
  assert.equal(info.canPurchase, true);
  assert.equal(info.stockQuantity, 10);
  assert.equal(isSoldOut({ stockQuantity: 10 }), false);
});

test('zero stock is sold out', () => {
  const info = getStockInfo({ stockQuantity: 0 });
  assert.equal(info.outOfStock, true);
  assert.equal(info.canPurchase, false);
  assert.equal(info.lowStock, false);
  assert.equal(isSoldOut({ stockQuantity: 0 }), true);
});

test('negative stock (defensive) is sold out', () => {
  assert.equal(getStockInfo({ stockQuantity: -3 }).outOfStock, true);
});

test('missing / undefined product is treated as sold out', () => {
  assert.equal(getStockInfo(undefined).outOfStock, true);
  assert.equal(getStockInfo({}).outOfStock, true);
});

test('inactive product is sold out even when stock remains', () => {
  const info = getStockInfo({ stockQuantity: 10, is_active: false });
  assert.equal(info.outOfStock, true);
  assert.equal(info.inactive, true);
  assert.equal(isSoldOut({ stockQuantity: 10, is_active: false }), true);
});

test('low stock is flagged only within the threshold', () => {
  assert.equal(getStockInfo({ stockQuantity: 1 }).lowStock, true);
  assert.equal(
    getStockInfo({ stockQuantity: LOW_STOCK_THRESHOLD }).lowStock,
    true
  );
  assert.equal(
    getStockInfo({ stockQuantity: LOW_STOCK_THRESHOLD + 1 }).lowStock,
    false
  );
  // low stock is never reported as sold out
  assert.equal(getStockInfo({ stockQuantity: 3 }).outOfStock, false);
});

test('numeric strings from the API are coerced', () => {
  const info = getStockInfo({ stockQuantity: '3' });
  assert.equal(info.stockQuantity, 3);
  assert.equal(info.lowStock, true);
  assert.equal(info.outOfStock, false);
});

test('isSoldOut always returns a boolean', () => {
  assert.equal(typeof isSoldOut({ stockQuantity: 0 }), 'boolean');
  assert.equal(typeof isSoldOut({ stockQuantity: 4 }), 'boolean');
});
