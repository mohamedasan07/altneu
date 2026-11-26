// Customer auth API calls (Sprint 21.1 backend). Returns raw API data;
// storage/state handling stays in AuthContext.

import { request } from './api';

/** POST /api/customer/auth/login — authenticate a customer, issue a JWT. */
export async function loginCustomer({ email, password }) {
  const data = await request('/api/customer/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return { token: data.token, user: data.user };
}

/** POST /api/customer/auth/register — create a customer account. */
export async function registerCustomer(details) {
  const data = await request('/api/customer/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      firstName: details.firstName,
      lastName: details.lastName,
      email: details.email,
      phone: details.phone ?? '',
      password: details.password,
    }),
  });
  return { token: data.token, user: data.user };
}

/** GET /api/customer/auth/me — restore the current customer from a token. */
export async function fetchCurrentCustomer(tokenOverride) {
  const options = tokenOverride
    ? { headers: { Authorization: `Bearer ${tokenOverride}` } }
    : {};
  const data = await request('/api/customer/auth/me', options);
  return data.user;
}

/** PUT /api/customer/profile — update the editable profile fields. */
export async function updateCustomerProfile(patch) {
  const data = await request('/api/customer/profile', {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
  return { token: data.token, user: data.user };
}

/** POST /api/customer/auth/forgot-password — request a reset link. */
export async function requestPasswordReset(email) {
  const data = await request('/api/customer/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  return data; // { success: true, devResetUrl?: string }
}

/** POST /api/customer/auth/reset-password — set a new password from a token. */
export async function confirmPasswordReset(token, password) {
  return request('/api/customer/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
}