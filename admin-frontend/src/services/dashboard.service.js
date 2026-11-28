import api from './api'

/**
 * Admin dashboard API calls (Sprint 22.2 Phase 2).
 * Reuses the shared Axios instance (services/api.js) — no fetch() in
 * components, and the JWT is attached automatically by the interceptor.
 *
 * Backend endpoint consumed (exactly as it exists):
 *   GET /admin/dashboard -> aggregate payload for the dashboard page:
 *   { success, stats, salesOverview, recentOrders, lowStockProducts,
 *     recentActivity, bestSellers, latestCustomers }
 *
 * bestSellers / latestCustomers are returned by the aggregate but are not
 * rendered by the dashboard (bestSellers backs the Analytics page since
 * Sprint 22.6; latestCustomers remains available for a future page). The
 * payload is passed through untouched so callers decide.
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

const EMPTY_DASHBOARD = {
  stats: {},
  salesOverview: [],
  recentOrders: [],
  lowStockProducts: [],
  recentActivity: [],
  bestSellers: [],
  latestCustomers: [],
}

function assertPlainObject(data, context = 'dashboard') {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`Invalid ${context} response from server`)
  }
}

/** GET /admin/dashboard — full aggregate payload for the dashboard page. */
export async function getDashboard() {
  try {
    const { data } = await api.get('/admin/dashboard')
    assertPlainObject(data, 'dashboard')
    if (!data.stats || typeof data.stats !== 'object' || Array.isArray(data.stats)) {
      throw new Error('Invalid dashboard stats response from server')
    }
    return {
      ...EMPTY_DASHBOARD,
      ...data,
    }
  } catch (error) {
    if (error?.message?.startsWith('Invalid dashboard')) throw error
    throw normalizeError(error)
  }
}

/**
 * Granular endpoints (Sprint 22.6) — the same service functions the aggregate
 * composes, exposed so the Analytics page can fetch exactly what it renders
 * and re-fetch the sales trend on range changes without reloading everything.
 * Each returns only its slice of the payload; errors normalize identically.
 */

const EMPTY_STATS = {
  stats: {},
  salesOverview: [],
}

/** GET /admin/dashboard/stats — stat cards (+ breakdowns/AOV) + 6-month trend. */
export async function getStats() {
  try {
    const { data } = await api.get('/admin/dashboard/stats')
    assertPlainObject(data, 'dashboard stats')
    return {
      ...EMPTY_STATS,
      ...data,
    }
  } catch (error) {
    if (error?.message?.startsWith('Invalid dashboard')) throw error
    throw normalizeError(error)
  }
}

/** GET /admin/dashboard/sales?months=N — monthly revenue/orders trend. */
export async function getSalesOverview(months = 6) {
  try {
    const { data } = await api.get('/admin/dashboard/sales', {
      params: { months },
    })
    return Array.isArray(data?.salesOverview) ? data.salesOverview : []
  } catch (error) {
    throw normalizeError(error)
  }
}

const EMPTY_RECENT_ORDERS = []

/** GET /admin/dashboard/recent-orders?limit=N — newest orders with items. */
export async function getRecentOrders(limit = 5) {
  try {
    const { data } = await api.get('/admin/dashboard/recent-orders', {
      params: { limit },
    })
    return Array.isArray(data?.recentOrders) ? data.recentOrders : EMPTY_RECENT_ORDERS
  } catch (error) {
    throw normalizeError(error)
  }
}

const EMPTY_LOW_STOCK = []

/** GET /admin/dashboard/low-stock — active products at/below threshold. */
export async function getLowStockProducts({ threshold, limit } = {}) {
  try {
    const { data } = await api.get('/admin/dashboard/low-stock', {
      params: { threshold, limit },
    })
    return Array.isArray(data?.lowStockProducts) ? data.lowStockProducts : EMPTY_LOW_STOCK
  } catch (error) {
    throw normalizeError(error)
  }
}

const EMPTY_BEST_SELLERS = []

/** GET /admin/dashboard/best-sellers?limit=N — top products by units sold. */
export async function getBestSellers(limit = 5) {
  try {
    const { data } = await api.get('/admin/dashboard/best-sellers', {
      params: { limit },
    })
    return Array.isArray(data?.bestSellers) ? data.bestSellers : EMPTY_BEST_SELLERS
  } catch (error) {
    throw normalizeError(error)
  }
}