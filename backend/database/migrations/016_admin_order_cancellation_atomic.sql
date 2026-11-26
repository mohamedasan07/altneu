-- ============================================================================
-- ALTNEU — Migration 016: Atomic Admin Order Cancellation & Refund Intent Creation
-- PostgreSQL 15+ (Supabase)
--
-- Sprint Admin Order Cancellation & Refund Safety:
-- Encapsulates admin-initiated cancellation, deterministic inventory restoration,
-- durable refund intent creation for paid orders, and truthful status history
-- recording into a single ACID database transaction.
--
-- Guarantees:
-- 1. All-or-nothing atomicity: An interruption or database error cannot leave an
--    order cancelled while inventory restoration or refund intent creation is skipped.
-- 2. Concurrency safety: Acquires an exclusive row lock (FOR UPDATE) on the order row,
--    guaranteeing mutual exclusion with concurrent payment verification, webhooks, or sweepers.
-- 3. Exactly-once restoration: Product stock is restored deterministically in ascending
--    product_id order. Repeated calls on an already cancelled order exit safely without
--    restoring stock or creating duplicate refund intents.
-- 4. Durable refund intent: For paid orders with a captured payment, inserts a refund intent
--    into public.refund_intents with unique constraints on (order_id, payment_id) and idempotency_key.
-- 5. Truthful status history: Appends an accurate status history entry (by_role: 'admin').
-- 6. Role separation: Restricted exclusively to backend service role.
--
-- NOTE: Do NOT apply to production until migration window approval.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_cancel_order_atomic(
  p_order_id uuid,
  p_reason text DEFAULT 'Admin-initiated order cancellation',
  p_idempotency_key text DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order record;
  v_item record;
  v_items_restored integer := 0;
  v_quantity_restored integer := 0;
  v_is_paid boolean := false;
  v_idemp_key text;
  v_amount_paise integer;
  v_existing_intent record;
  v_intent record;
  v_is_existing_intent boolean := false;
BEGIN
  -- 1. Input validation
  IF p_order_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_order_id');
  END IF;

  -- 2. Lock the order row FOR UPDATE to establish serializability
  SELECT id, status, payment_status, grand_total, currency, razorpay_payment_id, refund_status, refund_idempotency_key
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'order_not_found');
  END IF;

  -- 3. Idempotency: If already cancelled or refunded, exit cleanly without touching stock or intents
  IF v_order.status = 'cancelled' OR v_order.status = 'refunded' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_cancelled', true,
      'order_id', p_order_id,
      'current_status', v_order.status,
      'current_payment_status', v_order.payment_status,
      'refund_status', v_order.refund_status
    );
  END IF;

  -- 4. Verify order eligibility: only pre-fulfilment orders may be cancelled
  IF v_order.status IN ('shipped', 'delivered') THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'order_already_dispatched',
      'current_status', v_order.status
    );
  END IF;

  -- 5. Pre-flight check: verify order items validity
  IF EXISTS (
    SELECT 1
    FROM public.order_items
    WHERE order_id = p_order_id AND (product_id IS NULL OR quantity <= 0)
  ) THEN
    RAISE EXCEPTION 'Order % contains invalid order_items with null product_id or non-positive quantity', p_order_id;
  END IF;

  -- 6. Restore stock deterministically in ascending product_id order (deadlock-free)
  FOR v_item IN
    SELECT product_id, sum(quantity)::integer AS quantity
    FROM public.order_items
    WHERE order_id = p_order_id
    GROUP BY product_id
    ORDER BY product_id ASC
  LOOP
    UPDATE public.products
    SET stock_quantity = stock_quantity + v_item.quantity,
        updated_at = now()
    WHERE id = v_item.product_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % not found in public.products for order item stock restoration on order %', v_item.product_id, p_order_id;
    END IF;

    v_items_restored := v_items_restored + 1;
    v_quantity_restored := v_quantity_restored + v_item.quantity;
  END LOOP;

  -- 7. Check payment status
  v_is_paid := (v_order.payment_status = 'paid');

  IF v_is_paid THEN
    IF v_order.razorpay_payment_id IS NULL OR trim(v_order.razorpay_payment_id) = '' THEN
      RAISE EXCEPTION 'Paid order % has null or empty razorpay_payment_id', p_order_id;
    END IF;

    IF v_order.grand_total IS NULL OR v_order.grand_total <= 0 THEN
      RAISE EXCEPTION 'Paid order % has invalid or missing grand_total: %', p_order_id, v_order.grand_total;
    END IF;

    v_amount_paise := round(v_order.grand_total * 100)::integer;

    -- Check if refund intent already exists for (order_id, payment_id)
    SELECT id, status, amount, currency, idempotency_key
    INTO v_existing_intent
    FROM public.refund_intents
    WHERE order_id = p_order_id AND payment_id = v_order.razorpay_payment_id;

    IF FOUND THEN
      -- Validate amount consistency
      IF v_existing_intent.amount != v_amount_paise OR upper(trim(v_existing_intent.currency)) != upper(trim(coalesce(v_order.currency, 'INR'))) THEN
        RAISE EXCEPTION 'Existing refund intent % for order % has mismatched amount (% vs %) or currency',
          v_existing_intent.id, p_order_id, v_existing_intent.amount, v_amount_paise;
      END IF;

      -- Existing intent found: touch timestamp and preserve existing intent status
      UPDATE public.refund_intents
      SET updated_at = now()
      WHERE id = v_existing_intent.id;

      v_intent := v_existing_intent;
      v_is_existing_intent := true;
    ELSE
      v_idemp_key := coalesce(p_idempotency_key, 'rfnd_adm_' || replace(gen_random_uuid()::text, '-', ''));

      -- Insert fresh refund intent with ON CONFLICT safety
      INSERT INTO public.refund_intents (
        order_id,
        payment_id,
        amount,
        currency,
        status,
        reason,
        idempotency_key
      )
      VALUES (
        p_order_id,
        v_order.razorpay_payment_id,
        v_amount_paise,
        coalesce(v_order.currency, 'INR'),
        'pending',
        p_reason,
        v_idemp_key
      )
      ON CONFLICT (order_id, payment_id) DO UPDATE
        SET updated_at = now()
      RETURNING id, status, idempotency_key, amount, currency INTO v_intent;
    END IF;

    -- Update order to cancelled and reflect intent refund status
    UPDATE public.orders
    SET status = 'cancelled',
        refund_status = coalesce(v_intent.status, refund_status, 'pending'),
        refund_reason = coalesce(refund_reason, p_reason),
        refund_idempotency_key = coalesce(refund_idempotency_key, v_intent.idempotency_key),
        payment_failed_reason = substring(('ADMIN_CANCELLED_REFUND_' || upper(v_intent.status) || ': ' || p_reason) FROM 1 FOR 500),
        updated_at = now()
    WHERE id = p_order_id;

  ELSE
    -- Unpaid order: transition to cancelled / failed
    UPDATE public.orders
    SET status = 'cancelled',
        payment_status = 'failed',
        payment_failed_reason = substring(('ADMIN_CANCELLED: ' || p_reason) FROM 1 FOR 500),
        updated_at = now()
    WHERE id = p_order_id;
  END IF;

  -- 8. Record truthful order status history entry
  INSERT INTO public.order_status_history (order_id, status, by_role, created_at)
  VALUES (p_order_id, 'cancelled', 'admin', now());

  RETURN jsonb_build_object(
    'success', true,
    'already_cancelled', false,
    'is_existing_intent', v_is_existing_intent,
    'order_id', p_order_id,
    'is_paid', v_is_paid,
    'items_restored', v_items_restored,
    'quantity_restored', v_quantity_restored,
    'refund_intent_id', CASE WHEN v_is_paid THEN v_intent.id ELSE null END,
    'refund_intent_status', CASE WHEN v_is_paid THEN v_intent.status ELSE null END,
    'idempotency_key', CASE WHEN v_is_paid THEN v_intent.idempotency_key ELSE null END
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

revoke all on function public.admin_cancel_order_atomic(uuid, text, text) from public;
revoke all on function public.admin_cancel_order_atomic(uuid, text, text) from anon;
revoke all on function public.admin_cancel_order_atomic(uuid, text, text) from authenticated;
grant execute on function public.admin_cancel_order_atomic(uuid, text, text) to service_role;
