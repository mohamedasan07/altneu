import api from './api'

/**
 * Admin authentication API calls (Sprint 16).
 * Returns raw API data; storage/state handling stays in AuthContext.
 */

/**
 * POST /api/auth/login
 * @returns {Promise<{ token: string, admin: object }>}
 * @throws {Error} with a user-friendly message via normalizeAuthError.
 */
export async function login(email, password) {
  try {
    const { data } = await api.post('/auth/login', { email, password })
    if (!data || typeof data !== 'object' || !data.token || !data.admin) {
      throw new Error('Invalid authentication response from server')
    }
    return { token: data.token, admin: data.admin }
  } catch (error) {
    if (error?.message === 'Invalid authentication response from server') throw error
    throw normalizeAuthError(error)
  }
}

/**
 * GET /api/auth/me — current admin from a stored token (protected route).
 * @returns {Promise<object>} admin profile
 */
export async function getCurrentUser() {
  try {
    const { data } = await api.get('/auth/me')
    if (!data || typeof data !== 'object' || !data.admin) {
      throw new Error('Invalid session response from server')
    }
    return data.admin
  } catch (error) {
    if (error?.message === 'Invalid session response from server') throw error
    throw normalizeAuthError(error)
  }
}

/**
 * Logout. JWT auth is stateless — the backend holds no session to invalidate —
 * so this is intentionally a no-op server call; AuthContext clears local state.
 * Kept as a service function so the contract stays uniform for callers.
 */
export async function logout() {
  return Promise.resolve()
}

/**
 * Map an Axios error to a stable, user-facing message.
 *  - 401                -> invalid credentials
 *  - no server response -> connection failure
 *  - 5xx                -> unexpected server error
 */
export function normalizeAuthError(error) {
  if (error.response) {
    const { status, data } = error.response
    if (status === 401) return new Error('Invalid email or password')
    if (status >= 500) return new Error('Unexpected server error')
    return new Error(data?.error || 'Something went wrong. Please try again.')
  }
  if (error.request) {
    return new Error('Unable to connect to server')
  }
  return new Error('Something went wrong. Please try again.')
}
