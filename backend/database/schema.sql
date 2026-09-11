-- ============================================================================
-- ALTNEU — Production database schema
-- PostgreSQL 15+ (Supabase)
--
-- Apply via the Supabase SQL Editor, or from the CLI:
--   psql "$SUPABASE_DB_URL" -f database/schema.sql
--
-- Migration history lives in database/migrations/ — this file is the canonical
-- "current state" of the schema for reference and full rebuilds.
-- ============================================================================

-- Extensions (harmless no-ops when already installed)
create extension if not exists pgcrypto;
create extension if not exists citext;

-- ----------------------------------------------------------------------------
-- Shared helpers
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- Categories
-- ============================================================================
create table if not exists public.categories (
  id          bigint generated always as identity primary key,
  name        text not null,
  slug        text not null unique,
  description text,
  image_url   text,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================================
-- Products
-- ============================================================================
create table if not exists public.products (
  id             bigint generated always as identity primary key,
  category_id    bigint references public.categories (id) on delete set null,
  name           text not null,
  slug           text not null unique,
  description    text,
  price          numeric(12, 2) not null check (price >= 0),
  old_price      numeric(12, 2) check (old_price is null or old_price >= 0),
  image_url      text,
  image_gallery  jsonb not null default '[]'::jsonb,
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  is_sale        boolean not null default false,
  is_new         boolean not null default false,
  is_active      boolean not null default true,
  rating         numeric(2, 1) not null default 0 check (rating between 0 and 5),
  rating_count   integer not null default 0 check (rating_count >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ============================================================================
-- Users
-- ============================================================================
create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  email         citext not null unique,
  password_hash text not null,
  first_name    text,
  last_name     text,
  phone         text,
  avatar_url    text,
  role          text not null default 'customer' check (role in ('customer', 'admin')),
  is_active     boolean not null default true,
  last_login_at timestamptz,
  -- Password reset (Sprint 21.1) — reset_token stores a SHA-256 hash of the
  -- one-time reset code, never the code itself.
  reset_token         text,
  reset_token_expires_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ============================================================================
-- Addresses
-- ============================================================================
create table if not exists public.addresses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  name       text not null,
  phone      text not null,
  address    text not null,
  city       text not null,
  state      text not null,
  pincode    text not null,
  country    text not null default 'India',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- Wishlist
-- ============================================================================
create table if not exists public.wishlist (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  product_id bigint not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

-- ============================================================================
-- Cart + cart_items
-- ============================================================================
create table if not exists public.cart (
  id         uuid primary key default gen_random_uuid(),
  -- A cart belongs to a user OR an anonymous session (guest checkout).
  user_id    uuid references public.users (id) on delete cascade,
  session_id text,
  status     text not null default 'active' check (status in ('active', 'abandoned', 'checked_out')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (user_id is not null or session_id is not null)
);

create table if not exists public.cart_items (
  id         uuid primary key default gen_random_uuid(),
  cart_id    uuid not null references public.cart (id) on delete cascade,
  product_id bigint not null references public.products (id) on delete cascade,
  size       text,
  color      text,
  color_name text,
  quantity   integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cart_id, product_id, size, color)
);

-- ============================================================================
-- Orders + order_items
-- ============================================================================
create table if not exists public.orders (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references public.users (id) on delete set null,
  order_number     text not null unique,
  status           text not null default 'pending'
                     check (status in ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')),
  payment_status   text not null default 'pending'
                     check (payment_status in ('pending', 'paid', 'failed', 'refunded')),
  payment_method   text,
  subtotal         numeric(12, 2) not null default 0 check (subtotal >= 0),
  discount         numeric(12, 2) not null default 0 check (discount >= 0),
  shipping         numeric(12, 2) not null default 0 check (shipping >= 0),
  tax              numeric(12, 2) not null default 0 check (tax >= 0),
  grand_total      numeric(12, 2) not null default 0 check (grand_total >= 0),
  currency         text not null default 'INR',
  coupon_code      text,
  -- Snapshots so order history survives later edits/deletes of user data.
  shipping_address jsonb,
  contact          jsonb,
  placed_at        timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders (id) on delete cascade,
  product_id     bigint references public.products (id) on delete set null,
  name           text not null,
  price_at_order numeric(12, 2) not null check (price_at_order >= 0),
  image_url      text,
  size           text,
  color          text,
  color_name     text,
  quantity       integer not null default 1 check (quantity > 0),
  created_at     timestamptz not null default now()
);

-- ============================================================================
-- Indexes
-- ============================================================================
create index if not exists idx_products_category     on public.products (category_id);
create index if not exists idx_products_active       on public.products (is_active);
create index if not exists idx_addresses_user        on public.addresses (user_id);
create index if not exists idx_wishlist_user         on public.wishlist (user_id);
create index if not exists idx_cart_user             on public.cart (user_id);
create index if not exists idx_cart_session          on public.cart (session_id);
create index if not exists idx_cart_items_cart       on public.cart_items (cart_id);
create index if not exists idx_cart_items_product    on public.cart_items (product_id);
create index if not exists idx_orders_user           on public.orders (user_id);
create index if not exists idx_orders_status         on public.orders (status);
create index if not exists idx_orders_payment_status on public.orders (payment_status);
create index if not exists idx_orders_placed_at      on public.orders (placed_at desc);
create index if not exists idx_order_items_order     on public.order_items (order_id);
create index if not exists idx_order_items_product   on public.order_items (product_id);
-- One reset token can only ever belong to one user (NULLs stay out of the index).
create index if not exists idx_users_reset_token on public.users (reset_token)
  where reset_token is not null;

-- ============================================================================
-- Triggers (keep updated_at fresh)
-- ============================================================================
create trigger trg_categories_updated_at before update on public.categories
  for each row execute function public.set_updated_at();
create trigger trg_products_updated_at before update on public.products
  for each row execute function public.set_updated_at();
create trigger trg_users_updated_at before update on public.users
  for each row execute function public.set_updated_at();
create trigger trg_addresses_updated_at before update on public.addresses
  for each row execute function public.set_updated_at();
create trigger trg_cart_updated_at before update on public.cart
  for each row execute function public.set_updated_at();
create trigger trg_cart_items_updated_at before update on public.cart_items
  for each row execute function public.set_updated_at();
create trigger trg_orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Row Level Security
--
-- Sprint 13A is a read-only foundation: the catalog is publicly readable, and
-- everything user-scoped is locked until authentication lands in a later
-- sprint. The backend uses the service-role key, which bypasses RLS.
-- ============================================================================
alter table public.categories   enable row level security;
alter table public.products     enable row level security;
alter table public.users        enable row level security;
alter table public.addresses    enable row level security;
alter table public.wishlist     enable row level security;
alter table public.cart         enable row level security;
alter table public.cart_items   enable row level security;
alter table public.orders       enable row level security;
alter table public.order_items  enable row level security;

create policy "categories_public_read" on public.categories
  for select using (is_active = true);
create policy "products_public_read" on public.products
  for select using (is_active = true);

-- Customer authentication (Sprint 21.1): defense-in-depth for the anon key —
-- a logged-in customer may read/update only their own account. The backend
-- writes through the service-role key, which bypasses RLS.
drop policy if exists "users_select_own" on public.users;
create policy "users_select_own" on public.users
  for select
  using (auth.uid() = id);

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own" on public.users
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Address book (Sprint 21.2): a customer may read/insert/update/delete only
-- their own addresses. The backend writes through the service-role key, which
-- bypasses RLS — these policies are defense-in-depth for the anon key.
drop policy if exists "addresses_select_own" on public.addresses;
create policy "addresses_select_own" on public.addresses
  for select
  using (auth.uid() = user_id);

drop policy if exists "addresses_insert_own" on public.addresses;
create policy "addresses_insert_own" on public.addresses
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "addresses_update_own" on public.addresses;
create policy "addresses_update_own" on public.addresses
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "addresses_delete_own" on public.addresses;
create policy "addresses_delete_own" on public.addresses
  for delete
  using (auth.uid() = user_id);

-- Exactly one default address per user (hard integrity under concurrency).
create unique index if not exists idx_addresses_one_default
  on public.addresses (user_id)
  where is_default = true;