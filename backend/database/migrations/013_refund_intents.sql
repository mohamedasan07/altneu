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
CREATE OR REPLACE FUNCTION public.record_late_capture_refund_intent_atomic(
  p_event_id text,
  p_event_type text,
  p_order_id uuid,
  p_payload jsonb,
  p_payment_id text,
  p_amount integer,
  p_currency text,
  p_reason text DEFAULT 'Late capture on cancelled or expired order',
  p_idempotency_key text DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order record;
  v_existing_event record;
  v_existing_intent record;
  v_intent record;
  v_idemp_key text;
  v_expected_amount_paise integer;
  v_payload_rzp_order_id text;
  v_payload_payment_id text;
  v_existing_payload_payment_id text;
  v_inserted_event_id text;
  v_is_existing_intent boolean := false;
BEGIN
  -- =========================================================================
  -- PHASE 1: READ-ONLY PARAMETER & PAYLOAD VALIDATION (ZERO WRITES)
  -- =========================================================================

  -- 1. Input parameter non-null / non-empty checks
  IF p_event_id IS NULL OR trim(p_event_id) = '' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_event_id');
  END IF;

  IF p_order_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_order_id');
  END IF;

  IF p_payment_id IS NULL OR trim(p_payment_id) = '' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_payment_id');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_amount');
  END IF;

  IF p_currency IS NULL OR trim(p_currency) = '' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_currency');
  END IF;

  IF p_payload IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_payload');
  END IF;

  -- 2. Deduplication check: inspect if event_id was previously recorded
  SELECT event_id, event_type, order_id, payload INTO v_existing_event
  FROM public.razorpay_webhook_events
  WHERE event_id = p_event_id;

  IF FOUND THEN
    -- Stored event type: must be present and match incoming
    IF v_existing_event.event_type IS NULL OR v_existing_event.event_type != p_event_type THEN
      RETURN jsonb_build_object(
        'success', false,
        'reason', 'event_type_mismatch',
        'existing_event_type', v_existing_event.event_type,
        'provided_event_type', p_event_type
      );
    END IF;

    -- Stored order ID: must be present and match incoming
    IF v_existing_event.order_id IS NULL OR v_existing_event.order_id != p_order_id THEN
      RETURN jsonb_build_object(
        'success', false,
        'reason', 'event_order_mismatch',
        'existing_order_id', v_existing_event.order_id,
        'provided_order_id', p_order_id
      );
    END IF;

    -- Stored payment ID in payload: must be present and match incoming
    v_existing_payload_payment_id := coalesce(
      v_existing_event.payload->'payload'->'payment'->'entity'->>'id',
      v_existing_event.payload->'payment'->'entity'->>'id'
    );
    IF v_existing_payload_payment_id IS NULL OR trim(v_existing_payload_payment_id) = '' OR v_existing_payload_payment_id != p_payment_id THEN
      RETURN jsonb_build_object(
        'success', false,
        'reason', 'event_payment_mismatch',
        'existing_payment_id', v_existing_payload_payment_id,
        'provided_payment_id', p_payment_id
      );
    END IF;

    -- Identifying details match: legitimate duplicate, exit cleanly with zero writes
    RETURN jsonb_build_object(
      'success', true,
      'duplicate_event', true,
      'event_id', p_event_id
    );
  END IF;

  -- 3. Lock order row FOR UPDATE to establish serializability
  SELECT id, status, payment_status, grand_total, currency, razorpay_order_id, razorpay_payment_id, refund_status
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'order_not_found');
  END IF;

  -- 4. Enforce that order must have an associated Razorpay order ID
  IF v_order.razorpay_order_id IS NULL OR trim(v_order.razorpay_order_id) = '' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'order_missing_razorpay_order_id');
  END IF;

  -- 5. Enforce that order must be in cancelled status
  IF v_order.status != 'cancelled' THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'order_not_cancelled',
      'current_status', v_order.status
    );
  END IF;

  -- 6. Mandatory payload order ID extraction and match
  v_payload_rzp_order_id := coalesce(
    p_payload->'payload'->'payment'->'entity'->>'order_id',
    p_payload->'payment'->'entity'->>'order_id'
  );

  IF v_payload_rzp_order_id IS NULL OR trim(v_payload_rzp_order_id) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'payload_missing_razorpay_order_id',
      'detail', 'Webhook payload missing order_id under payload.payment.entity'
    );
  END IF;

  IF v_payload_rzp_order_id != v_order.razorpay_order_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'razorpay_order_id_mismatch',
      'order_razorpay_order_id', v_order.razorpay_order_id,
      'payload_order_id', v_payload_rzp_order_id
    );
  END IF;

  -- 7. Mandatory payload payment ID extraction and match
  v_payload_payment_id := coalesce(
    p_payload->'payload'->'payment'->'entity'->>'id',
    p_payload->'payment'->'entity'->>'id'
  );

  IF v_payload_payment_id IS NULL OR trim(v_payload_payment_id) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'payload_missing_payment_id',
      'detail', 'Webhook payload missing payment entity ID under payload.payment.entity.id'
    );
  END IF;

  IF v_payload_payment_id != p_payment_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'payload_payment_id_mismatch',
      'payload_payment_id', v_payload_payment_id,
      'provided_payment_id', p_payment_id
    );
  END IF;

  -- 8. Existing order payment ID check (if order already has a payment ID populated)
  IF v_order.razorpay_payment_id IS NOT NULL AND trim(v_order.razorpay_payment_id) != '' AND v_order.razorpay_payment_id != p_payment_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'payment_id_mismatch',
      'order_payment_id', v_order.razorpay_payment_id,
      'provided_payment_id', p_payment_id
    );
  END IF;

  -- 9. Currency validation
  IF v_order.currency IS NOT NULL AND upper(trim(p_currency)) != upper(trim(v_order.currency)) THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'currency_mismatch',
      'order_currency', v_order.currency,
      'provided_currency', p_currency
    );
  END IF;

  -- 10. Amount validation (paise vs grand_total): fail-closed if grand_total is null, zero, or invalid
  IF v_order.grand_total IS NULL OR v_order.grand_total <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'invalid_order_grand_total',
      'detail', 'Order grand_total is null, zero, or negative'
    );
  END IF;

  v_expected_amount_paise := round(v_order.grand_total * 100)::integer;
  IF p_amount != v_expected_amount_paise THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'amount_mismatch',
      'expected_amount_paise', v_expected_amount_paise,
      'provided_amount_paise', p_amount
    );
  END IF;

  -- =========================================================================
  -- PHASE 2: MUTATING OPERATIONS (EVENT RECORDING FIRST)
  -- =========================================================================

  -- 11. Concurrently safe webhook event logging (Occurs BEFORE refund intent mutation)
  INSERT INTO public.razorpay_webhook_events (event_id, event_type, order_id, payload, processed_at)
  VALUES (p_event_id, p_event_type, p_order_id, p_payload, now())
  ON CONFLICT (event_id) DO NOTHING
  RETURNING event_id INTO v_inserted_event_id;

  -- If not inserted, another concurrent worker inserted this event_id in a race
  IF v_inserted_event_id IS NULL THEN
    SELECT event_id, event_type, order_id, payload INTO v_existing_event
    FROM public.razorpay_webhook_events
    WHERE event_id = p_event_id;

    -- If event_type conflicting: RAISE EXCEPTION to abort transaction with ZERO side effects
    IF v_existing_event.event_type IS NULL OR v_existing_event.event_type != p_event_type THEN
      RAISE EXCEPTION 'Conflicting concurrent webhook event %: event_type mismatch (% vs %)',
        p_event_id, v_existing_event.event_type, p_event_type;
    END IF;

    -- If order_id conflicting: RAISE EXCEPTION to abort transaction with ZERO side effects
    IF v_existing_event.order_id IS NULL OR v_existing_event.order_id != p_order_id THEN
      RAISE EXCEPTION 'Conflicting concurrent webhook event %: order_id mismatch (% vs %)',
        p_event_id, v_existing_event.order_id, p_order_id;
    END IF;

    -- If payment_id conflicting: RAISE EXCEPTION to abort transaction with ZERO side effects
    v_existing_payload_payment_id := coalesce(
      v_existing_event.payload->'payload'->'payment'->'entity'->>'id',
      v_existing_event.payload->'payment'->'entity'->>'id'
    );
    IF v_existing_payload_payment_id IS NULL OR trim(v_existing_payload_payment_id) = '' OR v_existing_payload_payment_id != p_payment_id THEN
      RAISE EXCEPTION 'Conflicting concurrent webhook event %: payment_id mismatch (% vs %)',
        p_event_id, v_existing_payload_payment_id, p_payment_id;
    END IF;

    -- Concurrently verified duplicate: exit cleanly with zero mutations
    RETURN jsonb_build_object(
      'success', true,
      'duplicate_event', true,
      'event_id', p_event_id
    );
  END IF;

  -- 12. Create or safely update refund intent (ONLY reached after event is recorded)
  SELECT id, status, amount, currency, idempotency_key
  INTO v_existing_intent
  FROM public.refund_intents
  WHERE order_id = p_order_id AND payment_id = p_payment_id;

  IF FOUND THEN
    -- Verify amount and currency consistency
    IF v_existing_intent.amount != p_amount OR upper(trim(v_existing_intent.currency)) != upper(trim(coalesce(v_order.currency, p_currency))) THEN
      RAISE EXCEPTION 'Existing refund intent % for order % has mismatched amount (% vs %) or currency',
        v_existing_intent.id, p_order_id, v_existing_intent.amount, p_amount;
    END IF;

    UPDATE public.refund_intents
    SET updated_at = now()
    WHERE id = v_existing_intent.id;

    v_intent := v_existing_intent;
    v_is_existing_intent := true;
  ELSE
    v_idemp_key := coalesce(p_idempotency_key, 'rfnd_' || replace(gen_random_uuid()::text, '-', ''));

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
      p_payment_id,
      p_amount,
      coalesce(v_order.currency, p_currency),
      'pending',
      p_reason,
      v_idemp_key
    )
    ON CONFLICT (order_id, payment_id) DO UPDATE
      SET updated_at = now()
    RETURNING id, status, idempotency_key, amount, currency INTO v_intent;
  END IF;

  -- 13. Update order with payment ID and refund tracking diagnostics
  UPDATE public.orders
  SET razorpay_payment_id = coalesce(razorpay_payment_id, p_payment_id),
      payment_failed_reason = substring(('LATE_CAPTURE_REFUND_' || upper(v_intent.status) || ': ' || p_reason) FROM 1 FOR 500),
      refund_status = coalesce(v_intent.status, refund_status, 'pending'),
      refund_reason = coalesce(refund_reason, p_reason),
      refund_idempotency_key = coalesce(refund_idempotency_key, v_intent.idempotency_key),
      updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'duplicate_event', false,
    'is_existing_intent', v_is_existing_intent,
    'event_id', p_event_id,
    'refund_intent_id', v_intent.id,
    'refund_intent_status', v_intent.status,
    'idempotency_key', v_intent.idempotency_key
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

revoke all on function public.record_late_capture_refund_intent_atomic(text, text, uuid, jsonb, text, integer, text, text, text) from public;
revoke all on function public.record_late_capture_refund_intent_atomic(text, text, uuid, jsonb, text, integer, text, text, text) from anon;
revoke all on function public.record_late_capture_refund_intent_atomic(text, text, uuid, jsonb, text, integer, text, text, text) from authenticated;
grant execute on function public.record_late_capture_refund_intent_atomic(text, text, uuid, jsonb, text, integer, text, text, text) to service_role;
