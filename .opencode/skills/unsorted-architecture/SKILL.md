---
name: unsorted-architecture
description: Master map of the UNSORTED e-commerce monorepo (customer frontend, admin dashboard, Express+Supabase backend). Read this FIRST before any feature, bug fix, or refactor to learn where code lives, how the layers connect, and the cross-cutting conventions. Covers the routes→controllers→services→repositories→Supabase flow, JWT auth model, pricing rules, deployments, and the sprint workflow.
license: MIT
compatibility: opencode
metadata:
  scope: unsorted
---

# UNSORTED Architecture

Premium streetwear store ("UNSORTED — For the Unfiltered"). Monorepo, no root
`package.json` — each app manages its own scripts. Read this skill before
working anywhere in this repository; the layer skills
(`unsorted-backend-api`, `unsorted-database`, `unsorted-frontend-app`,
`unsorted-admin-app`, `unsorted-payments`) expand on the conventions here.

## Repository layout

| Area | Location | Stack | Notes |
|---|---|---|---|
| Customer storefront | `frontend/` | React 18 + Vite, react-router-dom, framer-motion | SPA; dev proxy `/api` → `localhost:3001` |
| Admin dashboard | `admin-frontend/` | React 19 + Vite, axios, recharts, react-icons | `VITE_API_URL` from local `.env`; ESLint configured |
| Backend API | `backend/` | Express 4, ESM (`"type": "module"`), Node | Entry `server.js`, port `3001` |
| Database | Supabase (PostgreSQL 15+) | `@supabase/supabase-js` | Schema in `backend/database/` |
| Legacy single-page site | repo root | `index.html`, `style.css`, `script.js`, `checkout_patch.js`, `razorpay_checkout.js` | Served by the backend as static files |

## Backend layering (strict, single consistent flow)

```
routes → controllers → services → repositories → Supabase
          ↓                ↓             ↓
       validators      business logic   data access
```

- **Routes** (`backend/routes/`) — thin Express routers. Define HTTP methods,
  mount auth middleware (`authorize`, `optionalAuth`), wrap async handlers with
  `asyncHandler`. New routers register once in `routes/index.js`.
- **Controllers** (`backend/controllers/`) — thin HTTP handlers. Parse/validate
  requests, resolve the acting principal, delegate to services, shape JSON
  responses. No business logic, no SQL.
- **Services** (`backend/services/`) — all business logic: stock rules, pricing,
  status transitions, idempotency, merge/compensation. Throw `ApiError`.
- **Repositories** (`backend/repositories/`) — the ONLY layer that talks to
  Supabase. Every method returns the shared result envelope:
  `{ ok: true, data }` or `{ ok: false, reason, code? }`. Callers never touch
  Supabase error objects.
- **Validators** (`backend/validators/`) — single source of truth for accepted
  request payloads and server-side pricing. Throw `ApiError(400, message)` with
  joined, human-readable errors.
- **Middleware** (`backend/middleware/`) — `auth.middleware.js` (JWT),
  `errorHandler.js` (mounted last, 4-arg), `notFound.js` (JSON 404 for /api).
- **Utils** (`backend/utils/`) — `ApiError` (typed HTTP error, `expose: true`),
  `asyncHandler` (forwards rejected promises to error middleware), `logger`
  (leveled `[unsorted]` console logger).

## Data model (see `unsorted-database`)

Tables: `categories`, `products`, `users`, `addresses`, `wishlist`, `cart`,
`cart_items`, `orders`, `order_items`. Identity PKs for the catalog, UUID PKs
for user-scoped tables. RLS enabled; the backend writes through the
service-role key (bypasses RLS), anon-key policies are defense-in-depth.

## Authentication model

- Two token families, one JWT secret (`JWT_SECRET`, no default — fails loudly).
- **Admin JWT** → decoded claims land on `req.admin` (`id`, `name`, `email`,
  `role`). Issued by `POST /api/auth/login` (bcrypt when `ADMIN_PASSWORD_HASH`
  is set, else plaintext `ADMIN_PASSWORD` fallback).
- **Customer JWT** → decoded claims land on `req.user` (`id`, `email`,
  `firstName`, `lastName`, `role`). Issued by `POST /api/customer/auth/*`
  (register/login), default 7d lifetime.
- Guards: `authorize('admin', 'customer', ...)`, backward-compat `verifyAdmin`,
  and `optionalAuth` (authenticated customers OR guests, e.g. cart API).
- Every customer-scoped query is additionally scoped by the resolved owner
  (user id or guest `sessionId`) at the service/repository layer.

## Pricing & business constants

- Currency: INR. All money is `numeric(12,2)`; the client NEVER sends totals —
  the service recomputes every value from database prices.
- Free shipping ≥ ₹2499; flat ₹99 standard; ₹199 express; pickup free.
- GST 5%. Coupons: `WELCOME10` (10%), `UNFILTERED15` (15%).
- Cart max quantity per line: 10. Sizes `XS–XXL`; colors `black/white/olive/rust`
  with display names. Constants are mirrored between
  `frontend/src/utils/cartConfig.js` and `backend/validators/*.validator.js` —
  keep them in sync.

## Deployment

- Backend: Render (`https://unsorted-backend.onrender.com`).
- Frontends: Vercel. `vercel.json` at repo root rewrites `/api/(.*)` to the
  Render backend.
- Dev: backend on `:3001`, frontends on Vite ports (5173, 5174). CORS allows
  any localhost origin in dev; in production only origins in `CORS_ORIGINS`.

## Workflow

Work proceeds in sprints. Each sprint starts with a read-only audit document
(`SPRINT_*_AUDIT.md`) that maps the baseline and implementation plan; then the
feature lands as a commit like `feat: complete Sprint 22.4 wishlist management`.
When starting work, check the latest audit doc and `git log` first.

## Cross-cutting rules

- Never trust client quantities, prices, or totals — re-derive server-side.
- Never read `process.env` outside `backend/config/env.js`.
- Never commit secrets. `.env` files exist locally and are gitignored.
- Do not modify generated artifacts (`node_modules/`, `dist/`, logs).
- Ownership scoping on every user-scoped query/endpoint.