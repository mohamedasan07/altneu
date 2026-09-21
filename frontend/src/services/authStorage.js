// ALTNEU — customer auth persistence.
// Stores the customer JWT + profile in localStorage so sessions survive
// refreshes. The token is read by services/api.js to attach the Bearer header
// on every API request; a 401 there clears storage centrally.

const OLD_LEGACY_TOKEN_KEY = 'unsorted_customer_token';
const OLD_LEGACY_USER_KEY = 'unsorted_customer_user';
const LEGACY_TOKEN_KEY = 'altnue_customer_token';
const LEGACY_USER_KEY = 'altnue_customer_user';
const TOKEN_KEY = 'altneu_customer_token';
const USER_KEY = 'altneu_customer_user';

/** Read the stored customer JWT. Never throws — null on any fault. */
export function getStoredToken() {
  try {
    let token = localStorage.getItem(TOKEN_KEY);
    if (token) return token;

    token = localStorage.getItem(LEGACY_TOKEN_KEY);
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      return token;
    }

    token = localStorage.getItem(OLD_LEGACY_TOKEN_KEY);
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      return token;
    }
    return null;
  } catch {
    return null;
  }
}

/** Read the cached customer profile. Never throws — null on any fault. */
export function getStoredUser() {
  try {
    let raw = localStorage.getItem(USER_KEY);
    if (raw) return JSON.parse(raw);

    raw = localStorage.getItem(LEGACY_USER_KEY);
    if (raw) {
      localStorage.setItem(USER_KEY, raw);
      return JSON.parse(raw);
    }

    raw = localStorage.getItem(OLD_LEGACY_USER_KEY);
    if (raw) {
      localStorage.setItem(USER_KEY, raw);
      return JSON.parse(raw);
    }
    return null;
  } catch {
    return null;
  }
}

/** Persist the token + profile (swallows storage failures). */
export function setAuthStorage(token, user) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(LEGACY_TOKEN_KEY, token);
      localStorage.setItem(OLD_LEGACY_TOKEN_KEY, token);
    }
    if (user) {
      const serialized = JSON.stringify(user);
      localStorage.setItem(USER_KEY, serialized);
      localStorage.setItem(LEGACY_USER_KEY, serialized);
      localStorage.setItem(OLD_LEGACY_USER_KEY, serialized);
    }
  } catch {
    /* storage unavailable — session runs in memory only */
  }
}

/** Remove the token + profile. */
export function clearAuthStorage() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    localStorage.removeItem(LEGACY_USER_KEY);
    localStorage.removeItem(OLD_LEGACY_TOKEN_KEY);
    localStorage.removeItem(OLD_LEGACY_USER_KEY);
  } catch {
    /* noop */
  }
}