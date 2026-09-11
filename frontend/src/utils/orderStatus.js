// ALTNEU — order status helpers (Sprint 22.5 Phase 3).
//
// Single source of truth for which order statuses a customer may cancel in the
// storefront. This is a UI gating hint only — the backend is the final
// authority and re-validates ownership, status and idempotency on every PATCH.

/** Statuses a customer may cancel before fulfilment begins. */
export const CANCELLABLE_STATUSES = ['pending', 'confirmed', 'processing'];

/** True when the order status offers customer self-service cancellation. */
export function canCancelOrder(status) {
  return CANCELLABLE_STATUSES.includes(status);
}