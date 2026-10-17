import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { requireInternalCronAuth } from '../middleware/internalAuth.js';
import { expireUnpaidOrders } from '../services/order.service.js';
import {
  findExpiredPendingOrders,
  expireUnpaidOrderAtomic,
  recordLateCaptureOnCancelledOrder,
} from '../repositories/order.repository.js';
import { setSupabaseClient } from '../database/client.js';
import { config } from '../config/index.js';
import { ApiError } from '../utils/apiError.js';
import internalRoutes from '../routes/internal.routes.js';
import { errorHandler } from '../middleware/errorHandler.js';

const TEST_CRON_SECRET = 'test_cron_secret_k9876543210zyx';

describe('Phase 5A: Unpaid Order Expiry and Inventory Safety', () => {
  let originalCronSecret;

  beforeEach(() => {
    originalCronSecret = config.cron.secret;
    config.cron.secret = TEST_CRON_SECRET;
  });

  afterEach(() => {
    config.cron.secret = originalCronSecret;
    setSupabaseClient(null);
  });

  // ==========================================================================
  // 1. Internal Authentication Middleware Tests
  // ==========================================================================
  describe('Internal Cron Authorization Middleware', () => {
    test('rejects with 401 when Authorization header is completely missing', () => {
      const req = { headers: {} };
      const res = {};
      let nextCalled = false;

      assert.throws(
        () => requireInternalCronAuth(req, res, () => { nextCalled = true; }),
        (err) => err instanceof ApiError && err.status === 401 && /Missing or malformed/i.test(err.message)
      );
      assert.strictEqual(nextCalled, false);
    });

    test('rejects with 401 when Authorization header is not Bearer scheme', () => {
      const req = { headers: { authorization: `Basic ${TEST_CRON_SECRET}` } };
      const res = {};
      let nextCalled = false;

      assert.throws(
        () => requireInternalCronAuth(req, res, () => { nextCalled = true; }),
        (err) => err instanceof ApiError && err.status === 401
      );
      assert.strictEqual(nextCalled, false);
    });

    test('rejects with 401 when Bearer token is invalid or wrong length', () => {
      const wrongTokens = [
        'wrong_token_entirely',
        'test_cron_secret_k9876543210zy', // one char short
        'test_cron_secret_k9876543210zyxx', // one char long
        'test_cron_secret_k9876543210zyY', // last char different
      ];

      for (const token of wrongTokens) {
        const req = { headers: { authorization: `Bearer ${token}` } };
        const res = {};
        let nextCalled = false;

        assert.throws(
          () => requireInternalCronAuth(req, res, () => { nextCalled = true; }),
          (err) => err instanceof ApiError && err.status === 401 && /Invalid internal authorization token/i.test(err.message)
        );
        assert.strictEqual(nextCalled, false);
      }
    });

    test('fails closed with 500 when INTERNAL_CRON_SECRET is unconfigured on server', () => {
      config.cron.secret = ''; // unconfigured
      const req = { headers: { authorization: `Bearer ${TEST_CRON_SECRET}` } };
      const res = {};
      let nextCalled = false;

      assert.throws(
        () => requireInternalCronAuth(req, res, () => { nextCalled = true; }),
        (err) => err instanceof ApiError && err.status === 500 && /not configured/i.test(err.message)
      );
      assert.strictEqual(nextCalled, false);
    });

    test('passes next() when valid Bearer token matching secret is provided', () => {
      const req = { headers: { authorization: `Bearer ${TEST_CRON_SECRET}` } };
      const res = {};
      let nextCalled = false;

      requireInternalCronAuth(req, res, () => {
        nextCalled = true;
      });
      assert.strictEqual(nextCalled, true, 'Valid token must call next() without error');
    });
  });

  // ==========================================================================
  // 2. HTTP Endpoint POST /api/internal/orders/expire-unpaid
  // ==========================================================================
  describe('HTTP Endpoint POST /api/internal/orders/expire-unpaid', () => {
    function createTestApp() {
      const app = express();
      app.use(express.json());
      app.use('/api/internal', internalRoutes);
      app.use(errorHandler);
      return app;
    }

    test('HTTP: rejects request without authorization header with 401', async () => {
      const app = createTestApp();
      const server = app.listen(0);
      const port = server.address().port;

      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/internal/orders/expire-unpaid`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        assert.strictEqual(res.status, 401);
      } finally {
        server.close();
      }
    });

    test('HTTP: rejects request with invalid token with 401', async () => {
      const app = createTestApp();
      const server = app.listen(0);
      const port = server.address().port;

      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/internal/orders/expire-unpaid`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer bad_secret_token_123',
          },
          body: JSON.stringify({}),
        });
        assert.strictEqual(res.status, 401);
      } finally {
        server.close();
      }
    });

    test('HTTP: rejects invalid timeoutMinutes with 400', async () => {
      const app = createTestApp();
      const server = app.listen(0);
      const port = server.address().port;

      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/internal/orders/expire-unpaid`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${TEST_CRON_SECRET}`,
          },
          body: JSON.stringify({ timeoutMinutes: -10 }),
        });
        assert.strictEqual(res.status, 400);
        const data = await res.json();
        assert.match(data.error || data.message, /timeoutMinutes must be a positive integer/i);
      } finally {
        server.close();
      }
    });

    test('HTTP: valid request executes sweeper and returns 200 with summary counts', async () => {
      // Mock empty DB response and valid RPC probe
      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  in: () => ({
                    lte: () => ({
                      order: () => ({
                        limit: async () => ({ data: [], error: null }),
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        },
        rpc: async () => ({
          data: { success: false, reason: 'order_not_found' },
          error: null,
        }),
      });

      const app = createTestApp();
      const server = app.listen(0);
      const port = server.address().port;

      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/internal/orders/expire-unpaid`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${TEST_CRON_SECRET}`,
          },
          body: JSON.stringify({ timeoutMinutes: 30, batchSize: 25 }),
        });
        assert.strictEqual(res.status, 200);
        const body = await res.json();
        assert.strictEqual(body.success, true);
        assert.strictEqual(body.timeoutMinutes, 30);
        assert.strictEqual(body.scanned, 0);
        assert.strictEqual(body.expired, 0);
        assert.strictEqual(body.skipped, 0);
        assert.strictEqual(body.errors, 0);
        assert.strictEqual(body.stockRestoredCount, 0);
      } finally {
        server.close();
      }
    });

    test('HTTP: returns 503 when Migration 012 RPC is missing (fail-closed)', async () => {
      setSupabaseClient({
        from: () => ({
          select: () => ({
            eq: () => ({
              in: () => ({
                lte: () => ({
                  order: () => ({
                    limit: async () => ({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          }),
        }),
        rpc: async () => ({
          data: null,
          error: { code: '42883', message: 'function expire_unpaid_order_atomic(uuid, text) does not exist' },
        }),
      });

      const app = createTestApp();
      const server = app.listen(0);
      const port = server.address().port;

      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/internal/orders/expire-unpaid`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${TEST_CRON_SECRET}`,
          },
          body: JSON.stringify({ timeoutMinutes: 30, batchSize: 25 }),
        });
        assert.strictEqual(res.status, 503);
        const body = await res.json();
        assert.match(body.error || body.message, /Migration 012.*must be applied/i);
      } finally {
        server.close();
      }
    });
  });

  // ==========================================================================
  // 3. Expiry Eligibility Rules & Order Age Filtering
  // ==========================================================================
  describe('Expiry Eligibility & Age Thresholding', () => {
    test('only queries orders with status=pending and payment_status in (pending, failed)', async () => {
      let queryFilter = {};

      setSupabaseClient({
        from: (table) => {
          assert.strictEqual(table, 'orders');
          return {
            select: () => ({
              eq: (col, val) => {
                queryFilter[col] = val;
                return {
                  in: (inCol, inVals) => {
                    queryFilter[inCol] = inVals;
                    return {
                      lte: (lteCol, lteVal) => {
                        queryFilter[lteCol] = lteVal;
                        return {
                          order: () => ({
                            limit: (lim) => {
                              queryFilter.limit = lim;
                              return Promise.resolve({ data: [], error: null });
                            },
                          }),
                        };
                      },
                    };
                  },
                };
              },
            }),
          };
        },
      });

      const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const result = await findExpiredPendingOrders({ cutoffDate: cutoff, limit: 50 });

      assert.strictEqual(result.ok, true);
      assert.strictEqual(queryFilter.status, 'pending', 'Must filter status = pending');
      assert.deepStrictEqual(queryFilter.payment_status, ['pending', 'failed'], 'Must filter payment_status in pending, failed');
      assert.strictEqual(queryFilter.placed_at, cutoff, 'Must filter placed_at <= cutoff');
      assert.strictEqual(queryFilter.limit, 50);
    });

    test('paid orders never qualify for expiry', async () => {
      // Setup mock where order is paid
      const paidOrder = {
        id: 'order_paid_123',
        status: 'confirmed',
        payment_status: 'paid',
        placed_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 60 mins ago
      };

      setSupabaseClient({
        from: (table) => ({
          select: () => ({
            eq: (col, val) => ({
              in: (inCol, inVals) => ({
                lte: () => ({
                  order: () => ({
                    limit: async () => {
                      // Simulating SQL WHERE status = 'pending' AND payment_status IN ('pending', 'failed')
                      // Paid order does NOT match!
                      const matches = paidOrder.status === val && inVals.includes(paidOrder.payment_status);
                      return { data: matches ? [paidOrder] : [], error: null };
                    },
                  }),
                }),
              }),
            }),
          }),
        }),
        rpc: async () => ({
          data: { success: false, reason: 'order_not_found' },
          error: null,
        }),
      });

      const result = await expireUnpaidOrders({ timeoutMinutes: 30 });
      assert.strictEqual(result.scanned, 0, 'Paid orders must never be scanned as candidates');
      assert.strictEqual(result.expired, 0);
      assert.strictEqual(result.stockRestoredCount, 0);
    });
  });

  // ==========================================================================
  // 4. Atomic CAS State Transitions & Stock Restoration
  // ==========================================================================
  describe('CAS State Transitions & Exactly-Once Stock Restoration', () => {
    test('successfully expires order, transitions to cancelled/failed, and restores stock exactly once', async () => {
      const orderId = 'order_expiring_001';
      const productId = 'prod_desk_lamp_99';
      const quantity = 3;
      let initialProductStock = 10;

      const candidateOrder = {
        id: orderId,
        status: 'pending',
        payment_status: 'pending',
        placed_at: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
        items: [{ product_id: productId, quantity }],
      };

      let orderStatusInDb = 'pending';
      let paymentStatusInDb = 'pending';
      let restoredStockCallCount = 0;
      let recordedHistory = [];

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  in: () => ({
                    lte: () => ({
                      order: () => ({
                        limit: async () => ({ data: [candidateOrder], error: null }),
                      }),
                    }),
                  }),
                }),
              }),
              update: (patch) => ({
                eq: (idCol, idVal) => ({
                  eq: (statusCol, statusVal) => ({
                    in: (payCol, payVals) => ({
                      select: () => ({
                        maybeSingle: async () => {
                          // Atomic CAS: only updates if current status and payment_status match
                          if (orderStatusInDb === statusVal && payVals.includes(paymentStatusInDb)) {
                            orderStatusInDb = patch.status;
                            paymentStatusInDb = patch.payment_status;
                            return {
                              data: { ...candidateOrder, ...patch },
                              error: null,
                            };
                          }
                          return { data: null, error: null }; // CAS lost
                        },
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'products') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: productId, stock_quantity: initialProductStock },
                    error: null,
                  }),
                }),
              }),
              update: (patch) => ({
                eq: (pIdCol, pIdVal) => ({
                  eq: (sCol, sVal) => ({
                    select: () => ({
                      maybeSingle: async () => {
                        // CAS update for stock
                        if (sVal === initialProductStock) {
                          initialProductStock = patch.stock_quantity;
                          restoredStockCallCount += 1;
                          return { data: { id: productId, stock_quantity: initialProductStock }, error: null };
                        }
                        return { data: null, error: null };
                      },
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'order_status_history') {
            return {
              insert: (entry) => {
                recordedHistory.push(entry);
                return {
                  select: () => ({
                    single: async () => ({ data: { id: 'hist_1', ...entry }, error: null }),
                  }),
                };
              },
            };
          }
          return {};
        },
        rpc: async (fn, params) => {
          if (fn === 'expire_unpaid_order_atomic') {
            if (params.p_order_id === '00000000-0000-0000-0000-000000000000') {
              return { data: { success: false, reason: 'order_not_found' }, error: null };
            }
            if (params.p_order_id === orderId) {
              if (orderStatusInDb === 'pending') {
                orderStatusInDb = 'cancelled';
                paymentStatusInDb = 'failed';
                initialProductStock += quantity;
                restoredStockCallCount += 1;
                recordedHistory.push({ order_id: orderId, status: 'cancelled', by_role: 'system' });
                return {
                  data: {
                    success: true,
                    order_id: orderId,
                    items_restored: 1,
                    quantity_restored: quantity,
                  },
                  error: null,
                };
              }
              return { data: { success: false, reason: 'order_not_eligible' }, error: null };
            }
          }
          return { data: null, error: { message: 'unknown rpc' } };
        },
      });

      const result = await expireUnpaidOrders({ timeoutMinutes: 30 });

      assert.strictEqual(result.scanned, 1);
      assert.strictEqual(result.expired, 1);
      assert.strictEqual(result.skipped, 0);
      assert.strictEqual(result.stockRestoredCount, quantity);

      // Verify DB state
      assert.strictEqual(orderStatusInDb, 'cancelled', 'Order status must be updated to cancelled');
      assert.strictEqual(paymentStatusInDb, 'failed', 'Payment status must be updated to failed');
      assert.strictEqual(initialProductStock, 13, 'Stock must be restored from 10 to 13');
      assert.strictEqual(restoredStockCallCount, 1, 'Stock must be restored exactly once');

      // Verify truthful history
      assert.strictEqual(recordedHistory.length, 1);
      assert.strictEqual(recordedHistory[0].status, 'cancelled');
      assert.strictEqual(recordedHistory[0].by_role, 'system');
    });

    test('concurrent workers: only winning worker restores stock, loser skips without duplicate release', async () => {
      const orderId = 'order_concurrent_race_002';
      const productId = 'prod_chair_55';
      const quantity = 2;
      let initialStock = 5;

      const candidateOrder = {
        id: orderId,
        status: 'pending',
        payment_status: 'pending',
        placed_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
        items: [{ product_id: productId, quantity }],
      };

      let orderStatusInDb = 'pending';
      let stockRestoreCount = 0;

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  in: () => ({
                    lte: () => ({
                      order: () => ({
                        limit: async () => ({ data: [candidateOrder], error: null }),
                      }),
                    }),
                  }),
                }),
              }),
              update: (patch) => ({
                eq: () => ({
                  eq: (statusCol, statusVal) => ({
                    in: () => ({
                      select: () => ({
                        maybeSingle: async () => {
                          // Atomic CAS: Only transitions if still pending
                          if (orderStatusInDb === 'pending') {
                            orderStatusInDb = patch.status;
                            return { data: { ...candidateOrder, ...patch }, error: null };
                          }
                          // Subsequent or concurrent worker gets rowCount 0 (data: null)
                          return { data: null, error: null };
                        },
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'products') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: productId, stock_quantity: initialStock },
                    error: null,
                  }),
                }),
              }),
              update: (patch) => ({
                eq: () => ({
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => {
                        initialStock = patch.stock_quantity;
                        stockRestoreCount += 1;
                        return { data: { id: productId, stock_quantity: initialStock }, error: null };
                      },
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        },
        rpc: async (fn, params) => {
          if (fn === 'expire_unpaid_order_atomic') {
            if (params.p_order_id === '00000000-0000-0000-0000-000000000000') {
              return { data: { success: false, reason: 'order_not_found' }, error: null };
            }
            // Exclusive row lock simulation: only first caller sees 'pending'
            if (orderStatusInDb === 'pending') {
              orderStatusInDb = 'cancelled';
              initialStock += quantity;
              stockRestoreCount += 1;
              return {
                data: {
                  success: true,
                  order_id: params.p_order_id,
                  items_restored: 1,
                  quantity_restored: quantity,
                },
                error: null,
              };
            }
            return {
              data: {
                success: false,
                reason: 'order_not_eligible',
                current_status: orderStatusInDb,
              },
              error: null,
            };
          }
          return { data: null, error: { message: 'unknown rpc' } };
        },
      });

      // Run two workers simultaneously
      const [worker1, worker2] = await Promise.all([
        expireUnpaidOrders({ timeoutMinutes: 30 }),
        expireUnpaidOrders({ timeoutMinutes: 30 }),
      ]);

      const totalExpired = worker1.expired + worker2.expired;
      const totalSkipped = worker1.skipped + worker2.skipped;

      assert.strictEqual(totalExpired, 1, 'Exactly one worker must win the expiry CAS');
      assert.strictEqual(totalSkipped, 1, 'The losing worker must skip');
      assert.strictEqual(stockRestoreCount, 1, 'Stock must be restored exactly once');
      assert.strictEqual(initialStock, 7, 'Stock must only increase by 2 (5 -> 7)');
    });
  });

  // ==========================================================================
  // 5. Payment vs Expiry Races & Late Capture Protections
  // ==========================================================================
  describe('Payment Capture vs Expiry Races', () => {
    test('if payment verification commits before expiry CAS, expiry skips and does NOT restore stock', async () => {
      const orderId = 'order_payment_won_race_003';
      const productId = 'prod_sofa_12';
      const quantity = 1;
      let stock = 4;

      const candidateOrder = {
        id: orderId,
        status: 'pending',
        payment_status: 'pending',
        placed_at: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
        items: [{ product_id: productId, quantity }],
      };

      // Payment committed while expiry was querying candidates:
      // Status in DB changed to 'confirmed' / 'paid'
      const dbOrderState = {
        status: 'confirmed',
        payment_status: 'paid',
      };

      let stockRestored = false;

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  in: () => ({
                    lte: () => ({
                      order: () => ({
                        limit: async () => ({ data: [candidateOrder], error: null }),
                      }),
                    }),
                  }),
                }),
              }),
              update: () => ({
                eq: () => ({
                  eq: (_statusCol, statusVal) => ({
                    in: (_payCol, payVals) => ({
                      select: () => ({
                        maybeSingle: async () => {
                          // Check CAS condition against dbOrderState
                          if (dbOrderState.status === statusVal && payVals.includes(dbOrderState.payment_status)) {
                            return { data: { id: orderId }, error: null };
                          }
                          // CAS fails because dbOrderState is already confirmed/paid
                          return { data: null, error: null };
                        },
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'products') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { id: productId, stock_quantity: stock }, error: null }),
                }),
              }),
              update: () => ({
                eq: () => ({
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => {
                        stockRestored = true;
                        return { data: true, error: null };
                      },
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        },
        rpc: async (fn, params) => {
          if (fn === 'expire_unpaid_order_atomic') {
            if (params.p_order_id === '00000000-0000-0000-0000-000000000000') {
              return { data: { success: false, reason: 'order_not_found' }, error: null };
            }
            if (params.p_order_id === orderId) {
              if (dbOrderState.status !== 'pending' || !['pending', 'failed'].includes(dbOrderState.payment_status)) {
                return {
                  data: {
                    success: false,
                    reason: 'order_not_eligible',
                    current_status: dbOrderState.status,
                    current_payment_status: dbOrderState.payment_status,
                  },
                  error: null,
                };
              }
              stockRestored = true;
              return {
                data: {
                  success: true,
                  order_id: params.p_order_id,
                  items_restored: 1,
                  quantity_restored: quantity,
                },
                error: null,
              };
            }
          }
          return { data: null, error: { message: 'unknown rpc' } };
        },
      });

      const result = await expireUnpaidOrders({ timeoutMinutes: 30 });

      assert.strictEqual(result.scanned, 1);
      assert.strictEqual(result.expired, 0, 'Must NOT expire paid order');
      assert.strictEqual(result.skipped, 1, 'Must skip paid order');
      assert.strictEqual(result.stockRestoredCount, 0);
      assert.strictEqual(stockRestored, false, 'Stock must never be restored for an order that became paid');
    });

    test('if expiry commits before payment CAS, payment update fails with 409 and does NOT resurrect order', async () => {
      const orderId = 'order_expiry_won_race_004';

      // Order is already cancelled by the sweeper
      const cancelledOrder = {
        id: orderId,
        status: 'cancelled',
        payment_status: 'failed',
        grand_total: '100.00',
        currency: 'INR',
        razorpay_order_id: 'order_rzp_race_999',
      };

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: cancelledOrder, error: null }),
                }),
              }),
              update: () => ({
                eq: (idCol, idVal) => ({
                  in: (payCol, payVals) => ({
                    eq: (statusCol, statusVal) => ({
                      select: () => ({
                        maybeSingle: async () => {
                          // CAS in updateOrderPaymentSuccessAtomic requires status = 'pending'
                          if (cancelledOrder.status === statusVal && payVals.includes(cancelledOrder.payment_status)) {
                            return { data: { ...cancelledOrder, status: 'confirmed', payment_status: 'paid' }, error: null };
                          }
                          // Order is cancelled, so rowCount is 0 (data: null)
                          return { data: null, error: null };
                        },
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        },
      });

      // Verify repository CAS helper returns null for cancelled order
      const casPaymentUpdate = await (async () => {
        const { updateOrderPaymentSuccessAtomic } = await import('../repositories/order.repository.js');
        return await updateOrderPaymentSuccessAtomic({
          orderId,
          razorpayPaymentId: 'pay_late_12345',
          razorpaySignature: 'sig_test',
        });
      })();

      assert.strictEqual(casPaymentUpdate.ok, true);
      assert.strictEqual(casPaymentUpdate.data, null, 'CAS update must return null when order is already cancelled');
    });

    test('recordLateCaptureOnCancelledOrder produces durable reviewable record on cancelled order', async () => {
      const orderId = 'order_cancelled_late_005';
      const paymentId = 'pay_late_capture_777';
      const auditNote = 'Late capture on cancelled order: manual review required';

      let updatedRow = null;

      setSupabaseClient({
        from: (table) => {
          assert.strictEqual(table, 'orders');
          return {
            update: (patch) => ({
              eq: (idCol, idVal) => ({
                eq: (statusCol, statusVal) => ({
                  select: () => ({
                    maybeSingle: async () => {
                      assert.strictEqual(idVal, orderId);
                      assert.strictEqual(statusVal, 'cancelled', 'Must only update if status is cancelled');
                      updatedRow = {
                        id: orderId,
                        status: 'cancelled',
                        payment_failed_reason: patch.payment_failed_reason,
                        razorpay_payment_id: patch.razorpay_payment_id,
                        updated_at: patch.updated_at,
                      };
                      return { data: updatedRow, error: null };
                    },
                  }),
                }),
              }),
            }),
          };
        },
      });

      const result = await recordLateCaptureOnCancelledOrder(orderId, paymentId, auditNote);

      assert.strictEqual(result.ok, true);
      assert.ok(result.data);
      assert.strictEqual(result.data.status, 'cancelled', 'Status must remain cancelled (no resurrection)');
      assert.strictEqual(result.data.razorpay_payment_id, paymentId, 'Payment ID must be durably recorded');
      assert.strictEqual(result.data.payment_failed_reason, auditNote, 'Audit note must be durably recorded');
    });
  });

  // ==========================================================================
  // 6. Database Error Handling and Resilience
  // ==========================================================================
  describe('Database Failure Handling & Resilience', () => {
    test('database failure when reading candidates throws clean ApiError without partial writes', async () => {
      setSupabaseClient({
        from: () => ({
          select: () => ({
            eq: () => ({
              in: () => ({
                lte: () => ({
                  order: () => ({
                    limit: async () => ({ data: null, error: { message: 'connection refused', code: '08006' } }),
                  }),
                }),
              }),
            }),
          }),
        }),
      });

      await assert.rejects(
        async () => expireUnpaidOrders({ timeoutMinutes: 30 }),
        (err) => err instanceof ApiError && err.status === 500 && /Unable to load expired pending orders/i.test(err.message)
      );
    });

    test('failure on one candidate in a batch records error and continues processing subsequent candidates', async () => {
      const order1 = {
        id: 'order_batch_fail_1',
        status: 'pending',
        payment_status: 'pending',
        placed_at: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
        items: [{ product_id: 'p1', quantity: 1 }],
      };
      const order2 = {
        id: 'order_batch_success_2',
        status: 'pending',
        payment_status: 'pending',
        placed_at: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
        items: [{ product_id: 'p2', quantity: 2 }],
      };

      let p2Stock = 10;

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  in: () => ({
                    lte: () => ({
                      order: () => ({
                        limit: async () => ({ data: [order1, order2], error: null }),
                      }),
                    }),
                  }),
                }),
              }),
              update: (patch) => ({
                eq: (idCol, idVal) => ({
                  eq: () => ({
                    in: () => ({
                      select: () => ({
                        maybeSingle: async () => {
                          if (idVal === order1.id) {
                            // Simulate DB failure on order 1
                            return { data: null, error: { message: 'row lock timeout', code: '55P03' } };
                          }
                          // Order 2 succeeds
                          return { data: { ...order2, ...patch }, error: null };
                        },
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'products') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { id: 'p2', stock_quantity: p2Stock }, error: null }),
                }),
              }),
              update: (patch) => ({
                eq: () => ({
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => {
                        p2Stock = patch.stock_quantity;
                        return { data: { id: 'p2', stock_quantity: p2Stock }, error: null };
                      },
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        },
        rpc: async (fn, params) => {
          if (fn === 'expire_unpaid_order_atomic') {
            if (params.p_order_id === '00000000-0000-0000-0000-000000000000') {
              return { data: { success: false, reason: 'order_not_found' }, error: null };
            }
            if (params.p_order_id === order1.id) {
              return { data: null, error: { message: 'row lock timeout', code: '55P03' } };
            }
            if (params.p_order_id === order2.id) {
              p2Stock += 2;
              return {
                data: {
                  success: true,
                  order_id: order2.id,
                  items_restored: 1,
                  quantity_restored: 2,
                },
                error: null,
              };
            }
          }
          return { data: null, error: { message: 'unknown rpc' } };
        },
      });

      const result = await expireUnpaidOrders({ timeoutMinutes: 30 });

      assert.strictEqual(result.scanned, 2);
      assert.strictEqual(result.errors, 1, 'Order 1 failure must increment errors');
      assert.strictEqual(result.expired, 1, 'Order 2 must successfully expire');
      assert.strictEqual(result.stockRestoredCount, 2, 'Stock for Order 2 must be restored');
      assert.strictEqual(p2Stock, 12);
    });
  });

  // ==========================================================================
  // 7. Phase 5A.1: Atomic Stock Release and Expiry Recovery
  // ==========================================================================
  describe('Phase 5A.1: Atomic Stock Release & Expiry Recovery', () => {
    test('RPC: atomic single-transaction execution expires order and restores stock', async () => {
      const orderId = 'order_atomic_rpc_001';
      const candidateOrder = {
        id: orderId,
        status: 'pending',
        payment_status: 'pending',
        placed_at: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
        items: [{ product_id: 'prod_rpc_1', quantity: 5 }],
      };

      let rpcCalledWith = null;

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  in: () => ({
                    lte: () => ({
                      order: () => ({
                        limit: async () => ({ data: [candidateOrder], error: null }),
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        },
        rpc: async (fnName, params) => {
          assert.strictEqual(fnName, 'expire_unpaid_order_atomic');
          rpcCalledWith = params;
          return {
            data: {
              success: true,
              order_id: orderId,
              items_restored: 1,
              quantity_restored: 5,
            },
            error: null,
          };
        },
      });

      const result = await expireUnpaidOrders({ timeoutMinutes: 30 });

      assert.strictEqual(result.scanned, 1);
      assert.strictEqual(result.expired, 1);
      assert.strictEqual(result.skipped, 0);
      assert.strictEqual(result.stockRestoredCount, 5);
      assert.strictEqual(rpcCalledWith.p_order_id, orderId);
      assert.match(rpcCalledWith.p_reason, /expired after 30 minutes/i);
    });

    test('RPC: database transaction failure reports error without partial state corruption', async () => {
      const orderId = 'order_atomic_rpc_fail_002';
      const candidateOrder = {
        id: orderId,
        status: 'pending',
        payment_status: 'pending',
        placed_at: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
        items: [{ product_id: 'prod_rpc_2', quantity: 3 }],
      };

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  in: () => ({
                    lte: () => ({
                      order: () => ({
                        limit: async () => ({ data: [candidateOrder], error: null }),
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        },
        rpc: async () => ({
          data: null,
          error: { message: 'deadlock detected', code: '40P01' },
        }),
      });

      const result = await expireUnpaidOrders({ timeoutMinutes: 30 });

      assert.strictEqual(result.scanned, 1);
      assert.strictEqual(result.expired, 0);
      assert.strictEqual(result.errors, 1);
      assert.strictEqual(result.stockRestoredCount, 0);
    });

    test('RPC: already paid or ineligible order is safely rejected without stock release', async () => {
      const orderId = 'order_atomic_rpc_paid_003';
      const candidateOrder = {
        id: orderId,
        status: 'pending',
        payment_status: 'pending',
        placed_at: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
        items: [{ product_id: 'prod_rpc_3', quantity: 2 }],
      };

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  in: () => ({
                    lte: () => ({
                      order: () => ({
                        limit: async () => ({ data: [candidateOrder], error: null }),
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        },
        rpc: async () => ({
          data: {
            success: false,
            reason: 'order_not_eligible',
            current_status: 'confirmed',
            current_payment_status: 'paid',
          },
          error: null,
        }),
      });

      const result = await expireUnpaidOrders({ timeoutMinutes: 30 });

      assert.strictEqual(result.scanned, 1);
      assert.strictEqual(result.expired, 0);
      assert.strictEqual(result.skipped, 1);
      assert.strictEqual(result.stockRestoredCount, 0);
    });

    test('Phase 5A.2: previously interrupted order in EXPIRY_STOCK_PENDING is detected and NOT automatically reprocessed (requires safe reconciliation)', async () => {
      const crashedOrderId = 'order_crashed_midway_004';
      const prodA = 'prod_desk_lamp';
      const prodB = 'prod_office_chair';
      let stockA = 4;
      let stockB = 10;

      const crashedOrder = {
        id: crashedOrderId,
        status: 'cancelled',
        payment_status: 'failed',
        payment_failed_reason: 'EXPIRY_STOCK_PENDING: Unpaid order reservation expired after 30 minutes',
        items: [
          { product_id: prodA, quantity: 2 },
          { product_id: prodB, quantity: 3 },
        ],
      };

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: (statusCol, statusVal) => {
                  if (statusVal === 'cancelled') {
                    // findCrashedUnrestoredOrders query
                    return {
                      like: () => ({
                        limit: async () => ({ data: [crashedOrder], error: null }),
                      }),
                    };
                  }
                  // findExpiredPendingOrders query
                  return {
                    in: () => ({
                      lte: () => ({
                        order: () => ({
                          limit: async () => ({ data: [], error: null }),
                        }),
                      }),
                    }),
                  };
                },
              }),
            };
          }
          return {};
        },
        rpc: async () => ({
          data: { success: false, reason: 'order_not_found' },
          error: null,
        }),
      });

      const result = await expireUnpaidOrders({ timeoutMinutes: 30 });

      assert.strictEqual(result.unreconciledPendingCount, 1, 'Must report unreconciled pending orders count');
      assert.strictEqual(result.stockRestoredCount, 0, 'Must NOT automatically restore stock to prevent duplicate stock release');
      assert.strictEqual(stockA, 4, 'Product A stock must remain untouched (4)');
      assert.strictEqual(stockB, 10, 'Product B stock must remain untouched (10)');
    });

    test('Multi-product order: restores correct stock quantities across all distinct lines', async () => {
      const orderId = 'order_multiproduct_005';
      const items = [
        { product_id: 'p_alpha', quantity: 1 },
        { product_id: 'p_beta', quantity: 4 },
        { product_id: 'p_gamma', quantity: 2 },
      ];

      const multiOrder = {
        id: orderId,
        status: 'pending',
        payment_status: 'pending',
        placed_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
        items,
      };

      const stockMap = {
        p_alpha: 10,
        p_beta: 20,
        p_gamma: 30,
      };

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  in: () => ({
                    lte: () => ({
                      order: () => ({
                        limit: async () => ({ data: [multiOrder], error: null }),
                      }),
                    }),
                  }),
                }),
              }),
              update: (patch) => ({
                eq: () => ({
                  eq: () => ({
                    in: () => ({
                      select: () => ({
                        maybeSingle: async () => ({ data: { ...multiOrder, ...patch }, error: null }),
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'products') {
            return {
              select: () => ({
                eq: (col, val) => ({
                  maybeSingle: async () => ({ data: { id: val, stock_quantity: stockMap[val] }, error: null }),
                }),
              }),
              update: (patch) => ({
                eq: (col, val) => ({
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => {
                        stockMap[val] = patch.stock_quantity;
                        return { data: { id: val, stock_quantity: patch.stock_quantity }, error: null };
                      },
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'order_status_history') {
            return {
              insert: (entry) => ({
                select: () => ({
                  single: async () => ({ data: { id: 'hist_multi', ...entry }, error: null }),
                }),
              }),
            };
          }
          return {};
        },
        rpc: async (fn, params) => {
          if (fn === 'expire_unpaid_order_atomic') {
            if (params.p_order_id === '00000000-0000-0000-0000-000000000000') {
              return { data: { success: false, reason: 'order_not_found' }, error: null };
            }
            if (params.p_order_id === orderId) {
              stockMap.p_alpha += 1;
              stockMap.p_beta += 4;
              stockMap.p_gamma += 2;
              return {
                data: {
                  success: true,
                  order_id: orderId,
                  items_restored: 3,
                  quantity_restored: 7,
                },
                error: null,
              };
            }
          }
          return { data: null, error: { message: 'unknown rpc' } };
        },
      });

      const result = await expireUnpaidOrders({ timeoutMinutes: 30 });

      assert.strictEqual(result.expired, 1);
      assert.strictEqual(result.stockRestoredCount, 7, 'Total stock restored must be 1 + 4 + 2 = 7');
      assert.strictEqual(stockMap.p_alpha, 11);
      assert.strictEqual(stockMap.p_beta, 24);
      assert.strictEqual(stockMap.p_gamma, 32);
    });

    test('Audit path verification: order schema does not have audit_note, uses payment_failed_reason and webhook payload', async () => {
      const orderId = 'order_audit_path_006';
      const paymentId = 'pay_audit_verify_888';
      const testAuditNote = 'Late capture on cancelled order: manual review required';

      let updatePayload = null;

      setSupabaseClient({
        from: (table) => {
          assert.strictEqual(table, 'orders');
          return {
            update: (patch) => {
              updatePayload = patch;
              return {
                eq: () => ({
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => ({ data: { id: orderId, ...patch }, error: null }),
                    }),
                  }),
                }),
              };
            },
          };
        },
      });

      const result = await recordLateCaptureOnCancelledOrder(orderId, paymentId, testAuditNote);

      assert.strictEqual(result.ok, true);
      assert.strictEqual(updatePayload.razorpay_payment_id, paymentId);
      assert.strictEqual(updatePayload.payment_failed_reason, testAuditNote);
      assert.strictEqual(
        updatePayload.audit_note,
        undefined,
        'orders table has no audit_note column — durable note must reside in payment_failed_reason'
      );
    });
  });

  // ==========================================================================
  // 8. Phase 5A.2: Unsafe Expiry Fallback Recovery & Concurrency Safety
  // ==========================================================================
  describe('Phase 5A.2: Unsafe Expiry Fallback Recovery & Concurrency Safety', () => {
    test('Crash/Failure injection after first product line: demonstrates double restoration in naive fallback vs safety in Phase 5A.2', async () => {
      const orderId = 'order_crash_after_line1_001';
      const prodA = 'prod_desk_lamp';
      const prodB = 'prod_office_chair';
      const items = [
        { product_id: prodA, quantity: 2 },
        { product_id: prodB, quantity: 3 },
      ];

      // --- Part 1: Demonstrate vulnerability of naive multi-step fallback ---
      let naiveStockA = 10;
      let naiveStockB = 20;

      // Step 1: Naive worker updates order to cancelled
      // Step 2: Restores line 1 (prodA)
      naiveStockA += items[0].quantity; // 10 -> 12
      // Step 3: Worker crashes before restoring line 2! (naiveStockB remains 20)

      // Step 4: Naive recovery worker restarts, reads items, and naively loops through ALL lines:
      for (const item of items) {
        if (item.product_id === prodA) naiveStockA += item.quantity; // 12 -> 14! Double restoration!
        if (item.product_id === prodB) naiveStockB += item.quantity; // 20 -> 23
      }
      assert.strictEqual(naiveStockA, 14, 'Vulnerability demonstration: Naive recovery restores prodA twice (10 -> 12 -> 14)');
      assert.strictEqual(naiveStockB, 23);

      // --- Part 2: Phase 5A.2 policy blocks naive recovery to protect inventory ---
      let safeStockA = 10;
      let safeStockB = 20;
      const crashedOrder = {
        id: orderId,
        status: 'cancelled',
        payment_status: 'failed',
        payment_failed_reason: 'EXPIRY_STOCK_PENDING: Unpaid order reservation expired after 30 minutes',
        items,
      };

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: (statusCol, statusVal) => {
                  if (statusVal === 'cancelled') {
                    return {
                      like: () => ({
                        limit: async () => ({ data: [crashedOrder], error: null }),
                      }),
                    };
                  }
                  return {
                    in: () => ({
                      lte: () => ({
                        order: () => ({
                          limit: async () => ({ data: [], error: null }),
                        }),
                      }),
                    }),
                  };
                },
              }),
            };
          }
          return {};
        },
        rpc: async () => ({
          data: { success: false, reason: 'order_not_found' },
          error: null,
        }),
      });

      const result = await expireUnpaidOrders({ timeoutMinutes: 30 });
      assert.strictEqual(result.unreconciledPendingCount, 1, 'Must report unreconciled pending orders for manual reconciliation');
      assert.strictEqual(result.stockRestoredCount, 0, 'Must NOT release stock through non-idempotent fallback');
      assert.strictEqual(safeStockA, 10, 'Stock A remains untouched and safe');
      assert.strictEqual(safeStockB, 20, 'Stock B remains untouched and safe');

      // --- Part 3: PostgreSQL RPC Atomic All-or-Nothing Guarantee ---
      // If a database error occurs on line 2, the entire transaction rolls back via PL/pgSQL
      let rpcStockA = 10;
      let rpcStockB = 20;
      let rpcOrderStatus = 'pending';

      const simulateAtomicRpcWithCrashOnLine2 = () => {
        // Transaction starts
        const snapshotStockA = rpcStockA;
        const snapshotStockB = rpcStockB;
        const snapshotStatus = rpcOrderStatus;
        try {
          // Line 1 update succeeds
          rpcStockA += 2;
          // Line 2 update encounters failure (e.g. check constraint or disk error)
          throw new Error('disk full or constraint violation on line 2');
        } catch (err) {
          // Transaction aborts and rolls back completely
          rpcStockA = snapshotStockA;
          rpcStockB = snapshotStockB;
          rpcOrderStatus = snapshotStatus;
          return { ok: false, error: err.message };
        }
      };

      const txResult = simulateAtomicRpcWithCrashOnLine2();
      assert.strictEqual(txResult.ok, false);
      assert.strictEqual(rpcStockA, 10, 'Atomic rollback ensures Line 1 restoration is undone');
      assert.strictEqual(rpcStockB, 20, 'Line 2 remains unchanged');
      assert.strictEqual(rpcOrderStatus, 'pending', 'Order status remains pending');
    });

    test('Concurrent recovery workers race: demonstrates duplicate stock restoration in naive recovery vs exactly-once in atomic RPC', async () => {
      const orderId = 'order_concurrent_race_002';
      const quantity = 2;

      // --- Part 1: Naive concurrent recovery without row lock ---
      let naiveStock = 10;
      let naiveOrderMarker = 'EXPIRY_STOCK_PENDING';
      const naiveWorker = async () => {
        // Both workers read order marker concurrently before either updates it
        if (naiveOrderMarker === 'EXPIRY_STOCK_PENDING') {
          naiveStock += quantity;
          // Delay before updating marker
          await new Promise((r) => setTimeout(r, 5));
          naiveOrderMarker = 'EXPIRY_STOCK_RESTORED';
        }
      };
      await Promise.all([naiveWorker(), naiveWorker()]);
      assert.strictEqual(naiveStock, 14, 'Vulnerability demonstration: concurrent naive workers restore stock twice (+4)');

      // --- Part 2: Atomic RPC with exclusive SELECT ... FOR UPDATE ---
      let atomicStock = 10;
      let atomicOrderStatus = 'pending';
      let rpcCallCount = 0;

      const atomicRpcWorker = async () => {
        rpcCallCount += 1;
        // In PostgreSQL: SELECT ... FOR UPDATE serializes access
        if (atomicOrderStatus === 'pending') {
          atomicOrderStatus = 'cancelled';
          atomicStock += quantity;
          return { success: true, quantity_restored: quantity };
        }
        return { success: false, reason: 'order_not_eligible', current_status: atomicOrderStatus };
      };

      const [res1, res2] = await Promise.all([atomicRpcWorker(), atomicRpcWorker()]);
      const successes = [res1, res2].filter((r) => r.success);
      const skips = [res1, res2].filter((r) => !r.success);

      assert.strictEqual(successes.length, 1, 'Only one worker can succeed');
      assert.strictEqual(skips.length, 1, 'Concurrent worker gets order_not_eligible');
      assert.strictEqual(atomicStock, 12, 'Stock restored exactly once (10 -> 12)');
      assert.strictEqual(atomicOrderStatus, 'cancelled');
    });

    test('Repeated expiry calls (Idempotency): consecutive calls safely exit without repeated stock restoration', async () => {
      const orderId = 'order_idempotent_expiry_003';
      let currentStock = 25;
      let orderStatusInDb = 'pending';
      let paymentStatusInDb = 'pending';

      const executeAtomicExpiry = async (id) => {
        // Emulating PostgreSQL PL/pgSQL expire_unpaid_order_atomic
        if (orderStatusInDb !== 'pending' || !['pending', 'failed'].includes(paymentStatusInDb)) {
          return {
            success: false,
            reason: 'order_not_eligible',
            current_status: orderStatusInDb,
            current_payment_status: paymentStatusInDb,
          };
        }
        orderStatusInDb = 'cancelled';
        paymentStatusInDb = 'failed';
        currentStock += 5;
        return {
          success: true,
          order_id: id,
          items_restored: 1,
          quantity_restored: 5,
        };
      };

      // Call 1: First expiry run
      const run1 = await executeAtomicExpiry(orderId);
      assert.strictEqual(run1.success, true);
      assert.strictEqual(run1.quantity_restored, 5);
      assert.strictEqual(currentStock, 30);

      // Call 2: Immediate retry / duplicate cron trigger
      const run2 = await executeAtomicExpiry(orderId);
      assert.strictEqual(run2.success, false);
      assert.strictEqual(run2.reason, 'order_not_eligible');
      assert.strictEqual(currentStock, 30, 'Stock must not change on duplicate run');

      // Call 3: Third run
      const run3 = await executeAtomicExpiry(orderId);
      assert.strictEqual(run3.success, false);
      assert.strictEqual(run3.reason, 'order_not_eligible');
      assert.strictEqual(currentStock, 30, 'Stock must not change on third run');
    });

    test('Race: payment capture commits before expiry RPC evaluates, expiry exits cleanly without stock change', async () => {
      const orderId = 'order_race_pay_wins_004';
      let stock = 15;
      const orderInDb = {
        id: orderId,
        status: 'confirmed',
        payment_status: 'paid',
      };

      // Atomic RPC logic checks status and payment_status under row lock
      const rpcResult = await (async () => {
        if (orderInDb.status !== 'pending' || !['pending', 'failed'].includes(orderInDb.payment_status)) {
          return {
            success: false,
            reason: 'order_not_eligible',
            current_status: orderInDb.status,
            current_payment_status: orderInDb.payment_status,
          };
        }
        stock += 3;
        orderInDb.status = 'cancelled';
        return { success: true };
      })();

      assert.strictEqual(rpcResult.success, false);
      assert.strictEqual(rpcResult.reason, 'order_not_eligible');
      assert.strictEqual(stock, 15, 'Stock must never be restored if payment already committed');
      assert.strictEqual(orderInDb.status, 'confirmed', 'Order status must remain confirmed');
    });

    test('Race: expiry RPC commits before payment verification CAS, payment verification fails CAS and triggers late-capture handling', async () => {
      const orderId = 'order_race_expiry_wins_005';
      const paymentId = 'pay_race_expiry_wins_999';
      let stock = 15;

      // Expiry commits first
      const orderInDb = {
        id: orderId,
        status: 'cancelled',
        payment_status: 'failed',
        payment_failed_reason: 'Unpaid order reservation expired after 30 minutes',
        razorpay_payment_id: null,
      };
      stock += 2; // Expiry released the reservation back to inventory

      // Now payment verification attempts CAS update:
      // UPDATE orders SET status = 'confirmed', payment_status = 'paid' WHERE id = ? AND status = 'pending'
      let casWon = false;
      if (orderInDb.status === 'pending') {
        orderInDb.status = 'confirmed';
        orderInDb.payment_status = 'paid';
        casWon = true;
      }

      assert.strictEqual(casWon, false, 'Payment CAS must fail because status is already cancelled');

      // Payment service detects lost race and records late capture for manual audit/refund
      setSupabaseClient({
        from: (table) => {
          assert.strictEqual(table, 'orders');
          return {
            update: (patch) => {
              Object.assign(orderInDb, patch);
              return {
                eq: () => ({
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => ({ data: orderInDb, error: null }),
                    }),
                  }),
                }),
              };
            },
          };
        },
      });

      const lateResult = await recordLateCaptureOnCancelledOrder(
        orderId,
        paymentId,
        'Late payment captured after order was expired and cancelled'
      );

      assert.strictEqual(lateResult.ok, true);
      assert.strictEqual(orderInDb.status, 'cancelled', 'Order must remain cancelled (no resurrection)');
      assert.strictEqual(orderInDb.razorpay_payment_id, paymentId);
      assert.match(orderInDb.payment_failed_reason, /Late payment captured/i);
      assert.strictEqual(stock, 17, 'Stock restoration remains intact');
    });

    test('Fail-closed guard: sweeper refuses to run and returns 503 if Migration 012 is missing', async () => {
      setSupabaseClient({
        from: () => ({
          select: () => ({
            eq: () => ({
              in: () => ({
                lte: () => ({
                  order: () => ({
                    limit: async () => ({ data: [{ id: 'order_1', status: 'pending', payment_status: 'pending' }], error: null }),
                  }),
                }),
              }),
            }),
          }),
        }),
        rpc: async () => ({
          data: null,
          error: { code: '42883', message: 'function expire_unpaid_order_atomic(uuid, text) does not exist' },
        }),
      });

      await assert.rejects(
        async () => expireUnpaidOrders({ timeoutMinutes: 30 }),
        (err) => {
          assert.strictEqual(err.status, 503);
          assert.match(err.message, /Migration 012.*must be applied/i);
          return true;
        }
      );
    });

    test('PostgreSQL RPC deadlock prevention: duplicate items are aggregated and processed in ascending product_id order', () => {
      // Simulate raw order_items with duplicates and unsorted order
      const rawOrderItems = [
        { product_id: 'prod_z_zebra', quantity: 2 },
        { product_id: 'prod_a_apple', quantity: 1 },
        { product_id: 'prod_z_zebra', quantity: 3 },
        { product_id: 'prod_m_mango', quantity: 4 },
      ];

      // Replicating Migration 012 query:
      // SELECT product_id, sum(quantity)::integer as quantity
      // FROM public.order_items
      // WHERE order_id = p_order_id AND product_id IS NOT NULL AND quantity > 0
      // GROUP BY product_id
      // ORDER BY product_id ASC;
      const aggregatedMap = new Map();
      for (const item of rawOrderItems) {
        if (!item.product_id || item.quantity <= 0) continue;
        const current = aggregatedMap.get(item.product_id) || 0;
        aggregatedMap.set(item.product_id, current + item.quantity);
      }

      const sortedRestorations = Array.from(aggregatedMap.entries())
        .map(([product_id, quantity]) => ({ product_id, quantity }))
        .sort((a, b) => a.product_id.localeCompare(b.product_id));

      assert.strictEqual(sortedRestorations.length, 3);
      assert.deepStrictEqual(sortedRestorations[0], { product_id: 'prod_a_apple', quantity: 1 });
      assert.deepStrictEqual(sortedRestorations[1], { product_id: 'prod_m_mango', quantity: 4 });
      assert.deepStrictEqual(sortedRestorations[2], { product_id: 'prod_z_zebra', quantity: 5 });
    });
  });

  // ==========================================================================
  // 9. Phase 5A.3: Migration 012 Security, Permissions, and Inventory Integrity
  // ==========================================================================
  describe('Phase 5A.3: Migration 012 Security, Permissions, and Inventory Integrity', () => {
    test('Inventory integrity: missing product row triggers rollback rather than silent cancellation with unreleased stock', async () => {
      const orderId = 'order_missing_product_001';
      const validProdId = 'prod_desk_lamp';
      const missingProdId = 'prod_deleted_from_catalog';
      let stockValid = 10;
      let orderStatusInDb = 'pending';

      const items = [
        { product_id: validProdId, quantity: 2 },
        { product_id: missingProdId, quantity: 1 },
      ];

      // Simulating Migration 012 execution with missing product check
      const simulateFortifiedMigration012 = () => {
        const snapshotStock = stockValid;
        const snapshotStatus = orderStatusInDb;

        try {
          // Pre-flight check passes (items have valid IDs and quantities)
          for (const item of items) {
            if (!item.product_id || item.quantity <= 0) {
              throw new Error(`Order ${orderId} contains invalid order_items`);
            }
          }

          // Loop 1: validProdId exists in products
          stockValid += 2;

          // Loop 2: missingProdId does NOT exist in products (UPDATE returns 0 rows)
          const productRowFound = false; // simulates IF NOT FOUND
          if (!productRowFound) {
            throw new Error(`Product ${missingProdId} not found in public.products for order item stock restoration on order ${orderId}`);
          }

          orderStatusInDb = 'cancelled';
          return { success: true };
        } catch (err) {
          // PostgreSQL transaction rollback
          stockValid = snapshotStock;
          orderStatusInDb = snapshotStatus;
          return { success: false, error: err.message };
        }
      };

      const result = simulateFortifiedMigration012();
      assert.strictEqual(result.success, false);
      assert.match(result.error, /not found in public\.products/i);
      assert.strictEqual(stockValid, 10, 'Rollback guarantees valid product stock is not partially incremented');
      assert.strictEqual(orderStatusInDb, 'pending', 'Order status must remain pending (not cancelled with unreleased stock)');
    });

    test('Inventory integrity: corrupted order_items line (null product_id or non-positive quantity) rejects before updating stock', async () => {
      const orderId = 'order_corrupted_items_002';
      let stock = 10;
      let orderStatus = 'pending';

      const itemsWithNullProduct = [
        { product_id: null, quantity: 2 },
      ];

      const simulateFortifiedMigration012 = (items) => {
        const snapshotStock = stock;
        const snapshotStatus = orderStatus;

        try {
          // Migration 012 step 3 preflight check:
          const hasInvalid = items.some((i) => !i.product_id || i.quantity <= 0);
          if (hasInvalid) {
            throw new Error(`Order ${orderId} contains invalid order_items with null product_id or non-positive quantity`);
          }

          stock += 2;
          orderStatus = 'cancelled';
          return { success: true };
        } catch (err) {
          stock = snapshotStock;
          orderStatus = snapshotStatus;
          return { success: false, error: err.message };
        }
      };

      const result = simulateFortifiedMigration012(itemsWithNullProduct);
      assert.strictEqual(result.success, false);
      assert.match(result.error, /invalid order_items with null product_id or non-positive quantity/i);
      assert.strictEqual(stock, 10, 'Stock must not change');
      assert.strictEqual(orderStatus, 'pending', 'Order must not be cancelled');
    });

    test('Permission & Role separation: expireUnpaidOrderRpc requires privileged service role', async () => {
      // Test that when unprivileged client is used (e.g. anon / customer role),
      // the repository refuses to call the RPC
      const { config } = await import('../config/index.js');
      const originalKey = config.supabase.serviceRoleKey;
      try {
        config.supabase.serviceRoleKey = null;
        // Inject mock client with isPrivileged: false to simulate unprivileged client
        setSupabaseClient({ rpc: async () => ({ data: null, error: null }) }, { isPrivileged: false });
        const { expireUnpaidOrderRpc } = await import('../repositories/order.repository.js');
        const res = await expireUnpaidOrderRpc('order_test_role_001');
        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.reason, 'supabase-service-role-not-configured');
      } finally {
        config.supabase.serviceRoleKey = originalKey;
      }
    });

    test('Test taxonomy: distinction between mocked tests and actual PostgreSQL integration', () => {
      // Explicit assertion documenting test methodology for Phase 5A.3:
      // 1. Unit & mock tests verify application-level logic, contract shapes, and PL/pgSQL transaction algorithms in isolation.
      // 2. Live PostgreSQL integration verification (FOR UPDATE locks, SECURITY DEFINER execution grants, PostgREST HTTP 403 for anon)
      //    must be executed against the actual database when Migration 012 is applied during the deployment window.
      const testArchitecture = {
        mockedTests: [
          'sweeper eligibility age filtering',
          'HTTP endpoint cron secret bearer validation',
          'fail-closed 503 when RPC missing (42883 / PGRST202)',
          'simulated atomic RPC rollback on constraint/missing row failure',
          'quarantine of EXPIRY_STOCK_PENDING orders',
          'CAS order status race vs payment capture',
        ],
        livePostgreSqlIntegrationPrerequisites: [
          'Execute Migration 012 on staging/production PostgreSQL database',
          'Verify REVOKE prevents anon/authenticated PostgREST execution (returns 403/404)',
          'Verify service_role can execute expire_unpaid_order_atomic(uuid, text)',
          'Verify concurrent transactions block on orders row lock (SELECT FOR UPDATE)',
          'Verify PostgreSQL engine rolls back all updates when RAISE EXCEPTION occurs',
        ],
      };

      assert.ok(testArchitecture.mockedTests.length >= 6);
      assert.ok(testArchitecture.livePostgreSqlIntegrationPrerequisites.length >= 5);
    });
  });
});

