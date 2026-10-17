import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import express from 'express';
import {
  verifyWebhookSignature,
  handleWebhookEvent,
} from '../services/payment.service.js';
import {
  isWebhookProcessed,
  recordWebhookEvent,
} from '../repositories/order.repository.js';
import { setSupabaseClient } from '../database/client.js';
import { config } from '../config/index.js';
import { ApiError } from '../utils/apiError.js';
import paymentRoutes from '../routes/payment.routes.js';

const TEST_WEBHOOK_SECRET = 'whsec_test_secret_xyz789';

function createSignedWebhookPayload(payloadObj, secret = TEST_WEBHOOK_SECRET) {
  const rawBody = Buffer.from(JSON.stringify(payloadObj), 'utf8');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  return { rawBody, signature };
}

describe('Phase 3: Secure Razorpay Webhook Implementation', () => {
  let originalWebhookSecret;
  let originalBrevoKey;

  beforeEach(() => {
    originalWebhookSecret = config.razorpay.webhookSecret;
    originalBrevoKey = process.env.BREVO_API_KEY;
    config.razorpay.webhookSecret = TEST_WEBHOOK_SECRET;
    process.env.BREVO_API_KEY = '';
  });

  afterEach(() => {
    config.razorpay.webhookSecret = originalWebhookSecret;
    process.env.BREVO_API_KEY = originalBrevoKey;
    setSupabaseClient(null);
  });

  // --------------------------------------------------------------------------
  // 1. Webhook Signature Verification
  // --------------------------------------------------------------------------
  test('Webhook signature: valid HMAC-SHA256 returns true', () => {
    const payload = { event: 'payment.captured', id: 'evt_valid_1' };
    const { rawBody, signature } = createSignedWebhookPayload(payload);

    const result = verifyWebhookSignature(rawBody, signature);
    assert.strictEqual(result, true, 'Valid webhook signature must return true');
  });

  test('Webhook signature: invalid signature throws 400', () => {
    const payload = { event: 'payment.captured', id: 'evt_invalid_1' };
    const { rawBody } = createSignedWebhookPayload(payload);
    const tamperedSignature = 'b'.repeat(64);

    assert.throws(
      () => verifyWebhookSignature(rawBody, tamperedSignature),
      (err) => err instanceof ApiError && err.status === 400 && err.message.includes('Invalid webhook signature')
    );
  });

  test('Webhook signature: tampered raw body throws 400', () => {
    const payload = { event: 'payment.captured', id: 'evt_tampered_1' };
    const { rawBody, signature } = createSignedWebhookPayload(payload);
    const tamperedBody = Buffer.from(rawBody.toString('utf8') + ' ', 'utf8');

    assert.throws(
      () => verifyWebhookSignature(tamperedBody, signature),
      (err) => err instanceof ApiError && err.status === 400
    );
  });

  test('Webhook signature: missing or empty raw body throws 400', () => {
    const signature = 'c'.repeat(64);

    assert.throws(
      () => verifyWebhookSignature(null, signature),
      (err) => err instanceof ApiError && err.status === 400 && err.message.includes('Missing raw request body')
    );

    assert.throws(
      () => verifyWebhookSignature(Buffer.from([]), signature),
      (err) => err instanceof ApiError && err.status === 400
    );

    assert.throws(
      () => verifyWebhookSignature('', signature),
      (err) => err instanceof ApiError && err.status === 400
    );
  });

  test('Webhook signature: missing or empty signature throws 400', () => {
    const rawBody = Buffer.from(JSON.stringify({ event: 'payment.captured' }), 'utf8');

    assert.throws(
      () => verifyWebhookSignature(rawBody, ''),
      (err) => err instanceof ApiError && err.status === 400 && err.message.includes('Missing X-Razorpay-Signature')
    );

    assert.throws(
      () => verifyWebhookSignature(rawBody, null),
      (err) => err instanceof ApiError && err.status === 400
    );
  });

  test('Webhook signature: unconfigured webhook secret throws 500', () => {
    config.razorpay.webhookSecret = '';
    const payload = { event: 'payment.captured' };
    const { rawBody, signature } = createSignedWebhookPayload(payload, TEST_WEBHOOK_SECRET);

    assert.throws(
      () => verifyWebhookSignature(rawBody, signature),
      (err) => err instanceof ApiError && err.status === 500 && err.message.includes('secret is not configured')
    );
  });

  test('Webhook signature: timing-safe check cleanly handles differing signature lengths', () => {
    const rawBody = Buffer.from('{"test":true}', 'utf8');

    assert.throws(
      () => verifyWebhookSignature(rawBody, 'short_sig'),
      (err) => err instanceof ApiError && err.status === 400
    );

    assert.throws(
      () => verifyWebhookSignature(rawBody, 'a'.repeat(128)),
      (err) => err instanceof ApiError && err.status === 400
    );
  });

  // --------------------------------------------------------------------------
  // 2. Event ID & Deduplication Table
  // --------------------------------------------------------------------------
  test('Webhook deduplication: missing event ID throws 400', async () => {
    const payload = { event: 'payment.captured' };
    const { rawBody, signature } = createSignedWebhookPayload(payload);

    await assert.rejects(
      async () => handleWebhookEvent({ rawBody, signature, eventId: '' }),
      (err) => err instanceof ApiError && err.status === 400 && err.message.includes('Missing Razorpay event ID')
    );

    await assert.rejects(
      async () => handleWebhookEvent({ rawBody, signature, eventId: null }),
      (err) => err instanceof ApiError && err.status === 400
    );
  });

  test('Webhook deduplication: already processed event ID returns duplicate without re-processing', async () => {
    const eventId = 'evt_processed_already_999';
    const payload = { event: 'payment.captured', id: eventId };
    const { rawBody, signature } = createSignedWebhookPayload(payload);

    let orderQueried = false;
    setSupabaseClient({
      from: (table) => {
        if (table === 'razorpay_webhook_events') {
          return {
            select: () => ({
              eq: (col, val) => ({
                maybeSingle: async () => {
                  assert.strictEqual(col, 'event_id');
                  assert.strictEqual(val, eventId);
                  return {
                    data: {
                      event_id: eventId,
                      event_type: 'payment.captured',
                      processed_at: '2026-10-15T12:00:00.000Z',
                    },
                    error: null,
                  };
                },
              }),
            }),
          };
        }
        if (table === 'orders') {
          orderQueried = true;
        }
        return {};
      },
    });

    const result = await handleWebhookEvent({ rawBody, signature, eventId, payload });

    assert.strictEqual(result.received, true);
    assert.strictEqual(result.duplicate, true);
    assert.strictEqual(result.eventId, eventId);
    assert.strictEqual(orderQueried, false, 'Orders table must NOT be queried for already-processed webhook events');
  });

  test('Webhook deduplication: concurrent duplicate deliveries coalesce safely', async () => {
    const eventId = 'evt_concurrent_race_101';
    const razorpayOrderId = 'order_concurrent_rzp_1';
    const paymentId = 'pay_concurrent_rzp_1';
    const mockOrder = {
      id: 'd3b07384-d113-43da-a9be-4824b0716650',
      status: 'pending',
      payment_status: 'pending',
      grand_total: '150.00',
      currency: 'INR',
      razorpay_order_id: razorpayOrderId,
      items: [],
    };

    const payload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: razorpayOrderId,
            amount: 15000,
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    };
    const { rawBody, signature } = createSignedWebhookPayload(payload);

    let atomicUpdateCalls = 0;
    let eventInsertCalls = 0;

    setSupabaseClient({
      from: (table) => {
        if (table === 'razorpay_webhook_events') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
            insert: () => ({
              select: () => ({
                maybeSingle: async () => {
                  eventInsertCalls++;
                  return { data: { event_id: eventId }, error: null };
                },
              }),
            }),
          };
        }
        if (table === 'orders') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: mockOrder, error: null }),
              }),
            }),
            update: () => ({
              eq: () => ({
                in: () => ({
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => {
                        atomicUpdateCalls++;
                        await new Promise((r) => setTimeout(r, 10)); // simulate slight async delay
                        return {
                          data: { ...mockOrder, status: 'confirmed', payment_status: 'paid' },
                          error: null,
                        };
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

    // Launch simultaneous deliveries
    const [res1, res2] = await Promise.all([
      handleWebhookEvent({ rawBody, signature, eventId, payload }),
      handleWebhookEvent({ rawBody, signature, eventId, payload }),
    ]);

    assert.strictEqual(res1.received, true);
    assert.strictEqual(res2.received, true);
    assert.strictEqual(atomicUpdateCalls, 1, 'In-flight single flight must coalesce simultaneous requests so DB update runs exactly once');
    assert.strictEqual(eventInsertCalls, 1, 'Webhook event insert must execute exactly once');
  });

  // --------------------------------------------------------------------------
  // 3. Payment Event Handling (payment.captured)
  // --------------------------------------------------------------------------
  test('payment.captured: valid payload with matching order marks order paid and confirmed', async () => {
    const eventId = 'evt_captured_success_1';
    const razorpayOrderId = 'order_captured_rzp_200';
    const paymentId = 'pay_captured_rzp_200';
    const mockOrder = {
      id: 'd3b07384-d113-43da-a9be-4824b0716651',
      order_number: 'ALT-100200',
      status: 'pending',
      payment_status: 'pending',
      grand_total: '249.99',
      currency: 'INR',
      razorpay_order_id: razorpayOrderId,
      items: [],
      contact: { email: 'customer@example.com' },
    };

    const payload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: razorpayOrderId,
            amount: 24999,
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    };
    const { rawBody, signature } = createSignedWebhookPayload(payload);

    let recordedEvent = null;
    let updatedPaymentStatus = null;

    setSupabaseClient({
      from: (table) => {
        if (table === 'razorpay_webhook_events') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
            insert: (data) => ({
              select: () => ({
                maybeSingle: async () => {
                  recordedEvent = data;
                  return { data, error: null };
                },
              }),
            }),
          };
        }
        if (table === 'orders') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: mockOrder, error: null }),
              }),
            }),
            update: (patch) => ({
              eq: () => ({
                in: () => ({
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => {
                        updatedPaymentStatus = patch.payment_status;
                        return {
                          data: { ...mockOrder, ...patch },
                          error: null,
                        };
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

    const result = await handleWebhookEvent({ rawBody, signature, eventId, payload });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.isWinningTransition, true);
    assert.strictEqual(result.orderId, mockOrder.id);
    assert.strictEqual(updatedPaymentStatus, 'paid');
    assert.ok(recordedEvent, 'Webhook event must be recorded');
    assert.strictEqual(recordedEvent.event_id, eventId);
    assert.strictEqual(recordedEvent.order_id, mockOrder.id);
  });

  test('payment.captured: unknown Razorpay order ID throws 404', async () => {
    const eventId = 'evt_captured_unknown_order';
    const payload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_unknown_order',
            order_id: 'order_nonexistent_999',
            amount: 10000,
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    };
    const { rawBody, signature } = createSignedWebhookPayload(payload);

    setSupabaseClient({
      from: (table) => {
        if (table === 'razorpay_webhook_events') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          };
        }
        if (table === 'orders') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          };
        }
        return {};
      },
    });

    await assert.rejects(
      async () => handleWebhookEvent({ rawBody, signature, eventId, payload }),
      (err) => err instanceof ApiError && err.status === 404 && err.message.includes('No matching order')
    );
  });

  test('payment.captured: amount mismatch rejects with 400 and preserves order status', async () => {
    const eventId = 'evt_captured_amount_mismatch';
    const razorpayOrderId = 'order_captured_rzp_300';
    const mockOrder = {
      id: 'd3b07384-d113-43da-a9be-4824b0716652',
      status: 'pending',
      payment_status: 'pending',
      grand_total: '500.00', // 50000 paise
      currency: 'INR',
      razorpay_order_id: razorpayOrderId,
    };

    const payload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_underpaid',
            order_id: razorpayOrderId,
            amount: 25000, // Attempted underpayment (250.00)
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    };
    const { rawBody, signature } = createSignedWebhookPayload(payload);

    let orderUpdated = false;

    setSupabaseClient({
      from: (table) => {
        if (table === 'razorpay_webhook_events') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          };
        }
        if (table === 'orders') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: mockOrder, error: null }),
              }),
            }),
            update: () => {
              orderUpdated = true;
              return {};
            },
          };
        }
        return {};
      },
    });

    await assert.rejects(
      async () => handleWebhookEvent({ rawBody, signature, eventId, payload }),
      (err) => err instanceof ApiError && err.status === 400 && err.message.includes('amount mismatch')
    );

    assert.strictEqual(orderUpdated, false, 'Order payment status must NOT be updated on amount mismatch');
  });

  test('payment.captured: currency mismatch rejects with 400 and preserves order status', async () => {
    const eventId = 'evt_captured_currency_mismatch';
    const razorpayOrderId = 'order_captured_rzp_301';
    const mockOrder = {
      id: 'd3b07384-d113-43da-a9be-4824b0716653',
      status: 'pending',
      payment_status: 'pending',
      grand_total: '100.00',
      currency: 'INR',
      razorpay_order_id: razorpayOrderId,
    };

    const payload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_foreign_curr',
            order_id: razorpayOrderId,
            amount: 10000,
            currency: 'USD', // Mismatched currency
            status: 'captured',
          },
        },
      },
    };
    const { rawBody, signature } = createSignedWebhookPayload(payload);

    let orderUpdated = false;

    setSupabaseClient({
      from: (table) => {
        if (table === 'razorpay_webhook_events') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          };
        }
        if (table === 'orders') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: mockOrder, error: null }),
              }),
            }),
            update: () => {
              orderUpdated = true;
              return {};
            },
          };
        }
        return {};
      },
    });

    await assert.rejects(
      async () => handleWebhookEvent({ rawBody, signature, eventId, payload }),
      (err) => err instanceof ApiError && err.status === 400 && err.message.includes('currency mismatch')
    );

    assert.strictEqual(orderUpdated, false, 'Order payment status must NOT be updated on currency mismatch');
  });

  test('payment.captured: late capture on cancelled order flags for manual triage without resurrecting or auto-refunding', async () => {
    const eventId = 'evt_late_capture_cancelled';
    const razorpayOrderId = 'order_late_rzp_400';
    const mockOrder = {
      id: 'd3b07384-d113-43da-a9be-4824b0716654',
      status: 'cancelled',
      payment_status: 'failed',
      grand_total: '350.00',
      currency: 'INR',
      razorpay_order_id: razorpayOrderId,
    };

    const payload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_late_400',
            order_id: razorpayOrderId,
            amount: 35000,
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    };
    const { rawBody, signature } = createSignedWebhookPayload(payload);

    let orderUpdated = false;
    let recordedEvent = null;

    setSupabaseClient({
      from: (table) => {
        if (table === 'razorpay_webhook_events') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
            insert: (data) => ({
              select: () => ({
                maybeSingle: async () => {
                  recordedEvent = data;
                  return { data, error: null };
                },
              }),
            }),
          };
        }
        if (table === 'orders') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: mockOrder, error: null }),
              }),
            }),
            update: () => {
              orderUpdated = true;
              return {};
            },
          };
        }
        return {};
      },
    });

    const result = await handleWebhookEvent({ rawBody, signature, eventId, payload });

    assert.strictEqual(result.received, true);
    assert.strictEqual(result.status, 'late_capture_on_cancelled_order');
    assert.strictEqual(result.orderId, mockOrder.id);
    assert.strictEqual(orderUpdated, false, 'Late capture on cancelled order must NOT mutate order status to paid in Phase 3');
    assert.ok(recordedEvent, 'Webhook event must be recorded for idempotency');
    assert.match(recordedEvent.payload.audit_note, /manual review required/i);
  });

  // --------------------------------------------------------------------------
  // 4. Payment Failed Event Handling & Out-of-Order Safety
  // --------------------------------------------------------------------------
  test('payment.failed: pending order records attempt failure diagnostics without releasing stock or cancelling order', async () => {
    const eventId = 'evt_failed_attempt_1';
    const razorpayOrderId = 'order_failed_rzp_500';
    const mockOrder = {
      id: 'd3b07384-d113-43da-a9be-4824b0716655',
      status: 'pending',
      payment_status: 'pending',
      payment_attempts: 1,
      grand_total: '120.00',
      currency: 'INR',
      razorpay_order_id: razorpayOrderId,
    };

    const payload = {
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: 'pay_failed_attempt',
            order_id: razorpayOrderId,
            error_code: 'BAD_REQUEST_ERROR',
            error_description: 'Payment failed due to insufficient funds',
          },
        },
      },
    };
    const { rawBody, signature } = createSignedWebhookPayload(payload);

    let recordedFailedReason = null;
    let finalOrderStatus = null;

    setSupabaseClient({
      from: (table) => {
        if (table === 'razorpay_webhook_events') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
            insert: (data) => ({
              select: () => ({
                maybeSingle: async () => ({ data, error: null }),
              }),
            }),
          };
        }
        if (table === 'orders') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: mockOrder, error: null }),
              }),
            }),
            update: (patch) => ({
              eq: () => ({
                eq: () => ({
                  not: () => ({
                    select: () => ({
                      maybeSingle: async () => {
                        recordedFailedReason = patch.payment_failed_reason;
                        finalOrderStatus = mockOrder.status; // status must remain pending
                        return { data: { ...mockOrder, ...patch }, error: null };
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

    const result = await handleWebhookEvent({ rawBody, signature, eventId, payload });

    assert.strictEqual(result.received, true);
    assert.strictEqual(result.paymentFailed, true);
    assert.strictEqual(result.orderId, mockOrder.id);
    assert.match(recordedFailedReason, /insufficient funds/i);
    assert.strictEqual(finalOrderStatus, 'pending', 'Order status must remain pending to allow customer retry');
  });

  test('payment.failed: failure event after payment already captured never downgrades paid order', async () => {
    const eventId = 'evt_out_of_order_failure';
    const razorpayOrderId = 'order_confirmed_paid_600';
    const mockOrder = {
      id: 'd3b07384-d113-43da-a9be-4824b0716656',
      status: 'confirmed',
      payment_status: 'paid',
      grand_total: '180.00',
      currency: 'INR',
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: 'pay_confirmed_600',
    };

    const payload = {
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: 'pay_stale_failed_600',
            order_id: razorpayOrderId,
            error_description: 'Late bank decline message',
          },
        },
      },
    };
    const { rawBody, signature } = createSignedWebhookPayload(payload);

    let orderModified = false;

    setSupabaseClient({
      from: (table) => {
        if (table === 'razorpay_webhook_events') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
            insert: (data) => ({
              select: () => ({
                maybeSingle: async () => ({ data, error: null }),
              }),
            }),
          };
        }
        if (table === 'orders') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: mockOrder, error: null }),
              }),
            }),
            update: () => {
              orderModified = true;
              return {};
            },
          };
        }
        return {};
      },
    });

    const result = await handleWebhookEvent({ rawBody, signature, eventId, payload });

    assert.strictEqual(result.received, true);
    assert.strictEqual(result.ignored, true);
    assert.strictEqual(result.reason, 'order_already_paid');
    assert.strictEqual(orderModified, false, 'Confirmed paid order must NEVER be downgraded by a failure webhook');
  });

  // --------------------------------------------------------------------------
  // 5. Database Errors, Safe Retries & Side Effect Idempotency
  // --------------------------------------------------------------------------
  test('Webhook retry: database failure during order update throws 500 and allows safe retry', async () => {
    const eventId = 'evt_retry_flow_700';
    const razorpayOrderId = 'order_retry_rzp_700';
    const mockOrder = {
      id: 'd3b07384-d113-43da-a9be-4824b0716657',
      status: 'pending',
      payment_status: 'pending',
      grand_total: '200.00',
      currency: 'INR',
      razorpay_order_id: razorpayOrderId,
      items: [],
      contact: { email: 'test@example.com' },
    };

    const payload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_retry_700',
            order_id: razorpayOrderId,
            amount: 20000,
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    };
    const { rawBody, signature } = createSignedWebhookPayload(payload);

    let simulateDbError = true;
    let recordedEvents = [];

    setSupabaseClient({
      from: (table) => {
        if (table === 'razorpay_webhook_events') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: recordedEvents.find((e) => e.event_id === eventId) || null,
                  error: null,
                }),
              }),
            }),
            insert: (data) => ({
              select: () => ({
                maybeSingle: async () => {
                  recordedEvents.push(data);
                  return { data, error: null };
                },
              }),
            }),
          };
        }
        if (table === 'orders') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: mockOrder, error: null }),
              }),
            }),
            update: () => ({
              eq: () => ({
                in: () => ({
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => {
                        if (simulateDbError) {
                          return { data: null, error: { message: 'db lock contention', code: '40P01' } };
                        }
                        return {
                          data: { ...mockOrder, status: 'confirmed', payment_status: 'paid' },
                          error: null,
                        };
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

    // 1st Attempt: Fails with database 500 error
    await assert.rejects(
      async () => handleWebhookEvent({ rawBody, signature, eventId, payload }),
      (err) => err instanceof ApiError && err.status === 500
    );

    assert.strictEqual(recordedEvents.length, 0, 'Failed database transaction must NOT record event in webhook deduplication table');

    // 2nd Attempt: Database connection restored, retry succeeds
    simulateDbError = false;
    const retryResult = await handleWebhookEvent({ rawBody, signature, eventId, payload });

    assert.strictEqual(retryResult.success, true);
    assert.strictEqual(retryResult.isWinningTransition, true);
    assert.strictEqual(recordedEvents.length, 1, 'Retry must durably record webhook event');
  });

  test('Webhook side effects: duplicate webhook for order marked paid by verify endpoint causes no duplicate email or history', async () => {
    const eventId = 'evt_duplicate_after_verify_800';
    const razorpayOrderId = 'order_verify_rzp_800';
    const paymentId = 'pay_verify_rzp_800';

    // Order was already marked paid earlier by the /verify client endpoint
    const mockOrderAlreadyPaid = {
      id: 'd3b07384-d113-43da-a9be-4824b0716658',
      status: 'confirmed',
      payment_status: 'paid',
      grand_total: '300.00',
      currency: 'INR',
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: paymentId,
      items: [],
      contact: { email: 'user@example.com' },
    };

    const payload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: razorpayOrderId,
            amount: 30000,
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    };
    const { rawBody, signature } = createSignedWebhookPayload(payload);

    let atomicUpdateCalled = false;
    let recordedEvent = null;

    setSupabaseClient({
      from: (table) => {
        if (table === 'razorpay_webhook_events') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
            insert: (data) => ({
              select: () => ({
                maybeSingle: async () => {
                  recordedEvent = data;
                  return { data, error: null };
                },
              }),
            }),
          };
        }
        if (table === 'orders') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: mockOrderAlreadyPaid, error: null }),
              }),
            }),
            update: () => {
              atomicUpdateCalled = true;
              return {};
            },
          };
        }
        return {};
      },
    });

    const result = await handleWebhookEvent({ rawBody, signature, eventId, payload });

    assert.strictEqual(result.received, true);
    assert.strictEqual(result.alreadyPaid, true);
    assert.strictEqual(atomicUpdateCalled, false, 'No atomic status update when order is already confirmed paid with same payment ID');
    assert.ok(recordedEvent, 'Webhook event should be recorded for idempotency');
  });

  test('Webhook retry: database failure during webhook event insert throws 500 and allows safe retry', async () => {
    const eventId = 'evt_event_insert_fail_801';
    const razorpayOrderId = 'order_event_insert_fail_801';
    const mockOrder = {
      id: 'd3b07384-d113-43da-a9be-4824b0716660',
      status: 'pending',
      payment_status: 'pending',
      grand_total: '100.00',
      currency: 'INR',
      razorpay_order_id: razorpayOrderId,
      items: [],
    };

    const payload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_fail_insert_801',
            order_id: razorpayOrderId,
            amount: 10000,
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    };
    const { rawBody, signature } = createSignedWebhookPayload(payload);

    let simulateInsertError = true;
    let eventInserted = false;

    setSupabaseClient({
      from: (table) => {
        if (table === 'razorpay_webhook_events') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: eventInserted ? { event_id: eventId } : null,
                  error: null,
                }),
              }),
            }),
            insert: () => ({
              select: () => ({
                maybeSingle: async () => {
                  if (simulateInsertError) {
                    return { data: null, error: { message: 'db disk full', code: '53100' } };
                  }
                  eventInserted = true;
                  return { data: { event_id: eventId }, error: null };
                },
              }),
            }),
          };
        }
        if (table === 'orders') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    ...mockOrder,
                    status: simulateInsertError ? 'pending' : 'confirmed',
                    payment_status: simulateInsertError ? 'pending' : 'paid',
                    razorpay_payment_id: 'pay_fail_insert_801',
                  },
                  error: null,
                }),
              }),
            }),
            update: () => ({
              eq: () => ({
                in: () => ({
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => ({
                        data: { ...mockOrder, status: 'confirmed', payment_status: 'paid' },
                        error: null,
                      }),
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

    // 1st attempt: throws 500 because event recording failed
    await assert.rejects(
      async () => handleWebhookEvent({ rawBody, signature, eventId, payload }),
      (err) => err instanceof ApiError && err.status === 500
    );

    // 2nd attempt: DB recovered, successfully records
    simulateInsertError = false;
    const retryRes = await handleWebhookEvent({ rawBody, signature, eventId, payload });
    assert.strictEqual(retryRes.received, true);
    assert.strictEqual(eventInserted, true);
  });

  test('Unsupported webhook event: records event and acknowledges with 200 without modifying orders', async () => {
    const eventId = 'evt_unsupported_type_802';
    const payload = {
      event: 'payment.authorized', // Unsupported event type
      id: eventId,
      payload: {},
    };
    const { rawBody, signature } = createSignedWebhookPayload(payload);

    let orderTableAccessed = false;
    let recordedEvent = null;

    setSupabaseClient({
      from: (table) => {
        if (table === 'razorpay_webhook_events') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
            insert: (data) => ({
              select: () => ({
                maybeSingle: async () => {
                  recordedEvent = data;
                  return { data, error: null };
                },
              }),
            }),
          };
        }
        if (table === 'orders') {
          orderTableAccessed = true;
          return {};
        }
        return {};
      },
    });

    const result = await handleWebhookEvent({ rawBody, signature, eventId, payload });

    assert.strictEqual(result.received, true);
    assert.strictEqual(result.ignored, true);
    assert.strictEqual(result.event, 'payment.authorized');
    assert.strictEqual(orderTableAccessed, false, 'Orders table must not be touched for unsupported events');
    assert.ok(recordedEvent, 'Unsupported event must be recorded to prevent duplicate reprocessing');
  });

  test('payment.captured: malformed payment entity or missing order_id throws 400', async () => {
    const eventId = 'evt_malformed_entity_803';
    const payload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_no_order',
            // missing order_id
          },
        },
      },
    };
    const { rawBody, signature } = createSignedWebhookPayload(payload);

    setSupabaseClient({
      from: (table) => {
        if (table === 'razorpay_webhook_events') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          };
        }
        return {};
      },
    });

    await assert.rejects(
      async () => handleWebhookEvent({ rawBody, signature, eventId, payload }),
      (err) => err instanceof ApiError && err.status === 400 && err.message.includes('Malformed webhook payment entity')
    );
  });

  test('Webhook side effects: winning transition records order status history in order_status_history table', async () => {
    const eventId = 'evt_history_tracking_804';
    const razorpayOrderId = 'order_history_rzp_804';
    const paymentId = 'pay_history_rzp_804';
    const mockOrder = {
      id: 'd3b07384-d113-43da-a9be-4824b0716661',
      status: 'pending',
      payment_status: 'pending',
      grand_total: '75.00',
      currency: 'INR',
      razorpay_order_id: razorpayOrderId,
      items: [],
      contact: { email: 'history@example.com' },
    };

    const payload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: razorpayOrderId,
            amount: 7500,
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    };
    const { rawBody, signature } = createSignedWebhookPayload(payload);

    let historyRows = [];

    setSupabaseClient({
      from: (table) => {
        if (table === 'razorpay_webhook_events') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
            insert: (data) => ({
              select: () => ({
                maybeSingle: async () => ({ data, error: null }),
              }),
            }),
          };
        }
        if (table === 'orders') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: mockOrder, error: null }),
              }),
            }),
            update: (patch) => ({
              eq: () => ({
                in: () => ({
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => ({
                        data: { ...mockOrder, ...patch },
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'order_status_history') {
          return {
            insert: (row) => ({
              select: () => ({
                single: async () => {
                  historyRows.push(row);
                  return { data: row, error: null };
                },
              }),
            }),
          };
        }
        return {};
      },
    });

    const result = await handleWebhookEvent({ rawBody, signature, eventId, payload });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.isWinningTransition, true);

    // Wait microtask tick for async background side-effect
    await new Promise((r) => setTimeout(r, 20));

    assert.strictEqual(historyRows.length, 1);
    assert.strictEqual(historyRows[0].status, 'confirmed');
    assert.strictEqual(historyRows[0].by_role, 'system');
    assert.strictEqual(historyRows[0].order_id, mockOrder.id);
  });

  test('payment.captured: status not captured rejects with 400', async () => {
    const eventId = 'evt_status_not_captured_901';
    const payload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_not_captured_901',
            order_id: 'order_some_rzp_901',
            amount: 5000,
            currency: 'INR',
            status: 'failed', // Inconsistent: event claims captured but entity status is failed
          },
        },
      },
    };
    const { rawBody, signature } = createSignedWebhookPayload(payload);

    setSupabaseClient({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    });

    await assert.rejects(
      async () => handleWebhookEvent({ rawBody, signature, eventId, payload }),
      (err) => err instanceof ApiError && err.status === 400 && err.message.includes('Payment entity status is not captured')
    );
  });

  test('payment.captured: mismatched payment ID on already paid order is safely ignored and logged', async () => {
    const eventId = 'evt_mismatched_pay_id_902';
    const razorpayOrderId = 'order_already_paid_902';
    const mockOrderAlreadyPaid = {
      id: 'd3b07384-d113-43da-a9be-4824b0716662',
      status: 'confirmed',
      payment_status: 'paid',
      grand_total: '100.00',
      currency: 'INR',
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: 'pay_original_legit_id', // Original payment
    };

    const payload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_different_conflicting_id', // Different payment ID
            order_id: razorpayOrderId,
            amount: 10000,
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    };
    const { rawBody, signature } = createSignedWebhookPayload(payload);

    let recordedAuditNote = null;
    let orderMutated = false;

    setSupabaseClient({
      from: (table) => {
        if (table === 'razorpay_webhook_events') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
            insert: (data) => ({
              select: () => ({
                maybeSingle: async () => {
                  recordedAuditNote = data.payload?.audit_note;
                  return { data, error: null };
                },
              }),
            }),
          };
        }
        if (table === 'orders') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: mockOrderAlreadyPaid, error: null }),
              }),
            }),
            update: () => {
              orderMutated = true;
              return {};
            },
          };
        }
        return {};
      },
    });

    const result = await handleWebhookEvent({ rawBody, signature, eventId, payload });

    assert.strictEqual(result.received, true);
    assert.strictEqual(result.ignored, true);
    assert.strictEqual(result.reason, 'already_paid_with_different_payment_id');
    assert.strictEqual(orderMutated, false, 'Already-paid order must NOT be mutated by conflicting payment ID');
    assert.match(recordedAuditNote, /already paid with different payment ID/i);
  });

  test('Webhook deduplication: multi-process concurrent deliveries safely resolve via database CAS and unique constraint without in-memory map', async () => {
    const eventId = 'evt_multiprocess_race_903';
    const razorpayOrderId = 'order_multiprocess_rzp_903';
    const paymentId = 'pay_multiprocess_rzp_903';
    const mockOrder = {
      id: 'd3b07384-d113-43da-a9be-4824b0716663',
      status: 'pending',
      payment_status: 'pending',
      grand_total: '100.00',
      currency: 'INR',
      razorpay_order_id: razorpayOrderId,
      items: [],
    };

    const payload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: razorpayOrderId,
            amount: 10000,
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    };
    const { rawBody, signature } = createSignedWebhookPayload(payload);

    let processAUpdated = false;
    let processAInserted = false;

    // Simulate Process A execution (winning worker)
    setSupabaseClient({
      from: (table) => {
        if (table === 'razorpay_webhook_events') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
            insert: (data) => ({
              select: () => ({
                maybeSingle: async () => {
                  processAInserted = true;
                  return { data, error: null };
                },
              }),
            }),
          };
        }
        if (table === 'orders') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: mockOrder, error: null }),
              }),
            }),
            update: (patch) => ({
              eq: () => ({
                in: () => ({
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => {
                        processAUpdated = true;
                        return { data: { ...mockOrder, ...patch }, error: null };
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

    const resultA = await handleWebhookEvent({ rawBody, signature, eventId, payload });
    assert.strictEqual(resultA.success, true);
    assert.strictEqual(resultA.isWinningTransition, true);
    assert.strictEqual(processAUpdated, true);
    assert.strictEqual(processAInserted, true);

    // Simulate Process B execution in a separate Node.js instance (different event ID to bypass in-memory map):
    // CAS update returns null (another process won), re-read finds order is paid, and event insert hits code 23505 (unique violation).
    const eventIdB = 'evt_multiprocess_race_903_procB';
    const payloadB = { ...payload, id: eventIdB };
    const signedB = createSignedWebhookPayload(payloadB);

    let processBCasAttempted = false;
    let processBUniqueViolationCaught = false;
    let processBReadCount = 0;

    setSupabaseClient({
      from: (table) => {
        if (table === 'razorpay_webhook_events') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
            insert: () => ({
              select: () => ({
                maybeSingle: async () => {
                  processBUniqueViolationCaught = true;
                  return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
                },
              }),
            }),
          };
        }
        if (table === 'orders') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => {
                  processBReadCount++;
                  if (processBReadCount === 1) {
                    // First read: Process B reads while still pending (concurrent race)
                    return { data: { ...mockOrder, status: 'pending', payment_status: 'pending' }, error: null };
                  }
                  // Second read: post-CAS failure re-read confirms Process A committed 'paid'
                  return { data: { ...mockOrder, status: 'confirmed', payment_status: 'paid', razorpay_payment_id: paymentId }, error: null };
                },
              }),
            }),
            update: () => ({
              eq: () => ({
                in: () => ({
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => {
                        processBCasAttempted = true;
                        // Another worker won CAS; matches 0 rows!
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

    const resultB = await handleWebhookEvent({
      rawBody: signedB.rawBody,
      signature: signedB.signature,
      eventId: eventIdB,
      payload: payloadB,
    });
    assert.strictEqual(resultB.received, true);
    assert.strictEqual(resultB.isWinningTransition, false, 'Losing process must NOT be winning transition');
    assert.strictEqual(processBCasAttempted, true, 'Losing process CAS must be attempted and return null');
    assert.strictEqual(processBUniqueViolationCaught, true, 'Unique constraint 23505 must be caught cleanly');
  });

  test('payment.failed: mismatched order ID or invalid payload rejects with 400', async () => {
    const eventId = 'evt_failed_mismatch_904';
    const razorpayOrderId = 'order_failed_expected_904';
    const mockOrder = {
      id: 'd3b07384-d113-43da-a9be-4824b0716664',
      status: 'pending',
      payment_status: 'pending',
      grand_total: '100.00',
      currency: 'INR',
      razorpay_order_id: 'order_failed_different_111', // Mismatched
    };

    const payload = {
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: 'pay_failed_904',
            order_id: razorpayOrderId,
            error_description: 'Card declined',
          },
        },
      },
    };
    const { rawBody, signature } = createSignedWebhookPayload(payload);

    setSupabaseClient({
      from: (table) => {
        if (table === 'razorpay_webhook_events') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          };
        }
        if (table === 'orders') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: mockOrder, error: null }),
              }),
            }),
          };
        }
        return {};
      },
    });

    await assert.rejects(
      async () => handleWebhookEvent({ rawBody, signature, eventId, payload }),
      (err) => err instanceof ApiError && err.status === 400 && err.message.includes('Razorpay Order ID mismatch')
    );
  });



  // --------------------------------------------------------------------------
  // 6. HTTP Endpoint & Route Integration
  // --------------------------------------------------------------------------
  test('HTTP Endpoint: POST /api/payment/razorpay/webhook accepts valid requests without customer JWT auth', async () => {
    const app = express();
    app.use(express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }));
    app.use('/api/payment', paymentRoutes);

    const eventId = 'evt_http_integration_900';
    const razorpayOrderId = 'order_http_rzp_900';
    const paymentId = 'pay_http_rzp_900';
    const mockOrder = {
      id: 'd3b07384-d113-43da-a9be-4824b0716659',
      status: 'pending',
      payment_status: 'pending',
      grand_total: '100.00',
      currency: 'INR',
      razorpay_order_id: razorpayOrderId,
      items: [],
      contact: { email: 'http@example.com' },
    };

    setSupabaseClient({
      from: (table) => {
        if (table === 'razorpay_webhook_events') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
            insert: (data) => ({
              select: () => ({
                maybeSingle: async () => ({ data, error: null }),
              }),
            }),
          };
        }
        if (table === 'orders') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: mockOrder, error: null }),
              }),
            }),
            update: (patch) => ({
              eq: () => ({
                in: () => ({
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => ({
                        data: { ...mockOrder, ...patch },
                        error: null,
                      }),
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

    const payload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: razorpayOrderId,
            amount: 10000,
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    };
    const { rawBody, signature } = createSignedWebhookPayload(payload);

    const server = app.listen(0);
    const port = server.address().port;

    try {
      // 1. Missing signature -> 400
      const resNoSig = await fetch(`http://127.0.0.1:${port}/api/payment/razorpay/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Razorpay-Event-Id': eventId,
        },
        body: rawBody,
      });
      assert.strictEqual(resNoSig.status, 400);

      // 2. Invalid signature -> 400
      const resBadSig = await fetch(`http://127.0.0.1:${port}/api/payment/razorpay/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Razorpay-Signature': 'invalid_hex_signature',
          'X-Razorpay-Event-Id': eventId,
        },
        body: rawBody,
      });
      assert.strictEqual(resBadSig.status, 400);

      // 3. Valid signature without any Authorization / Cookie headers -> 200 OK
      const resValid = await fetch(`http://127.0.0.1:${port}/api/payment/razorpay/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Razorpay-Signature': signature,
          'X-Razorpay-Event-Id': eventId,
        },
        body: rawBody,
      });
      assert.strictEqual(resValid.status, 200);
      const data = await resValid.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.eventId, eventId);
    } finally {
      server.close();
    }
  });

  test('Webhook HTTP: refund.processed event through HTTP endpoint updates refund intent and order', async () => {
    const eventId = 'evt_http_rfnd_processed_1';
    const orderId = 'd3b07384-d113-43da-a9be-4824b0716699';
    const paymentId = 'pay_http_rfnd_1';
    const refundId = 'rfnd_http_rfnd_1';

    const mockOrder = {
      id: orderId,
      order_number: 'ALT-9999',
      status: 'cancelled',
      payment_status: 'failed',
      grand_total: '250.00',
      currency: 'INR',
    };

    const mockIntent = {
      id: 'ref_intent_http_001',
      order_id: orderId,
      payment_id: paymentId,
      amount: 25000,
      currency: 'INR',
      status: 'processing',
      idempotency_key: 'rfnd_key_http_1234567890',
      razorpay_refund_id: refundId,
    };

    const payload = {
      event: 'refund.processed',
      payload: {
        refund: {
          entity: {
            id: refundId,
            payment_id: paymentId,
            amount: 25000,
            currency: 'INR',
            status: 'processed',
            notes: {
              refund_intent_id: mockIntent.id,
              altneu_order_id: orderId,
            },
          },
        },
      },
    };

    const { rawBody, signature } = createSignedWebhookPayload(payload);

    let intentCompleted = false;
    let orderRefunded = false;

    setSupabaseClient({
      from: (table) => {
        if (table === 'razorpay_webhook_events') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
            insert: () => ({
              select: () => ({
                maybeSingle: async () => ({ data: {}, error: null }),
              }),
            }),
          };
        }
        if (table === 'refund_intents') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: mockIntent, error: null }),
              }),
            }),
            update: (data) => ({
              eq: () => ({
                select: () => ({
                  maybeSingle: async () => {
                    if (data.status === 'completed') intentCompleted = true;
                    return { data: { ...mockIntent, ...data }, error: null };
                  },
                }),
              }),
            }),
          };
        }
        if (table === 'orders') {
          return {
            update: (data) => ({
              eq: async () => {
                if (data.status === 'refunded') orderRefunded = true;
                return { data: { ...mockOrder, ...data }, error: null };
              },
            }),
          };
        }
        return {};
      },
    });

    const app = express();
    app.use(
      express.json({
        verify: (req, _res, buf) => {
          req.rawBody = buf;
        },
      })
    );
    app.use('/api/payment', paymentRoutes);

    const server = app.listen(0);
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/payment/razorpay/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Razorpay-Signature': signature,
          'X-Razorpay-Event-Id': eventId,
        },
        body: rawBody,
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.status, 'completed');
      assert.strictEqual(data.refundId, refundId);
      assert.strictEqual(intentCompleted, true);
      assert.strictEqual(orderRefunded, true);
    } finally {
      server.close();
    }
  });
});

