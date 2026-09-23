import { useState } from 'react';
import { motion } from 'framer-motion';
import useCheckout from '../../hooks/useCheckout';
import { formatINR } from '../../utils/format';
import { cn } from '../../utils/cn';
import Button from '../../components/ui/Button/Button';
import CheckoutForm from '../../components/checkout/CheckoutForm/CheckoutForm';
import DeliveryOptions from '../../components/checkout/DeliveryOptions/DeliveryOptions';
import PaymentSelector from '../../components/checkout/PaymentSelector/PaymentSelector';
import CouponBox from '../../components/checkout/CouponBox/CouponBox';
import OrderSummary from '../../components/checkout/OrderSummary/OrderSummary';
import styles from './CheckoutPage.module.css';

const EASE_OUT = [0.22, 1, 0.36, 1];

export default function CheckoutPage() {
  const checkout = useCheckout();
  const [showPaymentError, setShowPaymentError] = useState(false);

  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);
  const [mobileCouponOpen, setMobileCouponOpen] = useState(false);

  // UI-only state
  const [newsletterOptIn, setNewsletterOptIn] = useState(true);
  const [saveInfoOptIn, setSaveInfoOptIn] = useState(false);

  const {
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

    delivery,
    setDelivery,
    deliveryOptions,

    payment,
    setPayment,
    paymentMethods,

    coupon,
    couponInput,
    setCouponInput,
    couponError,
    applyCoupon,
    removeCoupon,

    placeOrder,
    placing,
    placeError,
  } = checkout;

  if (items.length === 0) {
    return (
      <section className={styles.section} aria-labelledby="checkout-title">
        <header className={styles.checkoutHeader}>
          <img src="/images/admin1.png" alt="ALTNEU" className={styles.logo} />
        </header>
        <div className={styles.empty}>
          <p className={styles.emptyText}>Your bag is empty — nothing to check out yet.</p>
          <Button to="/collections" variant="outline" size="lg">
            Shop the collection
          </Button>
        </div>
      </section>
    );
  }

  const deliveryOption = deliveryOptions.find((option) => option.id === delivery);

  const handlePayNow = () => {
    const isValid = validateAll();

    if (!payment) {
      setShowPaymentError(true);
    } else {
      setShowPaymentError(false);
    }

    if (!isValid || !payment) {
      setTimeout(() => {
        const firstError = document.querySelector('[aria-invalid="true"]');
        if (firstError) {
          firstError.focus();
        }
      }, 0);
      return;
    }

    // In a real app, saveInfoOptIn and newsletterOptIn would be handled here or inside placeOrder.
    // For now, we preserve the exact placeOrder behavior.
    placeOrder();
  };

  const handlePaymentChange = (methodId) => {
    setPayment(methodId);
    if (showPaymentError) {
      setShowPaymentError(false);
    }
  };

  const addressComplete = Boolean(
    values.address &&
    values.city &&
    values.pincode &&
    values.country
  );

  return (
    <section className={styles.section} aria-labelledby="checkout-title">
      <header className={styles.checkoutHeader}>
        <img src="/images/admin1.png" alt="ALTNEU" className={styles.logo} />
      </header>

      <div className={styles.layout}>

        {/* MOBILE SUMMARY TOGGLE */}
        <button
          type="button"
          className={styles.mobileSummaryToggle}
          onClick={() => setMobileSummaryOpen(!mobileSummaryOpen)}
        >
          <span className={styles.mobileSummaryToggleLabel}>Order summary</span>
          <span className={styles.mobileSummaryToggleRight}>
            <span className={styles.mobileSummaryTotal}>{formatINR(totals.grandTotal)}</span>
            <span className={styles.chevron} data-open={mobileSummaryOpen}>▾</span>
          </span>
        </button>

        <div className={styles.rightColumn}>
          {/* ORDER SUMMARY */}
          <aside className={styles.sectionSummary} data-mobile-open={mobileSummaryOpen} aria-label="Order summary">
            <OrderSummary
              items={items}
              totals={totals}
              coupon={coupon}
              deliveryLabel={deliveryOption?.label}
            />
          </aside>

          {/* DISCOUNT */}
          <div className={styles.sectionDiscount}>
            <button
              type="button"
              className={styles.mobileDiscountToggle}
              onClick={() => setMobileCouponOpen(true)}
              data-open={mobileCouponOpen}
            >
              + Add discount
            </button>
            <div className={styles.couponContainer} data-open={mobileCouponOpen}>
              <CouponBox
                coupon={coupon}
                couponInput={couponInput}
                onCouponInput={setCouponInput}
                error={couponError}
                onApply={applyCoupon}
                onRemove={removeCoupon}
              />
            </div>
          </div>
        </div>

        {/* CONTACT */}
        <div className={styles.sectionContact}>
          <header className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Contact</h2>
            {/* The user is technically signed in since !isAuthenticated redirects, but if we wanted to match the UI perfectly: */}
            <span className={styles.signInLink}>Sign in</span>
          </header>

          <div style={{ position: 'relative' }}>
            <label htmlFor="checkout-email" className="sr-only">Email</label>
            <input
              id="checkout-email"
              type="email"
              inputMode="email"
              placeholder="Email"
              className={cn(styles.control, (errors.email && touched.email) && styles.controlError)}
              value={values.email}
              onChange={setField('email')}
              onBlur={handleBlur('email')}
              aria-invalid={(errors.email && touched.email) || undefined}
            />
            {(errors.email && touched.email) && (
              <motion.p
                role="alert"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: EASE_OUT }}
                style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)', marginTop: 'var(--space-2)' }}
              >
                {errors.email}
              </motion.p>
            )}
          </div>

          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              className={styles.checkboxInput}
              checked={newsletterOptIn}
              onChange={(e) => setNewsletterOptIn(e.target.checked)}
            />
            <span className={styles.checkboxLabel}>Email me with news and offers</span>
          </label>
        </div>

        {/* DELIVERY */}
        <div className={styles.sectionDelivery}>
          <h2 className={styles.sectionTitle}>Delivery</h2>
          <CheckoutForm
            values={values}
            errors={errors}
            touched={touched}
            setField={setField}
            handleBlur={handleBlur}
          />
          <label className={styles.checkboxRow} style={{ marginTop: 'var(--space-1)' }}>
            <input
              type="checkbox"
              className={styles.checkboxInput}
              checked={saveInfoOptIn}
              onChange={(e) => setSaveInfoOptIn(e.target.checked)}
            />
            <span className={styles.checkboxLabel}>Save this information for next time</span>
          </label>
        </div>

        {/* SHIPPING METHOD */}
        <div className={styles.sectionShipping}>
          <h2 className={styles.sectionTitle}>Shipping method</h2>
          <DeliveryOptions
            options={deliveryOptions}
            delivery={delivery}
            onChange={setDelivery}
            subtotal={totals.subtotal}
            addressComplete={addressComplete}
          />
        </div>

        {/* The sections were moved above inside rightColumn. */}

        {/* PAYMENT */}
        <div className={styles.sectionPayment}>
          <h2 className={styles.sectionTitle}>Payment</h2>
          <PaymentSelector
            methods={paymentMethods}
            payment={payment}
            onChange={handlePaymentChange}
          />
          {showPaymentError && (
             <p className={styles.errorMsg} style={{ textAlign: 'left', marginTop: '0' }}>Please select a payment method.</p>
          )}
        </div>

        {/* BILLING ADDRESS */}
        <div className={styles.sectionBilling}>
          <h2 className={styles.sectionTitle}>Billing address</h2>
          <div className={styles.billingToggle}>
            <label className={styles.billingOption} data-active={billingSameAsShipping}>
              <input
                type="radio"
                name="billing_option"
                className={styles.billingInput}
                checked={billingSameAsShipping}
                onChange={() => setBillingSameAsShipping(true)}
              />
              <span className={styles.billingRadio} aria-hidden="true" />
              <span className={styles.billingBody}>Same as shipping address</span>
            </label>
            <label className={styles.billingOption} data-active={!billingSameAsShipping}>
              <input
                type="radio"
                name="billing_option"
                className={styles.billingInput}
                checked={!billingSameAsShipping}
                onChange={() => setBillingSameAsShipping(false)}
              />
              <span className={styles.billingRadio} aria-hidden="true" />
              <span className={styles.billingBody}>Use a different billing address</span>
            </label>
          </div>

          {!billingSameAsShipping && (
            <div style={{ marginTop: 'var(--space-4)' }}>
              <CheckoutForm
                values={billingValues}
                errors={billingErrors}
                touched={billingTouched}
                setField={setBillingField}
                handleBlur={handleBillingBlur}
              />
            </div>
          )}
        </div>

        {/* MOBILE TOTAL ROW */}
        <div className={styles.mobileTotalRow}>
          {items[0] && (
            <div className={styles.mobileTotalImage}>
              {items[0].imageUrl ? (
                <img src={items[0].imageUrl} className={styles.mobileTotalImgElement} alt="" />
              ) : (
                <span className={styles.mobileTotalFallback}>{(items[0].name || '?').charAt(0)}</span>
              )}
              <span className={styles.mobileTotalBadge}>{totals.count}</span>
            </div>
          )}
          <div className={styles.mobileTotalText}>
            <span className={styles.mobileTotalLabel}>Total</span>
            <div className={styles.mobileTotalRight}>
              <span className={styles.mobileTotalItemCount}>{totals.count} {totals.count === 1 ? 'item' : 'items'}</span>
              <span className={styles.mobileTotalValue}>{formatINR(totals.grandTotal)}</span>
            </div>
          </div>
        </div>

        {/* PAY NOW */}
        <div className={styles.sectionPay}>
          <button
            type="button"
            className={styles.continuing}
            onClick={handlePayNow}
            disabled={placing}
          >
            {placing ? 'Processing...' : 'Pay now'}
          </button>

          {placeError && (
             <p className={styles.errorMsg}>{placeError}</p>
          )}
        </div>

        {/* MOBILE FOOTER */}
        <footer className={styles.mobileFooter}>
          <a href="#">Refund policy</a>
          <a href="#">Shipping</a>
          <a href="#">Privacy policy</a>
          <a href="#">Terms of service</a>
          <a href="#">Legal notice</a>
          <a href="#">Contact</a>
        </footer>

      </div>
    </section>
  );
}
