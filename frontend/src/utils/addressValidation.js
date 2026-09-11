// ALTNEU — shared shipping-address validation.
// Single source of truth for address rules used by the address book
// (AddressModal) AND the checkout shipping form (useCheckout), so the two can
// never drift. The backend mirrors these rules in
// backend/validators/address.validator.js.

export const CountriesList = ['India', 'United States', 'United Kingdom', 'United Arab Emirates', 'Australia'];

export const PIN_RE = /^\d{6}$/;
export const PIN_INTL_RE = /^\d{4,12}$/;
// Loose, international-friendly phone: optional +/(), digits, spaces/dashes.
export const PHONE_RE_LOOSE = /^[+()\d][\s\d()-]{6,16}$/;
// Strict 10-digit Indian mobile (used by checkout).
export const PHONE_RE_INDIA = /^[6-9]\d{9}$/;

export function validateName(value, label = 'name', min = 2) {
  const v = String(value ?? '').trim();
  if (!v) return `${label} is required.`;
  if (v.length < min) return `${label} must be at least ${min} characters.`;
  return '';
}

export function validateCity(value) {
  return validateName(value, 'City');
}

export function validateState(value) {
  return validateName(value, 'State');
}

export function validateAddress(value, min = 8) {
  const v = String(value ?? '').trim();
  if (!v) return 'Street address is required.';
  if (v.length < min) return 'Enter your full street address.';
  return '';
}

export function validateCountry(value) {
  const v = String(value ?? '').trim();
  if (!v) return 'Select a country.';
  if (!CountriesList.includes(v)) return 'Unsupported country.';
  return '';
}

/**
 * Pincode/postcode validation keyed off the selected country: 6 digits for
 * India, 4-12 digits elsewhere.
 */
export function validatePincode(value, country = 'India') {
  const v = String(value ?? '').trim();
  if (!v) return 'Pincode is required.';
  const isIndia = country === 'India';
  return isIndia
    ? PIN_RE.test(v)
      ? ''
      : 'Enter a valid 6-digit pincode.'
    : PIN_INTL_RE.test(v)
      ? ''
      : 'Enter a valid postcode.';
}

/**
 * Phone validation. Defaults to the strict Indian mobile rule (checkout);
 * pass { international: true } for the looser international rule (address
 * book), which also accepts `+91 98765 43210` style values.
 */
export function validatePhone(value, { international = false } = {}) {
  const v = String(value ?? '').trim();
  if (!v) return 'Phone number is required.';
  const re = international ? PHONE_RE_LOOSE : PHONE_RE_INDIA;
  return re.test(v)
    ? ''
    : international
      ? 'Enter a valid phone number.'
      : 'Enter a valid 10-digit phone number.';
}