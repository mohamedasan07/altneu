import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import {
  verifySignature,
  createPaymentOrder,
  verifyPayment,
  setRazorpayClient,
} from '../services/payment.service.js';
import { setSupabaseClient } from '../database/client.js';
import { config } from '../config/index.js';
import { ApiError } from '../utils/apiError.js';

// Setup test secret for deterministic signature generation
const TEST_KEY_ID = 'rzp_test_core_123';
const TEST_KEY_SECRET = 'test_secret_key_abcdef123456';

function generateValidSignature(orderId, paymentId, secret = TEST_KEY_SECRET) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
}

describe('Phase 2: Backend Payment Core (Razorpay)', () => {
  let originalKeyId;
  let originalKeySecret;

  beforeEach(() => {
    originalKeyId = config.razorpay.keyId;
    originalKeySecret = config.razorpay.keySecret;
    config.razorpay.keyId = TEST_KEY_ID;
    config.razorpay.keySecret = TEST_KEY_SECRET;
  });

  afterEach(() => {
    config.razorpay.keyId = originalKeyId;
    config.razorpay.keySecret = originalKeySecret;
    setRazorpayClient(null);
    setSupabaseClient(null);
  });

  // --------------------------------------------------------------------------
  // 1. Signature Verification
  // --------------------------------------------------------------------------
  test('Signature verification: valid HMAC SHA256 returns true', () => {
    const orderId = 'order_DA1234567890';
    const paymentId = 'pay_XY9876543210';
    const validSignature = generateValidSignature(orderId, paymentId);

    const result = verifySignature(orderId, paymentId, validSignature);
    assert.strictEqual(result, true, 'Valid signature must verify as true');
  });

  test('Signature verification: invalid signature fails with 400', () => {
    const orderId = 'order_DA1234567890';
    const paymentId = 'pay_XY9876543210';
    const invalidSignature = 'a'.repeat(64);

    assert.throws(
      () => verifySignature(orderId, paymentId, invalidSignature),
      (err) => err instanceof ApiError && err.status === 400
    );
  });

  test('Signature verification: tampered payload fails with 400', () => {
    const orderId = 'order_DA1234567890';
    const paymentId = 'pay_XY9876543210';
    const signature = generateValidSignature(orderId, paymentId);

    // Tampered order ID
    assert.throws(
      () => verifySignature('order_TAMPERED9999', paymentId, signature),
      (err) => err instanceof ApiError && err.status === 400
    );

    // Tampered payment ID
    assert.throws(
      () => verifySignature(orderId, 'pay_TAMPERED9999', signature),
      (err) => err instanceof ApiError && err.status === 400
    );
  });

  test('Signature verification: timing-safe comparison handles differing buffer lengths cleanly', () => {
    const orderId = 'order_DA1234567890';
    const paymentId = 'pay_XY9876543210';

    // Length mismatch should not crash the server and must return 400
    assert.throws(
      () => verifySignature(orderId, paymentId, 'short_sig'),
      (err) => err instanceof ApiError && err.status === 400
    );

    assert.throws(
      () => verifySignature(orderId, paymentId, ''),
      (err) => err instanceof ApiError && err.status === 400
    );
  });

  test('Signature verification: missing secret key throws 500 configuration error', () => {
    config.razorpay.keySecret = '';
    assert.throws(
      () => verifySignature('order_1', 'pay_1', 'sig_1'),
      (err) => err instanceof ApiError && err.status === 500
    );
  });

  // --------------------------------------------------------------------------
  // 2. Razorpay Order Creation
  // --------------------------------------------------------------------------
  test('Payment order creation: derives amount in paise from order grand_total and calls gateway', async () => {
    const mockOrder = {
      id: 'd3b07384-d113-43da-a9be-4824b0716601',
      order_number: 'US-20261015-ABCD1234',
      status: 'pending',
      payment_status: 'pending',
      payment_method: 'razorpay',
      grand_total: '2499.00',
      currency: 'INR',
      user_id: 'user_mock_1',
      razorpay_order_id: null,
    };

    let gatewayCreatedPayload = null;
    let dbUpdatedOrderId = null;
    let dbUpdatedRazorpayOrderId = null;

    setRazorpayClient({
      orders: {
        create: async (params) => {
          gatewayCreatedPayload = params;
          return { id: 'order_rzp_mock_new', amount: params.amount, currency: params.currency };
        },
      },
    });

    // Mock Supabase
    setSupabaseClient({
      from: (table) => {
        if (table === 'orders') {
          return {
            select: () => ({
              eq: (col, val) => ({
                maybeSingle: async () => {
                  if (col === 'id' && val === mockOrder.id) {
                    return { data: mockOrder, error: null };
                  }
                  return { data: null, error: null };
                },
              }),
            }),
            update: (updatePayload) => ({
              eq: (col, val) => ({
                select: () => ({
                  maybeSingle: async () => {
                    dbUpdatedOrderId = val;
                    dbUpdatedRazorpayOrderId = updatePayload.razorpay_order_id;
                    return { data: { ...mockOrder, ...updatePayload }, error: null };
                  },
                }),
              }),
            }),
          };
        }
      },
    });

    const result = await createPaymentOrder(
      { orderId: mockOrder.id },
      { user_id: 'user_mock_1' }
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.razorpayOrderId, 'order_rzp_mock_new');
    assert.strictEqual(result.amount, 249900, '2499.00 INR must be converted to 249900 paise');
    assert.strictEqual(result.currency, 'INR');
    assert.strictEqual(result.reused, false);

    assert.strictEqual(gatewayCreatedPayload.amount, 249900);
    assert.strictEqual(gatewayCreatedPayload.currency, 'INR');
    assert.strictEqual(dbUpdatedOrderId, mockOrder.id);
    assert.strictEqual(dbUpdatedRazorpayOrderId, 'order_rzp_mock_new');
  });

  test('Payment order creation: idempotently reuses existing razorpay_order_id without re-calling gateway', async () => {
    const mockOrder = {
      id: 'd3b07384-d113-43da-a9be-4824b0716602',
      order_number: 'US-20261015-EXISTING',
      status: 'pending',
      payment_status: 'pending',
      payment_method: 'razorpay',
      grand_total: '1500.50',
      currency: 'INR',
      user_id: 'user_mock_2',
      razorpay_order_id: 'order_rzp_already_created',
    };

    let gatewayCalled = false;
    setRazorpayClient({
      orders: {
        create: async () => {
          gatewayCalled = true;
          return { id: 'order_should_not_be_created' };
        },
      },
    });

    setSupabaseClient({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: mockOrder, error: null }),
          }),
        }),
      }),
    });

    const result = await createPaymentOrder(
      { orderId: mockOrder.id },
      { user_id: 'user_mock_2' }
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.razorpayOrderId, 'order_rzp_already_created');
    assert.strictEqual(result.reused, true);
    assert.strictEqual(result.amount, 150050);
    assert.strictEqual(gatewayCalled, false, 'Gateway must NOT be called if razorpay_order_id is already set');
  });

  test('Payment order creation: rejects order if already paid, cancelled, or refunded', async () => {
    const paidOrder = {
      id: 'd3b07384-d113-43da-a9be-4824b0716603',
      status: 'confirmed',
      payment_status: 'paid',
      grand_total: '100.00',
      user_id: 'user_mock_3',
    };

    setSupabaseClient({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: paidOrder, error: null }),
          }),
        }),
      }),
    });

    await assert.rejects(
      async () => createPaymentOrder({ orderId: paidOrder.id }, { user_id: 'user_mock_3' }),
      (err) => err instanceof ApiError && err.status === 400 && err.message.includes('already been paid')
    );
  });

  // --------------------------------------------------------------------------
  // 3. Payment Verification & Dual-Layer Gateway Checks
  // --------------------------------------------------------------------------
  test('Payment verification: fails with 404 when order does not exist', async () => {
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
      async () =>
        verifyPayment(
          {
            orderId: 'd3b07384-d113-43da-a9be-4824b0716699',
            razorpayOrderId: 'order_123456',
            razorpayPaymentId: 'pay_123456',
            razorpaySignature: 'a'.repeat(64),
          },
          { user_id: 'user_1' }
        ),
      (err) => err instanceof ApiError && err.status === 404
    );
  });

  test('Payment verification: fails with 403 when user does not own the order', async () => {
    const mockOrder = {
      id: 'd3b07384-d113-43da-a9be-4824b0716604',
      user_id: 'owner_user_uuid',
      status: 'pending',
      payment_status: 'pending',
      razorpay_order_id: 'order_123456',
      grand_total: '100.00',
    };

    setSupabaseClient({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: mockOrder, error: null }),
          }),
        }),
      }),
    });

    await assert.rejects(
      async () =>
        verifyPayment(
          {
            orderId: mockOrder.id,
            razorpayOrderId: 'order_123456',
            razorpayPaymentId: 'pay_123456',
            razorpaySignature: 'a'.repeat(64),
          },
          { user_id: 'attacker_user_uuid' }
        ),
      (err) => err instanceof ApiError && err.status === 403
    );
  });

  test('Payment verification: fails with 400 when razorpayOrderId does not match DB record', async () => {
    const mockOrder = {
      id: 'd3b07384-d113-43da-a9be-4824b0716605',
      user_id: 'owner_user_uuid',
      status: 'pending',
      payment_status: 'pending',
      razorpay_order_id: 'order_ACTUAL_EXPECTED',
      grand_total: '500.00',
    };

    setSupabaseClient({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: mockOrder, error: null }),
          }),
        }),
      }),
    });

    await assert.rejects(
      async () =>
        verifyPayment(
          {
            orderId: mockOrder.id,
            razorpayOrderId: 'order_SUBMITTED_DIFFERENT',
            razorpayPaymentId: 'pay_123456',
            razorpaySignature: 'a'.repeat(64),
          },
          { user_id: 'owner_user_uuid' }
        ),
      (err) => err instanceof ApiError && err.status === 400 && err.message.includes('mismatch')
    );
  });

  test('Payment verification: fails with 400 when Razorpay API reports amount mismatch', async () => {
    const mockOrder = {
      id: 'd3b07384-d113-43da-a9be-4824b0716606',
      user_id: 'user_1',
      status: 'pending',
      payment_status: 'pending',
      razorpay_order_id: 'order_matched_123',
      grand_total: '2500.00', // 250000 paise
      currency: 'INR',
    };

    const signature = generateValidSignature('order_matched_123', 'pay_underpaid_123');

    setSupabaseClient({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: mockOrder, error: null }),
          }),
        }),
        update: () => ({
          eq: () => ({
            eq: () => ({
              not: () => ({
                select: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    });

    setRazorpayClient({
      payments: {
        fetch: async () => ({
          id: 'pay_underpaid_123',
          order_id: 'order_matched_123',
          amount: 10000, // Gateway says only 100 INR paid!
          currency: 'INR',
          status: 'captured',
        }),
      },
    });

    await assert.rejects(
      async () =>
        verifyPayment(
          {
            orderId: mockOrder.id,
            razorpayOrderId: 'order_matched_123',
            razorpayPaymentId: 'pay_underpaid_123',
            razorpaySignature: signature,
          },
          { user_id: 'user_1' }
        ),
      (err) => err instanceof ApiError && err.status === 400 && err.message.includes('amount mismatch')
    );
  });

  test('Payment verification: fails with 400 when Razorpay API reports currency mismatch', async () => {
    const mockOrder = {
      id: 'd3b07384-d113-43da-a9be-4824b0716607',
      user_id: 'user_1',
      status: 'pending',
      payment_status: 'pending',
      razorpay_order_id: 'order_curr_123',
      grand_total: '100.00',
      currency: 'INR',
    };

    const signature = generateValidSignature('order_curr_123', 'pay_curr_123');

    setSupabaseClient({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: mockOrder, error: null }),
          }),
        }),
        update: () => ({
          eq: () => ({
            eq: () => ({
              not: () => ({
                select: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    });

    setRazorpayClient({
      payments: {
        fetch: async () => ({
          id: 'pay_curr_123',
          order_id: 'order_curr_123',
          amount: 10000,
          currency: 'USD', // Currency mismatch!
          status: 'captured',
        }),
      },
    });

    await assert.rejects(
      async () =>
        verifyPayment(
          {
            orderId: mockOrder.id,
            razorpayOrderId: 'order_curr_123',
            razorpayPaymentId: 'pay_curr_123',
            razorpaySignature: signature,
          },
          { user_id: 'user_1' }
        ),
      (err) => err instanceof ApiError && err.status === 400 && err.message.includes('currency')
    );
  });

  test('Payment verification: fails with 400 when Razorpay API reports status is not captured', async () => {
    const mockOrder = {
      id: 'd3b07384-d113-43da-a9be-4824b0716608',
      user_id: 'user_1',
      status: 'pending',
      payment_status: 'pending',
      razorpay_order_id: 'order_failed_status',
      grand_total: '100.00',
      currency: 'INR',
    };

    const signature = generateValidSignature('order_failed_status', 'pay_failed_status');

    setSupabaseClient({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: mockOrder, error: null }),
          }),
        }),
        update: () => ({
          eq: () => ({
            eq: () => ({
              not: () => ({
                select: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    });

    setRazorpayClient({
      payments: {
        fetch: async () => ({
          id: 'pay_failed_status',
          order_id: 'order_failed_status',
          amount: 10000,
          currency: 'INR',
          status: 'failed', // Status not captured
        }),
      },
    });

    await assert.rejects(
      async () =>
        verifyPayment(
          {
            orderId: mockOrder.id,
            razorpayOrderId: 'order_failed_status',
            razorpayPaymentId: 'pay_failed_status',
            razorpaySignature: signature,
          },
          { user_id: 'user_1' }
        ),
      (err) => err instanceof ApiError && err.status === 400 && err.message.includes('not in captured state')
    );
  });

  // --------------------------------------------------------------------------
  // 4. Successful Verification & State Consistency
  // --------------------------------------------------------------------------
  test('Payment verification: winning transition marks order paid and confirmed', async () => {
    const mockOrder = {
      id: 'd3b07384-d113-43da-a9be-4824b0716609',
      order_number: 'US-20261015-WIN001',
      user_id: 'user_winner_1',
      status: 'pending',
      payment_status: 'pending',
      razorpay_order_id: 'order_win_123',
      grand_total: '999.00',
      currency: 'INR',
    };

    const signature = generateValidSignature('order_win_123', 'pay_win_123');

    let updatedDbFields = null;

    setSupabaseClient({
      from: (table) => {
        if (table === 'orders') {
          return {
            select: () => ({
              eq: (col, val) => ({
                maybeSingle: async () => {
                  if (val === mockOrder.id) return { data: mockOrder, error: null };
                  return { data: null, error: null };
                },
              }),
            }),
            update: (fields) => ({
              eq: (_idCol, _idVal) => ({
                in: (_pCol, _pVals) => ({
                  eq: (_sCol, _sVal) => ({
                    select: () => ({
                      maybeSingle: async () => {
                        updatedDbFields = fields;
                        return {
                          data: {
                            ...mockOrder,
                            ...fields,
                          },
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
        if (table === 'order_status_history') {
          return {
            insert: () => ({
              select: () => ({
                single: async () => ({ data: { id: 'hist_1' }, error: null }),
              }),
            }),
          };
        }
      },
    });

    setRazorpayClient({
      payments: {
        fetch: async () => ({
          id: 'pay_win_123',
          order_id: 'order_win_123',
          amount: 99900,
          currency: 'INR',
          status: 'captured',
        }),
      },
    });

    const result = await verifyPayment(
      {
        orderId: mockOrder.id,
        razorpayOrderId: 'order_win_123',
        razorpayPaymentId: 'pay_win_123',
        razorpaySignature: signature,
      },
      { user_id: 'user_winner_1' }
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.alreadyPaid, false);
    assert.strictEqual(result.order.status, 'confirmed');
    assert.strictEqual(result.order.paymentStatus, 'paid');

    assert.strictEqual(updatedDbFields.status, 'confirmed');
    assert.strictEqual(updatedDbFields.payment_status, 'paid');
    assert.strictEqual(updatedDbFields.razorpay_payment_id, 'pay_win_123');
    assert.strictEqual(updatedDbFields.razorpay_signature, signature);
    assert.ok(updatedDbFields.payment_verified_at);
  });

  test('Payment verification: duplicate request returns alreadyPaid: true without error', async () => {
    const alreadyPaidOrder = {
      id: 'd3b07384-d113-43da-a9be-4824b0716610',
      order_number: 'US-20261015-DUP001',
      user_id: 'user_dup_1',
      status: 'confirmed',
      payment_status: 'paid',
      razorpay_order_id: 'order_dup_123',
      razorpay_payment_id: 'pay_dup_123',
      grand_total: '500.00',
      currency: 'INR',
    };

    setSupabaseClient({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: alreadyPaidOrder, error: null }),
          }),
        }),
      }),
    });

    let gatewayCalled = false;
    setRazorpayClient({
      payments: {
        fetch: async () => {
          gatewayCalled = true;
          return { id: 'pay_dup_123' };
        },
      },
    });

    const signature = generateValidSignature('order_dup_123', 'pay_dup_123');
    const result = await verifyPayment(
      {
        orderId: alreadyPaidOrder.id,
        razorpayOrderId: 'order_dup_123',
        razorpayPaymentId: 'pay_dup_123',
        razorpaySignature: signature,
      },
      { user_id: 'user_dup_1' }
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.alreadyPaid, true);
    assert.strictEqual(result.order.paymentStatus, 'paid');
    assert.strictEqual(gatewayCalled, false, 'Duplicate verification should bypass gateway check');
  });

  test('Payment verification: database failure during update returns 500', async () => {
    const mockOrder = {
      id: 'd3b07384-d113-43da-a9be-4824b0716611',
      user_id: 'user_err_1',
      status: 'pending',
      payment_status: 'pending',
      razorpay_order_id: 'order_err_123',
      grand_total: '100.00',
      currency: 'INR',
    };

    const signature = generateValidSignature('order_err_123', 'pay_err_123');

    setSupabaseClient({
      from: (table) => {
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
                      maybeSingle: async () => ({ data: null, error: { message: 'connection timeout' } }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
      },
    });

    setRazorpayClient({
      payments: {
        fetch: async () => ({
          id: 'pay_err_123',
          order_id: 'order_err_123',
          amount: 10000,
          currency: 'INR',
          status: 'captured',
        }),
      },
    });

    await assert.rejects(
      async () =>
        verifyPayment(
          {
            orderId: mockOrder.id,
            razorpayOrderId: 'order_err_123',
            razorpayPaymentId: 'pay_err_123',
            razorpaySignature: signature,
          },
          { user_id: 'user_err_1' }
        ),
      (err) => err instanceof ApiError && err.status === 500 && err.message.includes('Database error')
    );
  });

  // --------------------------------------------------------------------------
  // 4. Guest & Registered User Order Authorization
  // --------------------------------------------------------------------------
  test('Guest order: matching guest sessionId authorizes order creation and verification', async () => {
    const guestOrder = {
      id: 'd3b07384-d113-43da-a9be-4824b0716620',
      user_id: null,
      guest_session_id: 'guest-sess-uuid-1111',
      status: 'pending',
      payment_status: 'pending',
      grand_total: '500.00',
      currency: 'INR',
      razorpay_order_id: null,
      order_number: 'ALT-GUEST-01',
    };

    setRazorpayClient({
      orders: {
        create: async (params) => ({ id: 'order_rzp_guest_111', amount: params.amount, currency: params.currency }),
      },
      payments: {
        fetch: async () => ({
          id: 'pay_guest_111',
          order_id: 'order_rzp_guest_111',
          amount: 50000,
          currency: 'INR',
          status: 'captured',
        }),
      },
    });

    setSupabaseClient({
      from: (table) => {
        if (table === 'orders') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: guestOrder, error: null }),
              }),
            }),
            update: (upd) => ({
              eq: () => ({
                is: () => ({
                  select: () => ({
                    maybeSingle: async () => ({ data: { ...guestOrder, ...upd }, error: null }),
                  }),
                }),
                select: () => ({
                  maybeSingle: async () => ({ data: { ...guestOrder, ...upd }, error: null }),
                }),
                in: () => ({
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => ({ data: { ...guestOrder, ...upd, payment_status: 'paid', status: 'confirmed' }, error: null }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
      },
    });

    // 1. Create order with matching session
    const createResult = await createPaymentOrder(
      { orderId: guestOrder.id },
      { user_id: null, session_id: 'guest-sess-uuid-1111' }
    );
    assert.strictEqual(createResult.success, true);
    assert.strictEqual(createResult.razorpayOrderId, 'order_rzp_guest_111');

    // 2. Verify with matching session
    guestOrder.razorpay_order_id = 'order_rzp_guest_111';
    const sig = generateValidSignature('order_rzp_guest_111', 'pay_guest_111');
    const verifyResult = await verifyPayment(
      {
        orderId: guestOrder.id,
        razorpayOrderId: 'order_rzp_guest_111',
        razorpayPaymentId: 'pay_guest_111',
        razorpaySignature: sig,
      },
      { user_id: null, session_id: 'guest-sess-uuid-1111' }
    );
    assert.strictEqual(verifyResult.success, true);
    assert.strictEqual(verifyResult.order.paymentStatus, 'paid');
  });

  test('Guest order: mismatched or missing guest sessionId throws 403', async () => {
    const guestOrder = {
      id: 'd3b07384-d113-43da-a9be-4824b0716621',
      user_id: null,
      guest_session_id: 'guest-sess-uuid-correct',
      status: 'pending',
      payment_status: 'pending',
      grand_total: '500.00',
    };

    setSupabaseClient({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: guestOrder, error: null }),
          }),
        }),
      }),
    });

    // Mismatched session
    await assert.rejects(
      async () => createPaymentOrder({ orderId: guestOrder.id }, { session_id: 'guest-sess-uuid-wrong' }),
      (err) => err instanceof ApiError && err.status === 403 && err.message.includes('Unauthorized access')
    );

    // Missing session
    await assert.rejects(
      async () => createPaymentOrder({ orderId: guestOrder.id }, { session_id: null }),
      (err) => err instanceof ApiError && err.status === 403
    );

    // Registered user trying to access guest order without matching session
    await assert.rejects(
      async () => createPaymentOrder({ orderId: guestOrder.id }, { user_id: 'usr_different', session_id: null }),
      (err) => err instanceof ApiError && err.status === 403
    );
  });

  test('Registered user order: guest caller or wrong user throws 403', async () => {
    const userOrder = {
      id: 'd3b07384-d113-43da-a9be-4824b0716622',
      user_id: 'user_owner_real',
      status: 'pending',
      payment_status: 'pending',
      grand_total: '500.00',
    };

    setSupabaseClient({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: userOrder, error: null }),
          }),
        }),
      }),
    });

    // Guest caller accessing registered user order
    await assert.rejects(
      async () => createPaymentOrder({ orderId: userOrder.id }, { user_id: null, session_id: 'some-guest-sess' }),
      (err) => err instanceof ApiError && err.status === 403
    );

    // Wrong registered user accessing registered user order
    await assert.rejects(
      async () => createPaymentOrder({ orderId: userOrder.id }, { user_id: 'user_attacker' }),
      (err) => err instanceof ApiError && err.status === 403
    );
  });

  // --------------------------------------------------------------------------
  // 5. Concurrency & Race Condition Resilience
  // --------------------------------------------------------------------------
  test('Payment order creation: simultaneous requests coalesce into a single gateway call and return identical Razorpay order ID', async () => {
    const mockOrder = {
      id: 'd3b07384-d113-43da-a9be-4824b0716630',
      user_id: 'user_concurrent_1',
      order_number: 'US-CONCURRENT-01',
      status: 'pending',
      payment_status: 'pending',
      grand_total: '1000.00',
      currency: 'INR',
      razorpay_order_id: null,
    };

    let gatewayCallCount = 0;
    setRazorpayClient({
      orders: {
        create: async (params) => {
          gatewayCallCount++;
          // Simulate latency
          await new Promise((r) => setTimeout(r, 20));
          return { id: 'order_rzp_coalesced_123', amount: params.amount, currency: params.currency };
        },
      },
    });

    setSupabaseClient({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: mockOrder, error: null }),
          }),
        }),
        update: (upd) => ({
          eq: () => ({
            is: () => ({
              select: () => ({
                maybeSingle: async () => {
                  mockOrder.razorpay_order_id = upd.razorpay_order_id;
                  return { data: { ...mockOrder, ...upd }, error: null };
                },
              }),
            }),
            select: () => ({
              maybeSingle: async () => {
                mockOrder.razorpay_order_id = upd.razorpay_order_id;
                return { data: { ...mockOrder, ...upd }, error: null };
              },
            }),
          }),
        }),
      }),
    });

    // Launch two requests simultaneously
    const [res1, res2] = await Promise.all([
      createPaymentOrder({ orderId: mockOrder.id }, { user_id: 'user_concurrent_1' }),
      createPaymentOrder({ orderId: mockOrder.id }, { user_id: 'user_concurrent_1' }),
    ]);

    assert.strictEqual(gatewayCallCount, 1, 'Gateway create must only be called ONCE for simultaneous requests');
    assert.strictEqual(res1.razorpayOrderId, 'order_rzp_coalesced_123');
    assert.strictEqual(res2.razorpayOrderId, 'order_rzp_coalesced_123');
    assert.strictEqual(res1.razorpayOrderId, res2.razorpayOrderId);
  });

  test('Payment order creation: losing request in database race re-reads winning Razorpay order ID and returns reused: true', async () => {
    const mockOrder = {
      id: 'd3b07384-d113-43da-a9be-4824b0716631',
      user_id: 'user_concurrent_2',
      order_number: 'US-CONCURRENT-02',
      status: 'pending',
      payment_status: 'pending',
      grand_total: '1000.00',
      currency: 'INR',
      razorpay_order_id: null,
    };

    setRazorpayClient({
      orders: {
        create: async () => ({ id: 'order_rzp_loser_call' }),
      },
    });

    // Simulate CAS losing condition: update matches 0 rows (returns data: null) because another process wrote first
    let readCount = 0;
    setSupabaseClient({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              readCount++;
              if (readCount > 1) {
                // Winner's stored state
                return { data: { ...mockOrder, razorpay_order_id: 'order_rzp_winner_123' }, error: null };
              }
              return { data: mockOrder, error: null };
            },
          }),
        }),
        update: () => ({
          eq: () => ({
            is: () => ({
              select: () => ({
                // CAS lost: 0 rows updated
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }),
    });

    const result = await createPaymentOrder({ orderId: mockOrder.id }, { user_id: 'user_concurrent_2' });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.razorpayOrderId, 'order_rzp_winner_123');
    assert.strictEqual(result.reused, true, 'Losing request must safely adopt the winner order ID with reused: true');
  });

  test('Payment order creation: gateway failure clears in-flight map and allows subsequent retry to succeed', async () => {
    const mockOrder = {
      id: 'd3b07384-d113-43da-a9be-4824b0716632',
      user_id: 'user_retry_1',
      order_number: 'US-RETRY-01',
      status: 'pending',
      payment_status: 'pending',
      grand_total: '1000.00',
      currency: 'INR',
      razorpay_order_id: null,
    };

    let attempt = 0;
    setRazorpayClient({
      orders: {
        create: async () => {
          attempt++;
          if (attempt === 1) {
            throw new Error('Gateway transient 502');
          }
          return { id: 'order_rzp_success_on_retry' };
        },
      },
    });

    setSupabaseClient({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: mockOrder, error: null }),
          }),
        }),
        update: (upd) => ({
          eq: () => ({
            is: () => ({
              select: () => ({
                maybeSingle: async () => ({ data: { ...mockOrder, ...upd }, error: null }),
              }),
            }),
          }),
        }),
      }),
    });

    // Attempt 1: Gateway fails
    await assert.rejects(
      async () => createPaymentOrder({ orderId: mockOrder.id }, { user_id: 'user_retry_1' }),
      (err) => err instanceof ApiError && err.status === 502
    );

    // Attempt 2: Immediate retry succeeds
    const result = await createPaymentOrder({ orderId: mockOrder.id }, { user_id: 'user_retry_1' });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.razorpayOrderId, 'order_rzp_success_on_retry');
  });

  // --------------------------------------------------------------------------
  // 6. Supabase Service-Role Configuration Safety
  // --------------------------------------------------------------------------
  test('Supabase service-role safety: unconfigured service-role key throws 500 without leaking secrets', async () => {
    const mockOrder = {
      id: 'd3b07384-d113-43da-a9be-4824b0716640',
      user_id: 'user_sec_1',
      status: 'pending',
      payment_status: 'pending',
      grand_total: '1000.00',
    };

    const originalServiceRole = config.supabase.serviceRoleKey;
    try {
      config.supabase.serviceRoleKey = '';
      setSupabaseClient(null); // Ensure no mock bypass

      await assert.rejects(
        async () => createPaymentOrder({ orderId: mockOrder.id }, { user_id: 'user_sec_1' }),
        (err) => {
          assert.strictEqual(err instanceof ApiError, true);
          assert.strictEqual(err.status, 500);
          assert.strictEqual(err.message.includes('unavailable'), true);
          // Confirm no secrets leaked
          assert.strictEqual(err.message.includes('secret'), false);
          assert.strictEqual(err.message.includes('key'), false);
          return true;
        }
      );

      await assert.rejects(
        async () =>
          verifyPayment(
            {
              orderId: mockOrder.id,
              razorpayOrderId: 'order_1',
              razorpayPaymentId: 'pay_1',
              razorpaySignature: 'sig_1',
            },
            { user_id: 'user_sec_1' }
          ),
        (err) => err instanceof ApiError && err.status === 500
      );
    } finally {
      config.supabase.serviceRoleKey = originalServiceRole;
    }
  });

  test('Payment order creation: database link failure throws 500 cleanly', async () => {
    const mockOrder = {
      id: 'd3b07384-d113-43da-a9be-4824b0716641',
      user_id: 'user_fail_1',
      status: 'pending',
      payment_status: 'pending',
      grand_total: '1000.00',
      currency: 'INR',
      razorpay_order_id: null,
    };

    setRazorpayClient({
      orders: {
        create: async () => ({ id: 'order_rzp_will_fail_db' }),
      },
    });

    setSupabaseClient({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: mockOrder, error: null }),
          }),
        }),
        update: () => ({
          eq: () => ({
            is: () => ({
              select: () => ({
                maybeSingle: async () => ({ data: null, error: { message: 'db connection closed' } }),
              }),
            }),
          }),
        }),
      }),
    });

    await assert.rejects(
      async () => createPaymentOrder({ orderId: mockOrder.id }, { user_id: 'user_fail_1' }),
      (err) => err instanceof ApiError && err.status === 500 && err.message.includes('Failed to associate')
    );
  });
});

