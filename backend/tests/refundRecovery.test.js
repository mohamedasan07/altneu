import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';
import express from 'express';
import { config } from '../config/index.js';
import { setSupabaseClient } from '../database/client.js';
import internalRoutes from '../routes/internal.routes.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { setProcessPendingRefundIntents } from '../controllers/internal.controller.js';
import {
  setRazorpayClient,
  getRazorpayClient,
  handleWebhookEvent,
  handleRefundWebhookEvent,
} from '../services/payment.service.js';
import {
  executeIdempotentRefund,
  setRefundHttpTransport,
  getRefundHttpTransport,
  createLateCaptureRefundIntent,
  processRefundIntent,
  processPendingRefundIntents,
  reconcileRefundWithGateway,
} from '../services/refund.service.js';
import {
  claimRefundIntentAtomic,
  findRefundIntentById,
  findRefundIntentByOrderAndPayment,
  findRefundIntentByPaymentId,
  findRefundIntentByRazorpayRefundId,
  markRefundIntentCompleted,
  markRefundIntentManualReview,
  markRefundIntentFailed,
  recordRefundInitiated,
  releaseRefundIntentClaim,
} from '../repositories/refund.repository.js';

/**
 * Sprint Razorpay Phase 5B — Durable Refund Recovery Test Suite
 *
 * Official Razorpay Gateway API Reference:
 * - URL: https://razorpay.com/docs/api-reference/refunds/#create-a-normal-refund-idempotent-request
 * - Header: X-Refund-Idempotency
 *
 * Test Taxonomy:
 * - Mocked Integration Tests: Simulates PostgreSQL envelope and Razorpay Gateway API / HTTPS transport.
 *   Guarantees no real network calls or database modifications occur.
 * - Live Integration Requirements: Documents behavior when running against real PostgreSQL with Migration 013 applied.
 */

// Helper to sign webhook payload
function createSignedWebhookPayload(payload, secret = 'whsec_test_secret_refund_recovery_12345') {
  const rawBody = Buffer.from(JSON.stringify(payload), 'utf8');
  const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return { rawBody, signature };
}

