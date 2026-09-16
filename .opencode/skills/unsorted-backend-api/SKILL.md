---
name: unsorted-backend-api
description: How to add or modify an Express API endpoint in the UNSORTED backend following its exact 5-layer conventions (routes → controllers → services → repositories → validators → Supabase). Use when creating/changing any /api endpoint, fixing a backend bug, or adding a customer/admin feature. Includes the result envelope, ApiError, ownership scoping, and money-handling rules.
license: MIT
compatibility: opencode
metadata:
  scope: unsorted
---

# UNSORTED Backend API — Adding & Editing Endpoints

Everything lives under `backend/` (ESM, Express 4). Always follow the existing
patterns — read one complete vertical slice first (cart is the best example:
`routes/cart.routes.js` → `controllers/cart.controller.js` →
`services/cart.service.js` → `repositories/cart.repository.js` →
`validators/cart.validator.js`).

## File layout per feature

A feature spans five files plus one registration line:

| Layer | File | Responsibility |
|---|---|---|
| Routes | `backend/routes/<name>.routes.js` | HTTP verbs, auth middleware, `asyncHandler` |
| Controller | `backend/controllers/<name>.controller.js` | Parse, resolve principal, call service, shape response |
| Service | `backend/services/<name>.service.js` | Business logic, throws `ApiError` |
| Repository | `backend/repositories/<name>.repository.js` | Supabase queries only |
| Validator | `backend/validators/<name>.validator.js` | Payload validation + server-side pricing constants |

Register the router once in `backend/routes/index.js` with the correct mount
path (e.g. `apiRouter.use('/customer/cart', cartRoutes)`).

## Route conventions

- Use `Router()` and export default. Document the mounted path and routes in a
  header comment (every route module does this).
- Async handlers MUST be wrapped in `asyncHandler(...)` so rejections reach the
  centralized `errorHandler` instead of crashing the process.
- Auth: `authorize('admin')`, `authorize('customer')`, or `optionalAuth` (for
  guest + authenticated endpoints like the cart). Apply at the router level
  with `router.use(...)` when every route shares it.
- Route-level comments should state the endpoint, auth, and behavior contract.

## Controller conventions

- Keep handlers thin. Signature `(req, res)`, return/`res.json(...)` the
  response; throw `ApiError` for expected failures.
- Resolve the acting principal explicitly (e.g. a `resolveOwner(req)` helper:
  `req.user?.id` wins, else guest `sessionId` from body/query).
- Response shapes are `{ success: true, <resource> }` (customer API) or
  `{ ok, ... }` (admin/product API) — match the existing module's convention.

## Service conventions

- Import repository functions and validators; do NOT import `getSupabase`
  here — services never touch the database directly.
- Every DB failure becomes a consistent 500: use the per-module `toDbError`
  helper (`logger.error` + `new ApiError(500, 'Unable to <action>. Please try again.')`
  with `err.detail = result?.reason`).
- Normalize rows to the public API shape (snake_case DB → camelCase JSON) and
  compute derived values (totals, counts) here — never in the controller.
- Enforce business rules in this layer: active product checks, stock clamping,
  quantity caps (`MAX_ITEM_QTY`), ownership (`userId`/`sessionId`) scoping,
  idempotency, and any compensating rollback.
- Never trust client money: recompute prices/totals from database rows.

## Repository conventions

- `import { getSupabase } from '../database/client.js'`; return
  `{ ok: false, reason: 'not-configured' }` when it's `null`.
- Every method returns the envelope `{ ok: true, data }` /
  `{ ok: false, reason, code? }`. Surface `error.message` as `reason` and
  `error.code` as `code` (Supabase error codes like `23505` for unique
  violations are meaningful to services).
- Use column projections (constant strings) and `.select(...).eq(...).single()`
  / `.maybeSingle()` for singletons; `.order(...)` for lists.
- Scope EVERY user query by the owner (`.eq('user_id', ...)` or
  `.eq('cart_id', ...)` etc.) so no caller can read/mutate another user's rows.
- For joined product data (cart items, order items), select a nested
  `product:products (...)` projection and let the service normalize it.

## Validator conventions

- Export named validate functions per operation
  (e.g. `validateAddItemPayload`, `validateUpdateQuantityPayload`) plus any
  path-param parsers (`parseOrderId`, `parseSessionId`) and constants
  (`MAX_ITEM_QTY`, `DELIVERY_OPTIONS`, `CURRENCY`, `COUPONS`).
- Collect errors into an array and throw `ApiError(400, errors.join('; '))`.
- Validation covers presence, format (regexes), and allowed-value whitelists.
- Server-side pricing/compute helpers (e.g. `computeOrderPricing`) also live
  here so the discount/shipping/tax rules have one source of truth.
- Stock availability is NOT validated here — that needs a product lookup, so
  services do it against the database.

## Error handling

- `ApiError(status, message)` sets `expose = true` so `errorHandler` returns the
  real message. Use statuses 400 (bad input), 401 (auth), 403 (forbidden),
  404 (missing/ownership violation), 409/500 for DB issues.
- `errorHandler` (mounted last in `server.js`) renders `{ error }` and, in
  development only, `{ detail }`. Keep its 4-arg signature.

## Adding a new endpoint — checklist

1. Read the nearest existing vertical slice (cart/order/wishlist) for the pattern.
2. Add the validator functions + constants; export them.
3. Add repository methods (envelope + scoping) — only layer touching Supabase.
4. Add service functions with business rules and normalization.
5. Add controller handlers that resolve the principal and call the service.
6. Add the route module with auth + `asyncHandler`, register in `routes/index.js`.
7. Verify with `npm run dev` in `backend/` (port 3001) and `curl` the endpoint.