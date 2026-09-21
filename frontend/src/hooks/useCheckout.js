import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from './useCart';
import { calcSubtotal, ESTIMATED_TAX_RATE, shippingFor } from '../utils/cartConfig';
import { placeOrder as placeOrderApi } from '../services/orders';
import {
  CountriesList,
  validateAddress,
  validateCity,
  validateCountry,
  validateName,
  validatePhone,
  validatePincode,
  validateState,
} from '../utils/addressValidation';

export { CountriesList };

export const CHECKOUT_STEPS = [
  { id: 1, label: 'Shipping' },
  { id: 2, label: 'Payment' },
  { id: 3, label: 'Review' },
];

const EXPRESS_SHIPPING_FEE = 199;

export const DELIVERY_OPTIONS = [
  { id: 'standard', label: 'Standard Delivery', note: 'Doorstep · 5–7 business days', etaDays: 6, priceKind: 'standard' },
];

export const PAYMENT_METHODS = [
  { id: 'card', label: 'Credit / Debit Card', note: 'Visa, Mastercard, RuPay' },
  { id: 'upi', label: 'UPI', note: 'GPay, PhonePe, Paytm' },
  { id: 'netbanking', label: 'Net Banking', note: 'Major Indian banks supported' },
  { id: 'cod', label: 'Cash on Delivery', note: 'Pay when it arrives' },
  { id: 'razorpay', label: 'Razorpay', note: 'Coming soon', disabled: true },
];

const COUPONS = {
  WELCOME10: { percent: 0.1, label: '10% off — WELCOME10' },
  UNFILTERED15: { percent: 0.15, label: '15% off — UNFILTERED15' },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const REQUIRED_FIELDS = [
  'firstName',
  'lastName',
  'phone',
  'email',
  'address',
  'city',
  'state',
  'pincode',
  'country',
];

const validators = {
  firstName: (v) => validateName(v, 'First name'),
  lastName: (v) => validateName(v, 'Last name'),
  email: (v) =>
    v.trim().length === 0
      ? 'Email is required'
      : EMAIL_RE.test(v.trim())
        ? null
        : 'Enter a valid email address',
  phone: (v) => validatePhone(v),
  address: (v) => validateAddress(v),
  apartment: () => null,
  city: (v) => validateCity(v),
  state: (v) => validateState(v),
  pincode: (v, allValues) => validatePincode(v, allValues?.country),
  country: (v) => validateCountry(v),
};

const INITIAL_VALUES = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  address: '',
  apartment: '',
  city: '',
  state: '',
  pincode: '',
  country: 'India',
};

const round = (n) => Math.round(n);

/** Fresh idempotency key for double-submit protection (matches the backend regex). */
function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Human "Arrives by …" date, n business-flavored days out. */
export function etaDate(from, days) {
  const date = new Date(from);
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Delivery fee for a selected method, given the running subtotal. */
export function deliveryPriceFor(optionId, subtotal) {
  switch (optionId) {
    case 'express':
      return EXPRESS_SHIPPING_FEE;
    case 'pickup':
      return 0;
    default:
      return shippingFor(subtotal);
  }
}

/**
 * Full checkout totals: subtotal − coupon discount + delivery + tax.
 * Pure — memoize upstream. UI placeholder math only.
 */
export function checkoutTotals(items = [], deliveryId = 'standard', coupon = null) {
  const subtotal = calcSubtotal(items);
  const discount = coupon ? Math.min(subtotal, round(subtotal * coupon.percent)) : 0;
  const shipping = deliveryPriceFor(deliveryId, subtotal);
  const taxable = subtotal - discount;
  const tax = round(taxable * ESTIMATED_TAX_RATE);
  const grandTotal = taxable + shipping + tax;
  return {
    count: items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0),
    subtotal,
    discount,
    shipping,
    tax,
    taxable,
    grandTotal,
  };
}

/**
 * Frontend-only checkout state machine.
 * Shipping form (validation/touched), delivery, payment, coupon, order notes,
 * a 3-step flow, and the order-review modal → local order record. No backend.
 */
