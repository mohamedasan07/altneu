import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import express from 'express';
import { setSupabaseClient } from '../database/client.js';
import { config } from '../config/index.js';
import { ApiError } from '../utils/apiError.js';
import {
  cancelAdminOrder,
  updateAdminOrderStatus,
  updateAdminOrderPaymentStatus,
} from '../services/adminOrder.service.js';
import { cancelOrder } from '../services/order.service.js';
import {
  handleWebhookEvent,
  handleRefundWebhookEvent,
  setRefundHttpTransport,
} from '../services/payment.service.js';
import adminOrderRoutes from '../routes/adminOrder.routes.js';
import { errorHandler } from '../middleware/errorHandler.js';

/**
 * ALTNEU — Admin-Initiated Cancellation and Safe Refund Workflow Test Suite
 *
 * Validates:
 * 1. Unpaid order admin cancellation: restores inventory exactly once, sets status cancelled & payment_status failed, truthful status history ('admin').
 * 2. Paid order admin cancellation: restores inventory exactly once, creates durable refund intent for captured payment, does not mark refunded prematurely.
 * 3. Exactly-once invariants and idempotency across repeated cancellation calls.
 * 4. Prohibition of direct manual 'refunded' status assignment via status/payment PATCH.
 * 5. Protection of delivered orders from cancellation.
 * 6. Continued enforcement of customer self-service cancellation prohibition.
 * 7. Webhook reconciliation for both normal refund intents and manual Razorpay dashboard refunds.
 * 8. Late capture race preservation on cancelled orders.
 * 9. HTTP route integration for POST / PATCH /api/admin/orders/:id/cancel.
 */

const TEST_ORDER_ID = '11111111-1111-1111-1111-111111111111';
const TEST_USER_ID = '22222222-2222-2222-2222-222222222222';
const TEST_PAYMENT_ID = 'pay_test_capture_987654';
const TEST_WEBHOOK_SECRET = 'whsec_test_secret_admin_cancel_12345';
const TEST_JWT_SECRET = 'jwt_test_secret_for_admin_cancel_workflow_tests_32ch';

function createSignedWebhookPayload(payloadObj, secret = TEST_WEBHOOK_SECRET) {
  const rawBody = Buffer.from(JSON.stringify(payloadObj), 'utf8');
  const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return { rawBody, signature };
}

function makeMockOrderRow(overrides = {}) {
  return {
    id: TEST_ORDER_ID,
    user_id: TEST_USER_ID,
    status: 'pending',
    payment_status: 'pending',
    currency: 'INR',
    subtotal: 10000,
    shipping_fee: 0,
    discount_amount: 0,
    tax_amount: 0,
    grand_total: 10000,
    shipping_address: { full_name: 'Test Customer', city: 'Mumbai', postal_code: '400001' },
    billing_address: null,
    order_number: 'ALT-TEST-001',
    altneu_number: 'ALT-TEST-001',
    placed_at: '2026-10-15T10:00:00.000Z',
    created_at: '2026-10-15T10:00:00.000Z',
    updated_at: '2026-10-15T10:00:00.000Z',
    razorpay_order_id: 'order_test_rzp_111',
    razorpay_payment_id: null,
    refund_status: null,
    refund_reason: null,
    refund_idempotency_key: null,
    items: [
      {
        id: 'item-1',
        order_id: TEST_ORDER_ID,
        product_id: 'prod-item-1',
        quantity: 2,
        price_at_order: 3000,
        size: 'M',
        color: 'Black',
      },
      {
        id: 'item-2',
        order_id: TEST_ORDER_ID,
        product_id: 'prod-item-2',
        quantity: 1,
        price_at_order: 4000,
        size: 'L',
        color: 'Navy',
      },
    ],
    ...overrides,
  };
}

