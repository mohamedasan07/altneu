-- ============================================================================
-- Migration: 006_contact_messages
-- Description: Create contact_messages table for storing customer inquiries
-- ============================================================================

create table if not exists public.contact_messages (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  email        text not null,
  phone        text,
  subject      text not null,
  order_number text,
  message      text not null,
  status       text not null default 'new' check (status in ('new', 'in_progress', 'resolved', 'spam')),
  created_at   timestamptz not null default now()
);

-- ============================================================================
-- Indexes
-- ============================================================================
create index if not exists idx_contact_messages_status on public.contact_messages (status);
create index if not exists idx_contact_messages_created_at on public.contact_messages (created_at desc);

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.contact_messages enable row level security;

-- The backend writes through the service-role key, which bypasses RLS.
-- No public policies are needed since users do not read these directly.
