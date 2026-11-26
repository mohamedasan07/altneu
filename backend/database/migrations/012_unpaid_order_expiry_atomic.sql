-- ============================================================================
-- ALTNEU — Migration 012: Atomic Unpaid Order Expiry & Stock Restoration
-- PostgreSQL 15+ (Supabase)
--
-- Sprint Razorpay Phase 5A.1:
-- Encapsulates unpaid order cancellation, stock restoration, and status history
-- recording into a single ACID database transaction.
--
-- Guarantees:
-- 1. All-or-nothing atomicity: If any stock update, order status change, or
--    history insert fails, the entire transaction rolls back cleanly.
-- 2. Concurrency safety: SELECT ... FOR UPDATE acquires an exclusive row lock
--    on the order row, guaranteeing mutual exclusion with concurrent payment
--    verification or customer cancellations.
-- 3. Exactly-once restoration: An order is only processed if status = 'pending'
--    and payment_status in ('pending', 'failed'). Once cancelled, repeated calls
--    safely exit without modifying product stock.
--
-- NOTE: Do NOT apply to production until migration window approval.
-- ============================================================================

-- 0. Safely drop obsolete 2-argument signature to prevent ambiguous overload resolution in PostgREST/PostgreSQL
DROP FUNCTION IF EXISTS public.expire_unpaid_order_atomic(uuid, text);

CREATE OR REPLACE FUNCTION public.expire_unpaid_order_atomic(
  p_order_id uuid,
  p_reason text DEFAULT 'Unpaid order reservation expired after timeout',
  p_min_age_interval interval DEFAULT interval '30 minutes'
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
BEGIN
  -- 1. Input parameter check
  IF p_order_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_order_id');
  END IF;

  IF p_min_age_interval IS NULL OR p_min_age_interval < interval '30 minutes' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_min_age_interval');
  END IF;

  -- 2. Lock the order row FOR UPDATE to establish serializability
  SELECT id, status, payment_status, placed_at
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'order_not_found');
  END IF;

  -- 3. Verify order is still in eligible pending state
  IF v_order.status != 'pending' OR v_order.payment_status NOT IN ('pending', 'failed') THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'order_not_eligible',
      'current_status', v_order.status,
      'current_payment_status', v_order.payment_status
    );
  END IF;

  -- 4. Safety Cutoff Guard: Reject orders with missing placed_at or premature expiration of recently placed orders
  IF v_order.placed_at IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'invalid_placed_at',
      'order_id', p_order_id
    );
  END IF;

  IF v_order.placed_at > (now() - p_min_age_interval) THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'order_not_expired',
      'placed_at', v_order.placed_at,
      'min_age_threshold', (now() - p_min_age_interval)
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

  -- 6. Restore stock for every item in deterministic ascending order (deadlock-free)
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

  -- 7. Transition order status atomically to cancelled / failed
  UPDATE public.orders
  SET status = 'cancelled',
      payment_status = 'failed',
      payment_failed_reason = substring(p_reason FROM 1 FOR 500),
      updated_at = now()
  WHERE id = p_order_id;

  -- 8. Record truthful order status history
  INSERT INTO public.order_status_history (order_id, status, by_role, created_at)
  VALUES (p_order_id, 'cancelled', 'system', now());

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'items_restored', v_items_restored,
    'quantity_restored', v_quantity_restored
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

-- Restrict function execution exclusively to backend service role
REVOKE ALL ON FUNCTION public.expire_unpaid_order_atomic(uuid, text, interval) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_unpaid_order_atomic(uuid, text, interval) FROM anon;
REVOKE ALL ON FUNCTION public.expire_unpaid_order_atomic(uuid, text, interval) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.expire_unpaid_order_atomic(uuid, text, interval) TO service_role;
