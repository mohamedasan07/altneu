import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from './useCart';
import { calcSubtotal, ESTIMATED_TAX_RATE, shippingFor } from '../utils/cartConfig';
import { placeOrder as placeOrderApi } from '../services/orders';
import { getStoredGuestSessionId } from '../services/cart';
import {
  CountriesList,
  validateAddress,
  validateCity,
  validateCountry,
  validateName,
  validatePhone,
  validatePincode,
  validateState,
  StatesList,
} from '../utils/addressValidation';

export { CountriesList, StatesList };

export const CHECKOUT_STEPS = [
  { id: 1, label: 'Shipping' },
  { id: 2, label: 'Payment' },
  { id: 3, label: 'Review' },
];



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



const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const REQUIRED_FIELDS = [
  'fullName',
  'phone',
  'email',
  'address',
  'city',
  'state',
  'pincode',
  'country',
];

const validators = {
  fullName: (v) => validateName(v, 'Full name'),
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
  locality: (v) => v.trim().length === 0 ? 'Locality is required' : null,
};

const INITIAL_VALUES = {
  fullName: '',
  phone: '',
  email: '',
  address: '',
  apartment: '',
  city: '',
  state: '',
  pincode: '',
  country: 'India',
  locality: '',
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
  return shippingFor(subtotal);
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

  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true);
  const [billingValues, setBillingValues] = useState(INITIAL_VALUES);
  const [billingErrors, setBillingErrors] = useState({});
  const [billingTouched, setBillingTouched] = useState({});

  const [step, setStep] = useState(1);
  const [openReview, setOpenReview] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState(null);

  const [isFetchingPin, setIsFetchingPin] = useState(false);
  const [pinError, setPinError] = useState(null);
  const [localityOptions, setLocalityOptions] = useState([]);
  const autofilledPinRef = useRef(null);

  const valuesRef = useRef(values);
  valuesRef.current = values;

  const billingValuesRef = useRef(billingValues);
  billingValuesRef.current = billingValues;

  const totals = useMemo(() => checkoutTotals(items, delivery), [items, delivery]);

  useEffect(() => {
    const pin = values.pincode;

    if (pin.length !== 6) {
      if (pinError) setPinError(null);
      if (autofilledPinRef.current) {
        setValues((prev) => {
          const latest = { ...prev, city: '', state: '', locality: '' };
          valuesRef.current = latest;
          return latest;
        });
        setLocalityOptions([]);
        autofilledPinRef.current = null;
      }
      return;
    }

    if (autofilledPinRef.current === pin) return;

    const abortController = new AbortController();

    async function checkPin() {
      setIsFetchingPin(true);
      setPinError(null);

      try {
        const response = await fetch(`https://api.postalpincode.in/pincode/${pin}`, {
          signal: abortController.signal
        });

        if (!response.ok) {
          throw new Error('Network error');
        }

        const data = await response.json();

        if (data?.[0]?.Status === 'Success' && data[0].PostOffice?.length > 0) {
          const poList = data[0].PostOffice;
          const po = poList[0];
          const newCity = po.District || '';
          const newState = po.State || '';
          const options = poList.map((p) => p.Name).filter(Boolean);
          const autoLocality = options.length === 1 ? options[0] : '';

          setLocalityOptions(options);

          setValues(prev => {
            const latest = { ...prev, city: newCity, state: newState, country: 'India', locality: autoLocality };
            valuesRef.current = latest;
            return latest;
          });

          autofilledPinRef.current = pin;

          setErrors(prev => ({
            ...prev,
            city: null,
            state: null,
            country: null,
            pincode: null,
            locality: null
          }));
        } else {
          setPinError('PIN code not found. Please check the PIN code.');
          setLocalityOptions([]);
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
        setPinError('Unable to check PIN. Please enter City/State manually.');
      } finally {
        setIsFetchingPin(false);
      }
    }

    checkPin();

    return () => {
      abortController.abort();
    };
  }, [values.pincode]);

  const setField = useCallback((name) => (event) => {
    let value = event.target?.value ?? '';

    if (name === 'phone' || name === 'pincode') {
      value = value.replace(/\D/g, '');
      if (name === 'phone' && value.length > 10) value = value.slice(0, 10);
      if (name === 'pincode' && value.length > 6) value = value.slice(0, 6);
    } else if (name === 'email') {
      value = value.trim().toLowerCase();
    }

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
    let value = event.target?.value ?? '';

    if (name === 'phone' || name === 'pincode') {
      value = value.replace(/\D/g, '');
      if (name === 'phone' && value.length > 10) value = value.slice(0, 10);
      if (name === 'pincode' && value.length > 6) value = value.slice(0, 6);
    } else if (name === 'email') {
      value = value.trim().toLowerCase();
    }

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
    const currentRequired = [...REQUIRED_FIELDS];
    if (localityOptions.length > 0) currentRequired.push('locality');

    currentRequired.forEach((name) => {
      next[name] = validators[name] ? validators[name](latest[name], latest) : null;
    });
    setErrors(next);
    setTouched((prev) => ({ ...prev, ...Object.fromEntries(currentRequired.map((name) => [name, true])) }));

    let isBillingValid = true;
    if (!billingSameAsShipping) {
      const latestBilling = billingValuesRef.current;
      const nextBilling = {};
      const billingRequired = [...REQUIRED_FIELDS];
      if (localityOptions.length > 0) billingRequired.push('locality');

      billingRequired.forEach((name) => {
        nextBilling[name] = validators[name] ? validators[name](latestBilling[name], latestBilling) : null;
      });
      setBillingErrors(nextBilling);
      setBillingTouched((prev) => ({ ...prev, ...Object.fromEntries(billingRequired.map((name) => [name, true])) }));
    }

    return Object.values(next).every((error) => !error);
  }, [billingSameAsShipping, localityOptions]);



  const canProceed = useMemo(() => {
    const currentRequired = [...REQUIRED_FIELDS];
    if (localityOptions.length > 0) currentRequired.push('locality');
    return currentRequired.every((name) => !errors[name]) && Boolean(payment);
  }, [errors, payment, localityOptions]);

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
        name: latest.fullName.trim(),
        phone: latest.phone,
        email: latest.email,
        line1: latest.address,
        line2: latest.apartment,
        city: latest.city,
        state: latest.state,
        pincode: latest.pincode,
        country: latest.country,
        locality: latest.locality,
      },
      delivery,
      payment,
      coupon: null,
      notes,
      idempotencyKey: newIdempotencyKey(),
      sessionId: getStoredGuestSessionId() || undefined,
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
  }, [placing, delivery, payment, notes, clearCart, navigate]);

  return {
    items,
    totals,

    values,
    errors,
    touched,
    setField,
    handleBlur,

    isFetchingPin,
    pinError,
    localityOptions,

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
