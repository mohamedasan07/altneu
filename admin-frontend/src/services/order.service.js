import api from './api'

/**
 * Admin order API calls (Sprint 22.1 Phase 3–4).
 * Reuses the shared Axios instance (services/api.js) — no fetch() in
 * components, and the JWT is attached automatically by the interceptor.
 *
 * Backend endpoints consumed (exactly as they exist):
 *   GET    /admin/orders     → { success, orders, pagination { page, limit, total, totalPages } }
 *   GET    /admin/orders/:id → { success, order }
 *   PATCH  /admin/orders/:id/status  → { success, order }   body { status }
 *   PATCH  /admin/orders/:id/payment → { success, order }   body { paymentStatus }
 *
 * The list is server-side (page / limit / search / status / paymentStatus /
 * sort / order) — mirroring backend/validators/adminOrder.validator.js. The
 * PATCH helpers resolve to the freshly updated order, which the UI treats as
 * the source of truth (no optimistic mutations).
 */

function normalizeError(error) {
  if (error.response) {
    const { status, data } = error.response
    if (status >= 500) return new Error('Server error. Please try again.')
    return new Error(data?.error || 'Something went wrong. Please try again.')
  }
  if (error.request) return new Error('Unable to connect to server')
  return new Error('Something went wrong. Please try again.')
}

const EMPTY_PAGINATION = { page: 1, limit: 10, total: 0, totalPages: 1 }

/**
 * GET /admin/orders — paginated, filtered, sorted order list.
 * Undefined params are dropped by axios, so "all" filters are omitted.
 * @param {{ page?: number, limit?: number, search?: string, status?: string,
 *           paymentStatus?: string, sort?: string, order?: string }} params
 * @returns {Promise<{ orders: Array, pagination: object }>}
 */
export async function listOrders(params = {}) {
  try {
    const { data } = await api.get('/admin/orders', { params })
    return {
      orders: Array.isArray(data?.orders) ? data.orders : [],
      pagination: data?.pagination || EMPTY_PAGINATION,
    }
  } catch (error) {
    throw normalizeError(error)
  }
}

/** GET /admin/orders/:id — a single order with items and timestamps. */
export async function getOrder(id) {
  try {
    const { data } = await api.get(`/admin/orders/${id}`)
    return data?.order ?? data
  } catch (error) {
    throw normalizeError(error)
  }
}

/**
 * PATCH /admin/orders/:id/status — set the fulfilment status.
 * Resolves to the freshly updated order (backend response = source of truth).
 * @param {string} id
 * @param {string} status  one of ORDER_STATUS_META's keys
 */
export async function updateOrderStatus(id, status) {
  try {
    const { data } = await api.patch(`/admin/orders/${id}/status`, { status })
    return data?.order ?? data
  } catch (error) {
    throw normalizeError(error)
  }
}

/**
 * PATCH /admin/orders/:id/payment — set the payment status.
 * Resolves to the freshly updated order (backend response = source of truth).
 * @param {string} id
 * @param {string} paymentStatus  one of PAYMENT_STATUS_META's keys
 */
export async function updateOrderPaymentStatus(id, paymentStatus) {
  try {
    const { data } = await api.patch(`/admin/orders/${id}/payment`, {
      paymentStatus,
    })
    return data?.order ?? data
  } catch (error) {
    throw normalizeError(error)
  }
}

/**
 * PATCH /admin/orders/:id/tracking — set the tracking data.
 * @param {string} id
 * @param {object} trackingData
 */
export async function updateOrderTracking(id, trackingData) {
  try {
    const { data } = await api.patch(`/admin/orders/${id}/tracking`, trackingData)
    return data?.order ?? data
  } catch (error) {
    throw normalizeError(error)
  }
}