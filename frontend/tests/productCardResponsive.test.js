import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Responsive contract for ProductCard Quick View.
 *
 * Requirements:
 * - Mobile view (<= 767px): Quick View eye icon and actions are completely hidden.
 * - Desktop view (>= 768px): Quick View eye icon is vertically aligned with Wishlist and revealed on hover.
 * - Touch devices (hover: none): Wishlist heart remains visible; Quick View is restricted to >= 768px.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.join(here, '..', 'src/components/ProductCard/ProductCard.module.css'), 'utf8');

test('ProductCard responsive: Quick View overlay is suppressed on mobile (<= 767px)', () => {
  // Must contain media query for mobile screens up to 767px
  assert.match(css, /@media\s*\(\s*max-width:\s*767px\s*\)/i);

  // Must hide .quickView / .quickWrap on mobile
  const mobileMatch = css.match(/@media\s*\(\s*max-width:\s*767px\s*\)\s*\{([^}]+)\}/i);
  assert.ok(mobileMatch, 'Mobile media query block must exist');
  assert.match(mobileMatch[1], /\.quickView\s*\{[^}]*display:\s*none\s*!important/i);
});

test('ProductCard responsive: Desktop view retains hover behavior and Quick View eye icon styling', () => {
  // Desktop action group aligns Wishlist and Quick View vertically
  assert.match(css, /\.actionGroup\s*\{[^}]*position:\s*absolute/);
  assert.match(css, /\.actionGroup\s*\{[^}]*flex-direction:\s*column/);

  // Desktop hover rule reveals .quickView
  assert.match(css, /\.card:hover\s+\.quickView\s*\{[^}]*opacity:\s*1/);
  assert.match(css, /\.card:hover\s+\.quickView\s*\{[^}]*transform:\s*translateY\(0\)/);
});

test('ProductCard responsive: Touch devices keep Wishlist visible while guarding Quick View to desktop', () => {
  // Touch media query keeps Wishlist visible
  assert.match(css, /@media\s*\(\s*hover:\s*none\s*\)\s*\{[^}]*\.wishlist\s*\{[^}]*opacity:\s*1/i);

  // Quick View on touch devices is scoped to >= 768px
  assert.match(css, /@media\s*\(\s*min-width:\s*768px\s*\)\s*\{[^}]*\.quickView\s*\{[^}]*opacity:\s*1/i);
});
