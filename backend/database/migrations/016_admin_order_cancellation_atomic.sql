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

create or replace function public.admin_cancel_order_atomic(
  p_order_id uuid,
  p_reason text default 'Admin-initiated order cancellation',
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order record;
  v_item record;
  v_items_restored integer := 0;
  v_quantity_restored integer := 0;
  v_is_paid boolean := false;
  v_idemp_key text;
  v_amount_paise integer;
  v_intent record;
begin
  -- 1. Lock the order row FOR UPDATE to establish serializability and prevent concurrent races
  select id, status, payment_status, grand_total, currency, razorpay_payment_id, refund_status, refund_idempotency_key
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'order_not_found');
  end if;

  -- 2. Idempotency: If already cancelled or refunded, exit cleanly without touching stock or intents
  if v_order.status = 'cancelled' or v_order.status = 'refunded' then
    return jsonb_build_object(
      'success', true,
      'already_cancelled', true,
      'order_id', p_order_id,
      'current_status', v_order.status,
      'current_payment_status', v_order.payment_status,
      'refund_status', v_order.refund_status
    );
  end if;

  -- 3. Verify order eligibility: only pre-fulfilment orders may be cancelled
  -- Shipped or delivered orders cannot be cancelled
  if v_order.status in ('shipped', 'delivered') then
    return jsonb_build_object(
      'success', false,
      'reason', 'order_already_dispatched',
      'current_status', v_order.status
    );
  end if;

  -- 4. Pre-flight check: verify no invalid or corrupted order items
  if exists (
    select 1
    from public.order_items
    where order_id = p_order_id and (product_id is null or quantity <= 0)
  ) then
    raise exception 'Order % contains invalid order_items with null product_id or non-positive quantity', p_order_id;
  end if;

  -- 5. Lock and restore stock for every order item in deterministic order (prevents deadlocks)
  for v_item in
    select product_id, sum(quantity)::integer as quantity
    from public.order_items
    where order_id = p_order_id
    group by product_id
    order by product_id asc
  loop
    update public.products
    set stock_quantity = stock_quantity + v_item.quantity,
        updated_at = now()
    where id = v_item.product_id;

    if not found then
      raise exception 'Product % not found in public.products for order item stock restoration on order %', v_item.product_id, p_order_id;
    end if;

    v_items_restored := v_items_restored + 1;
    v_quantity_restored := v_quantity_restored + v_item.quantity;
  end loop;

  -- 6. Check payment status
  v_is_paid := (v_order.payment_status = 'paid');

  if v_is_paid then
    -- Paid order: verify payment_id exists
    if v_order.razorpay_payment_id is null or trim(v_order.razorpay_payment_id) = '' then
      raise exception 'Paid order % has null or empty razorpay_payment_id', p_order_id;
    end if;

    v_amount_paise := round(v_order.grand_total * 100)::integer;
    v_idemp_key := coalesce(p_idempotency_key, 'rfnd_adm_' || replace(gen_random_uuid()::text, '-', ''));

    -- Insert durable refund intent
    insert into public.refund_intents (
      order_id,
      payment_id,
      amount,
      currency,
      status,
      reason,
      idempotency_key
    )
    values (
      p_order_id,
      v_order.razorpay_payment_id,
      v_amount_paise,
      coalesce(v_order.currency, 'INR'),
      'pending',
      p_reason,
      v_idemp_key
    )
    on conflict (order_id, payment_id) do update
      set updated_at = now()
    returning id, status, idempotency_key into v_intent;

    -- Update order to cancelled and mark refund pending (payment_status remains paid until gateway confirms)
    update public.orders
    set status = 'cancelled',
        refund_status = coalesce(refund_status, 'pending'),
        refund_reason = coalesce(refund_reason, p_reason),
        refund_idempotency_key = coalesce(refund_idempotency_key, v_intent.idempotency_key),
        payment_failed_reason = substring(('ADMIN_CANCELLED_REFUND_PENDING: ' || p_reason) from 1 for 500),
        updated_at = now()
    where id = p_order_id;

  else
    -- Unpaid order: transition status to cancelled and payment_status to failed
    update public.orders
    set status = 'cancelled',
        payment_status = 'failed',
        payment_failed_reason = substring(('ADMIN_CANCELLED: ' || p_reason) from 1 for 500),
        updated_at = now()
    where id = p_order_id;
  end if;

  -- 7. Record truthful order status history entry
  insert into public.order_status_history (order_id, status, by_role, created_at)
  values (p_order_id, 'cancelled', 'admin', now());

  return jsonb_build_object(
    'success', true,
    'already_cancelled', false,
    'order_id', p_order_id,
    'is_paid', v_is_paid,
    'items_restored', v_items_restored,
    'quantity_restored', v_quantity_restored,
    'refund_intent_id', case when v_is_paid then v_intent.id else null end,
    'refund_intent_status', case when v_is_paid then v_intent.status else null end,
    'idempotency_key', case when v_is_paid then v_intent.idempotency_key else null end
  );
exception
  when others then
    raise;
end;
$$;

revoke all on function public.admin_cancel_order_atomic(uuid, text, text) from public;
revoke all on function public.admin_cancel_order_atomic(uuid, text, text) from anon;
revoke all on function public.admin_cancel_order_atomic(uuid, text, text) from authenticated;
grant execute on function public.admin_cancel_order_atomic(uuid, text, text) to service_role;
