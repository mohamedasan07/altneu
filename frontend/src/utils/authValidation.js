// ALTNEU — auth form validation helpers.
// Pure functions that return a field-keyed errors map. Empty object = valid.

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PASSWORD_MIN = 8;
const NAME_RE = /^[a-zA-Z][a-zA-Z\s'.-]{1,}$/;
const PHONE_RE = /^[+()\d][\s\d()-]{6,16}$/;

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function validateEmail(email) {
  if (!email || !email.trim()) return 'Email is required.';
  if (!EMAIL_RE.test(email.trim())) return 'Enter a valid email address.';
  return '';
}

export function validatePassword(password) {
  if (!password) return 'Password is required.';
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters.`;
  return '';
}

export function validateLogin(values) {
  const errors = {};
  const emailError = validateEmail(values.email);
  if (emailError) errors.email = emailError;
  if (!values.password) errors.password = 'Password is required.';
  return errors;
}

export function validateRegister(values) {
  const errors = {};

  if (!values.firstName || !values.firstName.trim()) {
    errors.firstName = 'First name is required.';
  } else if (!NAME_RE.test(values.firstName.trim())) {
    errors.firstName = 'First name looks invalid.';
  }

  if (!values.lastName || !values.lastName.trim()) {
    errors.lastName = 'Last name is required.';
  } else if (!NAME_RE.test(values.lastName.trim())) {
    errors.lastName = 'Last name looks invalid.';
  }

  const emailError = validateEmail(values.email);
  if (emailError) errors.email = emailError;

  if (!values.phone || !values.phone.trim()) {
    errors.phone = 'Phone number is required.';
  } else if (!PHONE_RE.test(values.phone.trim())) {
    errors.phone = 'Enter a valid phone number.';
  }

  const passwordError = validatePassword(values.password);
  if (passwordError) {
    errors.password = passwordError;
  } else if (values.password !== values.confirmPassword) {
    errors.confirmPassword = 'Passwords do not match.';
  }

  if (!values.terms) errors.terms = 'You must accept the terms to continue.';

  return errors;
}

export function validateForgot(values) {
  const errors = {};
  const emailError = validateEmail(values.email);
  if (emailError) errors.email = emailError;
  return errors;
}