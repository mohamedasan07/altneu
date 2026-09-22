import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useFocusTrap } from '../../../hooks/useFocusTrap';
import { PAYMENT_METHODS } from '../../../hooks/useCheckout';
import OrderStatusBadge from '../../orders/OrderStatusBadge/OrderStatusBadge';
import OrderTimeline from '../../orders/OrderTimeline/OrderTimeline';
import ItemThumb from '../../account/ItemThumb/ItemThumb';
import { canCancelOrder } from '../../../utils/orderStatus';
import { canShowInvoice } from '../../../utils/invoice';
import { formatINR } from '../../../utils/format';
import styles from './OrderModal.module.css';

const EASE_OUT = [0.22, 1, 0.36, 1];

const paymentLabel = (id) =>
  PAYMENT_METHODS.find((m) => m.id === id)?.label || 'Payment method';

const dateOf = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

/**
 * Order details modal — summary, products, shipping, payment and a truthful
 * status timeline from order.history. Portal'd, focus-trapped, closes on ESC /
 * backdrop / ✕. When cancellable (pending/confirmed/processing) and an
 * onCancelOrder handler is provided, a Cancel Order action is shown in the
 * footer that opens the shared confirmation modal. When the order has item
 * snapshots and an onInvoice handler is provided, an Invoice action opens the
 * customer invoice overlay from the same order data.
 */
export default function OrderModal({ order, open, onClose, onCancelOrder, onInvoice }) {
  const panelRef = useFocusTrap(open);
  const closeRef = useRef(null);

  // Closing + focus helpers
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!order) return null;

  const items = order.items ?? [];
  const ship = order.shipping ?? {};
  const totals = order.totals ?? {};
  const showShippingCharge = totals.shipping > 0;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className={styles.backdrop}
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            ref={panelRef}
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-modal-title"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.32, ease: EASE_OUT }}
          >
            <header className={styles.head}>
              <div>
                <p className={styles.kicker}>Order</p>
                <h2 id="order-modal-title" className={styles.title}>
                  #{order.altneuNumber || order.orderNumber || '—'}
                </h2>
              </div>
              <button
                ref={closeRef}
                type="button"
                className={styles.close}
                onClick={onClose}
                aria-label="Close order details"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <path d="M5 5l14 14" />
                  <path d="M19 5L5 19" />
                </svg>
              </button>
            </header>

            <div className={styles.body}>
              <div className={styles.summary}>
                <div>
                  <p className={styles.metaLabel}>Placed</p>
                  <p className={styles.metaValue}>{dateOf(order.placedAt)}</p>
                </div>
                <OrderStatusBadge status={order.status} />
              </div>

              <section className={styles.block} aria-label="Products">
                <h3 className={styles.blockTitle}>Products</h3>
                <ul className={styles.list}>
                  {items.map((item, i) => (
                    <li key={`${item.id}-${i}`} className={styles.item}>
                      <ItemThumb item={item} />
                      <div className={styles.itemInfo}>
                        <p className={styles.itemName}>{item.name}</p>
                        <p className={styles.itemMeta}>
                          {item.size ? `Size ${item.size}` : ''}
                          {item.colorName ? ` · ${item.colorName}` : ''}
                          {item.quantity ? ` · Qty ${item.quantity}` : ''}
                        </p>
                      </div>
                      <span className={styles.itemPrice}>
                        {formatINR((Number(item.price) || 0) * (Number(item.quantity) || 1))}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <div className={styles.split}>
                <section className={styles.block} aria-label="Shipping address">
                  <h3 className={styles.blockTitle}>Shipping Address</h3>
                  <address className={styles.address}>
                    <strong>{ship.name || '—'}</strong>
                    <span>{ship.line1 || ''}</span>
                    {ship.line2 ? <span>{ship.line2}</span> : null}
                    <span>{[ship.city, ship.state].filter(Boolean).join(', ')}</span>
                    <span>{[ship.pincode, ship.country].filter(Boolean).join(' · ')}</span>
                    <span className={styles.hidden}>{ship.phone}</span>
                    <span className={styles.hidden}>{ship.email}</span>
                  </address>
                </section>

                <section className={styles.block} aria-label="Payment method">
                  <h3 className={styles.blockTitle}>Payment</h3>
                  <p className={styles.payment}>{paymentLabel(order.paymentMethod)}</p>
                  {order.delivery?.label && (
                    <>
                      <h3 className={styles.blockTitle}>Delivery</h3>
                      <p className={styles.payment}>{order.delivery.label}</p>
                    </>
                  )}
                </section>
              </div>

              <section className={styles.block} aria-label="Order status timeline">
                <h3 className={styles.blockTitle}>Timeline</h3>
                <OrderTimeline history={order.history} status={order.status} />
              </section>

              <div className={styles.totals}>
                <p>
                  <span>Subtotal</span>
                  <span>{formatINR(totals.subtotal ?? 0)}</span>
                </p>
                {totals.discount > 0 && (
                  <p>
                    <span>Discount</span>
                    <span className={styles.discount}>−{formatINR(totals.discount)}</span>
                  </p>
                )}
                {showShippingCharge && (
                  <p>
                    <span>Shipping</span>
                    <span>{formatINR(totals.shipping)}</span>
                  </p>
                )}
                <p className={styles.grand}>
                  <span>Total</span>
                  <span>{formatINR(totals.grandTotal ?? 0)}</span>
                </p>
              </div>
            </div>

            <footer className={styles.foot}>
              {canCancelOrder(order.status) && onCancelOrder && (
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => {
                    onClose();
                    onCancelOrder(order);
                  }}
                >
                  Cancel Order
                </button>
              )}
              {canShowInvoice(order) && onInvoice && (
                <button type="button" className={styles.invoiceBtn} onClick={() => onInvoice(order)}>
                  Invoice
                </button>
              )}
              <button type="button" className={styles.done} onClick={onClose}>
                Done
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}