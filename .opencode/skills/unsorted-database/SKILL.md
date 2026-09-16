---
name: unsorted-database
description: The UNSORTED Supabase/PostgreSQL schema and data-access conventions. Use when writing SQL, adding tables/columns/migrations, writing or debugging repository queries, reviewing RLS policies, or troubleshooting schema/constraint/index issues. Documents tables, columns, FK behavior, constraints, indexes, triggers, and the migration workflow.
license: MIT
compatibility: opencode
metadata:
  scope: unsorted
---

# UNSORTED Database (Supabase / PostgreSQL 15+)

The database is Supabase PostgreSQL. There is NO MongoDB, NO `db.json`, NO
filesystem persistence. The backend talks to it through `@supabase/supabase-js`
via `backend/database/client.js` (lazy singleton; prefers the service-role key,
falls back to anon; returns `null` when unconfigured).

## Source of truth

- `backend/database/schema.sql` — canonical "current state" of the schema
  (reference / full rebuild).
- `backend/database/migrations/NNN_*.sql` — idempotent, applied incrementally
  (`IF NOT EXISTS`, safe to re-run).
- Apply with: `psql "$SUPABASE_DB_URL" -f backend/database/migrations/NNN_x.sql`.
- When changing the schema, ALWAYS update BOTH a new migration file AND
  `schema.sql` so the two never drift.

## Tables

| Table | PK | Key columns / notes |
|---|---|---|
| `categories` | `bigint identity` | `name`, `slug` (unique), `image_url`, `is_active`, `sort_order` |
| `products` | `bigint identity` | `category_id` FK (set null), `name`, `slug` (unique), `price`/`old_price` `numeric(12,2)` ≥ 0, `image_url`, `image_gallery` jsonb, `stock_quantity` ≥ 0, `is_sale`, `is_new`, `is_active`, `rating` 0–5, `rating_count` |
| `users` | `uuid` (`gen_random_uuid()`) | `email` citext unique, `password_hash` (bcrypt), `role` check (`customer`/`admin`), `reset_token` + `reset_token_expires_at` (stores SHA-256 of the code) |
| `addresses` | `uuid` | `user_id` FK (cascade), name/phone/address/city/state/pincode/country, `is_default` (one default per user via partial unique index) |
| `wishlist` | `uuid` | `user_id` FK (cascade), `product_id` FK (cascade), unique `(user_id, product_id)` |
| `cart` | `uuid` | `user_id` FK (cascade) XOR `session_id` text (CHECK requires at least one), `status` check (`active`/`abandoned`/`checked_out`) |
| `cart_items` | `uuid` | `cart_id` FK (cascade), `product_id` FK (cascade), `size`/`color`/`color_name`, `quantity` > 0, unique `(cart_id, product_id, size, color)` — duplicate insert = `23505` |
| `orders` | `uuid` | `user_id` FK (set null), `order_number` unique, `status` check (pending/confirmed/processing/shipped/delivered/cancelled/refunded), `payment_status` check (pending/paid/failed/refunded), `payment_method`, money columns ≥ 0, `currency` (INR), `coupon_code`, `shipping_address` jsonb + `contact` jsonb snapshots, `placed_at` |
| `order_items` | `uuid` | `order_id` FK (cascade), `product_id` FK (set null), `name` + `price_at_order` snapshot (price at purchase time), `quantity` > 0 |

## Shared conventions

- `updated_at` is maintained by the `set_updated_at()` trigger function, one
  trigger per table. Never set `updated_at` manually in queries.
- Indexes exist on every FK and hot query column (products category/active,
  orders user/status/payment_status/placed_at, cart user/session, etc.) — new
  queries should reuse them, not scan.
- RLS is enabled on every table. The backend writes via the service-role key
  which BYPASSES RLS; policies (`users_*_own`, `addresses_*_own`,
  `products_public_read`, `categories_public_read`) are defense-in-depth for
  the anon key. Public catalog: `is_active = true` only.

## Repository query patterns (`backend/repositories/*.repository.js`)

- `getSupabase()` first; bail with `{ ok: false, reason: 'not-configured' }` if null.
- Always `.select(...)` explicit column projections (constants at top of file)
  so queries stay fast and shape changes are centralized.
- Use `.single()` for insert/update returning one row, `.maybeSingle()` for
  optional singletons, `.eq(...).order(...).limit(...)` for "latest" lookups.
- Nested joins use the foreign-object syntax: `.select('id, cart_id, product:products (id, name, price, stock_quantity)')` — the result nests under `product`.
- Return the envelope `{ ok: true, data }` / `{ ok: false, reason, code }`.
  The `code` field carries PostgreSQL error codes (`23505` unique violation)
  which services use for idempotent retry logic.
- Every query is scoped by owner (`.eq('user_id', id)`, `.eq('cart_id', id)`)
  — ownership guards live in the query, not just in app logic.

## Writing migrations

- One new file per change, numbered above the latest (`004_...`), idempotent
  (`create table if not exists`, `create index if not exists`).
- Use `alter table ... enable row level security` + matching policies for any
  new user-scoped table.
- Add `updated_at` trigger for tables that need it.
- Keep `schema.sql` in sync with the same DDL.