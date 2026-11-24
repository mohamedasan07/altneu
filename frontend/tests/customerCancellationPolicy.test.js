import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANCELLABLE_STATUSES, canCancelOrder } from '../src/utils/orderStatus.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(here, '..', rel), 'utf8');

describe('Customer Order Cancellation Policy Alignment (Frontend)', () => {
  // =========================================================================
  // 1. Order Status Utility Contract
  // =========================================================================
  describe('src/utils/orderStatus.js contract', () => {
    test('CANCELLABLE_STATUSES is strictly an empty array per ALTNEU policy', () => {
      assert(Array.isArray(CANCELLABLE_STATUSES));
      assert.strictEqual(CANCELLABLE_STATUSES.length, 0);
    });

    test('canCancelOrder returns false for all standard order statuses', () => {
      const statuses = [
        'pending',
        'confirmed',
        'processing',
        'shipped',
        'delivered',
        'cancelled',
        'refunded',
        'failed',
        'unknown',
        '',
        null,
        undefined,
      ];

      for (const status of statuses) {
        assert.strictEqual(
          canCancelOrder(status),
          false,
          `canCancelOrder must return false for status "${status}"`
        );
      }
    });
  });

  // =========================================================================
  // 2. Storefront Modal & Card UI Button Guards
  // =========================================================================
  describe('UI Cancellation Button Guards', () => {
    test('OrderCard guards Cancel Order button with canCancelOrder(order?.status)', () => {
      const cardSrc = read('src/components/dashboard/OrderCard/OrderCard.jsx');
      assert.match(cardSrc, /canCancelOrder\(order\??\.status\)/);
      assert.match(cardSrc, /Cancel/);
    });

    test('OrderModal guards Cancel Order button with canCancelOrder(order.status)', () => {
      const modalSrc = read('src/components/dashboard/OrderModal/OrderModal.jsx');
      assert.match(modalSrc, /canCancelOrder\(order\.status\)\s*&&\s*onCancelOrder/);
      assert.match(modalSrc, /Cancel Order/);
    });
  });

  // =========================================================================
  // 3. Support & Statutory Remedy Path Preservation
  // =========================================================================
  describe('Statutory Consumer Remedy & Customer Support Path', () => {
    test('OrderModal includes a prominent support link to /contact in the footer', () => {
      const modalSrc = read('src/components/dashboard/OrderModal/OrderModal.jsx');
      assert.match(modalSrc, /import\s*\{[^}]*Link[^}]*\}\s*from\s*'react-router-dom'/);
      assert.match(modalSrc, /<Link[^>]*to="\/contact"[^>]*className=\{styles\.supportBtn\}[^>]*>\s*Support\s*<\/Link>/);
    });

    test('OrdersPage handleNotCancellable directs customer to support for order inquiries or statutory remedies', () => {
      const ordersPageSrc = read('src/pages/OrdersPage/OrdersPage.jsx');
      assert.match(
        ordersPageSrc,
        /Order cancellation is not available\. For order inquiries or statutory remedies, please contact support\./
      );
    });

    test('DashboardPage handleNotCancellable directs customer to support for order inquiries or statutory remedies', () => {
      const dashboardPageSrc = read('src/pages/DashboardPage/DashboardPage.jsx');
      assert.match(
        dashboardPageSrc,
        /Order cancellation is not available\. For order inquiries or statutory remedies, please contact support\./
      );
    });
  });
});
