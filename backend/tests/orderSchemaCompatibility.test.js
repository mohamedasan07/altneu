import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_ORDER_COLUMNS,
  ORDER_COLUMNS,
  ORDER_WITH_ITEMS,
  FULL_ORDER_WITH_ITEMS,
  findOrderByNumber,
  findOrdersByUser,
  findOrderById,
  findOrderByIdRaw,
  insertOrder,
  findOrderByRazorpayOrderId,
  setOrderRazorpayOrderId,
  updateOrderPaymentSuccessAtomic,
  recordPaymentAttemptFailure,
  isWebhookProcessed,
  recordWebhookEvent,
  decrementStock,
  restoreStock,
  _setHasMigration011ForTest,
} from '../repositories/order.repository.js';
import { createPaymentOrder, verifyPayment } from '../services/payment.service.js';
import { setSupabaseClient } from '../database/client.js';

describe('Order Schema Compatibility & Migration 011 Pre-Rollout Resilience', () => {
  beforeEach(() => {
    _setHasMigration011ForTest(null);
    setSupabaseClient(null);
  });

  afterEach(() => {
    _setHasMigration011ForTest(null);
    setSupabaseClient(null);
  });

  test('Projection exports: ORDER_COLUMNS strictly documents Migration 011 columns while ORDER_WITH_ITEMS uses BASE_ORDER_COLUMNS', () => {
    // Migration 011 columns must be documented in ORDER_COLUMNS
    const migrationColumns = [
      'razorpay_order_id',
      'razorpay_payment_id',
      'razorpay_signature',
      'razorpay_refund_id',
      'payment_attempts',
      'payment_failed_reason',
      'payment_verified_at',
      'guest_session_id',
    ];
    for (const col of migrationColumns) {
      assert.match(ORDER_COLUMNS, new RegExp(`\\b${col}\\b`), `ORDER_COLUMNS must reference ${col}`);
    }

    // ORDER_WITH_ITEMS must NOT include migration columns to protect pre-migration DB and admin views from 42703
    for (const col of migrationColumns) {
      assert.doesNotMatch(ORDER_WITH_ITEMS, new RegExp(`\\b${col}\\b`), `ORDER_WITH_ITEMS must NOT contain ${col}`);
    }

    // FULL_ORDER_WITH_ITEMS must include migration columns
    for (const col of migrationColumns) {
      assert.match(FULL_ORDER_WITH_ITEMS, new RegExp(`\\b${col}\\b`), `FULL_ORDER_WITH_ITEMS must reference ${col}`);
    }
  });

  test('Regression: findOrderByNumber recovers transparently on PostgreSQL 42703 without throwing 500 error', async () => {
    let callCount = 0;
    const requestedProjections = [];

    setSupabaseClient({
      from: (table) => {
        assert.strictEqual(table, 'orders');
        return {
          select: (projection) => {
            callCount++;
            requestedProjections.push(projection);
            return {
              eq: (col, val) => {
                assert.strictEqual(col, 'order_number');
                assert.match(val, /^US-20261017-TEST000[12]$/);
                return {
                  maybeSingle: async () => {
                    if (callCount === 1) {
                      // First call simulates PostgreSQL 42703 error on unmigrated database
                      return {
                        data: null,
                        error: {
                          code: '42703',
                          message: 'column orders.razorpay_order_id does not exist',
                        },
                      };
                    }
                    // Second call with fallback projection succeeds
                    return {
                      data: null, // Order does not exist yet (clean idempotency check)
                      error: null,
                    };
                  },
                };
              },
            };
          },
        };
      },
    });

    const result = await findOrderByNumber('US-20261017-TEST0001');
    assert.strictEqual(result.ok, true, 'Result must be ok: true after fallback');
    assert.strictEqual(result.data, null, 'Data must be null for non-existent order');
    assert.strictEqual(callCount, 2, 'Should have retried with fallback projection');
    assert.strictEqual(requestedProjections[0], FULL_ORDER_WITH_ITEMS, 'First attempt must use FULL projection');
    assert.strictEqual(requestedProjections[1], ORDER_WITH_ITEMS, 'Second attempt must use BASE projection');

    // Subsequent calls should use cached state and not re-trigger 42703
    const cachedResult = await findOrderByNumber('US-20261017-TEST0002');
    assert.strictEqual(cachedResult.ok, true);
    assert.strictEqual(callCount, 3, 'Third call should execute once using cached fallback projection');
    assert.strictEqual(requestedProjections[2], ORDER_WITH_ITEMS, 'Cached attempt must directly use BASE projection');
  });

  test('Regression: insertOrder recovers transparently on PostgreSQL 42703 without failing order placement', async () => {
    let insertAttempts = 0;
    const mockOrderRow = {
      order_number: 'US-20261017-NEW0001',
      status: 'pending',
      payment_status: 'pending',
      grand_total: 1580,
    };

    setSupabaseClient({
      from: (table) => {
        assert.strictEqual(table, 'orders');
        return {
          insert: (row) => ({
            select: (cols) => ({
              single: async () => {
                insertAttempts++;
                if (insertAttempts === 1) {
                  return {
                    data: null,
                    error: {
                      code: '42703',
                      message: 'column orders.guest_session_id does not exist',
                    },
                  };
                }
                return {
                  data: { id: 'order_uuid_123', ...row },
                  error: null,
                };
              },
            }),
          }),
        };
      },
    });

    const result = await insertOrder(mockOrderRow);
    assert.strictEqual(result.ok, true, 'insertOrder must succeed after fallback');
    assert.strictEqual(result.data?.id, 'order_uuid_123');
    assert.strictEqual(insertAttempts, 2, 'Should have retried insert with BASE_ORDER_COLUMNS');
  });

  test('Regression: findOrdersByUser recovers transparently on PostgreSQL 42703 without failing customer order history', async () => {
    let callCount = 0;
    setSupabaseClient({
      from: (table) => {
        assert.strictEqual(table, 'orders');
        return {
          select: () => {
            callCount++;
            return {
              eq: () => ({
                order: () => {
                  if (callCount === 1) {
                    return Promise.resolve({
                      data: null,
                      error: {
                        code: '42703',
                        message: 'column orders.razorpay_order_id does not exist',
                      },
                    });
                  }
                  return Promise.resolve({
                    data: [
                      {
                        id: 'order_hist_1',
                        order_number: 'US-20261017-HIST01',
                        status: 'pending',
                        items: [],
                      },
                    ],
                    error: null,
                  });
                },
              }),
            };
          },
        };
      },
    });

    const result = await findOrdersByUser('user_uuid_456');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data?.length, 1);
    assert.strictEqual(result.data[0].order_number, 'US-20261017-HIST01');
    assert.strictEqual(callCount, 2);
  });

  test('Fail-Closed: findOrderByRazorpayOrderId returns MIGRATION_011_REQUIRED when Migration 011 is unapplied', async () => {
    _setHasMigration011ForTest(false);
    let queried = false;

    setSupabaseClient({
      from: () => {
        queried = true;
        return {};
      },
    });

    const result = await findOrderByRazorpayOrderId('order_rzp_unapplied_01');
    assert.strictEqual(result.ok, false, 'Must fail closed (ok: false)');
    assert.strictEqual(result.missingMigration, true, 'Must indicate missingMigration: true');
    assert.strictEqual(result.code, 'MIGRATION_011_REQUIRED');
    assert.match(result.reason, /Migration 011 required/i);
    assert.strictEqual(queried, false, 'Should not query database when migration is known unapplied');
  });

  test('Fail-Closed: findOrderByRazorpayOrderId detects 42703 on unmigrated DB and fails closed with MIGRATION_011_REQUIRED', async () => {
    let callCount = 0;

    setSupabaseClient({
      from: (table) => {
        assert.strictEqual(table, 'orders');
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => {
                callCount++;
                return {
                  data: null,
                  error: {
                    code: '42703',
                    message: 'column orders.razorpay_order_id does not exist',
                  },
                };
              },
            }),
          }),
        };
      },
    });

    const result = await findOrderByRazorpayOrderId('order_rzp_unapplied_02');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.missingMigration, true);
    assert.strictEqual(result.code, 'MIGRATION_011_REQUIRED');
    assert.strictEqual(callCount, 1);
  });

  test('Fail-Closed: setOrderRazorpayOrderId fails closed with MIGRATION_011_REQUIRED when Migration 011 is unapplied', async () => {
    _setHasMigration011ForTest(false);

    const result = await setOrderRazorpayOrderId('order_uuid_101', 'order_rzp_mock123');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.missingMigration, true);
    assert.strictEqual(result.code, 'MIGRATION_011_REQUIRED');
  });

  test('Fail-Closed: updateOrderPaymentSuccessAtomic fails closed with MIGRATION_011_REQUIRED when Migration 011 is unapplied', async () => {
    _setHasMigration011ForTest(false);

    const result = await updateOrderPaymentSuccessAtomic({
      orderId: 'order_uuid_102',
      razorpayPaymentId: 'pay_mock123',
      razorpaySignature: 'sig_mock123',
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.missingMigration, true);
    assert.strictEqual(result.code, 'MIGRATION_011_REQUIRED');
  });

  test('Fail-Closed: recordPaymentAttemptFailure fails closed with MIGRATION_011_REQUIRED when Migration 011 is unapplied', async () => {
    _setHasMigration011ForTest(false);

    const result = await recordPaymentAttemptFailure('order_uuid_103', 'Payment failed at gateway');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.missingMigration, true);
    assert.strictEqual(result.code, 'MIGRATION_011_REQUIRED');
  });

  test('Fail-Closed: isWebhookProcessed & recordWebhookEvent fail closed when webhook events table is unapplied', async () => {
    _setHasMigration011ForTest(false);

    const checkResult = await isWebhookProcessed('evt_mock_001');
    assert.strictEqual(checkResult.ok, false);
    assert.strictEqual(checkResult.missingMigration, true);
    assert.strictEqual(checkResult.code, 'MIGRATION_011_REQUIRED');

    const recordResult = await recordWebhookEvent({
      eventId: 'evt_mock_002',
      eventType: 'payment.captured',
    });
    assert.strictEqual(recordResult.ok, false);
    assert.strictEqual(recordResult.missingMigration, true);
    assert.strictEqual(recordResult.code, 'MIGRATION_011_REQUIRED');
  });

  test('Fail-Closed: createPaymentOrder and verifyPayment throw HTTP 503 when Migration 011 is absent', async () => {
    _setHasMigration011ForTest(false);

    // Test createPaymentOrder fails closed with 503
    await assert.rejects(
      async () => {
        await createPaymentOrder({ orderId: 'b7b83d1c-1234-4567-890a-bcdef0123456' }, { user_id: 'user_mock' });
      },
      (err) => {
        assert.strictEqual(err.status, 503);
        assert.match(err.message, /database migration 011 required/i);
        return true;
      }
    );

    // Test verifyPayment fails closed with 503
    await assert.rejects(
      async () => {
        await verifyPayment(
          {
            orderId: 'b7b83d1c-1234-4567-890a-bcdef0123456',
            razorpayOrderId: 'order_rzp_mock123',
            razorpayPaymentId: 'pay_mock123',
            razorpaySignature: 'sig_mock123',
          },
          { user_id: 'user_mock' }
        );
      },
      (err) => {
        assert.strictEqual(err.status, 503);
        assert.match(err.message, /database migration 011 required/i);
        return true;
      }
    );
  });

  test('Checkout integrity: Idempotent order lookup retrieves existing order without duplicating or erroring', async () => {
    _setHasMigration011ForTest(false);

    const existingOrder = {
      id: 'ord_idem_01',
      order_number: 'US-20261017-IDEM01',
      status: 'pending',
      payment_status: 'pending',
      grand_total: 2500,
      items: [{ id: 'item_1', name: 'Alpaca Crewneck', quantity: 1, price_at_order: 2500 }],
    };

    setSupabaseClient({
      from: (table) => {
        assert.strictEqual(table, 'orders');
        return {
          select: (cols) => {
            assert.strictEqual(cols, ORDER_WITH_ITEMS, 'Must use BASE projection when migration 011 is unapplied');
            return {
              eq: (field, val) => {
                assert.strictEqual(field, 'order_number');
                assert.strictEqual(val, 'US-20261017-IDEM01');
                return {
                  maybeSingle: async () => ({
                    data: existingOrder,
                    error: null,
                  }),
                };
              },
            };
          },
        };
      },
    });

    const result = await findOrderByNumber('US-20261017-IDEM01');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data?.id, 'ord_idem_01');
    assert.strictEqual(result.data?.order_number, 'US-20261017-IDEM01');
  });

  test('Checkout integrity: Stock reservation decrementStock uses CAS and guards against race conditions', async () => {
    let readAttempts = 0;
    let updateAttempts = 0;
    let currentStock = 5;

    setSupabaseClient({
      from: (table) => {
        assert.strictEqual(table, 'products');
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => {
                readAttempts++;
                return {
                  data: { id: 42, stock_quantity: currentStock },
                  error: null,
                };
              },
            }),
          }),
          update: (patch) => ({
            eq: (col1, val1) => ({
              eq: (col2, val2) => ({
                select: () => ({
                  maybeSingle: async () => {
                    updateAttempts++;
                    if (updateAttempts === 1) {
                      // First update attempt simulates concurrent stock movement (CAS mismatch)
                      currentStock = 4; // Moved concurrently
                      return { data: null, error: null };
                    }
                    // Second attempt succeeds
                    currentStock = patch.stock_quantity;
                    return {
                      data: { id: 42, stock_quantity: currentStock },
                      error: null,
                    };
                  },
                }),
              }),
            }),
          }),
        };
      },
    });

    const result = await decrementStock(42, 2, 5);
    assert.strictEqual(result.ok, true, 'CAS decrement must succeed after retry');
    assert.strictEqual(result.data?.stock_quantity, 2, 'Stock must decrement from 4 to 2');
    assert.strictEqual(readAttempts, 2, 'Should have read stock twice due to retry');
    assert.strictEqual(updateAttempts, 2, 'Should have updated stock twice');
  });
});
