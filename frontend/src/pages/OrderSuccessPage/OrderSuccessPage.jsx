import { motion } from 'framer-motion';
import { Navigate, useLocation } from 'react-router-dom';
import { etaDate, PAYMENT_METHODS } from '../../hooks/useCheckout';
import { formatINR } from '../../utils/format';
import Button from '../../components/ui/Button/Button';
import styles from './OrderSuccessPage.module.css';

const EASE_OUT = [0.22, 1, 0.36, 1];

const Info = ({ label, value }) => (
  <div className={styles.infoRow}>
    <span className={styles.infoLabel}>{label}</span>
    <span className={styles.infoValue}>{value}</span>
  </div>
);

const addressLines = (ship) => {
  const lines = [ship.line1, ship.line2].filter(Boolean);
  lines.push([ship.city, ship.state].filter(Boolean).join(', '));
  lines.push([ship.pincode, ship.country].filter(Boolean).join(' · '));
  return lines.filter(Boolean).join(', ');
};

/**
 * Post-purchase confirmation. Displays the order returned by the backend
 * checkout response (passed through navigation state) — order number, placed
 * date, server-computed totals, delivery and the shipping snapshot. A direct
 * visit with no order (e.g. a refreshed success page) redirects to the shop.
 */
export default function OrderSuccessPage() {
  const location = useLocation();
  const order = location.state?.order ?? null;

  if (!order) {
    return <Navigate to="/collections" replace />;
  }

  const placed = order.placedAt ? new Date(order.placedAt) : null;
  const paymentLabel = PAYMENT_METHODS.find((method) => method.id === order.paymentMethod)?.label || 'Payment';
  const formatted = placed && !Number.isNaN(placed.getTime())
    ? placed.toLocaleString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';
  const arrivesBy = etaDate(Date.now(), order.delivery?.etaDays ?? 6);

  return (
    <motion.section
      className={`page ${styles.section}`}
      aria-labelledby="success-title"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE_OUT }}
    >
      <div className={styles.card}>
        <motion.div
          className={styles.badge}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 260, damping: 18 }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 13l4 4L19 7" />
          </svg>
        </motion.div>

        <p className="page-kicker">Order confirmed</p>
        <h1 id="success-title" className="page-title">
          You're all set.
        </h1>
        <p className={styles.lead}>
          Thanks{order.shipping?.name ? `, ${order.shipping.name.split(' ')[0]}` : ''} — your
          order is in and a confirmation email is on its way to
          {order.shipping?.email ? ` ${order.shipping.email}` : ' your inbox'}.
        </p>

        <div className={styles.summary}>
          <Info label="Order number" value={order.altneuNumber || order.orderNumber} />
          <Info label="Placed at" value={formatted} />
          <Info label="Delivery" value={order.delivery?.label} />
          <Info label="Arrives by" value={arrivesBy} />
          <Info label="Payment" value={paymentLabel} />
          <Info label="Ship to" value={addressLines(order.shipping ?? {})} />
        </div>

        <div className={styles.total}>
          <span>Total</span>
          <strong>{formatINR(order.totals?.grandTotal || 0)}</strong>
        </div>

        <div className={styles.actions}>
          <Button to="/collections" variant="primary" size="lg">
            Continue shopping
          </Button>
          <Button to="/wishlist" variant="ghost" size="lg">
            View wishlist
          </Button>
        </div>
      </div>
    </motion.section>
  );
}