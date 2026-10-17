-- ============================================================================
-- ALTNEU — Migration 013: Durable Refund Intents & Schema Hardening
-- PostgreSQL 15+ (Supabase)
--
-- Sprint Razorpay Phase 5B:
-- Durable recovery mechanism for payments captured after an order has expired
-- or been cancelled (late captures).
--
-- Guarantees:
-- 1. Security hardening: Revokes object creation privileges in the public schema
--    from untrusted roles (public, anon, authenticated) to prevent search_path
--    hijacking on SECURITY DEFINER functions.
-- 2. Durable refund intent: Table public.refund_intents stores uniquely
--    identifiable refund requests associated with an order and payment ID.
-- 3. Database uniqueness: Unique constraint on (order_id, payment_id) prevents
--    duplicate refund intents for the same order and payment combination.
-- 4. Unique idempotency key: Unique constraint on idempotency_key prevents
--    colliding gateway idempotency keys across requests.
-- 5. Atomic ingestion: public.record_late_capture_refund_intent_atomic creates
--    both the razorpay_webhook_events deduplication record and refund_intents in
--    a single ACID database transaction.
-- 6. Row-level security: Restricted exclusively to backend service role.
--
-- NOTE: Do NOT apply to production until migration window approval.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Security Hardening: Revoke CREATE on schema public from untrusted roles
-- ----------------------------------------------------------------------------
revoke create on schema public from public;
revoke create on schema public from anon;
revoke create on schema public from authenticated;

-- ----------------------------------------------------------------------------
-- 2. Create public.refund_intents Table
-- ----------------------------------------------------------------------------
create table if not exists public.refund_intents (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders (id) on delete restrict,
  payment_id          text not null,
  amount              integer not null check (amount > 0),
  currency            text not null default 'INR',
  status              text not null default 'pending'
                        check (status in ('pending', 'processing', 'completed', 'manual_review', 'failed')),
  reason              text not null default 'Late capture on cancelled or expired order',
  idempotency_key     text not null unique,
  razorpay_refund_id  text,
  gateway_response    jsonb,
  error_message       text,
  attempts            integer not null default 0 check (attempts >= 0),
  worker_claimed_at   timestamptz,
  worker_id           text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint uq_refund_intents_order_payment unique (order_id, payment_id)
);

-- Unique and lookup indexes for performance and concurrent claiming
create unique index if not exists idx_refund_intents_order_payment
  on public.refund_intents (order_id, payment_id);

create unique index if not exists idx_refund_intents_idempotency_key
  on public.refund_intents (idempotency_key);

create index if not exists idx_refund_intents_status
  on public.refund_intents (status);

create index if not exists idx_refund_intents_worker_claim
  on public.refund_intents (worker_claimed_at)
  where status = 'processing';

-- ----------------------------------------------------------------------------
-- 3. Row Level Security & Service Role Access
-- ----------------------------------------------------------------------------
alter table public.refund_intents enable row level security;
revoke all on public.refund_intents from public;
revoke all on public.refund_intents from anon;
revoke all on public.refund_intents from authenticated;
grant all on public.refund_intents to service_role;

-- ----------------------------------------------------------------------------
-- 4. Trigger for automatic updated_at timestamp
-- ----------------------------------------------------------------------------
drop trigger if exists trg_refund_intents_updated_at on public.refund_intents;
create trigger trg_refund_intents_updated_at before update on public.refund_intents
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 5. Atomic RPC: Ingest Late Capture Webhook and Create Refund Intent
-- ----------------------------------------------------------------------------
create or replace function public.record_late_capture_refund_intent_atomic(
  p_event_id text,
  p_event_type text,
  p_order_id uuid,
  p_payload jsonb,
  p_payment_id text,
  p_amount integer,
  p_currency text,
  p_reason text default 'Late capture on cancelled or expired order',
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order record;
  v_existing_event record;
  v_intent record;
  v_idemp_key text;
begin
  -- 1. Check if webhook event already recorded (deduplication)
  select event_id into v_existing_event
  from public.razorpay_webhook_events
  where event_id = p_event_id;

  if found then
    return jsonb_build_object(
      'success', true,
      'duplicate_event', true,
      'event_id', p_event_id
    );
  end if;

  -- 2. Lock order row FOR UPDATE to verify status and prevent concurrent modification
  select id, status, payment_status, grand_total, currency, razorpay_payment_id
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'order_not_found');
  end if;

  -- 3. Enforce that order must be in cancelled status
  if v_order.status != 'cancelled' then
    return jsonb_build_object(
      'success', false,
      'reason', 'order_not_cancelled',
      'current_status', v_order.status
    );
  end if;

  -- 4. Record webhook event in razorpay_webhook_events
  insert into public.razorpay_webhook_events (event_id, event_type, order_id, payload, processed_at)
  values (p_event_id, p_event_type, p_order_id, p_payload, now());

  -- 5. Compute idempotency key if not provided (minimum 10 chars, alphanum + hyphens)
  v_idemp_key := coalesce(p_idempotency_key, 'rfnd_' || replace(gen_random_uuid()::text, '-', ''));

  -- 6. Insert refund intent; if duplicate (order_id, payment_id), safely update timestamp
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
    p_payment_id,
    p_amount,
    p_currency,
    'pending',
    p_reason,
    v_idemp_key
  )
  on conflict (order_id, payment_id) do update
    set updated_at = now()
  returning id, status, idempotency_key into v_intent;

  -- 7. Update order to record payment_id and pending refund tracking diagnostics
  update public.orders
  set razorpay_payment_id = coalesce(razorpay_payment_id, p_payment_id),
      payment_failed_reason = substring(('LATE_CAPTURE_REFUND_PENDING: ' || p_reason) from 1 for 500),
      refund_status = coalesce(refund_status, 'pending'),
      refund_reason = coalesce(refund_reason, p_reason),
      refund_idempotency_key = coalesce(refund_idempotency_key, v_intent.idempotency_key),
      updated_at = now()
  where id = p_order_id;

  return jsonb_build_object(
    'success', true,
    'duplicate_event', false,
    'event_id', p_event_id,
    'refund_intent_id', v_intent.id,
    'refund_intent_status', v_intent.status,
    'idempotency_key', v_intent.idempotency_key
  );
exception
  when others then
    raise;
end;
$$;

revoke all on function public.record_late_capture_refund_intent_atomic(text, text, uuid, jsonb, text, integer, text, text, text) from public;
revoke all on function public.record_late_capture_refund_intent_atomic(text, text, uuid, jsonb, text, integer, text, text, text) from anon;
revoke all on function public.record_late_capture_refund_intent_atomic(text, text, uuid, jsonb, text, integer, text, text, text) from authenticated;
grant execute on function public.record_late_capture_refund_intent_atomic(text, text, uuid, jsonb, text, integer, text, text, text) to service_role;
