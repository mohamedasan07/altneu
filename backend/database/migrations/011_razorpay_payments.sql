-- ============================================================================
-- ALTNEU — Migration 011: Razorpay Payment Gateway & Refund Integration
-- PostgreSQL 15+ (Supabase)
-- ============================================================================

-- 1. Add Gateway Reference Columns, Attempt Counters & Refund Tracking to Orders
alter table public.orders
  add column if not exists razorpay_order_id text,
  add column if not exists razorpay_payment_id text,
  add column if not exists razorpay_signature text,
  add column if not exists razorpay_refund_id text,
  add column if not exists refund_idempotency_key text,
  add column if not exists refund_claimed_at timestamptz,
  add column if not exists refund_status text,
  add column if not exists refund_reason text,
  add column if not exists refunded_at timestamptz,
  add column if not exists payment_attempts integer not null default 0,
  add column if not exists payment_failed_reason text,
  add column if not exists last_payment_attempt_at timestamptz,
  add column if not exists payment_verified_at timestamptz,
  add column if not exists guest_session_id text;

-- 2. Create Unique / Lookup Indexes (Partial indexes avoid indexing NULLs)
create unique index if not exists idx_orders_razorpay_order_id
  on public.orders (razorpay_order_id)
  where razorpay_order_id is not null;

create unique index if not exists idx_orders_razorpay_payment_id
  on public.orders (razorpay_payment_id)
  where razorpay_payment_id is not null;

create unique index if not exists idx_orders_razorpay_refund_id
  on public.orders (razorpay_refund_id)
  where razorpay_refund_id is not null;

create unique index if not exists idx_orders_refund_idempotency_key
  on public.orders (refund_idempotency_key)
  where refund_idempotency_key is not null;

create index if not exists idx_orders_guest_session_id
  on public.orders (guest_session_id)
  where guest_session_id is not null;

-- Partial index covering retryable unexpired orders for the sweeper
create index if not exists idx_orders_unpaid_sweeper
  on public.orders (placed_at)
  where status = 'pending' and payment_status in ('pending', 'failed');

-- 3. Webhook Idempotency & Deduplication Table
create table if not exists public.razorpay_webhook_events (
  event_id     text primary key,
  event_type   text not null,
  order_id     uuid references public.orders (id) on delete set null,
  payload      jsonb not null,
  processed_at timestamptz not null default now()
);

create index if not exists idx_webhook_events_order
  on public.razorpay_webhook_events (order_id);

-- 4. Restrict Webhook Deduplication Table Access (Backend Service Role Only)
alter table public.razorpay_webhook_events enable row level security;
revoke all on public.razorpay_webhook_events from anon, authenticated;

