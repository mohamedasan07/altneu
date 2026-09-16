---
name: unsorted-frontend-app
description: Conventions for the UNSORTED customer storefront (React 18 + Vite under frontend/). Use when adding/editing pages, components, contexts, hooks, or API service calls for the shopper-facing app. Covers the fetch API wrapper, auth/guest session storage, cart/wishlist contexts, routing, Cloudinary asset URLs, and the pricing constants mirrored with the backend.
license: MIT
compatibility: opencode
metadata:
  scope: unsorted
---

# UNSORTED Customer Frontend (`frontend/`)

React 18 + Vite 6 SPA (the shop customers use). Vanilla JS (no TypeScript).
Pages live in `frontend/src/pages/<Feature>Page/`, components in
`frontend/src/components/`, shared state in `frontend/src/context/`, data
fetching in `frontend/src/services/`, reusable logic in `frontend/src/hooks/`,
helpers in `frontend/src/utils/`.

## API access — `src/services/api.js`

- Use the shared `request(path, options)` wrapper for every network call. It
  auto-attaches the customer JWT (`Authorization: Bearer`) from auth storage,
  and on any 401 clears storage and dispatches `UNAUTHORIZED_EVENT` so
  `AuthContext` tears the session down. It parses `{ error }` / `{ detail }`
  from the backend error shape into `Error.message` / `err.detail`.
- `API_BASE` is `''` in dev (goes through the Vite proxy → localhost:3001) and
  `https://unsorted-backend.onrender.com` in production — never hardcode another
  URL.
- Each domain gets a thin service module: `products.js`, `cart.js`, `orders.js`,
  `wishlist.js`, `addresses.js`, `customerAuth.js`. Services return parsed
  data (e.g. `res.cart`, `data.order`) — components never see `fetch`.
- `resolveUrl(src)` maps legacy local image paths to their Cloudinary
  equivalent (`https://res.cloudinary.com/jtfzpgol/image/upload/unsorted/products/...`)
  and passes Cloudinary/data-URIs through unchanged. Use it for ANY image src.

## Auth & guest session state

- `src/services/authStorage.js` persists the customer JWT + profile in
  localStorage (`unsorted_customer_token`, `unsorted_customer_user`).
  Read via `getStoredToken()`/`getStoredUser()`, write via `setAuthStorage()`,
  clear via `clearAuthStorage()`.
- Guest carts: `src/services/cart.js` manages a guest `sessionId` in
  localStorage (`unsorted_cart_session_v1`) with `ensureGuestSessionId()` /
  `clearGuestSessionId()`. Authenticated customers omit it; guests send it in
  the body/query so the backend routes to the right cart.
- `AuthContext`/`useAuth`, `CartContext`/`useCart`, `WishlistContext`/`useWishlist`
  are the state homes; screens consume them through the matching hooks.

## Routing

- react-router-dom v6. Routes are defined in `src/App.jsx` /
  `src/router/`. Pages: Home, Collections, Product, Cart, Checkout,
  OrderSuccess, Orders, Wishlist, Login, Register, ForgotPassword,
  ResetPassword, Profile, Addresses, Settings, Dashboard, NotFound.

## Business constants (keep in sync with the backend!)

`src/utils/cartConfig.js` is the client-side mirror of backend validator
constants. When you change one side, change the other:

- `MAX_ITEM_QTY = 10`, sizes `XS–XXL`, colors `black/white/olive/rust` (+ display
  names), `DEFAULT_SIZE = 'M'`, `DEFAULT_COLOR = 'black'`.
- Free shipping ≥ ₹2499, flat ₹99, tax 5% GST. Coupons `WELCOME10` /
  `UNFILTERED15` (also duplicated in `useCheckout.js`).
- The backend recomputes ALL money server-side; the client only sends
  shipping/contact, delivery, payment method, coupon, notes, and an
  `idempotencyKey` (UUID) for double-submit protection.

## Checkout

- `src/hooks/useCheckout.js` is a frontend-only state machine (3 steps:
  Shipping → Payment → Review), validation via `src/utils/addressValidation.js`,
  and `placeOrder()` posting to the customer orders API. Success navigates to
  `/checkout/success` with the order in router state.
- Mirror the backend `computeOrderPricing` rules in `checkoutTotals()`.

## Development & build

- `npm run dev` (Vite, port 5173) — `/api` is proxied to `http://localhost:3001`.
- `npm run build` / `npm run preview` for production. No lint configured here.

## Rules

- Components stay presentational; data logic lives in hooks/services/contexts.
- Do not add new UI libraries — the stack is React, react-router-dom,
  framer-motion (motion helpers in `src/utils/motion.js`), and `cn()` from
  `src/utils/cn.js` for class merging.
- Preserve the existing visual language (premium streetwear aesthetic, dark
  theme via `ThemeContext`).