export default function useCheckout() {
  const { items, clearCart } = useCart();
  const navigate = useNavigate();

  const [values, setValues] = useState(INITIAL_VALUES);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  const [delivery, setDelivery] = useState(DELIVERY_OPTIONS[0].id);
  const [payment, setPayment] = useState(null);
  const [notes, setNotes] = useState('');

  const [coupon, setCoupon] = useState(null);
  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState(null);

  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true);
  const [billingValues, setBillingValues] = useState(INITIAL_VALUES);
  const [billingErrors, setBillingErrors] = useState({});
  const [billingTouched, setBillingTouched] = useState({});

  const [step, setStep] = useState(1);
  const [openReview, setOpenReview] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState(null);

  const valuesRef = useRef(values);
  valuesRef.current = values;

  const billingValuesRef = useRef(billingValues);
  billingValuesRef.current = billingValues;

  const totals = useMemo(() => checkoutTotals(items, delivery, coupon), [items, delivery, coupon]);

  const setField = useCallback((name) => (event) => {
    const value = event.target?.value ?? '';
    const latest = { ...valuesRef.current, [name]: value };
    valuesRef.current = latest;
    setValues(latest);
    const error = validators[name] ? validators[name](value, latest) : null;
    setErrors((prev) => ({ ...prev, [name]: error }));
  }, []);

  const handleBlur = useCallback((name) => () => {
    const latest = valuesRef.current;
    setTouched((prev) => ({ ...prev, [name]: true }));
    const error = validators[name] ? validators[name](latest[name], latest) : null;
    setErrors((prev) => ({ ...prev, [name]: error }));
  }, []);

  const setBillingField = useCallback((name) => (event) => {
    const value = event.target?.value ?? '';
    const latest = { ...billingValuesRef.current, [name]: value };
    billingValuesRef.current = latest;
    setBillingValues(latest);
    const error = validators[name] ? validators[name](value, latest) : null;
    setBillingErrors((prev) => ({ ...prev, [name]: error }));
  }, []);

  const handleBillingBlur = useCallback((name) => () => {
    const latest = billingValuesRef.current;
    setBillingTouched((prev) => ({ ...prev, [name]: true }));
    const error = validators[name] ? validators[name](latest[name], latest) : null;
    setBillingErrors((prev) => ({ ...prev, [name]: error }));
  }, []);

  const validateAll = useCallback(() => {
    const latest = valuesRef.current;
    const next = {};
    REQUIRED_FIELDS.forEach((name) => {
      next[name] = validators[name] ? validators[name](latest[name], latest) : null;
    });
    setErrors(next);
    setTouched((prev) => ({ ...prev, ...Object.fromEntries(REQUIRED_FIELDS.map((name) => [name, true])) }));

    let isBillingValid = true;
    if (!billingSameAsShipping) {
      const latestBilling = billingValuesRef.current;
      const nextBilling = {};
      REQUIRED_FIELDS.forEach((name) => {
        nextBilling[name] = validators[name] ? validators[name](latestBilling[name], latestBilling) : null;
      });
      setBillingErrors(nextBilling);
      setBillingTouched((prev) => ({ ...prev, ...Object.fromEntries(REQUIRED_FIELDS.map((name) => [name, true])) }));
      // We don't fail the overall form if billing is invalid based on instructions, but we show the errors.
    }

    return Object.values(next).every((error) => !error);
  }, [billingSameAsShipping]);

  const applyCoupon = useCallback(() => {
    const code = couponInput.trim().toUpperCase();
    if (!code) {
      setCouponError('Enter a coupon code first.');
      return false;
    }
    const known = COUPONS[code];
    if (!known) {
      setCoupon(null);
      setCouponError(`"${code}" isn't valid. Try WELCOME10 or UNFILTERED15.`);
      return false;
    }
    setCoupon({ code, ...known });
    setCouponError(null);
    return true;
  }, [couponInput]);

  const removeCoupon = useCallback(() => {
    setCoupon(null);
    setCouponInput('');
    setCouponError(null);
  }, []);

  const canProceed = useMemo(() => {
    return REQUIRED_FIELDS.every((name) => !errors[name]) && Boolean(payment);
  }, [errors, payment]);

  const nextStep = useCallback(() => {
    if (step === 1 && !validateAll()) return;
    if (step === 2 && !payment) return;
    setStep((s) => Math.min(3, s + 1));
  }, [step, validateAll, payment]);

  const prevStep = useCallback(() => setStep((s) => Math.max(1, s - 1)), []);

  const placeOrder = useCallback(async () => {
    if (placing) return;
    const latest = valuesRef.current;

    // The backend recomputes every total server-side from database prices;
    // the client never sends money values. Only shipping/contact, the delivery
    // option, the payment method, the coupon code, notes and an idempotency key
    // leave the browser.
    const payload = {
      shipping: {
        name: `${latest.firstName.trim()} ${latest.lastName.trim()}`,
        phone: latest.phone,
        email: latest.email,
        line1: latest.address,
        line2: latest.apartment,
        city: latest.city,
        state: latest.state,
        pincode: latest.pincode,
        country: latest.country,
      },
      delivery,
      payment,
      coupon: coupon ? coupon.code : null,
      notes,
      idempotencyKey: newIdempotencyKey(),
    };

    setPlacing(true);
    setPlaceError(null);
    try {
      const { order } = await placeOrderApi(payload);
      clearCart();
      navigate('/checkout/success', { replace: true, state: { order } });
    } catch (err) {
      setPlacing(false);
      setPlaceError(err?.message || 'Unable to place your order. Please try again.');
    }
  }, [placing, delivery, payment, coupon, notes, clearCart, navigate]);

  return {
    items,
    totals,

    values,
    errors,
    touched,
    setField,
    handleBlur,

    billingSameAsShipping,
    setBillingSameAsShipping,
    billingValues,
    billingErrors,
    billingTouched,
    setBillingField,
    handleBillingBlur,

    validateAll,
    canProceed,

    delivery,
    setDelivery,
    deliveryOptions: DELIVERY_OPTIONS,

    payment,
    setPayment,
    paymentMethods: PAYMENT_METHODS,

    notes,
    setNotes,

    coupon,
    couponInput,
    setCouponInput,
    couponError,
    applyCoupon,
    removeCoupon,

    step,
    nextStep,
    prevStep,

    openReview,
    setOpenReview,
    placeOrder,
    placing,
    placeError,
  };
}

export { COUPONS };
