import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Wiring contract for the sold-out UI.
 *
 * This project has no DOM/browser test runner (no vitest/jsdom), and the React
 * components import Vite-only modules (CSS modules, import.meta.env) that plain
 * Node cannot load. The availability *decisions* are covered by the pure-logic
 * tests in stock.test.js; these assertions guard the JSX wiring those decisions
 * feed — the SOLD OUT badge, the dimming overlay, and the disabled Add to Cart
 * button — so a regression cannot silently drop them.
 *
 * Read the files as text rather than importing them so no bundler is needed.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(here, '..', rel), 'utf8');

test('ProductCard: SOLD OUT badge, overlay and disabled Add to Cart', () => {
  const src = read('src/components/ProductCard/ProductCard.jsx');

  assert.match(src, /const \{[^}]*\boutOfStock\b[^}]*\} = getStockInfo\(product\)/);
  assert.match(src, /styles\.badgeSoldOut/);
  assert.match(src, /styles\.overlay/);
  assert.match(src, /disabled=\{outOfStock\}/);
  assert.match(src, /outOfStock \? 'Sold Out' : 'Add to Cart'/);
  // Faded "Out of stock" paragraph is gone.
  assert.doesNotMatch(src, /styles\.stock/);
  assert.doesNotMatch(src, /Out of stock/);
});

test('QuickView: SOLD OUT badge, overlay, disabled Add to Cart and click guard', () => {
  const src = read('src/components/ui/QuickView/QuickView.jsx');

  assert.match(src, /const \{[^}]*\boutOfStock\b[^}]*\} = getStockInfo\(product\)/);
  assert.match(src, /styles\.badgeSoldOut/);
  assert.match(src, /styles\.overlay/);
  assert.match(src, /disabled=\{outOfStock\}/);
  assert.match(src, /if \(outOfStock\) return;/);
  assert.doesNotMatch(src, /styles\.stock/);
});

test('ProductPage: SOLD OUT badge, readable availability and disabled actions', () => {
  const src = read('src/pages/ProductPage/ProductPage.jsx');

  assert.match(src, /const \{[^}]*\boutOfStock\b[^}]*\} = getStockInfo\(product\)/);
  assert.match(src, /styles\.soldOutBadge/);
  assert.match(src, /styles\.availabilityOut/);
  // Add to Cart and Buy Now both disable when sold out.
  const disabledCount = (src.match(/disabled=\{outOfStock\}/g) || []).length;
  assert.ok(disabledCount >= 2, `expected >=2 disabled={outOfStock}, saw ${disabledCount}`);
});

test('CartContext: refuses sold-out products as a defensive guard', () => {
  const src = read('src/context/CartContext.jsx');
  assert.match(src, /getStockInfo\(product\)\.outOfStock/);
});

test('WishlistGrid: Move to Cart is disabled for sold-out items', () => {
  const src = read('src/components/wishlist/WishlistGrid/WishlistGrid.jsx');
  assert.match(src, /disabled=\{soldOut\}/);
  assert.match(src, /const soldOut = getStockInfo\(product\)\.outOfStock/);
});
