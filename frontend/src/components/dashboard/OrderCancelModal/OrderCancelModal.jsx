import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useFocusTrap } from '../../../hooks/useFocusTrap';
import { cancelOrder } from '../../../services/orders';
import OrderStatusBadge from '../../orders/OrderStatusBadge/OrderStatusBadge';
import styles from './OrderCancelModal.module.css';

const EASE_OUT = [0.22, 1, 0.36, 1];

/**
 * Cancel-order confirmation modal (Sprint 22.5 Phase 3).
 *
 * Portal'd + focus-trapped like OrderModal. Confirming sends exactly one
 * PATCH; both buttons are disabled while the request is in flight so a second
 * tap can never fire a duplicate. On success the parent reloads the order
 * list. On a 400 the backend says the order is no longer cancellable, so the
 * parent reloads to reflect the real server state. Any other failure keeps the
 * modal open with an inline error so the customer can retry.
 */
export default function OrderCancelModal({ order, open, onClose, onCanceled, onNotCancellable }) {
  const panelRef = useFocusTrap(open);
  const closeRef = useRef(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !pending) onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose, pending]);

  const confirm = async () => {
    if (pending || !order) return;
    setPending(true);
    setError('');
    try {
      const updated = await cancelOrder(order.id);
      onCanceled(updated);
    } catch (err) {
      setPending(false);
      if (err.status === 400) {
        // Backend: no longer cancellable — reload so the UI matches reality.
        onNotCancellable();
        return;
      }
      setError(err.message || 'Unable to cancel this order. Please try again.');
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && order && (
        <motion.div
          className={styles.backdrop}
          onClick={() => !pending && onClose()}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            ref={panelRef}
            className={styles.dialog}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cancel-order-title"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.32, ease: EASE_OUT }}
          >
            <header className={styles.head}>
              <div>
                <p className={styles.kicker}>Cancel order</p>
                <h2 id="cancel-order-title" className={styles.title}>
                  Cancel #{order.altneuNumber || order.orderNumber || 'this order'}?
                </h2>
              </div>
              <button
                ref={closeRef}
                type="button"
                className={styles.close}
                onClick={() => !pending && onClose()}
                disabled={pending}
                aria-label="Close cancellation dialog"
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
                  <p className={styles.metaLabel}>Current status</p>
                  <OrderStatusBadge status={order.status} />
                </div>
              </div>
              <p className={styles.lead}>
                Cancelling is <strong>permanent and cannot be undone</strong>. The items in this
                order will be released back to stock and the order will be marked as cancelled.
              </p>
              {error && (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              )}
            </div>

            <footer className={styles.foot}>
              <button
                type="button"
                className={styles.keep}
                onClick={() => !pending && onClose()}
                disabled={pending}
              >
                {pending ? 'Cancelling…' : 'Keep Order'}
              </button>
              <button
                type="button"
                className={styles.confirm}
                onClick={confirm}
                disabled={pending}
              >
                {pending ? 'Cancelling…' : 'Confirm Cancellation'}
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}