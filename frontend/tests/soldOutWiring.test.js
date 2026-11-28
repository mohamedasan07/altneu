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

test('Sold-out grayscale styling: applied to images across card, quickview, gallery and search', () => {
  // ProductCard wires imgSoldOut and defines filter: grayscale(100%)
  const cardJsx = read('src/components/ProductCard/ProductCard.jsx');
  const cardCss = read('src/components/ProductCard/ProductCard.module.css');
  assert.match(cardJsx, /outOfStock && styles\.imgSoldOut/);
  assert.match(cardCss, /\.imgSoldOut\s*\{[^}]*filter:\s*grayscale\(100%\)/);

  // QuickView wires imgSoldOut and defines filter: grayscale(100%)
  const quickJsx = read('src/components/ui/QuickView/QuickView.jsx');
  const quickCss = read('src/components/ui/QuickView/QuickView.module.css');
  assert.match(quickJsx, /outOfStock && styles\.imgSoldOut/);
  assert.match(quickCss, /\.imgSoldOut\s*\{[^}]*filter:\s*grayscale\(100%\)/);

  // ProductPage passes outOfStock to ProductGallery
  const pageJsx = read('src/pages/ProductPage/ProductPage.jsx');
  assert.match(pageJsx, /<ProductGallery[^>]*outOfStock=\{outOfStock\}/);

  // ProductGallery wires imgSoldOut to mobile & lightbox and passes to subcomponents
  const galleryJsx = read('src/components/product/ProductGallery.jsx');
  const galleryCss = read('src/components/product/ProductGallery.module.css');
  assert.match(galleryJsx, /outOfStock && styles\.imgSoldOut/);
  assert.match(galleryJsx, /<ImageZoom[\s\S]*?outOfStock=\{outOfStock\}/);
  assert.match(galleryJsx, /<ThumbnailStrip[\s\S]*?outOfStock=\{outOfStock\}/);
  assert.match(galleryCss, /\.imgSoldOut\s*\{[^}]*filter:\s*grayscale\(100%\)/);

  // ImageZoom & ThumbnailStrip wire imgSoldOut and define filter: grayscale(100%)
  const zoomJsx = read('src/components/product/ImageZoom.jsx');
  const zoomCss = read('src/components/product/ImageZoom.module.css');
  assert.match(zoomJsx, /outOfStock && styles\.imgSoldOut/);
  assert.match(zoomCss, /\.imgSoldOut\s*\{[^}]*filter:\s*grayscale\(100%\)/);

  const thumbJsx = read('src/components/product/ThumbnailStrip.jsx');
  const thumbCss = read('src/components/product/ThumbnailStrip.module.css');
  assert.match(thumbJsx, /outOfStock && styles\.imgSoldOut/);
  assert.match(thumbCss, /\.imgSoldOut\s*\{[^}]*filter:\s*grayscale\(100%\)/);

  // SearchSuggestions wires imgSoldOut and defines filter: grayscale(100%)
  const searchJsx = read('src/components/search/SearchSuggestions/SearchSuggestions.jsx');
  const searchCss = read('src/components/search/SearchSuggestions/SearchSuggestions.module.css');
  assert.match(searchJsx, /outOfStock && styles\.imgSoldOut/);
  assert.match(searchCss, /\.imgSoldOut\s*\{[^}]*filter:\s*grayscale\(100%\)/);

  // Sold-out overlays are transparent (no dark tint) and SOLD OUT badges use thin subtle white border
  assert.match(cardCss, /\.overlay\s*\{[^}]*background:\s*transparent/);
  assert.match(quickCss, /\.overlay\s*\{[^}]*background:\s*transparent/);
  assert.match(cardCss, /\.badgeSoldOut\s*\{[^}]*border:\s*1px solid rgba\(255,\s*255,\s*255,\s*0\.28\)/);
  assert.match(quickCss, /\.badgeSoldOut\s*\{[^}]*border:\s*1px solid rgba\(255,\s*255,\s*255,\s*0\.28\)/);
});
