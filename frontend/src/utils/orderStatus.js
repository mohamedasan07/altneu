// ALTNEU — order status helpers (Sprint 22.5 Phase 3).
//
// Single source of truth for which order statuses a customer may cancel in the
// storefront. Ordinary self-service cancellation is disabled per ALTNEU policy.
// Customers may contact support for order issues or statutory remedies.

/** Statuses a customer may cancel before fulfilment begins. Disabled per store policy. */
export const CANCELLABLE_STATUSES = [];

/** True when the order status offers customer self-service cancellation. */
export function canCancelOrder(status) {
  return CANCELLABLE_STATUSES.includes(status);
}