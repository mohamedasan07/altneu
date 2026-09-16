---
name: unsorted-admin-app
description: Conventions for the UNSORTED admin dashboard (React 19 + Vite under admin-frontend/). Use when adding/editing admin pages, axios API services, auth handling, or dashboard charts. Covers the shared axios instance and interceptors, per-domain services, admin JWT storage, routing/layout, and ESLint/build commands.
license: MIT
compatibility: opencode
metadata:
  scope: unsorted
---

# UNSORTED Admin Frontend (`admin-frontend/`)

React 19 + Vite 8 SPA for store administrators. Uses axios (not fetch), plain
JS, ESLint configured. Deploys to Vercel (no deployment config in-repo; set
`VITE_API_URL` in a local `.env` for development, e.g.
`http://localhost:3001/api`).

## API access — `src/services/api.js`

- A single shared axios instance is the ONLY way to call the backend:
  `baseURL = import.meta.env.VITE_API_URL || '/api'`, JSON content type.
- Request interceptor: attaches `Authorization: Bearer <token>` from
  `src/utils/storage` when a token exists and marks the request `_hasAuth`;
  for `FormData` payloads it deletes the JSON content-type so the browser sets
  the multipart boundary (needed for product image uploads).
- Response interceptor: any 401 on an auth-carrying request calls the handler
  registered via `setUnauthorizedHandler(...)` (wired by `AuthContext`) so the
  admin session is torn down. The login endpoint is excluded (failed sign-in is
  a form error, not a session expiry).
- Per-domain service modules in `src/services/`: `product.service.js`,
  `order.service.js`, `customer.service.js`, `dashboard.service.js`,
  `upload.service.js`, `auth.service.js`.

## Auth

- Admin JWT persisted by `src/utils/storage` (see `authContext.js` /
  `AuthContext.jsx`). Login page at `src/pages/Login/`.
- The backend verifies admin tokens via the shared `authorize('admin')`
  middleware; admin claims land on `req.admin`. Customer tokens are separate
  and never accepted on admin routes.

## Routing & layout

- Routes are centralized in `src/routes/AppRoutes.jsx`; the app shell/layout in
  `src/layouts/`. Pages: Login, Dashboard, Products, Orders, Customers,
  Analytics, Settings. Product image uploads go through `upload.service.js`
  (multipart → backend `/api/upload` → Cloudinary).

## Dashboard & analytics

- Charts use recharts (`src/pages/Dashboard/`, `src/pages/Analytics/`).
  Data comes from `dashboard.service.js` (`/api/admin/dashboard/*`) and
  `order.service.js`; metrics include orders, revenue, top products,
  customer counts.

## Development & build

- `npm run dev` (Vite), `npm run build`, `npm run preview`.
- `npm run lint` runs ESLint — run it before finishing changes; keep it clean.

## Rules

- Use the shared axios instance and interceptors; never add raw `fetch`.
- Keep the admin design system as-is (dark admin theme, sidebar layout,
  react-icons for icons).
- Backend responses use `{ ok, ... }`/`{ success, ... }` shapes — normalize
  them in the service modules, not inside page components.
- Do not introduce TypeScript or new state libraries; the codebase is plain JS
  with hooks/context.