describe('Admin-Initiated Cancellation and Safe Refund Workflow', () => {
  let originalWebhookSecret;
  let originalJwtSecret;

  beforeEach(() => {
    originalWebhookSecret = config.razorpay.webhookSecret;
    originalJwtSecret = config.auth.jwtSecret;
    config.razorpay.webhookSecret = TEST_WEBHOOK_SECRET;
    config.auth.jwtSecret = TEST_JWT_SECRET;
    setRefundHttpTransport(null);
  });

  afterEach(() => {
    config.razorpay.webhookSecret = originalWebhookSecret;
    config.auth.jwtSecret = originalJwtSecret;
    setSupabaseClient(null);
    setRefundHttpTransport(null);
  });

  // =========================================================================
  // 1. Unpaid Order Admin Cancellation & Migration 016 Fail-Closed Safeguard
  // =========================================================================
  describe('Unpaid admin cancellation', () => {
    test('fails closed with HTTP 503 when Migration 016 RPC is missing on client', async () => {
      const orderRow = makeMockOrderRow({
        status: 'pending',
        payment_status: 'pending',
      });

      // supabase client without .rpc function
      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { ...orderRow }, error: null }),
                }),
              }),
            };
          }
          return {};
        },
      });

      await assert.rejects(
        async () => {
          await cancelAdminOrder(TEST_ORDER_ID, { reason: 'Missing RPC test' });
        },
        (err) => {
          assert(err instanceof ApiError);
          assert.strictEqual(err.status, 503);
          assert.match(err.message, /Migration 016 .* must be applied/i);
          return true;
        }
      );
    });

    test('fails closed with HTTP 503 when database returns function-does-not-exist error', async () => {
      const orderRow = makeMockOrderRow({
        status: 'pending',
        payment_status: 'pending',
      });

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { ...orderRow }, error: null }),
                }),
              }),
            };
          }
          return {};
        },
        rpc: async (fnName) => {
          assert.strictEqual(fnName, 'admin_cancel_order_atomic');
          return {
            data: null,
            error: {
              code: '42883',
              message: 'function public.admin_cancel_order_atomic(uuid, text, text) does not exist',
            },
          };
        },
      });

      await assert.rejects(
        async () => {
          await cancelAdminOrder(TEST_ORDER_ID, { reason: 'Unapplied migration test' });
        },
        (err) => {
          assert(err instanceof ApiError);
          assert.strictEqual(err.status, 503);
          assert.match(err.message, /Migration 016 .* must be applied/i);
          return true;
        }
      );
    });

    test('restores inventory exactly once and records admin status history via atomic RPC', async () => {
      let rpcParams = null;
      const orderRow = makeMockOrderRow({
        status: 'pending',
        payment_status: 'pending',
      });

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { ...orderRow }, error: null }),
                }),
              }),
            };
          }
          if (table === 'order_status_history') {
            return {
              select: () => ({
                eq: () => ({
                  order: async () => ({
                    data: [{ status: 'cancelled', by_role: 'admin', created_at: new Date().toISOString() }],
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        },
        rpc: async (fnName, params) => {
          if (fnName === 'admin_cancel_order_atomic') {
            rpcParams = params;
            orderRow.status = 'cancelled';
            orderRow.payment_status = 'failed';
            return {
              data: {
                success: true,
                order_id: params.p_order_id,
                is_paid: false,
                items_restored: 2,
                quantity_restored: 3,
                order: { ...orderRow },
              },
              error: null,
            };
          }
          return { data: null, error: { message: 'unknown RPC' } };
        },
      });

      const result = await cancelAdminOrder(TEST_ORDER_ID, { reason: 'Customer requested by phone' });

      // Invariants:
      assert.strictEqual(result.status, 'cancelled');
      assert.strictEqual(result.paymentStatus, 'failed');
      assert.strictEqual(orderRow.status, 'cancelled');
      assert.strictEqual(orderRow.payment_status, 'failed');

      // Verified atomic RPC call
      assert(rpcParams, 'admin_cancel_order_atomic RPC must be called');
      assert.strictEqual(rpcParams.p_order_id, TEST_ORDER_ID);
      assert.strictEqual(rpcParams.p_reason, 'Customer requested by phone');

      // Status history verification
      assert(result.history.some((h) => h.status === 'cancelled' && h.by === 'admin'));
    });
  });

  // =========================================================================
  // 2. Paid Order Admin Cancellation & Durable Refund Intent Creation
  // =========================================================================
  describe('Paid admin cancellation', () => {
    test('restores stock exactly once and creates durable refund intent for captured payment via atomic RPC', async () => {
      const paidOrderRow = makeMockOrderRow({
        status: 'confirmed',
        payment_status: 'paid',
        razorpay_payment_id: TEST_PAYMENT_ID,
        grand_total: 10000,
      });

      const mockIntent = {
        id: 'intent-uuid-001',
        order_id: TEST_ORDER_ID,
        payment_id: TEST_PAYMENT_ID,
        amount: 1000000,
        currency: 'INR',
        status: 'pending',
        reason: 'Customer requested cancellation of paid order',
        idempotency_key: 'rfnd_adm_testkey123',
      };

      let rpcCalledWith = null;

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { ...paidOrderRow }, error: null }),
                }),
              }),
            };
          }
          if (table === 'refund_intents') {
            return {
              select: () => ({
                eq: (col, val) => ({
                  maybeSingle: async () => ({ data: val === mockIntent.id ? mockIntent : null, error: null }),
                }),
              }),
            };
          }
          if (table === 'order_status_history') {
            return {
              select: () => ({
                eq: () => ({
                  order: async () => ({
                    data: [{ status: 'cancelled', by_role: 'admin', created_at: new Date().toISOString() }],
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        },
        rpc: async (fnName, params) => {
          if (fnName === 'admin_cancel_order_atomic') {
            rpcCalledWith = params;
            paidOrderRow.status = 'cancelled';
            paidOrderRow.refund_status = 'pending';
            return {
              data: {
                success: true,
                order_id: params.p_order_id,
                is_paid: true,
                items_restored: 2,
                quantity_restored: 3,
                refund_intent_id: mockIntent.id,
                refund_intent_status: 'pending',
                idempotency_key: mockIntent.idempotency_key,
                order: { ...paidOrderRow },
              },
              error: null,
            };
          }
          return { data: null, error: { message: 'unknown RPC' } };
        },
      });

      const result = await cancelAdminOrder(TEST_ORDER_ID, { reason: 'Customer requested cancellation of paid order' });

      // Order status is cancelled, but payment status is NOT falsely claimed refunded!
      assert.strictEqual(result.status, 'cancelled');
      assert.strictEqual(paidOrderRow.status, 'cancelled');
      assert.strictEqual(paidOrderRow.payment_status, 'paid', 'payment_status must remain paid until confirmed by Razorpay');
      assert.strictEqual(paidOrderRow.refund_status, 'pending');

      // RPC invoked with orderId and reason
      assert(rpcCalledWith);
      assert.strictEqual(rpcCalledWith.p_order_id, TEST_ORDER_ID);
      assert.strictEqual(rpcCalledWith.p_reason, 'Customer requested cancellation of paid order');

      // Truthful status history entry recorded
      assert(result.history.some((h) => h.status === 'cancelled' && h.by === 'admin'));
    });
  });

  // =========================================================================
  // 3. Exactly-Once Invariants & Repeated Cancellation (Idempotency)
  // =========================================================================
  describe('Idempotency and duplicate requests', () => {
    test('repeated cancellation calls exit safely without duplicate stock restoration or duplicate intents', async () => {
      let stockRestores = 0;
      let intentCreates = 0;

      const cancelledOrderRow = makeMockOrderRow({
        status: 'cancelled',
        payment_status: 'paid',
        refund_status: 'pending',
        razorpay_payment_id: TEST_PAYMENT_ID,
      });

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { ...cancelledOrderRow }, error: null }),
                }),
              }),
            };
          }
          if (table === 'products') {
            stockRestores++;
            return { update: () => ({ eq: () => ({}) }) };
          }
          if (table === 'refund_intents') {
            intentCreates++;
            return { insert: () => ({ select: () => ({ maybeSingle: async () => ({ data: {} }) }) }) };
          }
          if (table === 'order_status_history') {
            return {
              select: () => ({
                eq: () => ({
                  order: async () => ({ data: [{ status: 'cancelled', by_role: 'admin' }], error: null }),
                }),
              }),
            };
          }
          return {};
        },
      });

      const firstReplay = await cancelAdminOrder(TEST_ORDER_ID);
      const secondReplay = await cancelAdminOrder(TEST_ORDER_ID);

      assert.strictEqual(firstReplay.status, 'cancelled');
      assert.strictEqual(secondReplay.status, 'cancelled');
      assert.strictEqual(stockRestores, 0, 'No stock should be touched on duplicate cancellation');
      assert.strictEqual(intentCreates, 0, 'No refund intent should be created on duplicate cancellation');
    });

    test('updateAdminOrderStatus delegates to cancelAdminOrder when status is cancelled', async () => {
      const orderRow = makeMockOrderRow({
        status: 'confirmed',
        payment_status: 'pending',
      });

      let stockRestored = false;

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { ...orderRow }, error: null }),
                }),
              }),
            };
          }
          if (table === 'order_status_history') {
            return {
              select: () => ({
                eq: () => ({
                  order: async () => ({ data: [{ status: 'cancelled', by_role: 'admin' }], error: null }),
                }),
              }),
            };
          }
          return {};
        },
        rpc: async (fnName, params) => {
          if (fnName === 'admin_cancel_order_atomic') {
            orderRow.status = 'cancelled';
            orderRow.payment_status = 'failed';
            stockRestored = true;
            return {
              data: {
                success: true,
                order_id: params.p_order_id,
                is_paid: false,
                items_restored: 2,
                quantity_restored: 3,
                order: { ...orderRow },
              },
              error: null,
            };
          }
          return { data: null, error: { message: 'unknown RPC' } };
        },
      });

      const updated = await updateAdminOrderStatus(TEST_ORDER_ID, { status: 'cancelled', reason: 'Admin cancel via PATCH /status' });
      assert.strictEqual(updated.status, 'cancelled');
      assert.strictEqual(stockRestored, true, 'Stock restoration must occur via atomic RPC when updating status to cancelled');
    });
  });

  // =========================================================================
  // 4. Protection Against Manual 'refunded' Status Setting
  // =========================================================================
  describe('Prohibition of direct manual refunded status setting', () => {
    test('rejects setting status: "refunded" directly via status PATCH', async () => {
      await assert.rejects(
        async () => {
          await updateAdminOrderStatus(TEST_ORDER_ID, { status: 'refunded' });
        },
        (err) => {
          assert(err instanceof ApiError);
          assert.strictEqual(err.status, 400);
          assert.match(err.message, /Orders cannot be marked refunded directly/i);
          return true;
        }
      );
    });

    test('rejects setting paymentStatus: "refunded" directly via payment PATCH', async () => {
      await assert.rejects(
        async () => {
          await updateAdminOrderPaymentStatus(TEST_ORDER_ID, { paymentStatus: 'refunded' });
        },
        (err) => {
          assert(err instanceof ApiError);
          assert.strictEqual(err.status, 400);
          assert.match(err.message, /Payment status cannot be marked refunded directly/i);
          return true;
        }
      );
    });

    test('rejects transitioning already cancelled or refunded orders to active statuses', async () => {
      const cancelledOrder = makeMockOrderRow({ status: 'cancelled' });

      setSupabaseClient({
        from: (table) => {
          assert.strictEqual(table, 'orders');
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: cancelledOrder, error: null }),
              }),
            }),
          };
        },
      });

      await assert.rejects(
        async () => {
          await updateAdminOrderStatus(TEST_ORDER_ID, { status: 'confirmed' });
        },
        (err) => {
          assert(err instanceof ApiError);
          assert.strictEqual(err.status, 400);
          assert.match(err.message, /Cannot update status: order is already cancelled/i);
          return true;
        }
      );
    });
  });

  // =========================================================================
  // 5. Dispatched & Delivered Order Protection (Shipped / Delivered Guards)
  // =========================================================================
  describe('Dispatched and delivered order protection', () => {
    test('rejects cancellation of shipped orders with HTTP 400', async () => {
      const shippedOrder = makeMockOrderRow({ status: 'shipped', payment_status: 'paid' });

      setSupabaseClient({
        from: (table) => {
          assert.strictEqual(table, 'orders');
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: shippedOrder, error: null }),
              }),
            }),
          };
        },
      });

      await assert.rejects(
        async () => {
          await cancelAdminOrder(TEST_ORDER_ID);
        },
        (err) => {
          assert(err instanceof ApiError);
          assert.strictEqual(err.status, 400);
          assert.match(err.message, /Orders in 'shipped' status cannot be cancelled/i);
          return true;
        }
      );
    });

    test('rejects cancellation of delivered orders with HTTP 400', async () => {
      const deliveredOrder = makeMockOrderRow({ status: 'delivered', payment_status: 'paid' });

      setSupabaseClient({
        from: (table) => {
          assert.strictEqual(table, 'orders');
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: deliveredOrder, error: null }),
              }),
            }),
          };
        },
      });

      await assert.rejects(
        async () => {
          await cancelAdminOrder(TEST_ORDER_ID);
        },
        (err) => {
          assert(err instanceof ApiError);
          assert.strictEqual(err.status, 400);
          assert.match(err.message, /Orders in 'delivered' status cannot be cancelled/i);
          return true;
        }
      );
    });
  });

  // =========================================================================
  // 6. Preservation of Customer Cancellation Policy
  // =========================================================================
  describe('Customer cancellation policy preservation', () => {
    test('customer self-service cancelOrder remains disabled and untouched', async () => {
      const orderRow = makeMockOrderRow({ status: 'pending' });

      setSupabaseClient({
        from: (table) => {
          assert.strictEqual(table, 'orders');
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: orderRow, error: null }),
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
          assert.strictEqual(err.status, 400);
          assert.match(err.message, /Self-service order cancellation is not available/i);
          return true;
        }
      );
    });
  });

  // =========================================================================
  // 7. Webhook Reconciliation & Manual Razorpay Dashboard Refunds
  // =========================================================================
  describe('Webhook reconciliation', () => {
    test('reconciles manual Razorpay dashboard refund directly to matching cancelled order without touching stock', async () => {
      const paidOrder = makeMockOrderRow({
        status: 'cancelled',
        payment_status: 'paid',
        razorpay_payment_id: TEST_PAYMENT_ID,
        grand_total: 10000,
      });

      let orderUpdated = null;
      let historyCreated = null;
      let intentCreated = null;
      let stockRestoredCount = 0;

      setSupabaseClient({
        from: (table) => {
          if (table === 'refund_intents') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }), // No pre-existing intent
                }),
              }),
              insert: (row) => {
                intentCreated = row;
                return {
                  select: () => ({
                    maybeSingle: async () => ({ data: { ...row, id: 'intent-reconciled-01' }, error: null }),
                  }),
                };
              },
            };
          }
          if (table === 'orders') {
            return {
              select: () => ({
                eq: (col, val) => {
                  assert.strictEqual(col, 'razorpay_payment_id');
                  assert.strictEqual(val, TEST_PAYMENT_ID);
                  return {
                    maybeSingle: async () => ({ data: { ...paidOrder }, error: null }),
                  };
                },
              }),
              update: (patch) => {
                orderUpdated = patch;
                return {
                  eq: () => ({}),
                };
              },
            };
          }
          if (table === 'products') {
            stockRestoredCount++;
            return {
              select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { stock_quantity: 5 } }) }) }),
              update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: { stock_quantity: 7 } }) }) }) }) }),
            };
          }
          if (table === 'order_status_history') {
            return {
              insert: (row) => {
                historyCreated = row;
                return {
                  select: () => ({
                    single: async () => ({ data: { ...row, id: 'h-1' } }),
                    maybeSingle: async () => ({ data: { ...row, id: 'h-1' } }),
                  }),
                };
              },
            };
          }
          if (table === 'razorpay_webhook_events') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
              insert: (row) => ({
                select: () => ({
                  single: async () => ({ data: { ...row }, error: null }),
                  maybeSingle: async () => ({ data: { ...row }, error: null }),
                }),
              }),
            };
          }
          return {};
        },
      });

      const refundWebhookPayload = {
        entity: 'event',
        event: 'refund.processed',
        payload: {
          refund: {
            entity: {
              id: 'rfnd_manual_dashboard_999',
              payment_id: TEST_PAYMENT_ID,
              amount: 1000000,
              currency: 'INR',
              status: 'processed',
              notes: {}, // No notes attached (typical for manual dashboard refunds)
            },
          },
        },
      };

      const result = await handleRefundWebhookEvent(
        'evt_refund_proc_manual_001',
        'refund.processed',
        refundWebhookPayload
      );

      assert.strictEqual(result.received, true);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.reconciledManualRefund, true);

      // Order updated to refunded
      assert(orderUpdated, 'Order must be updated in database');
      assert.strictEqual(orderUpdated.status, 'refunded');
      assert.strictEqual(orderUpdated.payment_status, 'refunded');
      assert.strictEqual(orderUpdated.refund_status, 'completed');
      assert.strictEqual(orderUpdated.razorpay_refund_id, 'rfnd_manual_dashboard_999');

      // Reconciled refund intent created
      assert(intentCreated);
      assert.strictEqual(intentCreated.payment_id, TEST_PAYMENT_ID);
      assert.strictEqual(intentCreated.status, 'completed');

      // History recorded
      assert(historyCreated);
      assert.strictEqual(historyCreated.status, 'refunded');
      assert.strictEqual(historyCreated.by_role, 'system');

      // Stock was NOT touched (must be 0, inventory is not restored on refund webhooks)
      assert.strictEqual(stockRestoredCount, 0, 'Inventory MUST NOT be touched on refund webhook events');
    });

    test('manual refund webhook for shipped order updates payment status but preserves fulfillment status and touches zero stock', async () => {
      const shippedOrder = makeMockOrderRow({
        status: 'shipped',
        payment_status: 'paid',
        razorpay_payment_id: TEST_PAYMENT_ID,
        grand_total: 10000,
      });

      let orderUpdated = null;
      let historyCreated = null;
      let stockRestoredCount = 0;

      setSupabaseClient({
        from: (table) => {
          if (table === 'refund_intents') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
              insert: (row) => ({
                select: () => ({
                  maybeSingle: async () => ({ data: { ...row, id: 'intent-reconciled-02' }, error: null }),
                }),
              }),
            };
          }
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { ...shippedOrder }, error: null }),
                }),
              }),
              update: (patch) => {
                orderUpdated = patch;
                return { eq: () => ({}) };
              },
            };
          }
          if (table === 'products') {
            stockRestoredCount++;
            return { select: () => ({}), update: () => ({}) };
          }
          if (table === 'order_status_history') {
            return {
              insert: (row) => {
                historyCreated = row;
                return { select: () => ({ single: async () => ({ data: row }) }) };
              },
            };
          }
          if (table === 'razorpay_webhook_events') {
            return {
              select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
              insert: (row) => ({
                select: () => ({
                  single: async () => ({ data: { ...row }, error: null }),
                  maybeSingle: async () => ({ data: { ...row }, error: null }),
                }),
              }),
            };
          }
          return {};
        },
      });

      const result = await handleRefundWebhookEvent(
        'evt_refund_proc_shipped_001',
        'refund.processed',
        {
          entity: 'event',
          event: 'refund.processed',
          payload: {
            refund: {
              entity: {
                id: 'rfnd_manual_shipped_888',
                payment_id: TEST_PAYMENT_ID,
                amount: 1000000,
                currency: 'INR',
                status: 'processed',
              },
            },
          },
        }
      );

      assert.strictEqual(result.received, true);
      assert.strictEqual(result.success, true);
      assert(orderUpdated);
      assert.strictEqual(orderUpdated.payment_status, 'refunded');
      assert.strictEqual(orderUpdated.refund_status, 'completed');
      // Status must NOT be overwritten to 'refunded' since order is already shipped
      assert.strictEqual(orderUpdated.status, undefined);
      assert.strictEqual(historyCreated, null, 'No order status history transition recorded');
      assert.strictEqual(stockRestoredCount, 0, 'No stock restoration for shipped orders');
    });

    test('partial manual refund sets refund_status to partial_refunded without marking payment_status or status refunded', async () => {
      const confirmedOrder = makeMockOrderRow({
        status: 'confirmed',
        payment_status: 'paid',
        razorpay_payment_id: TEST_PAYMENT_ID,
        grand_total: 10000, // 10000 INR = 1000000 paise
      });

      let orderUpdated = null;
      let stockRestoredCount = 0;

      setSupabaseClient({
        from: (table) => {
          if (table === 'refund_intents') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
              insert: (row) => ({
                select: () => ({
                  maybeSingle: async () => ({ data: { ...row, id: 'intent-part-01' }, error: null }),
                }),
              }),
            };
          }
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { ...confirmedOrder }, error: null }),
                }),
              }),
              update: (patch) => {
                orderUpdated = patch;
                return { eq: () => ({}) };
              },
            };
          }
          if (table === 'products') {
            stockRestoredCount++;
            return {};
          }
          if (table === 'razorpay_webhook_events') {
            return {
              select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
              insert: (row) => ({
                select: () => ({
                  single: async () => ({ data: { ...row }, error: null }),
                  maybeSingle: async () => ({ data: { ...row }, error: null }),
                }),
              }),
            };
          }
          return {};
        },
      });

      const result = await handleRefundWebhookEvent(
        'evt_refund_proc_partial_001',
        'refund.processed',
        {
          entity: 'event',
          event: 'refund.processed',
          payload: {
            refund: {
              entity: {
                id: 'rfnd_part_555',
                payment_id: TEST_PAYMENT_ID,
                amount: 300000, // Partial refund: 3000 INR of 10000 INR
                currency: 'INR',
                status: 'processed',
              },
            },
          },
        }
      );

      assert.strictEqual(result.received, true);
      assert.strictEqual(result.success, true);
      assert(orderUpdated);
      assert.strictEqual(orderUpdated.refund_status, 'partial_refunded');
      assert.strictEqual(orderUpdated.payment_status, undefined, 'payment_status must not be marked refunded on partial refund');
      assert.strictEqual(orderUpdated.status, undefined, 'status must not be marked refunded on partial refund');
      assert.strictEqual(stockRestoredCount, 0, 'No stock restoration on partial refund');
    });

    test('refund.created with pending status keeps order in pending refund state and does not mark refunded', async () => {
      const intentRecord = {
        id: 'intent-uuid-p1',
        order_id: TEST_ORDER_ID,
        payment_id: TEST_PAYMENT_ID,
        amount: 1000000,
        currency: 'INR',
        status: 'pending',
      };

      let orderUpdated = false;

      setSupabaseClient({
        from: (table) => {
          if (table === 'refund_intents') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: intentRecord, error: null }),
                }),
              }),
              update: () => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: async () => ({ data: { ...intentRecord, razorpay_refund_id: 'rfnd_pending_111' } }),
                  }),
                }),
              }),
            };
          }
          if (table === 'orders') {
            return {
              update: () => {
                orderUpdated = true;
                return { eq: () => ({}) };
              },
            };
          }
          if (table === 'razorpay_webhook_events') {
            return {
              insert: (row) => ({
                select: () => ({
                  single: async () => ({ data: { ...row }, error: null }),
                  maybeSingle: async () => ({ data: { ...row }, error: null }),
                }),
              }),
            };
          }
          return {};
        },
      });

      const payload = {
        entity: 'event',
        event: 'refund.created',
        payload: {
          refund: {
            entity: {
              id: 'rfnd_pending_111',
              payment_id: TEST_PAYMENT_ID,
              amount: 1000000,
              currency: 'INR',
              status: 'pending',
              notes: { refund_intent_id: 'intent-uuid-p1' },
            },
          },
        },
      };

      const result = await handleRefundWebhookEvent('evt_rfnd_created_01', 'refund.created', payload);
      assert.strictEqual(result.received, true);
      assert.strictEqual(result.status, 'processing');
      // Order must NOT be marked refunded on pending refund creation
      assert.strictEqual(orderUpdated, false);
    });

    test('refund.failed flags intent for manual review and does not mark order refunded', async () => {
      const intentRecord = {
        id: 'intent-uuid-f1',
        order_id: TEST_ORDER_ID,
        payment_id: TEST_PAYMENT_ID,
        amount: 1000000,
        currency: 'INR',
        status: 'processing',
      };

      let markedManualReview = false;

      setSupabaseClient({
        from: (table) => {
          if (table === 'refund_intents') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: intentRecord, error: null }),
                }),
              }),
              update: (patch) => {
                if (patch.status === 'manual_review') {
                  markedManualReview = true;
                }
                return {
                  eq: () => ({
                    select: () => ({ maybeSingle: async () => ({ data: { ...intentRecord, ...patch } }) }),
                  }),
                };
              },
            };
          }
          if (table === 'razorpay_webhook_events') {
            return {
              insert: (row) => ({
                select: () => ({
                  single: async () => ({ data: { ...row }, error: null }),
                  maybeSingle: async () => ({ data: { ...row }, error: null }),
                }),
              }),
            };
          }
          return {};
        },
      });

      const payload = {
        entity: 'event',
        event: 'refund.failed',
        payload: {
          refund: {
            entity: {
              id: 'rfnd_failed_111',
              payment_id: TEST_PAYMENT_ID,
              amount: 1000000,
              currency: 'INR',
              status: 'failed',
              error_description: 'Insufficient balance in merchant account',
              notes: { refund_intent_id: 'intent-uuid-f1' },
            },
          },
        },
      };

      const result = await handleRefundWebhookEvent('evt_rfnd_failed_01', 'refund.failed', payload);
      assert.strictEqual(result.received, true);
      assert.strictEqual(result.status, 'failed');
      assert.strictEqual(markedManualReview, true);
    });
  });

  // =========================================================================
  // 8. Late Capture Race Preservation
  // =========================================================================
  describe('Late capture preservation on admin-cancelled order', () => {
    test('late capture on cancelled order creates refund intent without resurrecting order or restoring stock', async () => {
      const cancelledOrder = makeMockOrderRow({
        status: 'cancelled',
        payment_status: 'failed',
        razorpay_order_id: 'order_test_late_cap_123',
        grand_total: 10000,
      });

      let stockModified = false;
      let orderResurrected = false;
      let lateCaptureIntentCreated = false;

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: (col, val) => {
                  return {
                    maybeSingle: async () => ({ data: { ...cancelledOrder }, error: null }),
                  };
                },
              }),
              update: (patch) => {
                if (patch.status === 'confirmed' || patch.payment_status === 'paid') {
                  orderResurrected = true;
                }
                return { eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: {} }) }) }) }) };
              },
            };
          }
          if (table === 'products') {
            stockModified = true;
            return { update: () => ({ eq: () => ({}) }) };
          }
          if (table === 'razorpay_webhook_events') {
            return {
              select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
              insert: (row) => ({
                select: () => ({
                  single: async () => ({ data: { ...row }, error: null }),
                  maybeSingle: async () => ({ data: { ...row }, error: null }),
                }),
              }),
            };
          }
          if (table === 'refund_intents') {
            lateCaptureIntentCreated = true;
            return {
              insert: () => ({
                select: () => ({
                  maybeSingle: async () => ({
                    data: { id: 'intent-late-1', status: 'pending', idempotency_key: 'rfnd_late_1' },
                  }),
                }),
              }),
            };
          }
          return {};
        },
      });

      const payload = {
        entity: 'event',
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_late_capture_777',
              order_id: 'order_test_late_cap_123',
              amount: 1000000,
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      };

      const { rawBody, signature } = createSignedWebhookPayload(payload, TEST_WEBHOOK_SECRET);

      const result = await handleWebhookEvent({
        rawBody,
        signature,
        eventId: 'evt_test_late_capture_001',
        payload,
      });

      assert.strictEqual(result.received, true);
      assert.strictEqual(result.status, 'late_capture_on_cancelled_order');
      assert.strictEqual(lateCaptureIntentCreated, true, 'Durable refund intent must be created for late capture');
      assert.strictEqual(orderResurrected, false, 'Late capture must NEVER resurrect cancelled order');
      assert.strictEqual(stockModified, false, 'Stock must NOT be modified again on late capture');
    });

    test('rejects late capture when payment entity ID is missing or blank (HTTP 400)', async () => {
      setSupabaseClient({
        from: (table) => {
          if (table === 'razorpay_webhook_events') {
            return {
              select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
            };
          }
          return {};
        },
      });

      const payload = {
        entity: 'event',
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: '', // Empty payment ID
              order_id: 'order_test_late_cap_123',
              amount: 1000000,
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      };

      const { rawBody, signature } = createSignedWebhookPayload(payload, TEST_WEBHOOK_SECRET);

      await assert.rejects(
        async () => {
          await handleWebhookEvent({
            rawBody,
            signature,
            eventId: 'evt_test_missing_pay_id',
            payload,
          });
        },
        (err) => {
          assert.strictEqual(err.status, 400);
          assert.match(err.message, /missing or invalid payment ID/i);
          return true;
        }
      );
    });

    test('rejects late capture when payment entity order_id is missing or blank (HTTP 400)', async () => {
      setSupabaseClient({
        from: (table) => {
          if (table === 'razorpay_webhook_events') {
            return {
              select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
            };
          }
          return {};
        },
      });

      const payload = {
        entity: 'event',
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_test_valid_123',
              order_id: '   ', // Blank order ID
              amount: 1000000,
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      };

      const { rawBody, signature } = createSignedWebhookPayload(payload, TEST_WEBHOOK_SECRET);

      await assert.rejects(
        async () => {
          await handleWebhookEvent({
            rawBody,
            signature,
            eventId: 'evt_test_blank_order_id',
            payload,
          });
        },
        (err) => {
          assert.strictEqual(err.status, 400);
          assert.match(err.message, /missing or invalid order ID/i);
          return true;
        }
      );
    });

    test('rejects late capture with 500 when RPC aborts due to conflicting duplicate event', async () => {
      const cancelledOrder = makeMockOrderRow({
        status: 'cancelled',
        payment_status: 'failed',
        razorpay_order_id: 'order_test_late_cap_conflict',
        grand_total: 10000,
      });

      setSupabaseClient({
        rpc: async (fnName) => {
          if (fnName === 'record_late_capture_refund_intent_atomic') {
            return {
              data: null,
              error: {
                message: 'Conflicting concurrent webhook event evt_conflict_123: payment_id mismatch (pay_orig vs pay_different)',
                code: 'P0001',
              },
            };
          }
          return { data: null, error: null };
        },
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { ...cancelledOrder }, error: null }),
                }),
              }),
            };
          }
          if (table === 'razorpay_webhook_events') {
            return {
              select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
            };
          }
          return {};
        },
      });

      const payload = {
        entity: 'event',
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_different',
              order_id: 'order_test_late_cap_conflict',
              amount: 1000000,
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      };

      const { rawBody, signature } = createSignedWebhookPayload(payload, TEST_WEBHOOK_SECRET);

      await assert.rejects(
        async () => {
          await handleWebhookEvent({
            rawBody,
            signature,
            eventId: 'evt_conflict_123',
            payload,
          });
        },
        (err) => {
          assert.strictEqual(err.status, 500);
          assert.match(err.message, /Database error recording late capture refund intent/i);
          return true;
        }
      );
    });

    test('handles verified duplicate late capture event idempotently without duplicate intent', async () => {
      const cancelledOrder = makeMockOrderRow({
        status: 'cancelled',
        payment_status: 'failed',
        razorpay_order_id: 'order_test_late_cap_dup',
        grand_total: 10000,
      });

      setSupabaseClient({
        rpc: async (fnName) => {
          if (fnName === 'record_late_capture_refund_intent_atomic') {
            return {
              data: {
                success: true,
                duplicate_event: true,
                event_id: 'evt_dup_123',
              },
              error: null,
            };
          }
          return { data: null, error: null };
        },
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { ...cancelledOrder }, error: null }),
                }),
              }),
            };
          }
          if (table === 'razorpay_webhook_events') {
            return {
              select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
            };
          }
          return {};
        },
      });

      const payload = {
        entity: 'event',
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_late_dup_123',
              order_id: 'order_test_late_cap_dup',
              amount: 1000000,
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      };

      const { rawBody, signature } = createSignedWebhookPayload(payload, TEST_WEBHOOK_SECRET);

      const result = await handleWebhookEvent({
        rawBody,
        signature,
        eventId: 'evt_dup_123',
        payload,
      });

      assert.strictEqual(result.received, true);
      assert.strictEqual(result.status, 'late_capture_on_cancelled_order');
      assert.strictEqual(result.eventId, 'evt_dup_123');
    });
  });

  // =========================================================================
  // 9. HTTP Integration Tests
  // =========================================================================
  describe('HTTP endpoint integration for admin cancellation', () => {
    test('POST /api/admin/orders/:id/cancel invokes cancelAdminOrder and returns 200 with admin token', async () => {
      const orderRow = makeMockOrderRow({ status: 'confirmed', payment_status: 'pending' });

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { ...orderRow }, error: null }),
                }),
              }),
            };
          }
          if (table === 'order_status_history') {
            return {
              select: () => ({
                eq: () => ({
                  order: async () => ({
                    data: [{ status: 'cancelled', by_role: 'admin', created_at: new Date().toISOString() }],
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        },
        rpc: async (fnName, params) => {
          if (fnName === 'admin_cancel_order_atomic') {
            orderRow.status = 'cancelled';
            orderRow.payment_status = 'failed';
            return {
              data: {
                success: true,
                order_id: params.p_order_id,
                is_paid: false,
                items_restored: 2,
                quantity_restored: 3,
                order: { ...orderRow },
              },
              error: null,
            };
          }
          return { data: null, error: { message: 'unknown RPC' } };
        },
      });

      const adminToken = jwt.sign(
        { id: 'admin-user-uuid', role: 'admin' },
        TEST_JWT_SECRET,
        { expiresIn: '1h' }
      );

      const app = express();
      app.use(express.json());
      app.use('/api/admin/orders', adminOrderRoutes);
      app.use(errorHandler);

      const server = app.listen(0);
      const port = server.address().port;

      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/admin/orders/${TEST_ORDER_ID}/cancel`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ reason: 'HTTP admin cancellation test' }),
        });

        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.success, true);
        assert.strictEqual(data.order.status, 'cancelled');
      } finally {
        server.close();
      }
    });

    test('POST /api/admin/orders/:id/cancel returns 503 when Migration 016 is unapplied (fail-closed)', async () => {
      const orderRow = makeMockOrderRow({ status: 'confirmed', payment_status: 'pending' });

      // supabase client without RPC function
      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { ...orderRow }, error: null }),
                }),
              }),
            };
          }
          return {};
        },
      });

      const adminToken = jwt.sign(
        { id: 'admin-user-uuid', role: 'admin' },
        TEST_JWT_SECRET,
        { expiresIn: '1h' }
      );

      const app = express();
      app.use(express.json());
      app.use('/api/admin/orders', adminOrderRoutes);
      app.use(errorHandler);

      const server = app.listen(0);
      const port = server.address().port;

      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/admin/orders/${TEST_ORDER_ID}/cancel`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ reason: 'HTTP 503 fail-closed test' }),
        });

        assert.strictEqual(res.status, 503);
        const data = await res.json();
        assert.match(data.error, /Migration 016 .* must be applied/i);
      } finally {
        server.close();
      }
    });
  });
});