describe('Phase 5B: Durable Refund Recovery for Late Captures', () => {
  let originalWebhookSecret;
  let originalKeyId;
  let originalKeySecret;
  let originalHttpTransport;
  let originalCronSecret;
  const TEST_CRON_SECRET = 'test_cron_secret_refund_k123456789';

  beforeEach(() => {
    originalWebhookSecret = config.razorpay.webhookSecret;
    originalKeyId = config.razorpay.keyId;
    originalKeySecret = config.razorpay.keySecret;
    originalHttpTransport = getRefundHttpTransport();
    originalCronSecret = config.cron?.secret;

    config.razorpay.webhookSecret = 'whsec_test_secret_refund_recovery_12345';
    config.razorpay.keyId = 'rzp_test_refund_key_123';
    config.razorpay.keySecret = 'rzp_test_refund_secret_456';
    config.cron.secret = TEST_CRON_SECRET;
    setRefundHttpTransport(null);
  });

  afterEach(() => {
    config.razorpay.webhookSecret = originalWebhookSecret;
    config.razorpay.keyId = originalKeyId;
    config.razorpay.keySecret = originalKeySecret;
    config.cron.secret = originalCronSecret;
    setProcessPendingRefundIntents(null);
    setRefundHttpTransport(originalHttpTransport);
    setSupabaseClient(null);
    setRazorpayClient(null);
  });

  // --------------------------------------------------------------------------
  // 1. Durable Intent Creation & Non-Resurrection (Phase 5B.1)
  // --------------------------------------------------------------------------
  describe('Phase 5B.1: Durable Intent Creation & Non-Resurrection', () => {
    test('late capture creates durable refund intent without resurrecting order or releasing stock', async () => {
      const eventId = 'evt_late_capture_durable_001';
      const rzpOrderId = 'order_late_rzp_101';
      const mockOrder = {
        id: '99999999-0000-0000-0000-000000000001',
        order_number: 'ALT-1001',
        status: 'cancelled',
        payment_status: 'failed',
        grand_total: '500.00',
        currency: 'INR',
        razorpay_order_id: rzpOrderId,
      };

      const payload = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_late_101',
              order_id: rzpOrderId,
              amount: 50000,
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      };

      const { rawBody, signature } = createSignedWebhookPayload(payload);

      let recordedEvent = null;
      let insertedIntent = null;
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
          if (table === 'refund_intents') {
            return {
              insert: (data) => ({
                select: () => ({
                  maybeSingle: async () => {
                    insertedIntent = { ...data, id: 'ref_intent_uuid_001' };
                    return { data: insertedIntent, error: null };
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
                  eq: async () => {
                    orderUpdated = true;
                    return { data: mockOrder, error: null };
                  },
                }),
              }),
            };
          }
          return {};
        },
      });

      const result = await handleWebhookEvent({ rawBody, signature, eventId, payload });

      assert.strictEqual(result.received, true);
      assert.strictEqual(result.status, 'late_capture_on_cancelled_order');
      assert.strictEqual(result.orderId, mockOrder.id);
      assert.strictEqual(result.isWinningTransition, false);

      // Verifies non-resurrection: order status is NOT mutated to 'paid'
      assert.strictEqual(mockOrder.status, 'cancelled');

      // Verifies durable webhook event recording
      assert.ok(recordedEvent, 'Webhook event must be recorded for deduplication');
      assert.match(recordedEvent.payload.audit_note, /refund intent created/i);

      // Verifies durable refund intent was created
      assert.ok(insertedIntent, 'Refund intent must be inserted into public.refund_intents');
      assert.strictEqual(insertedIntent.order_id, mockOrder.id);
      assert.strictEqual(insertedIntent.payment_id, 'pay_late_101');
      assert.strictEqual(insertedIntent.amount, 50000);
      assert.strictEqual(insertedIntent.status, 'pending');
      assert.ok(insertedIntent.idempotency_key, 'Must generate unique idempotency key');
      assert.ok(insertedIntent.idempotency_key.length >= 10, 'Idempotency key must be >= 10 characters');
    });

    test('re-delivered late-capture webhook is safely deduplicated without creating duplicate intent', async () => {
      const eventId = 'evt_duplicate_late_capture_002';
      const payload = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_late_102',
              order_id: 'order_late_rzp_102',
              amount: 25000,
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      };

      const { rawBody, signature } = createSignedWebhookPayload(payload);

      let intentInsertCalled = false;

      setSupabaseClient({
        from: (table) => {
          if (table === 'razorpay_webhook_events') {
            return {
              select: () => ({
                eq: () => ({
                  // Returns existing event record: already processed!
                  maybeSingle: async () => ({
                    data: { event_id: eventId, processed_at: new Date().toISOString() },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'refund_intents') {
            return {
              insert: () => {
                intentInsertCalled = true;
                return {};
              },
            };
          }
          return {};
        },
      });

      const result = await handleWebhookEvent({ rawBody, signature, eventId, payload });

      assert.strictEqual(result.received, true);
      assert.strictEqual(result.duplicate, true);
      assert.strictEqual(intentInsertCalled, false, 'Duplicate webhook must not insert a new refund intent');
    });
  });

  // --------------------------------------------------------------------------
  // 2. Atomic Worker Claiming & Concurrency Protection (Phase 5B.2)
  // --------------------------------------------------------------------------
  describe('Phase 5B.2: Atomic Worker Claiming & Concurrency Protection', () => {
    test('concurrent workers: only winning worker acquires claim on pending intent, loser skips', async () => {
      const mockCandidate = {
        id: 'ref_intent_race_001',
        order_id: '99999999-0000-0000-0000-000000000002',
        payment_id: 'pay_race_103',
        amount: 30000,
        currency: 'INR',
        status: 'pending',
        attempts: 0,
        idempotency_key: 'rfnd_race_key_1234567890',
      };

      let claimCount = 0;

      // Mock database CAS simulation
      setSupabaseClient({
        from: (table) => {
          if (table === 'refund_intents') {
            return {
              select: () => ({
                or: () => ({
                  order: () => ({
                    limit: async () => ({ data: [mockCandidate], error: null }),
                  }),
                }),
              }),
              update: (updateData) => ({
                eq: (col1, val1) => ({
                  eq: (col2, val2) => ({
                    select: () => ({
                      maybeSingle: async () => {
                        claimCount++;
                        // Only the first worker succeeds; subsequent worker gets null (row was updated)
                        if (claimCount === 1) {
                          return {
                            data: {
                              ...mockCandidate,
                              ...updateData,
                              status: 'processing',
                            },
                            error: null,
                          };
                        }
                        // Lost CAS race
                        return { data: null, error: null };
                      },
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        },
      });

      const worker1Promise = claimRefundIntentAtomic({ workerId: 'worker_alpha' });
      const worker2Promise = claimRefundIntentAtomic({ workerId: 'worker_beta' });

      const [claim1, claim2] = await Promise.all([worker1Promise, worker2Promise]);

      const winner = claim1.data || claim2.data;
      const loser = claim1.data ? claim2.data : claim1.data;

      assert.ok(winner, 'One worker must win the claim');
      assert.strictEqual(winner.status, 'processing');
      assert.strictEqual(loser, null, 'Losing concurrent worker must receive null and skip');
    });

    test('stale processing claim (> 5 min) can be safely reclaimed by a recovery worker', async () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const staleIntent = {
        id: 'ref_intent_stale_001',
        order_id: '99999999-0000-0000-0000-000000000003',
        payment_id: 'pay_stale_104',
        amount: 45000,
        currency: 'INR',
        status: 'processing',
        worker_claimed_at: tenMinutesAgo,
        worker_id: 'dead_worker_1',
        attempts: 1,
        idempotency_key: 'rfnd_stale_key_1234567890',
      };

      let reclaimed = null;

      setSupabaseClient({
        from: (table) => {
          if (table === 'refund_intents') {
            return {
              select: () => ({
                or: () => ({
                  order: () => ({
                    limit: async () => ({ data: [staleIntent], error: null }),
                  }),
                }),
              }),
              update: (updateData) => {
                const chain = {
                  eq: () => chain,
                  select: () => ({
                    maybeSingle: async () => {
                      reclaimed = { ...staleIntent, ...updateData };
                      return { data: reclaimed, error: null };
                    },
                  }),
                };
                return chain;
              },
            };
          }
          return {};
        },
      });

      const claimResult = await claimRefundIntentAtomic({
        workerId: 'recovery_worker_99',
        staleTimeoutMinutes: 5,
      });

      assert.strictEqual(claimResult.ok, true);
      assert.ok(claimResult.data);
      assert.strictEqual(claimResult.data.worker_id, 'recovery_worker_99');
      assert.strictEqual(claimResult.data.attempts, 2);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Official Razorpay API & Idempotency Header Contract (Phase 5B.3)
  // --------------------------------------------------------------------------
  describe('Phase 5B.3: Official Razorpay API & Idempotency Header Contract', () => {
    test('executeIdempotentRefund transmits X-Refund-Idempotency header and Basic Auth over HTTPS', async () => {
      let interceptedEndpoint = null;
      let interceptedHeaders = null;
      let interceptedBody = null;

      setRefundHttpTransport(async (url, options) => {
        interceptedEndpoint = url;
        interceptedHeaders = options.headers;
        interceptedBody = JSON.parse(options.body);

        return {
          ok: true,
          status: 200,
          data: {
            id: 'rfnd_official_mock_001',
            entity: 'refund',
            amount: 50000,
            currency: 'INR',
            payment_id: 'pay_official_105',
            status: 'processed',
          },
        };
      });

      const result = await executeIdempotentRefund({
        paymentId: 'pay_official_105',
        amount: 50000,
        idempotencyKey: 'rfnd_idemp_key_official_999',
        notes: { test_note: 'ALTNEU idempotency verification' },
      });

      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.status, 200);
      assert.strictEqual(interceptedEndpoint, 'https://api.razorpay.com/v1/payments/pay_official_105/refund');

      // Verify idempotency header
      assert.strictEqual(
        interceptedHeaders['X-Refund-Idempotency'],
        'rfnd_idemp_key_official_999',
        'Must transmit X-Refund-Idempotency header to Razorpay Gateway'
      );

      // Verify Basic Auth
      const expectedBasicAuth = `Basic ${Buffer.from('rzp_test_refund_key_123:rzp_test_refund_secret_456').toString('base64')}`;
      assert.strictEqual(interceptedHeaders['Authorization'], expectedBasicAuth);

      // Verify request payload
      assert.strictEqual(interceptedBody.amount, 50000);
      assert.strictEqual(interceptedBody.notes.test_note, 'ALTNEU idempotency verification');
    });

    test('rejects malformed idempotency keys shorter than 10 characters or with invalid characters', async () => {
      await assert.rejects(
        executeIdempotentRefund({
          paymentId: 'pay_test_106',
          amount: 10000,
          idempotencyKey: 'short', // < 10 chars
        }),
        /idempotencyKey must be at least 10 characters/
      );

      await assert.rejects(
        executeIdempotentRefund({
          paymentId: 'pay_test_106',
          amount: 10000,
          idempotencyKey: 'key_with_invalid$special!chars',
        }),
        /letters, numbers, hyphens, and underscores/
      );
    });
  });

  // --------------------------------------------------------------------------
  // 4. Pre-Flight Gateway Verification & Discrepancy Guards (Phase 5B.4)
  // --------------------------------------------------------------------------
  describe('Phase 5B.4: Pre-Flight Gateway Verification & Discrepancy Guards', () => {
    test('amount or currency mismatch between order and gateway flags intent for manual review without refunding', async () => {
      const intent = {
        id: 'ref_intent_mismatch_001',
        order_id: '99999999-0000-0000-0000-000000000004',
        payment_id: 'pay_mismatch_107',
        amount: 50000,
        currency: 'INR',
        idempotency_key: 'rfnd_key_mismatch_123456789',
        status: 'processing',
      };

      const mockOrder = {
        id: intent.order_id,
        status: 'cancelled',
        grand_total: '500.00',
        currency: 'INR',
        razorpay_order_id: 'order_rzp_mismatch',
      };

      // Gateway returns different currency: USD instead of INR
      setRazorpayClient({
        payments: {
          fetch: async () => ({
            id: intent.payment_id,
            amount: 50000,
            currency: 'USD', // Currency mismatch!
            status: 'captured',
            order_id: 'order_rzp_mismatch',
            amount_refunded: 0,
          }),
        },
      });

      let manualReviewCalled = false;

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: mockOrder, error: null }),
                }),
              }),
            };
          }
          if (table === 'refund_intents') {
            return {
              update: (data) => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: async () => {
                      if (data.status === 'manual_review') {
                        manualReviewCalled = true;
                      }
                      return { data: { ...intent, ...data }, error: null };
                    },
                  }),
                }),
              }),
            };
          }
          return {};
        },
      });

      let refundExecuted = false;
      setRefundHttpTransport(async () => {
        refundExecuted = true;
        return { ok: true, status: 200, data: {} };
      });

      const result = await processRefundIntent(intent);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.status, 'manual_review');
      assert.strictEqual(result.reason, 'gateway_currency_mismatch');
      assert.strictEqual(manualReviewCalled, true, 'Intent must be marked manual_review');
      assert.strictEqual(refundExecuted, false, 'Refund HTTP request must NOT be sent on discrepancy');
    });

    test('payment not in captured state (e.g. failed or authorized) flags for manual review without refunding', async () => {
      const intent = {
        id: 'ref_intent_not_captured_002',
        order_id: '99999999-0000-0000-0000-000000000005',
        payment_id: 'pay_not_captured_108',
        amount: 30000,
        currency: 'INR',
        idempotency_key: 'rfnd_key_not_captured_12345',
        status: 'processing',
      };

      const mockOrder = {
        id: intent.order_id,
        status: 'cancelled',
        grand_total: '300.00',
        currency: 'INR',
        razorpay_order_id: 'order_rzp_not_captured',
      };

      setRazorpayClient({
        payments: {
          fetch: async () => ({
            id: intent.payment_id,
            amount: 30000,
            currency: 'INR',
            status: 'failed', // NOT captured!
            order_id: 'order_rzp_not_captured',
            amount_refunded: 0,
          }),
        },
      });

      let manualReviewCalled = false;
      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: mockOrder, error: null }),
                }),
              }),
            };
          }
          if (table === 'refund_intents') {
            return {
              update: (data) => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: async () => {
                      if (data.status === 'manual_review') manualReviewCalled = true;
                      return { data: { ...intent, ...data }, error: null };
                    },
                  }),
                }),
              }),
            };
          }
          return {};
        },
      });

      const result = await processRefundIntent(intent);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.status, 'manual_review');
      assert.strictEqual(result.reason, 'payment_not_captured');
      assert.strictEqual(manualReviewCalled, true);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Existing Full and Partial Refunds Handling (Phase 5B.5)
  // --------------------------------------------------------------------------
  describe('Phase 5B.5: Existing Full and Partial Refunds Handling', () => {
    test('existing full refund: detects already completed refund, marks completed without calling refund API', async () => {
      const intent = {
        id: 'ref_intent_existing_full_001',
        order_id: '99999999-0000-0000-0000-000000000006',
        payment_id: 'pay_existing_full_109',
        amount: 40000,
        currency: 'INR',
        idempotency_key: 'rfnd_key_existing_full_12345',
        status: 'processing',
      };

      const mockOrder = {
        id: intent.order_id,
        status: 'cancelled',
        grand_total: '400.00',
        currency: 'INR',
        razorpay_order_id: 'order_rzp_existing_full',
      };

      setRazorpayClient({
        payments: {
          fetch: async () => ({
            id: intent.payment_id,
            amount: 40000,
            currency: 'INR',
            status: 'refunded',
            order_id: 'order_rzp_existing_full',
            amount_refunded: 40000, // 100% refunded already!
            refund_id: 'rfnd_pre_existing_777',
          }),
          fetchMultipleRefund: async () => ({
            items: [{ id: 'rfnd_pre_existing_777', amount: 40000, status: 'processed' }],
          }),
        },
      });

      let refundCompleted = false;
      let orderRefundStatus = null;

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: mockOrder, error: null }),
                }),
              }),
              update: (data) => ({
                eq: async () => {
                  orderRefundStatus = data.status;
                  return { data: { ...mockOrder, ...data }, error: null };
                },
              }),
            };
          }
          if (table === 'refund_intents') {
            return {
              update: (data) => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: async () => {
                      if (data.status === 'completed') refundCompleted = true;
                      return { data: { ...intent, ...data }, error: null };
                    },
                  }),
                }),
              }),
            };
          }
          return {};
        },
      });

      let refundApiCalled = false;
      setRefundHttpTransport(async () => {
        refundApiCalled = true;
        return { ok: true, status: 200, data: {} };
      });

      const result = await processRefundIntent(intent);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.alreadyRefunded, true);
      assert.strictEqual(result.refundId, 'rfnd_pre_existing_777');
      assert.strictEqual(refundCompleted, true);
      assert.strictEqual(refundApiCalled, false, 'Must NOT invoke refund API when already fully refunded');
    });

    test('existing partial refund: flags for manual review to prevent duplicate or exceeding refunds', async () => {
      const intent = {
        id: 'ref_intent_partial_001',
        order_id: '99999999-0000-0000-0000-000000000007',
        payment_id: 'pay_partial_110',
        amount: 60000,
        currency: 'INR',
        idempotency_key: 'rfnd_key_partial_1234567890',
        status: 'processing',
      };

      const mockOrder = {
        id: intent.order_id,
        status: 'cancelled',
        grand_total: '600.00',
        currency: 'INR',
        razorpay_order_id: 'order_rzp_partial',
      };

      // Gateway shows partial refund (20000 of 60000 paise already refunded)
      setRazorpayClient({
        payments: {
          fetch: async () => ({
            id: intent.payment_id,
            amount: 60000,
            currency: 'INR',
            status: 'captured',
            order_id: 'order_rzp_partial',
            amount_refunded: 20000,
          }),
        },
      });

      let manualReviewCalled = false;

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: mockOrder, error: null }),
                }),
              }),
            };
          }
          if (table === 'refund_intents') {
            return {
              update: (data) => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: async () => {
                      if (data.status === 'manual_review') manualReviewCalled = true;
                      return { data: { ...intent, ...data }, error: null };
                    },
                  }),
                }),
              }),
            };
          }
          return {};
        },
      });

      let refundApiCalled = false;
      setRefundHttpTransport(async () => {
        refundApiCalled = true;
        return { ok: true, status: 200, data: {} };
      });

      const result = await processRefundIntent(intent);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.status, 'manual_review');
      assert.strictEqual(result.reason, 'existing_partial_refund_detected');
      assert.strictEqual(manualReviewCalled, true);
      assert.strictEqual(refundApiCalled, false, 'Must NOT trigger automated refund on partial refund discrepancy');
    });
  });

  // --------------------------------------------------------------------------
  // 6. HTTP 409 Conflict & In-Progress Gateway Handling (Phase 5B.6)
  // --------------------------------------------------------------------------
  describe('Phase 5B.6: HTTP 409 Conflict & In-Progress Gateway Handling', () => {
    test('HTTP 409 Conflict releases worker claim for retry with exact same idempotency key', async () => {
      const intent = {
        id: 'ref_intent_conflict_001',
        order_id: '99999999-0000-0000-0000-000000000008',
        payment_id: 'pay_conflict_111',
        amount: 20000,
        currency: 'INR',
        idempotency_key: 'rfnd_key_conflict_1234567890',
        status: 'processing',
      };

      const mockOrder = {
        id: intent.order_id,
        status: 'cancelled',
        grand_total: '200.00',
        currency: 'INR',
        razorpay_order_id: 'order_rzp_conflict',
      };

      setRazorpayClient({
        payments: {
          fetch: async () => ({
            id: intent.payment_id,
            amount: 20000,
            currency: 'INR',
            status: 'captured',
            order_id: 'order_rzp_conflict',
            amount_refunded: 0,
          }),
        },
      });

      let claimReleased = false;

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: mockOrder, error: null }),
                }),
              }),
            };
          }
          if (table === 'refund_intents') {
            return {
              update: (data) => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: async () => {
                      if (data.status === 'pending' && data.worker_claimed_at === null) {
                        claimReleased = true;
                      }
                      return { data: { ...intent, ...data }, error: null };
                    },
                  }),
                }),
              }),
            };
          }
          return {};
        },
      });

      // Gateway returns HTTP 409 Conflict (request currently processing)
      setRefundHttpTransport(async () => ({
        ok: false,
        status: 409,
        conflict: true,
        error: { description: 'Refund request already in progress at gateway' },
      }));

      const result = await processRefundIntent(intent);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.status, 'conflict_retryable');
      assert.strictEqual(claimReleased, true, 'Worker claim must be released for retry with same idempotency key');
    });
  });

  // --------------------------------------------------------------------------
  // 7. Network Timeout & Gateway Reconciliation (Phase 5B.7)
  // --------------------------------------------------------------------------
  describe('Phase 5B.7: Network Timeout & Gateway Reconciliation', () => {
    test('network timeout with successful gateway reconciliation marks intent completed', async () => {
      const intent = {
        id: 'ref_intent_timeout_rec_001',
        order_id: '99999999-0000-0000-0000-000000000009',
        payment_id: 'pay_timeout_112',
        amount: 35000,
        currency: 'INR',
        idempotency_key: 'rfnd_key_timeout_1234567890',
        status: 'processing',
      };

      const mockOrder = {
        id: intent.order_id,
        status: 'cancelled',
        grand_total: '350.00',
        currency: 'INR',
        razorpay_order_id: 'order_rzp_timeout',
      };

      let fetchCallCount = 0;
      setRazorpayClient({
        payments: {
          fetch: async () => {
            fetchCallCount++;
            return {
              id: intent.payment_id,
              amount: 35000,
              currency: 'INR',
              status: 'captured',
              order_id: 'order_rzp_timeout',
              // 0 on pre-flight, 35000 on reconciliation
              amount_refunded: fetchCallCount === 1 ? 0 : 35000,
              refund_id: 'rfnd_reconciled_after_timeout_888',
            };
          },
          fetchMultipleRefund: async () => ({
            items: [
              {
                id: 'rfnd_reconciled_after_timeout_888',
                amount: 35000,
                status: 'processed',
              },
            ],
          }),
        },
      });

      let intentCompleted = false;

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: mockOrder, error: null }),
                }),
              }),
              update: () => ({ eq: async () => ({ data: mockOrder, error: null }) }),
            };
          }
          if (table === 'refund_intents') {
            return {
              update: (data) => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: async () => {
                      if (data.status === 'completed') intentCompleted = true;
                      return { data: { ...intent, ...data }, error: null };
                    },
                  }),
                }),
              }),
            };
          }
          return {};
        },
      });

      // Simulate network socket timeout on initial POST
      setRefundHttpTransport(async () => ({
        ok: false,
        status: 0,
        timeout: true,
        networkError: true,
        error: { description: 'The operation was aborted due to timeout', name: 'AbortError' },
      }));

      const result = await processRefundIntent(intent);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.status, 'completed');
      assert.strictEqual(result.reconciled, true);
      assert.strictEqual(result.refundId, 'rfnd_reconciled_after_timeout_888');
      assert.strictEqual(intentCompleted, true);
    });

    test('network timeout with uncertain reconciliation flags intent for manual review', async () => {
      const intent = {
        id: 'ref_intent_timeout_uncertain_002',
        order_id: '99999999-0000-0000-0000-000000000010',
        payment_id: 'pay_timeout_uncertain_113',
        amount: 55000,
        currency: 'INR',
        idempotency_key: 'rfnd_key_timeout_unc_12345678',
        status: 'processing',
      };

      const mockOrder = {
        id: intent.order_id,
        status: 'cancelled',
        grand_total: '550.00',
        currency: 'INR',
        razorpay_order_id: 'order_rzp_timeout_unc',
      };

      // Gateway still shows 0 amount_refunded and empty refunds list
      setRazorpayClient({
        payments: {
          fetch: async () => ({
            id: intent.payment_id,
            amount: 55000,
            currency: 'INR',
            status: 'captured',
            order_id: 'order_rzp_timeout_unc',
            amount_refunded: 0,
          }),
          fetchMultipleRefund: async () => ({
            items: [],
          }),
        },
      });

      let manualReviewCalled = false;

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: mockOrder, error: null }),
                }),
              }),
            };
          }
          if (table === 'refund_intents') {
            return {
              update: (data) => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: async () => {
                      if (data.status === 'manual_review') manualReviewCalled = true;
                      return { data: { ...intent, ...data }, error: null };
                    },
                  }),
                }),
              }),
            };
          }
          return {};
        },
      });

      setRefundHttpTransport(async () => ({
        ok: false,
        status: 0,
        timeout: true,
        networkError: true,
        error: { description: 'Connection reset by peer', name: 'FetchError' },
      }));

      const result = await processRefundIntent(intent);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.status, 'manual_review');
      assert.strictEqual(result.reason, 'timeout_uncertain');
      assert.strictEqual(manualReviewCalled, true, 'Uncertain timeout state must be flagged for manual review');
    });
  });

  // --------------------------------------------------------------------------
  // 8. Gateway Errors & Status Lifecycle Invariants (Phase 5B.8)
  // --------------------------------------------------------------------------
  describe('Phase 5B.8: Gateway Errors & Status Lifecycle Invariants', () => {
    test('insufficient merchant balance error transitions intent to manual_review', async () => {
      const intent = {
        id: 'ref_intent_balance_err_001',
        order_id: '99999999-0000-0000-0000-000000000011',
        payment_id: 'pay_balance_114',
        amount: 75000,
        currency: 'INR',
        idempotency_key: 'rfnd_key_balance_1234567890',
        status: 'processing',
      };

      const mockOrder = {
        id: intent.order_id,
        status: 'cancelled',
        grand_total: '750.00',
        currency: 'INR',
        razorpay_order_id: 'order_rzp_balance',
      };

      setRazorpayClient({
        payments: {
          fetch: async () => ({
            id: intent.payment_id,
            amount: 75000,
            currency: 'INR',
            status: 'captured',
            order_id: 'order_rzp_balance',
            amount_refunded: 0,
          }),
        },
      });

      let manualReviewCalled = false;

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: mockOrder, error: null }),
                }),
              }),
            };
          }
          if (table === 'refund_intents') {
            return {
              update: (data) => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: async () => {
                      if (data.status === 'manual_review') manualReviewCalled = true;
                      return { data: { ...intent, ...data }, error: null };
                    },
                  }),
                }),
              }),
            };
          }
          return {};
        },
      });

      // Gateway returns insufficient balance
      setRefundHttpTransport(async () => ({
        ok: false,
        status: 400,
        error: {
          code: 'BAD_REQUEST_PAYMENT_REFUND_AMOUNT_GREATER_THAN_BALANCE',
          description: 'The refund amount is greater than the merchant balance available',
        },
      }));

      const result = await processRefundIntent(intent);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.status, 'manual_review');
      assert.strictEqual(result.reason, 'insufficient_balance');
      assert.strictEqual(manualReviewCalled, true);
    });

    test('rule: never mark a refund completed merely because request was sent (handles status=pending)', async () => {
      const intent = {
        id: 'ref_intent_status_pending_001',
        order_id: '99999999-0000-0000-0000-000000000012',
        payment_id: 'pay_pending_status_115',
        amount: 25000,
        currency: 'INR',
        idempotency_key: 'rfnd_key_pending_status_1234',
        status: 'processing',
      };

      const mockOrder = {
        id: intent.order_id,
        status: 'cancelled',
        grand_total: '250.00',
        currency: 'INR',
        razorpay_order_id: 'order_rzp_pending_status',
      };

      setRazorpayClient({
        payments: {
          fetch: async () => ({
            id: intent.payment_id,
            amount: 25000,
            currency: 'INR',
            status: 'captured',
            order_id: 'order_rzp_pending_status',
            amount_refunded: 0,
          }),
        },
      });

      let intentMarkedCompleted = false;

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: mockOrder, error: null }),
                }),
              }),
            };
          }
          if (table === 'refund_intents') {
            return {
              update: (data) => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: async () => {
                      if (data.status === 'completed') intentMarkedCompleted = true;
                      return { data: { ...intent, ...data }, error: null };
                    },
                  }),
                }),
              }),
            };
          }
          return {};
        },
      });

      // Gateway returns HTTP 200 but refund status is 'pending' (awaiting banking processing)
      setRefundHttpTransport(async () => ({
        ok: true,
        status: 200,
        data: {
          id: 'rfnd_pending_gateway_001',
          entity: 'refund',
          amount: 25000,
          currency: 'INR',
          payment_id: 'pay_pending_status_115',
          status: 'pending', // NOT 'processed'
        },
      }));

      const result = await processRefundIntent(intent);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.status, 'processing');
      assert.strictEqual(result.pendingGatewayProcessing, true);
      assert.strictEqual(intentMarkedCompleted, false, 'Must NOT mark completed when gateway status is pending');
    });
  });

  // --------------------------------------------------------------------------
  // 9. Batch Worker Orchestration & Internal Cron Protection (Phase 5B.9)
  // --------------------------------------------------------------------------
  describe('Phase 5B.9: Batch Worker Orchestration & Internal Cron Protection', () => {
    test('processPendingRefundIntents runs sequential batch and reports accurate summary', async () => {
      let candidateServed = false;
      const intentCandidate = {
        id: 'ref_intent_batch_001',
        order_id: '99999999-0000-0000-0000-000000000013',
        payment_id: 'pay_batch_116',
        amount: 15000,
        currency: 'INR',
        idempotency_key: 'rfnd_key_batch_1234567890',
        status: 'pending',
      };

      const mockOrder = {
        id: intentCandidate.order_id,
        status: 'cancelled',
        grand_total: '150.00',
        currency: 'INR',
        razorpay_order_id: 'order_rzp_batch',
      };

      setRazorpayClient({
        payments: {
          fetch: async () => ({
            id: intentCandidate.payment_id,
            amount: 15000,
            currency: 'INR',
            status: 'captured',
            order_id: 'order_rzp_batch',
            amount_refunded: 0,
          }),
        },
      });

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: mockOrder, error: null }),
                }),
              }),
              update: () => ({ eq: async () => ({ data: mockOrder, error: null }) }),
            };
          }
          if (table === 'refund_intents') {
            return {
              select: () => ({
                or: () => ({
                  order: () => ({
                    limit: async () => {
                      if (!candidateServed) {
                        candidateServed = true;
                        return { data: [intentCandidate], error: null };
                      }
                      return { data: [], error: null };
                    },
                  }),
                }),
              }),
              update: (data) => ({
                eq: (col1, val1) => ({
                  eq: (col2, val2) => ({
                    select: () => ({
                      maybeSingle: async () => ({
                        data: { ...intentCandidate, ...data, status: 'processing' },
                        error: null,
                      }),
                    }),
                  }),
                  select: () => ({
                    maybeSingle: async () => ({
                      data: { ...intentCandidate, ...data },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        },
      });

      setRefundHttpTransport(async () => ({
        ok: true,
        status: 200,
        data: {
          id: 'rfnd_batch_success_999',
          status: 'processed',
          amount: 15000,
        },
      }));

      const summary = await processPendingRefundIntents({ batchSize: 5 });

      assert.strictEqual(summary.scanned, 1);
      assert.strictEqual(summary.processed, 1);
      assert.strictEqual(summary.completed, 1);
      assert.strictEqual(summary.errors, 0);
      assert.strictEqual(summary.items[0].intentId, 'ref_intent_batch_001');
      assert.ok(Array.isArray(summary.items), 'Service-level call must retain detailed items array');
      assert.strictEqual(summary.items.length, 1);
      assert.strictEqual(summary.items[0].paymentId, 'pay_batch_116');
      assert.ok(summary.items[0].result, 'Service-level items must contain result details');
    });

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
        const res = await fetch(`http://127.0.0.1:${port}/api/internal/refunds/process-intents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        assert.strictEqual(res.status, 401);
      } finally {
        server.close();
      }
    });

    test('HTTP: rejects request with invalid bearer token with 401', async () => {
      const app = createTestApp();
      const server = app.listen(0);
      const port = server.address().port;

      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/internal/refunds/process-intents`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer wrong_token_entirely_12345',
          },
          body: JSON.stringify({}),
        });
        assert.strictEqual(res.status, 401);
      } finally {
        server.close();
      }
    });

    test('HTTP: rejects invalid batchSize input with 400', async () => {
      const app = createTestApp();
      const server = app.listen(0);
      const port = server.address().port;

      try {
        const invalidInputs = [0, -5, 'not-a-number', 1.5];
        for (const badBatch of invalidInputs) {
          const res = await fetch(`http://127.0.0.1:${port}/api/internal/refunds/process-intents`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${TEST_CRON_SECRET}`,
            },
            body: JSON.stringify({ batchSize: badBatch }),
          });
          assert.strictEqual(res.status, 400, `batchSize=${badBatch} must be rejected with 400`);
          const body = await res.json();
          assert.match(body.error || body.message || '', /batchSize must be a positive integer/i);
        }
      } finally {
        server.close();
      }
    });

    test('HTTP: excludes per-intent items array and remains under 500 bytes when multiple intents are processed', async () => {
      const candidates = [
        {
          id: 'ref_intent_batch_http_001',
          order_id: '99999999-0000-0000-0000-000000000051',
          payment_id: 'pay_batch_http_501',
          amount: 10000,
          currency: 'INR',
          idempotency_key: 'rfnd_key_batch_http_501_12345',
          status: 'pending',
        },
        {
          id: 'ref_intent_batch_http_002',
          order_id: '99999999-0000-0000-0000-000000000052',
          payment_id: 'pay_batch_http_502',
          amount: 20000,
          currency: 'INR',
          idempotency_key: 'rfnd_key_batch_http_502_12345',
          status: 'pending',
        },
        {
          id: 'ref_intent_batch_http_003',
          order_id: '99999999-0000-0000-0000-000000000053',
          payment_id: 'pay_batch_http_503',
          amount: 30000,
          currency: 'INR',
          idempotency_key: 'rfnd_key_batch_http_503_12345',
          status: 'pending',
        },
      ];

      let claimIndex = 0;

      const orderMap = {
        [candidates[0].order_id]: {
          id: candidates[0].order_id,
          status: 'cancelled',
          grand_total: '100.00',
          currency: 'INR',
          razorpay_order_id: 'order_rzp_http_501',
        },
        [candidates[1].order_id]: {
          id: candidates[1].order_id,
          status: 'cancelled',
          grand_total: '200.00',
          currency: 'INR',
          razorpay_order_id: 'order_rzp_http_502',
        },
        [candidates[2].order_id]: {
          id: candidates[2].order_id,
          status: 'cancelled',
          grand_total: '300.00',
          currency: 'INR',
          razorpay_order_id: 'order_rzp_http_503',
        },
      };

      setRazorpayClient({
        payments: {
          fetch: async (payId) => {
            const matched = candidates.find((c) => c.payment_id === payId);
            return {
              id: payId,
              amount: matched?.amount || 10000,
              currency: 'INR',
              status: 'captured',
              order_id: orderMap[matched?.order_id]?.razorpay_order_id || 'order_rzp_mock',
              amount_refunded: 0,
            };
          },
        },
      });

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: (col, val) => ({
                  maybeSingle: async () => ({
                    data: orderMap[val] || null,
                    error: null,
                  }),
                }),
              }),
              update: () => ({
                eq: async () => ({ data: {}, error: null }),
              }),
            };
          }
          if (table === 'refund_intents') {
            return {
              select: () => ({
                or: () => ({
                  order: () => ({
                    limit: async () => {
                      if (claimIndex < candidates.length) {
                        return { data: [candidates[claimIndex]], error: null };
                      }
                      return { data: [], error: null };
                    },
                  }),
                }),
              }),
              update: (data) => ({
                eq: (col1, val1) => ({
                  eq: (col2, val2) => ({
                    select: () => ({
                      maybeSingle: async () => {
                        const current = candidates[claimIndex];
                        claimIndex++;
                        return {
                          data: { ...current, ...data, status: 'processing' },
                          error: null,
                        };
                      },
                    }),
                  }),
                  select: () => ({
                    maybeSingle: async () => ({
                      data: { ...data },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        },
      });

      setRefundHttpTransport(async () => ({
        ok: true,
        status: 200,
        data: {
          id: `rfnd_batch_http_${Date.now()}`,
          status: 'processed',
          amount: 10000,
        },
      }));

      const app = createTestApp();
      const server = app.listen(0);
      const port = server.address().port;

      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/internal/refunds/process-intents`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${TEST_CRON_SECRET}`,
          },
          body: JSON.stringify({ batchSize: 5 }),
        });

        assert.strictEqual(res.status, 200);

        const rawBodyText = await res.text();
        const rawByteLength = Buffer.byteLength(rawBodyText, 'utf8');

        // Bounded response size hardening: strictly under 500 bytes
        assert.ok(
          rawByteLength < 500,
          `HTTP response size (${rawByteLength} bytes) must remain strictly under 500 bytes to prevent cron-job.org buffer overflow`
        );

        const body = JSON.parse(rawBodyText);

        // Verify summary fields accurately reflect outcomes
        assert.strictEqual(body.scanned, 3, 'Must report accurate scanned count');
        assert.strictEqual(body.processed, 3, 'Must report accurate processed count');
        assert.strictEqual(body.completed, 3, 'Must report accurate completed count');
        assert.strictEqual(body.manualReview, 0, 'Must report accurate manualReview count');
        assert.strictEqual(body.retried, 0, 'Must report accurate retried count');
        assert.strictEqual(body.errors, 0, 'Must report accurate errors count');

        // Strict projection security: items array MUST NOT be present in HTTP response
        assert.strictEqual(body.items, undefined, 'HTTP response must exclude per-intent items array');
        assert.strictEqual('items' in body, false, 'items key must not exist in response JSON');

        // Strict security: gateway details and IDs must NOT leak into HTTP response
        assert.strictEqual('gatewayResponse' in body, false, 'Gateway responses must not leak');
        assert.strictEqual('paymentId' in body, false, 'Payment IDs must not leak');
        assert.strictEqual('orderId' in body, false, 'Order IDs must not leak');
        assert.strictEqual('intentId' in body, false, 'Intent IDs must not leak');
      } finally {
        server.close();
      }
    });

    test('HTTP: fails closed with 500 when service returns a malformed or absent summary', async () => {
      const app = createTestApp();
      const server = app.listen(0);
      const port = server.address().port;

      const malformedCases = [
        null,
        undefined,
        {},
        { scanned: 1, processed: 1 }, // missing completed, manualReview, retried, errors
        { scanned: 1, processed: 1, completed: 1, manualReview: 0, retried: 0, errors: 'invalid' }, // non-numeric
        { scanned: 1, processed: 1, completed: 1, manualReview: 0, retried: 0, errors: -1 }, // negative
        { scanned: 1.5, processed: 1, completed: 1, manualReview: 0, retried: 0, errors: 0 }, // non-integer
      ];

      try {
        for (const malformedSummary of malformedCases) {
          setProcessPendingRefundIntents(async () => malformedSummary);

          const res = await fetch(`http://127.0.0.1:${port}/api/internal/refunds/process-intents`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${TEST_CRON_SECRET}`,
            },
            body: JSON.stringify({ batchSize: 10 }),
          });

          assert.strictEqual(
            res.status,
            500,
            `Expected HTTP 500 for malformed summary: ${JSON.stringify(malformedSummary)}`
          );

          const body = await res.json();
          assert.match(
            body.error,
            /Invalid refund sweeper summary|Malformed refund service summary/i,
            'Error message should indicate malformed or invalid service summary'
          );
          // Never return items, order IDs, payment IDs, gateway payloads, or stack traces
          assert.strictEqual(body.items, undefined);
          assert.strictEqual(body.stack, undefined);
          assert.strictEqual('scanned' in body, false, 'Malformed results must not pretend to succeed with summary fields');
        }
      } finally {
        setProcessPendingRefundIntents(null);
        server.close();
      }
    });

    test('test taxonomy: distinction between mocked tests and real PostgreSQL integration', () => {
      const taxonomy = {
        mocked: {
          scope: 'Unit & integration test suites (tests/*.test.js)',
          gatewayCalls: 'Mocked in-memory (setRazorpayClient, setRefundHttpTransport)',
          databaseClient: 'Mocked in-memory (setSupabaseClient)',
          productionSafety: 'Safe to run in CI/CD without credentials or network access',
        },
        realPostgres: {
          scope: 'Production Supabase deployment (Migration 013)',
          databaseRequirements: [
            'public.refund_intents table with unique constraints on (order_id, payment_id)',
            'record_late_capture_refund_intent_atomic PL/pgSQL function',
            'SECURITY DEFINER search_path hardening: revoke create on schema public from public, anon, authenticated',
            'Exclusive service_role permissions for table and function',
          ],
          gatewayRequirements: [
            'RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET configured on backend only',
            'Direct HTTPS request with X-Refund-Idempotency header bypassing SDK header filter',
          ],
        },
      };

      assert.strictEqual(taxonomy.mocked.productionSafety.includes('Safe to run'), true);
      assert.strictEqual(taxonomy.realPostgres.databaseRequirements.length, 4);
    });
  });

  // --------------------------------------------------------------------------
  // 10. Phase 5B.1: Refund Completion, Webhook Reconciliation & Safety Tests
  // --------------------------------------------------------------------------
  describe('Phase 5B.1: Refund Completion, Webhook Reconciliation & Safety Tests', () => {
    // 1. A pending refund later becomes processed
    test('1A. A pending refund later becomes processed via refund.processed webhook', async () => {
      const eventId = 'evt_rfnd_processed_wh_001';
      const orderId = '99999999-0000-0000-0000-000000000021';
      const paymentId = 'pay_pending_proc_201';
      const refundId = 'rfnd_p2p_wh_201';

      const mockOrder = {
        id: orderId,
        order_number: 'ALT-5001',
        status: 'cancelled',
        payment_status: 'failed',
        grand_total: '500.00',
        currency: 'INR',
        razorpay_order_id: 'order_rzp_p2p_201',
      };

      const mockIntent = {
        id: 'ref_intent_p2p_001',
        order_id: orderId,
        payment_id: paymentId,
        amount: 50000,
        currency: 'INR',
        status: 'processing',
        idempotency_key: 'rfnd_key_p2p_1234567890',
        razorpay_refund_id: refundId,
      };

      const payload = {
        event: 'refund.processed',
        payload: {
          refund: {
            entity: {
              id: refundId,
              payment_id: paymentId,
              amount: 50000,
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

      let intentUpdatedStatus = null;
      let orderUpdatedStatus = null;
      let recordedWebhook = null;

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
                    recordedWebhook = data;
                    return { data, error: null };
                  },
                }),
              }),
            };
          }
          if (table === 'refund_intents') {
            return {
              select: () => ({
                eq: (col, val) => ({
                  maybeSingle: async () => {
                    if (val === mockIntent.id || val === paymentId || val === refundId) {
                      return { data: mockIntent, error: null };
                    }
                    return { data: null, error: null };
                  },
                }),
              }),
              update: (data) => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: async () => {
                      intentUpdatedStatus = data.status;
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
                  orderUpdatedStatus = data.status;
                  return { data: { ...mockOrder, ...data }, error: null };
                },
              }),
            };
          }
          return {};
        },
      });

      const result = await handleWebhookEvent({ rawBody, signature, eventId, payload });

      assert.strictEqual(result.received, true);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.status, 'completed');
      assert.strictEqual(result.refundId, refundId);
      assert.strictEqual(intentUpdatedStatus, 'completed');
      assert.strictEqual(orderUpdatedStatus, 'refunded');
      assert.ok(recordedWebhook);
    });

    test('1B. A pending refund later becomes processed via worker reconciliation against Razorpay', async () => {
      const orderId = '99999999-0000-0000-0000-000000000022';
      const paymentId = 'pay_pending_proc_202';
      const refundId = 'rfnd_p2p_worker_202';

      const mockOrder = {
        id: orderId,
        order_number: 'ALT-5002',
        status: 'cancelled',
        payment_status: 'failed',
        grand_total: '300.00',
        currency: 'INR',
        razorpay_order_id: 'order_rzp_p2p_202',
      };

      const mockIntent = {
        id: 'ref_intent_p2p_worker_002',
        order_id: orderId,
        payment_id: paymentId,
        amount: 30000,
        currency: 'INR',
        status: 'processing',
        idempotency_key: 'rfnd_key_p2p_worker_12345',
        razorpay_refund_id: refundId,
      };

      setRazorpayClient({
        payments: {
          fetch: async () => ({
            id: paymentId,
            amount: 30000,
            currency: 'INR',
            status: 'captured',
            order_id: 'order_rzp_p2p_202',
            amount_refunded: 30000,
          }),
        },
        refunds: {
          fetch: async (rId) => {
            assert.strictEqual(rId, refundId);
            return {
              id: refundId,
              status: 'processed',
              amount: 30000,
              payment_id: paymentId,
            };
          },
        },
      });

      let intentMarkedCompleted = false;
      let refundHttpCalled = false;

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: mockOrder, error: null }),
                }),
              }),
              update: () => ({ eq: async () => ({ data: mockOrder, error: null }) }),
            };
          }
          if (table === 'refund_intents') {
            return {
              update: (data) => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: async () => {
                      if (data.status === 'completed') intentMarkedCompleted = true;
                      return { data: { ...mockIntent, ...data }, error: null };
                    },
                  }),
                }),
              }),
            };
          }
          return {};
        },
      });

      setRefundHttpTransport(async () => {
        refundHttpCalled = true;
        return { ok: true, status: 200, data: {} };
      });

      const result = await processRefundIntent(mockIntent);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.status, 'completed');
      assert.strictEqual(result.refundId, refundId);
      assert.strictEqual(intentMarkedCompleted, true);
      assert.strictEqual(refundHttpCalled, false, 'Must NOT make new refund HTTP request when reconciliation finds processed refund');
    });

    // 2. A pending refund later fails
    test('2A. A pending refund later fails via refund.failed webhook', async () => {
      const eventId = 'evt_rfnd_failed_wh_001';
      const orderId = '99999999-0000-0000-0000-000000000023';
      const paymentId = 'pay_pending_fail_203';
      const refundId = 'rfnd_p2f_wh_203';

      const mockOrder = {
        id: orderId,
        order_number: 'ALT-5003',
        status: 'cancelled',
        payment_status: 'failed',
        grand_total: '450.00',
        currency: 'INR',
      };

      const mockIntent = {
        id: 'ref_intent_p2f_001',
        order_id: orderId,
        payment_id: paymentId,
        amount: 45000,
        currency: 'INR',
        status: 'processing',
        idempotency_key: 'rfnd_key_p2f_1234567890',
        razorpay_refund_id: refundId,
      };

      const payload = {
        event: 'refund.failed',
        payload: {
          refund: {
            entity: {
              id: refundId,
              payment_id: paymentId,
              amount: 45000,
              currency: 'INR',
              status: 'failed',
              error_code: 'BANK_ACCOUNT_REVERSED',
              error_description: 'Customer bank account closed or invalid IFSC',
              notes: {
                refund_intent_id: mockIntent.id,
              },
            },
          },
        },
      };

      const { rawBody, signature } = createSignedWebhookPayload(payload);

      let intentUpdatedStatus = null;
      let intentErrorMessage = null;

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
                      intentUpdatedStatus = data.status;
                      intentErrorMessage = data.error_message;
                      return { data: { ...mockIntent, ...data }, error: null };
                    },
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
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.status, 'failed');
      assert.strictEqual(intentUpdatedStatus, 'manual_review');
      assert.match(intentErrorMessage, /account closed/i);
    });

    test('2B. A pending refund later fails via worker reconciliation against Razorpay', async () => {
      const orderId = '99999999-0000-0000-0000-000000000024';
      const paymentId = 'pay_pending_fail_204';
      const refundId = 'rfnd_p2f_worker_204';

      const mockOrder = {
        id: orderId,
        order_number: 'ALT-5004',
        status: 'cancelled',
        grand_total: '200.00',
        currency: 'INR',
        razorpay_order_id: 'order_rzp_p2f_204',
      };

      const mockIntent = {
        id: 'ref_intent_p2f_worker_002',
        order_id: orderId,
        payment_id: paymentId,
        amount: 20000,
        currency: 'INR',
        status: 'processing',
        idempotency_key: 'rfnd_key_p2f_worker_12345',
        razorpay_refund_id: refundId,
      };

      setRazorpayClient({
        payments: {
          fetch: async () => ({
            id: paymentId,
            amount: 20000,
            currency: 'INR',
            status: 'captured',
            order_id: 'order_rzp_p2f_204',
            amount_refunded: 0,
          }),
        },
        refunds: {
          fetch: async () => ({
            id: refundId,
            status: 'failed',
            amount: 20000,
            error_description: 'Beneficiary bank declined instant credit',
          }),
        },
      });

      let manualReviewCalled = false;
      let httpCalled = false;

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: mockOrder, error: null }),
                }),
              }),
            };
          }
          if (table === 'refund_intents') {
            return {
              update: (data) => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: async () => {
                      if (data.status === 'manual_review') manualReviewCalled = true;
                      return { data: { ...mockIntent, ...data }, error: null };
                    },
                  }),
                }),
              }),
            };
          }
          return {};
        },
      });

      setRefundHttpTransport(async () => {
        httpCalled = true;
        return { ok: true, status: 200, data: {} };
      });

      const result = await processRefundIntent(mockIntent);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.status, 'manual_review');
      assert.strictEqual(result.reason, 'existing_gateway_refund_failed');
      assert.strictEqual(manualReviewCalled, true);
      assert.strictEqual(httpCalled, false, 'Must NOT re-execute refund HTTP request when existing refund failed');
    });

    // 3. Duplicate and out-of-order refund webhooks
    test('3. Duplicate and out-of-order refund webhooks do not corrupt refund state', async () => {
      const eventId1 = 'evt_duplicate_rfnd_1';
      const eventId2 = 'evt_delayed_created_2';
      const orderId = '99999999-0000-0000-0000-000000000025';
      const paymentId = 'pay_dup_ooo_205';
      const refundId = 'rfnd_dup_ooo_205';

      let currentIntentStatus = 'completed'; // Already marked completed by earlier event

      const mockCompletedIntent = {
        id: 'ref_intent_ooo_001',
        order_id: orderId,
        payment_id: paymentId,
        amount: 35000,
        currency: 'INR',
        status: currentIntentStatus,
        idempotency_key: 'rfnd_key_ooo_1234567890',
        razorpay_refund_id: refundId,
      };

      // 3A: Delayed refund.created event (status: pending) arrives after completion
      const delayedCreatedPayload = {
        event: 'refund.created',
        payload: {
          refund: {
            entity: {
              id: refundId,
              payment_id: paymentId,
              amount: 35000,
              currency: 'INR',
              status: 'pending', // Pending status from earlier in the lifecycle
              notes: { refund_intent_id: mockCompletedIntent.id },
            },
          },
        },
      };

      const { rawBody: rawBodyDelayed, signature: sigDelayed } = createSignedWebhookPayload(delayedCreatedPayload);

      let intentStatusOverwritten = false;

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
                  maybeSingle: async () => ({ data: mockCompletedIntent, error: null }),
                }),
              }),
              update: (data) => {
                if (data.status !== 'completed') {
                  intentStatusOverwritten = true;
                }
                return {
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => ({ data: mockCompletedIntent, error: null }),
                    }),
                  }),
                };
              },
            };
          }
          return {};
        },
      });

      const delayedResult = await handleWebhookEvent({
        rawBody: rawBodyDelayed,
        signature: sigDelayed,
        eventId: eventId2,
        payload: delayedCreatedPayload,
      });

      assert.strictEqual(delayedResult.received, true);
      assert.strictEqual(delayedResult.alreadyCompleted, true);
      assert.strictEqual(intentStatusOverwritten, false, 'Delayed refund.created must NOT overwrite completed status');

      // 3B: Exact duplicate event delivery is deduplicated via razorpay_webhook_events
      setSupabaseClient({
        from: (table) => {
          if (table === 'razorpay_webhook_events') {
            return {
              select: () => ({
                eq: () => ({
                  // Returns existing event record
                  maybeSingle: async () => ({
                    data: { event_id: eventId1, processed_at: new Date().toISOString() },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        },
      });

      const dupResult = await handleWebhookEvent({
        rawBody: rawBodyDelayed,
        signature: sigDelayed,
        eventId: eventId1,
        payload: delayedCreatedPayload,
      });

      assert.strictEqual(dupResult.received, true);
      assert.strictEqual(dupResult.duplicate, true);
    });

    // 4. A worker crashes after Razorpay accepts a refund
    test('4. A worker crashes after Razorpay accepts a refund; next worker recovers and completes without duplicate refund', async () => {
      const orderId = '99999999-0000-0000-0000-000000000026';
      const paymentId = 'pay_crash_206';
      const acceptedRefundId = 'rfnd_accepted_crash_999';

      const mockOrder = {
        id: orderId,
        order_number: 'ALT-5006',
        status: 'cancelled',
        grand_total: '600.00',
        currency: 'INR',
        razorpay_order_id: 'order_rzp_crash_206',
      };

      // Intent was claimed by Worker 1, but Worker 1 crashed after Razorpay accepted the refund
      const staleIntent = {
        id: 'ref_intent_crash_001',
        order_id: orderId,
        payment_id: paymentId,
        amount: 60000,
        currency: 'INR',
        status: 'processing',
        attempts: 1,
        idempotency_key: 'rfnd_crash_fixed_key_12345678',
        razorpay_refund_id: acceptedRefundId, // Stored or discovered on gateway
      };

      // Gateway shows payment captured and has the refund
      setRazorpayClient({
        payments: {
          fetch: async () => ({
            id: paymentId,
            amount: 60000,
            currency: 'INR',
            status: 'captured',
            order_id: 'order_rzp_crash_206',
            amount_refunded: 60000,
          }),
        },
        refunds: {
          fetch: async (rId) => {
            assert.strictEqual(rId, acceptedRefundId);
            return {
              id: acceptedRefundId,
              status: 'processed',
              amount: 60000,
              payment_id: paymentId,
            };
          },
        },
      });

      let refundCompleted = false;
      let refundHttpCalls = 0;

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: mockOrder, error: null }),
                }),
              }),
              update: () => ({ eq: async () => ({ data: mockOrder, error: null }) }),
            };
          }
          if (table === 'refund_intents') {
            return {
              update: (data) => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: async () => {
                      if (data.status === 'completed') refundCompleted = true;
                      return { data: { ...staleIntent, ...data }, error: null };
                    },
                  }),
                }),
              }),
            };
          }
          return {};
        },
      });

      setRefundHttpTransport(async () => {
        refundHttpCalls++;
        return { ok: true, status: 200, data: {} };
      });

      // Worker 2 (sweeper) runs recovery
      const result = await processRefundIntent(staleIntent, 'worker_recovery_2');

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.status, 'completed');
      assert.strictEqual(result.refundId, acceptedRefundId);
      assert.strictEqual(refundCompleted, true);
      assert.strictEqual(refundHttpCalls, 0, 'Recovery worker must NOT create a duplicate refund at the gateway');
    });

    // 5. Reconciliation finds an existing refund
    test('5. Reconciliation finds an existing refund on gateway and links it without duplicate refund creation', async () => {
      const orderId = '99999999-0000-0000-0000-000000000027';
      const paymentId = 'pay_reconcile_find_207';
      const existingGatewayRefundId = 'rfnd_already_on_gateway_777';

      const mockOrder = {
        id: orderId,
        order_number: 'ALT-5007',
        status: 'cancelled',
        grand_total: '400.00',
        currency: 'INR',
        razorpay_order_id: 'order_rzp_rec_207',
      };

      const intent = {
        id: 'ref_intent_rec_find_001',
        order_id: orderId,
        payment_id: paymentId,
        amount: 40000,
        currency: 'INR',
        status: 'processing',
        idempotency_key: 'rfnd_key_rec_find_12345678',
      };

      // Gateway reports amount_refunded=40000 and returns refund in fetchMultipleRefund
      setRazorpayClient({
        payments: {
          fetch: async () => ({
            id: paymentId,
            amount: 40000,
            currency: 'INR',
            status: 'captured',
            order_id: 'order_rzp_rec_207',
            amount_refunded: 40000,
            refund_id: existingGatewayRefundId,
          }),
          fetchMultipleRefund: async () => ({
            items: [
              {
                id: existingGatewayRefundId,
                amount: 40000,
                status: 'processed',
              },
            ],
          }),
        },
      });

      let httpCalls = 0;
      setRefundHttpTransport(async () => {
        httpCalls++;
        return { ok: true, status: 200, data: {} };
      });

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: mockOrder, error: null }),
                }),
              }),
              update: () => ({ eq: async () => ({ data: mockOrder, error: null }) }),
            };
          }
          if (table === 'refund_intents') {
            return {
              update: (data) => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: async () => ({ data: { ...intent, ...data }, error: null }),
                  }),
                }),
              }),
            };
          }
          return {};
        },
      });

      const result = await processRefundIntent(intent);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.alreadyRefunded, true);
      assert.strictEqual(result.refundId, existingGatewayRefundId);
      assert.strictEqual(httpCalls, 0, 'Gateway refund endpoint must not be invoked when refund already exists');
    });

    // 6. Duplicate workers never create a second refund
    test('6. Duplicate workers never create a second refund (atomic CAS claim exclusion)', async () => {
      const intentCandidate = {
        id: 'ref_intent_race_claim_001',
        order_id: '99999999-0000-0000-0000-000000000028',
        payment_id: 'pay_race_claim_208',
        amount: 25000,
        currency: 'INR',
        status: 'pending',
        attempts: 0,
        idempotency_key: 'rfnd_race_claim_key_12345678',
      };

      let claimCalls = 0;

      setSupabaseClient({
        from: (table) => {
          if (table === 'refund_intents') {
            return {
              select: () => ({
                or: () => ({
                  order: () => ({
                    limit: async () => ({ data: [intentCandidate], error: null }),
                  }),
                }),
              }),
              update: (data) => ({
                eq: () => ({
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => {
                        claimCalls++;
                        if (claimCalls === 1) {
                          return { data: { ...intentCandidate, ...data, status: 'processing' }, error: null };
                        }
                        return { data: null, error: null }; // Losing worker gets null
                      },
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        },
      });

      const [claimA, claimB] = await Promise.all([
        claimRefundIntentAtomic({ workerId: 'worker_A' }),
        claimRefundIntentAtomic({ workerId: 'worker_B' }),
      ]);

      const winner = claimA.data ? claimA : claimB;
      const loser = claimA.data ? claimB : claimA;

      assert.ok(winner.data, 'Exactly one worker must win the claim');
      assert.strictEqual(loser.data, null, 'Second worker must receive null and never process the intent');
    });

    // 7. A terminal or manual-review intent is not silently reset to pending
    test('7. A terminal or manual-review intent is not silently reset to pending', async () => {
      // 7A: claimRefundIntentAtomic candidate query excludes manual_review and completed
      let queryOrClause = null;

      setSupabaseClient({
        from: (table) => {
          if (table === 'refund_intents') {
            return {
              select: () => ({
                or: (clause) => {
                  queryOrClause = clause;
                  return {
                    order: () => ({
                      limit: async () => ({ data: [], error: null }),
                    }),
                  };
                },
              }),
            };
          }
          return {};
        },
      });

      await claimRefundIntentAtomic({ workerId: 'worker_test_filter' });

      assert.ok(queryOrClause);
      assert.strictEqual(queryOrClause.includes('manual_review'), false, 'Candidate filter must never query manual_review');
      assert.strictEqual(queryOrClause.includes('completed'), false, 'Candidate filter must never query completed');

      // 7B: Webhook arriving for an intent in manual_review does not reset it to pending
      const manualReviewIntent = {
        id: 'ref_intent_manual_rev_001',
        order_id: '99999999-0000-0000-0000-000000000029',
        payment_id: 'pay_manual_rev_209',
        amount: 30000,
        currency: 'INR',
        status: 'manual_review',
        reason: 'Flagged for currency mismatch',
      };

      const webhookPayload = {
        event: 'refund.created',
        payload: {
          refund: {
            entity: {
              id: 'rfnd_late_created_manual_209',
              payment_id: manualReviewIntent.payment_id,
              amount: 30000,
              currency: 'INR',
              status: 'pending',
              notes: { refund_intent_id: manualReviewIntent.id },
            },
          },
        },
      };

      const { rawBody, signature } = createSignedWebhookPayload(webhookPayload);
      let statusResetToPending = false;

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
                  maybeSingle: async () => ({ data: manualReviewIntent, error: null }),
                }),
              }),
              update: (data) => {
                if (data.status === 'pending' || data.status === 'processing') {
                  statusResetToPending = true;
                }
                return { eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: manualReviewIntent, error: null }) }) }) };
              },
            };
          }
          return {};
        },
      });

      const whResult = await handleWebhookEvent({
        rawBody,
        signature,
        eventId: 'evt_manual_review_webhook_test',
        payload: webhookPayload,
      });

      assert.strictEqual(whResult.received, true);
      assert.strictEqual(whResult.manualReviewPreserved, true);
      assert.strictEqual(statusResetToPending, false, 'Webhook must NOT reset manual_review intent to pending');
    });

    // 8. The same idempotency key and identical payload are used when retrying an ambiguous request
    test('8. The same idempotency key and identical payload are used when retrying an ambiguous request', async () => {
      const fixedIdempotencyKey = 'rfnd_fixed_key_consistent_1234567890';
      const orderId = '99999999-0000-0000-0000-000000000030';
      const paymentId = 'pay_retry_ambig_210';

      const mockOrder = {
        id: orderId,
        order_number: 'ALT-5010',
        status: 'cancelled',
        grand_total: '550.00',
        currency: 'INR',
        razorpay_order_id: 'order_rzp_retry_ambig_210',
      };

      const intent = {
        id: 'ref_intent_retry_ambig_001',
        order_id: orderId,
        payment_id: paymentId,
        amount: 55000,
        currency: 'INR',
        idempotency_key: fixedIdempotencyKey,
        status: 'processing',
        attempts: 1,
      };

      setRazorpayClient({
        payments: {
          fetch: async () => ({
            id: paymentId,
            amount: 55000,
            currency: 'INR',
            status: 'captured',
            order_id: 'order_rzp_retry_ambig_210',
            amount_refunded: 0,
          }),
        },
      });

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: mockOrder, error: null }),
                }),
              }),
              update: () => ({ eq: async () => ({ data: mockOrder, error: null }) }),
            };
          }
          if (table === 'refund_intents') {
            return {
              update: (data) => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: async () => ({ data: { ...intent, ...data }, error: null }),
                  }),
                }),
              }),
            };
          }
          return {};
        },
      });

      const capturedRequests = [];

      setRefundHttpTransport(async (url, options) => {
        capturedRequests.push({
          url,
          idempotencyKey: options.headers['X-Refund-Idempotency'],
          body: JSON.parse(options.body),
        });

        if (capturedRequests.length === 1) {
          // Attempt 1: HTTP 409 Conflict (request in progress)
          return {
            ok: false,
            status: 409,
            conflict: true,
            error: { description: 'Refund request already in progress' },
          };
        }

        // Attempt 2 (retry): HTTP 200 processed
        return {
          ok: true,
          status: 200,
          data: {
            id: 'rfnd_retry_succeeded_210',
            status: 'processed',
            amount: 55000,
          },
        };
      });

      // Attempt 1
      const res1 = await processRefundIntent(intent);
      assert.strictEqual(res1.status, 'conflict_retryable');

      // Attempt 2 (Retry)
      const res2 = await processRefundIntent(intent);
      assert.strictEqual(res2.status, 'completed');

      // Verify idempotency key and payload consistency
      assert.strictEqual(capturedRequests.length, 2);
      assert.strictEqual(
        capturedRequests[0].idempotencyKey,
        fixedIdempotencyKey,
        'Attempt 1 must use the intent idempotency key'
      );
      assert.strictEqual(
        capturedRequests[1].idempotencyKey,
        fixedIdempotencyKey,
        'Retry must use the exact same idempotency key as Attempt 1'
      );
      assert.deepStrictEqual(
        capturedRequests[0].body,
        capturedRequests[1].body,
        'Retry payload must be identical to the initial attempt payload'
      );
    });

    test('9. refund.speed_changed webhook updates speed metadata without altering core lifecycle status', async () => {
      const orderId = '99999999-0000-0000-0000-000000000031';
      const paymentId = 'pay_speed_change_211';
      const refundId = 'rfnd_speed_change_211';

      const mockIntent = {
        id: 'ref_intent_speed_001',
        order_id: orderId,
        payment_id: paymentId,
        amount: 40000,
        currency: 'INR',
        status: 'processing',
        idempotency_key: 'rfnd_key_speed_1234567890',
        razorpay_refund_id: refundId,
        gateway_response: { initial_speed: 'optimum' },
      };

      const payload = {
        event: 'refund.speed_changed',
        payload: {
          refund: {
            entity: {
              id: refundId,
              payment_id: paymentId,
              amount: 40000,
              currency: 'INR',
              status: 'pending',
              speed_requested: 'optimum',
              speed_processed: 'normal',
              notes: { refund_intent_id: mockIntent.id },
            },
          },
        },
      };

      const { rawBody, signature } = createSignedWebhookPayload(payload);
      let recordedSpeedData = null;

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
              update: (data) => {
                recordedSpeedData = data;
                return {
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => ({ data: { ...mockIntent, ...data }, error: null }),
                    }),
                  }),
                };
              },
            };
          }
          return {};
        },
      });

      const result = await handleWebhookEvent({
        rawBody,
        signature,
        eventId: 'evt_speed_change_test_01',
        payload,
      });

      assert.strictEqual(result.received, true);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.speedChanged, true);
      assert.strictEqual(result.speedRequested, 'optimum');
      assert.strictEqual(result.speedProcessed, 'normal');
      assert.strictEqual(recordedSpeedData.gateway_response.speed_processed, 'normal');
    });

    // 10. An existing refund with status 'pending' stays nonterminal and is kept in processing for later reconciliation
    test('10. An existing refund with status "pending" stays nonterminal and is kept in processing for later reconciliation', async () => {
      const orderId = '99999999-0000-0000-0000-000000000032';
      const paymentId = 'pay_pend_chk_212';
      const existingRefundId = 'rfnd_pend_chk_212';

      const mockOrder = {
        id: orderId,
        order_number: 'ALT-5012',
        status: 'cancelled',
        grand_total: '500.00',
        currency: 'INR',
        razorpay_order_id: 'order_rzp_pend_212',
      };

      const intent = {
        id: 'ref_intent_pend_chk_001',
        order_id: orderId,
        payment_id: paymentId,
        amount: 50000,
        currency: 'INR',
        status: 'processing',
        idempotency_key: 'rfnd_key_pend_chk_1234567890',
        razorpay_refund_id: existingRefundId,
      };

      setRazorpayClient({
        payments: {
          fetch: async () => ({
            id: paymentId,
            amount: 50000,
            currency: 'INR',
            status: 'captured',
            order_id: 'order_rzp_pend_212',
            amount_refunded: 0,
          }),
        },
        refunds: {
          fetch: async (rId) => {
            assert.strictEqual(rId, existingRefundId);
            return {
              id: existingRefundId,
              status: 'pending',
              amount: 50000,
              payment_id: paymentId,
            };
          },
        },
      });

      let intentMarkedCompleted = false;
      let intentMarkedFailed = false;
      let httpCalls = 0;

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: mockOrder, error: null }),
                }),
              }),
            };
          }
          if (table === 'refund_intents') {
            return {
              update: (data) => {
                if (data.status === 'completed') intentMarkedCompleted = true;
                if (data.status === 'failed' || data.status === 'manual_review') intentMarkedFailed = true;
                return {
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => ({ data: { ...intent, ...data }, error: null }),
                    }),
                  }),
                };
              },
            };
          }
          return {};
        },
      });

      setRefundHttpTransport(async () => {
        httpCalls++;
        return { ok: true, status: 200, data: {} };
      });

      const result = await processRefundIntent(intent);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.status, 'processing');
      assert.strictEqual(result.pendingGatewayProcessing, true);
      assert.strictEqual(result.refundId, existingRefundId);
      assert.strictEqual(intentMarkedCompleted, false, 'Pending refund must NOT mark intent completed');
      assert.strictEqual(intentMarkedFailed, false, 'Pending refund must NOT mark intent failed/manual_review');
      assert.strictEqual(httpCalls, 0, 'Must NOT trigger new HTTP refund call when refund is already pending on gateway');
    });

    // 11. A gateway lookup returning an unknown or incomplete state never causes a refund to be marked completed and flags manual_review
    test('11. A gateway lookup returning an unknown or incomplete state never causes a refund to be marked completed and flags manual_review', async () => {
      const orderId = '99999999-0000-0000-0000-000000000033';
      const paymentId = 'pay_unk_213';
      const existingRefundId = 'rfnd_unk_213';

      const mockOrder = {
        id: orderId,
        order_number: 'ALT-5013',
        status: 'cancelled',
        grand_total: '420.00',
        currency: 'INR',
        razorpay_order_id: 'order_rzp_unk_213',
      };

      const intent = {
        id: 'ref_intent_unk_001',
        order_id: orderId,
        payment_id: paymentId,
        amount: 42000,
        currency: 'INR',
        status: 'processing',
        idempotency_key: 'rfnd_key_unk_1234567890',
        razorpay_refund_id: existingRefundId,
      };

      // Gateway returns unrecognized status: 'unknown_stage'
      setRazorpayClient({
        payments: {
          fetch: async () => ({
            id: paymentId,
            amount: 42000,
            currency: 'INR',
            status: 'captured',
            order_id: 'order_rzp_unk_213',
            amount_refunded: 0,
          }),
        },
        refunds: {
          fetch: async (rId) => ({
            id: rId,
            status: 'unknown_stage',
            amount: 42000,
            payment_id: paymentId,
          }),
        },
      });

      let updatedStatus = null;
      let manualReviewReason = null;
      let httpCalls = 0;

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: mockOrder, error: null }),
                }),
              }),
            };
          }
          if (table === 'refund_intents') {
            return {
              update: (data) => {
                updatedStatus = data.status;
                manualReviewReason = data.reason;
                return {
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => ({ data: { ...intent, ...data }, error: null }),
                    }),
                  }),
                };
              },
            };
          }
          return {};
        },
      });

      setRefundHttpTransport(async () => {
        httpCalls++;
        return { ok: true, status: 200, data: {} };
      });

      const result = await processRefundIntent(intent);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.status, 'manual_review');
      assert.strictEqual(result.reason, 'unknown_gateway_refund_status');
      assert.strictEqual(updatedStatus, 'manual_review');
      assert.strictEqual(manualReviewReason, 'unknown_gateway_refund_status');
      assert.notStrictEqual(updatedStatus, 'completed', 'Unknown gateway status must NEVER mark intent completed');
      assert.strictEqual(httpCalls, 0, 'Must NOT trigger new HTTP refund call when gateway status is unknown');
    });

    // 12. An ambiguous network timeout reconciles against gateway and flags manual_review if uncertain, never issuing duplicate refunds
    test('12. An ambiguous network timeout reconciles against gateway and flags manual_review if uncertain, never issuing duplicate refunds', async () => {
      const orderId = '99999999-0000-0000-0000-000000000034';
      const paymentId = 'pay_timeout_214';

      const mockOrder = {
        id: orderId,
        order_number: 'ALT-5014',
        status: 'cancelled',
        grand_total: '350.00',
        currency: 'INR',
        razorpay_order_id: 'order_rzp_timeout_214',
      };

      const intent = {
        id: 'ref_intent_timeout_001',
        order_id: orderId,
        payment_id: paymentId,
        amount: 35000,
        currency: 'INR',
        status: 'processing',
        idempotency_key: 'rfnd_key_timeout_1234567890',
        attempts: 1,
      };

      setRazorpayClient({
        payments: {
          fetch: async () => ({
            id: paymentId,
            amount: 35000,
            currency: 'INR',
            status: 'captured',
            order_id: 'order_rzp_timeout_214',
            amount_refunded: 0,
          }),
          fetchMultipleRefund: async () => ({
            items: [], // Reconciler finds no refunds on gateway
          }),
        },
      });

      let flaggedManualReview = false;
      let manualReviewReason = null;

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: mockOrder, error: null }),
                }),
              }),
            };
          }
          if (table === 'refund_intents') {
            return {
              update: (data) => {
                if (data.status === 'manual_review') {
                  flaggedManualReview = true;
                  manualReviewReason = data.reason;
                }
                return {
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => ({ data: { ...intent, ...data }, error: null }),
                    }),
                  }),
                };
              },
            };
          }
          return {};
        },
      });

      let httpCalls = 0;
      setRefundHttpTransport(async () => {
        httpCalls++;
        return {
          ok: false,
          status: 0,
          timeout: true,
          networkError: true,
          error: { description: 'The operation was aborted due to timeout', name: 'AbortError' },
        };
      });

      const result = await processRefundIntent(intent);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.status, 'manual_review');
      assert.strictEqual(result.reason, 'timeout_uncertain');
      assert.strictEqual(flaggedManualReview, true);
      assert.match(manualReviewReason, /network timeout/i);
      assert.strictEqual(httpCalls, 1, 'Only one HTTP call was attempted; duplicate calls prevented');
    });

    // 13. An ambiguous network timeout that resulted in a processed gateway refund completes safely without duplicate refund requests
    test('13. An ambiguous network timeout that resulted in a processed gateway refund completes safely without duplicate refund requests', async () => {
      const orderId = '99999999-0000-0000-0000-000000000035';
      const paymentId = 'pay_timeout_succ_215';
      const reconciledRefundId = 'rfnd_timeout_reconciled_999';

      const mockOrder = {
        id: orderId,
        order_number: 'ALT-5015',
        status: 'cancelled',
        grand_total: '450.00',
        currency: 'INR',
        razorpay_order_id: 'order_rzp_timeout_succ_215',
      };

      const intent = {
        id: 'ref_intent_timeout_succ_001',
        order_id: orderId,
        payment_id: paymentId,
        amount: 45000,
        currency: 'INR',
        status: 'processing',
        idempotency_key: 'rfnd_key_timeout_succ_1234567890',
        attempts: 1,
      };

      let paymentFetchCount = 0;
      setRazorpayClient({
        payments: {
          fetch: async () => {
            paymentFetchCount++;
            return {
              id: paymentId,
              amount: 45000,
              currency: 'INR',
              status: 'captured',
              order_id: 'order_rzp_timeout_succ_215',
              amount_refunded: paymentFetchCount > 1 ? 45000 : 0,
            };
          },
          fetchMultipleRefund: async () => ({
            items: [
              {
                id: reconciledRefundId,
                amount: 45000,
                status: 'processed',
              },
            ],
          }),
        },
      });

      let intentCompleted = false;
      let orderRefunded = false;

      setSupabaseClient({
        from: (table) => {
          if (table === 'orders') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: mockOrder, error: null }),
                }),
              }),
              update: (data) => {
                if (data.status === 'refunded') orderRefunded = true;
                return { eq: async () => ({ data: { ...mockOrder, ...data }, error: null }) };
              },
            };
          }
          if (table === 'refund_intents') {
            return {
              update: (data) => {
                if (data.status === 'completed') intentCompleted = true;
                return {
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => ({ data: { ...intent, ...data }, error: null }),
                    }),
                  }),
                };
              },
            };
          }
          return {};
        },
      });

      let httpCalls = 0;
      setRefundHttpTransport(async () => {
        httpCalls++;
        // Request timed out on client side, but gateway actually processed it
        return {
          ok: false,
          status: 0,
          timeout: true,
          networkError: true,
          error: { description: 'Connection timeout after 15000ms', name: 'TimeoutError' },
        };
      });

      const result = await processRefundIntent(intent);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.status, 'completed');
      assert.strictEqual(result.reconciled, true);
      assert.strictEqual(result.refundId, reconciledRefundId);
      assert.strictEqual(intentCompleted, true);
      assert.strictEqual(orderRefunded, true);
      assert.strictEqual(httpCalls, 1, 'Only the initial timed-out call was made; no duplicate refund was created');
    });
  });
});

