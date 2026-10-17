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

create or replace function public.expire_unpaid_order_atomic(
  p_order_id uuid,
  p_reason text default 'Unpaid order reservation expired after timeout'
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
begin
  -- 1. Lock the order row FOR UPDATE to establish serializability and prevent concurrent race
  select id, status, payment_status, placed_at
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'order_not_found');
  end if;

  -- 2. Verify order is still in eligible pending state
  -- If payment verification won, or customer cancelled, or already expired, exit without changes
  if v_order.status != 'pending' or v_order.payment_status not in ('pending', 'failed') then
    return jsonb_build_object(
      'success', false,
      'reason', 'order_not_eligible',
      'current_status', v_order.status,
      'current_payment_status', v_order.payment_status
    );
  end if;

  -- 3. Pre-flight check: verify no invalid or corrupted order items (e.g. null product_id or non-positive quantity)
  if exists (
    select 1
    from public.order_items
    where order_id = p_order_id and (product_id is null or quantity <= 0)
  ) then
    raise exception 'Order % contains invalid order_items with null product_id or non-positive quantity', p_order_id;
  end if;

  -- 4. Lock and restore stock for every order item in deterministic order (prevents deadlocks)
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

    -- Ensure product row actually existed and was updated; roll back if row is missing
    if not found then
      raise exception 'Product % not found in public.products for order item stock restoration on order %', v_item.product_id, p_order_id;
    end if;

    v_items_restored := v_items_restored + 1;
    v_quantity_restored := v_quantity_restored + v_item.quantity;
  end loop;

  -- 5. Transition order status atomically to cancelled / failed
  update public.orders
  set status = 'cancelled',
      payment_status = 'failed',
      payment_failed_reason = substring(p_reason from 1 for 500),
      updated_at = now()
  where id = p_order_id;

  -- 6. Record truthful order status history
  insert into public.order_status_history (order_id, status, by_role, created_at)
  values (p_order_id, 'cancelled', 'system', now());

  return jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'items_restored', v_items_restored,
    'quantity_restored', v_quantity_restored
  );
exception
  when others then
    -- Any unexpected error triggers automatic rollback of all updates in this transaction
    raise;
end;
$$;

-- Restrict function execution exclusively to backend service role
revoke all on function public.expire_unpaid_order_atomic(uuid, text) from public;
revoke all on function public.expire_unpaid_order_atomic(uuid, text) from anon;
revoke all on function public.expire_unpaid_order_atomic(uuid, text) from authenticated;
grant execute on function public.expire_unpaid_order_atomic(uuid, text) to service_role;
