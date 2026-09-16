---
name: unsorted-payments
description: Payment state and how to wire Razorpay into the UNSORTED storefront + backend. Use when working on checkout payments, payment_status transitions, Razorpay order creation, signature verification, or payment webhooks. Documents the CURRENT state (Razorpay disabled; COD/card/UPI/netbanking recorded as pending) and the secure integration pattern the existing idempotency + stock-reservation code was built for.
license: MIT
compatibility: opencode
metadata:
  scope: unsorted
---

# UNSORTED Payments & Razorpay Integration

## Current state (verified in the repository)

- **Razorpay is NOT live.** The checkout flow records the chosen payment method
  and leaves `payment_status = 'pending'`; no money is captured.
- Customer checkout (`frontend/src/hooks/useCheckout.js`) offers
  `card`, `upi`, `netbanking`, `cod`. `razorpay` is listed but
  `{ disabled: true, note: 'Coming soon' }`.
- Backend order validator (`backend/validators/order.validator.js`) whitelists
  only `PAYMENT_METHODS = ['card', 'upi', 'netbanking', 'cod']` — a `razorpay`
  value is rejected with 400. `PAYMENT_METHODS` is the gate to flip when
  enabling payments.
- Orders store `payment_method` + `payment_status` (`pending|paid|failed|refunded`)
  in the `orders` table (CHECK-constrained in `backend/database/schema.sql`).
- `backend/routes/adminOrder.routes.js` + `backend/services/adminOrder.service.js`
  let admins view/update order + payment status.
- Legacy `razorpay_checkout.js` at the repo root is a client-side-only demo
  (no server order creation, no signature verification) — reference only.

## What already supports payments (build on this, don't rework it)

- **Idempotency**: `placeOrder` folds the client `idempotencyKey` into a
  deterministic `order_number` (`US-YYYYMMDD-XXXXXXXX`), replays on retry, and
  handles the unique-violation race (`23505`). A payment retry with the same
  key resolves to the same order.
- **Stock reservation**: orders decrement stock with conditional CAS per line
  and compensate (restore stock + delete the order) on any later failure. A
  successful payment only needs to flip `payment_status` — stock is already
  reserved from placement.
- **Server-side pricing**: all totals are computed from database prices
  (INR, paise = ₹ × 100). Never trust client amounts.

## Enabling Razorpay (when the sprint lands)

1. Backend: add `razorpay` to `PAYMENT_METHODS` in the order validator.
2. Backend: create the order server-side with the Razorpay Orders API
   (amount in paise, currency INR, `receipt` = the order's `order_number`).
   Store `razorpay_order_id` on the order.
3. Backend: add a verify endpoint — `POST /api/customer/orders/:id/pay/verify`
   that checks the Razorpay signature
   (`crypto.createHmac('sha256', RAZORPAY_KEY_SECRET).update(order_id + '|' + payment_id).digest('hex')`
   against `razorpay_signature`) and sets `payment_status = 'paid'`.
4. Backend: add a webhook endpoint for async events (payment captured,
   failed) with signature verification + replay protection; reconcile
   `payment_status` and update admin views.
5. Frontend: load `https://checkout.razorpay.com/v1/checkout.js` on demand,
   open the checkout with `key` + server `order_id` (never pass client
   amounts as the source of truth), handle `payment.failed`, and call the
   verify endpoint in the `handler` callback.
6. Keep the existing idempotency key tied to the payment flow so retries
   cannot double-charge; on `paid`, mark the cart `checked_out` if not already.

## Security rules

- Signature verification MUST happen server-side; never trust the browser
  callback alone.
- Store only the Razorpay key ID client-side; keep the key SECRET in
  `backend/.env` (accessed via `backend/config/env.js` + `config/index.js`
  conventions — never inline).
- Log payment events through `backend/utils/logger.js`; never log full card
  numbers or signatures.
- Follow the `unsorted-backend-api` skill for any new endpoint layout.