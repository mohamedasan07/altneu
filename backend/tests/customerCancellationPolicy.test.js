import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cancelOrder } from '../services/order.service.js';
import { updateAdminOrderStatus } from '../services/adminOrder.service.js';
import { expireUnpaidOrders } from '../services/order.service.js';
import { createLateCaptureRefundIntent } from '../services/refund.service.js';
import { setSupabaseClient } from '../database/client.js';
import { _setHasMigration011ForTest } from '../repositories/order.repository.js';
import { ApiError } from '../utils/apiError.js';

describe('Customer Cancellation Policy Alignment & Invariants', () => {
  const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';
  const OTHER_USER_ID = '00000000-0000-0000-0000-000000000002';
  const TEST_ORDER_ID = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    _setHasMigration011ForTest(false);
    setSupabaseClient(null);
  });

  afterEach(() => {
    _setHasMigration011ForTest(null);
    setSupabaseClient(null);
  });

  // Helper to construct a mock order record
  function makeMockOrderRow(overrides = {}) {
    return {
      id: TEST_ORDER_ID,
      altneu_number: 'ALT-1001',
      order_number: 'ORD-1001',
      user_id: TEST_USER_ID,
      status: 'pending',
      payment_status: 'pending',
      payment_method: 'razorpay',
      subtotal: 2500,
      discount: 0,
      shipping: 0,
      tax: 0,
      grand_total: 2500,
      shipping_address: { name: 'Test Customer', line1: 'Street 1', city: 'Mumbai', state: 'MH', pincode: '400001' },
      items: [
        {
          id: 'item-1',
          product_id: 'prod-1',
          name: 'Heavyweight Tee',
          price_at_order: 2500,
          quantity: 1,
          size: 'L',
          color: '#000',
        },
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    };
  }

  // =========================================================================
  // 1. Customer Self-Service Cancellation Rejection
  // =========================================================================
  describe('Customer self-service cancellation rejection across order statuses', () => {
    const nonCancellableStatuses = ['pending', 'confirmed', 'processing', 'shipped'];

    for (const status of nonCancellableStatuses) {
      test(`rejects customer self-service cancellation when status is "${status}"`, async () => {
        const orderRow = makeMockOrderRow({ status, payment_status: 'pending' });

        setSupabaseClient({
          from: (table) => {
            assert.strictEqual(table, 'orders');
            return {
              select: () => ({
                eq: (col1, val1) => {
                  assert.strictEqual(col1, 'id');
                  assert.strictEqual(val1, TEST_ORDER_ID);
                  return {
                    eq: (col2, val2) => {
                      assert.strictEqual(col2, 'user_id');
                      assert.strictEqual(val2, TEST_USER_ID);
                      return {
                        maybeSingle: async () => ({ data: orderRow, error: null }),
                      };
                    },
                  };
                },
              }),
            };
          },
        });

        await assert.rejects(
          async () => {
            await cancelOrder(TEST_USER_ID, TEST_ORDER_ID);
          },
          (err) => {
            assert(err instanceof ApiError, 'Must throw an ApiError');
            assert.strictEqual(err.status, 400, 'Must return 400 Bad Request');
            assert.match(
              err.message,
              /Self-service order cancellation is not available\. For order inquiries or statutory remedies, please contact customer support\./i
            );
            return true;
          }
        );
      });
    }
  });

  // =========================================================================
  // 2. Paid Order Safety & Inventory Invariants
  // =========================================================================
  describe('Paid-order safety and inventory invariants', () => {
    test('paid order cancellation attempt is rejected; inventory and payment state are untouched', async () => {
      let restoreStockCalled = false;
      let orderUpdateCalled = false;

      const paidOrderRow = makeMockOrderRow({
        status: 'confirmed',
        payment_status: 'paid',
        items: [
          {
            id: 'item-1',
            product_id: 'prod-paid-1',
            name: 'Cargo Pant',
            price_at_order: 4500,
            quantity: 2,
            size: 'M',
            color: '#111',
          },
        ],
      });

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: paidOrderRow, error: null }),
                  }),
                }),
              }),
              update: () => {
                orderUpdateCalled = true;
                return { eq: () => ({}) };
              },
            };
          }
          if (table === 'products') {
            restoreStockCalled = true;
            return { update: () => ({ eq: () => ({}) }) };
          }
          return {};
        },
      });

      await assert.rejects(
        async () => {
          await cancelOrder(TEST_USER_ID, TEST_ORDER_ID);
        },
        (err) => {
          assert(err instanceof ApiError);
          assert.strictEqual(err.status, 400);
          assert.match(err.message, /Self-service order cancellation is not available/i);
          return true;
        }
      );

      // Verify strict invariants:
      assert.strictEqual(restoreStockCalled, false, 'Stock must NOT be restored on customer cancellation attempt');
      assert.strictEqual(orderUpdateCalled, false, 'Order row must NOT be modified in the database');
      assert.strictEqual(paidOrderRow.payment_status, 'paid', 'Payment status must remain paid');
      assert.strictEqual(paidOrderRow.status, 'confirmed', 'Order status must remain confirmed');
    });
  });

  // =========================================================================
  // 3. Ownership Guard and UUID Format Validation
  // =========================================================================
  describe('Ownership and UUID validation', () => {
    test('rejects with 400 if orderId is not a valid UUID format', async () => {
      const invalidIds = ['12345', 'not-a-uuid', 'abc', '11111111-1111-1111-1111'];

      for (const badId of invalidIds) {
        await assert.rejects(
          async () => {
            await cancelOrder(TEST_USER_ID, badId);
          },
          (err) => {
            assert(err instanceof ApiError);
            assert.strictEqual(err.status, 400);
            assert.match(err.message, /Invalid order id/i);
            return true;
          }
        );
      }
    });

    test('rejects with 404 when order belongs to a different user (fails safe without leaking existence)', async () => {
      // Mock returns null when query filters by user_id = TEST_USER_ID
      setSupabaseClient({
        from: (table) => {
          assert.strictEqual(table, 'orders');
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          };
        },
      });

      await assert.rejects(
        async () => {
          await cancelOrder(TEST_USER_ID, TEST_ORDER_ID);
        },
        (err) => {
          assert(err instanceof ApiError);
          assert.strictEqual(err.status, 404);
          assert.match(err.message, /Order not found/i);
          return true;
        }
      );
    });
  });

  // =========================================================================
  // 4. Idempotency on Already-Cancelled Orders
  // =========================================================================
  describe('Idempotent replay on already cancelled orders', () => {
    test('returns normalized cancelled order safely if order is already cancelled', async () => {
      const cancelledOrderRow = makeMockOrderRow({
        status: 'cancelled',
        payment_status: 'failed',
      });

      let stockRestorationAttempted = false;

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: cancelledOrderRow, error: null }),
                  }),
                }),
              }),
            };
          }
          if (table === 'products') {
            stockRestorationAttempted = true;
          }
          return {};
        },
      });

      const res = await cancelOrder(TEST_USER_ID, TEST_ORDER_ID);
      assert.strictEqual(res.id, TEST_ORDER_ID);
      assert.strictEqual(res.status, 'cancelled');
      assert.strictEqual(stockRestorationAttempted, false, 'Stock must not be touched on replay');
    });
  });

  // =========================================================================
  // 5. System Expiry Workflow Preservation
  // =========================================================================
  describe('System-driven unpaid order expiry preservation', () => {
    test('expireUnpaidOrders continues to operate via atomic RPC independently of customer cancellation rules', async () => {
      let rpcCalledWith = null;

      setSupabaseClient({
        from: (table) => {
          assert.strictEqual(table, 'orders');
          return {
            select: () => ({
              eq: () => ({
                in: () => ({
                  lte: () => ({
                    order: () => ({
                      limit: async () => ({
                        data: [
                          {
                            id: TEST_ORDER_ID,
                            order_number: 'ORD-EXP-1',
                            created_at: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
                          },
                        ],
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            }),
          };
        },
        rpc: async (fnName, params) => {
          if (fnName === 'expire_unpaid_order_atomic') {
            if (params.p_order_id === '00000000-0000-0000-0000-000000000000') {
              return { data: { success: false, reason: 'order_not_found' }, error: null };
            }
            rpcCalledWith = params;
            return {
              data: {
                success: true,
                order_id: TEST_ORDER_ID,
                status: 'cancelled',
                payment_status: 'failed',
                stock_restored: true,
                items_restored: 1,
                quantity_restored: 1,
              },
              error: null,
            };
          }
          return { data: null, error: { message: 'unknown RPC' } };
        },
      });

      const summary = await expireUnpaidOrders({ timeoutMinutes: 30, batchSize: 10 });
      assert.strictEqual(summary.scanned, 1);
      assert.strictEqual(summary.expired, 1);
      assert.strictEqual(summary.errors, 0);
      assert.strictEqual(summary.stockRestoredCount, 1);
      assert.strictEqual(rpcCalledWith.p_order_id, TEST_ORDER_ID);
    });
  });

  // =========================================================================
  // 6. Admin Fulfilment Workflow Preservation
  // =========================================================================
  describe('Admin workflow preservation', () => {
    test('updateAdminOrderStatus continues to transition order statuses', async () => {
      const orderRow = makeMockOrderRow({ status: 'confirmed' });
      let statusUpdatedTo = null;

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: orderRow, error: null }),
                }),
              }),
              update: (patch) => {
                statusUpdatedTo = patch.status;
                return {
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => ({
                        data: { ...orderRow, status: patch.status },
                        error: null,
                      }),
                    }),
                  }),
                };
              },
            };
          }
          if (table === 'order_status_history') {
            return {
              select: () => ({
                eq: () => ({
                  order: async () => ({ data: [], error: null }),
                }),
              }),
              insert: async () => ({ data: null, error: null }),
            };
          }
          return {};
        },
      });

      const result = await updateAdminOrderStatus(TEST_ORDER_ID, { status: 'processing' });
      assert.strictEqual(result.status, 'processing');
      assert.strictEqual(statusUpdatedTo, 'processing');
    });
  });

  // =========================================================================
  // 7. Late-Capture Refund Recovery Preservation
  // =========================================================================
  describe('Late-capture refund recovery workflow preservation', () => {
    test('createLateCaptureRefundIntent registers durable refund intent for late captures safely', async () => {
      setSupabaseClient({
        rpc: async (fnName, params) => {
          if (fnName === 'record_late_capture_refund_intent_atomic') {
            return {
              data: {
                success: true,
                intent_id: 'intent-uuid-1',
                order_id: params.p_order_id,
                payment_id: params.p_payment_id,
                amount: params.p_amount,
                currency: params.p_currency,
                status: 'pending',
              },
              error: null,
            };
          }
          return { data: null, error: { message: 'unknown rpc' } };
        },
      });

      const intentResult = await createLateCaptureRefundIntent({
        eventId: 'evt_late_123',
        eventType: 'payment.captured',
        orderId: TEST_ORDER_ID,
        paymentId: 'pay_latecapture_123',
        amount: 2500,
        currency: 'INR',
        reason: 'order_expired_pending_payment',
      });

      assert(intentResult);
      assert.strictEqual(intentResult.ok, true);
      assert.strictEqual(intentResult.data.order_id, TEST_ORDER_ID);
      assert.strictEqual(intentResult.data.payment_id, 'pay_latecapture_123');
      assert.strictEqual(intentResult.data.status, 'pending');
    });
  });
});
