import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useOrders } from '../../hooks/useOrders';
import OrderCard from '../../components/dashboard/OrderCard/OrderCard';
import OrderModal from '../../components/dashboard/OrderModal/OrderModal';
import OrderCancelModal from '../../components/dashboard/OrderCancelModal/OrderCancelModal';
import OrderInvoice from '../../components/dashboard/OrderInvoice/OrderInvoice';
import styles from './OrdersPage.module.css';

/**
 * Orders page — real order history from the customer API, newest first.
 * Opening a card fetches the fresh order detail (GET /api/customer/orders/:id)
 * which includes the truthful status timeline. Cancel Order opens a
 * confirmation modal; after a successful (or backend-rejected) cancellation
 * the list is reloaded so the UI reflects the real server state. Invoice opens
 * the print-friendly invoice overlay from the order's own snapshot data.
 */
export default function OrdersPage() {
  const { orders, status, error, reload, getOrder } = useOrders();
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [invoiceOrder, setInvoiceOrder] = useState(null);
  const [notice, setNotice] = useState('');

  const handleView = async (order) => {
    setSelected(order);
    setDetail(order);
    try {
      const fresh = await getOrder(order.id);
      setDetail(fresh);
    } catch {
      /* keep the list copy — the modal still renders */
    }
  };

  const handleCancelRequest = (order) => setCancelTarget(order);

  const handleInvoice = (order) => {
    setSelected(null);
    setDetail(null);
    setCancelTarget(null);
    setInvoiceOrder(order);
  };

  const handleCanceled = async () => {
    setNotice('Order cancelled — the items have been released back to stock.');
    await reload();
    setCancelTarget(null);
    setSelected(null);
    setDetail(null);
  };

  const handleNotCancellable = async () => {
    setNotice('Order cancellation is not available. For order inquiries or statutory remedies, please contact support.');
    await reload();
    setCancelTarget(null);
    setSelected(null);
    setDetail(null);
  };

  if (status === 'loading') {
    return (
      <div className={styles.page}>
        <motion.section
          className={styles.empty}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="page-kicker">Orders</p>
          <h1 className={styles.title}>Loading your orders…</h1>
        </motion.section>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className={styles.page}>
        <motion.section
          className={styles.empty}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="page-kicker">Orders</p>
          <h1 className={styles.title}>Something went wrong.</h1>
          <p className={styles.lead}>{error}</p>
          <Link to="/account" className={styles.cta}>
            Back to dashboard
          </Link>
        </motion.section>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className={styles.page}>
        <motion.section
          className={styles.empty}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="page-kicker">Orders</p>
          <h1 className={styles.title}>No orders yet.</h1>
          <p className={styles.lead}>Your placed drops will live here with live tracking.</p>
          <Link to="/collections" className={styles.cta}>
            Continue shopping
          </Link>
        </motion.section>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {notice && (
        <div className={styles.notice} role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} aria-label="Dismiss notice">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M5 5l14 14" />
              <path d="M19 5L5 19" />
            </svg>
          </button>
        </div>
      )}

      <ul className={styles.list} aria-label="Order history">
        <AnimatePresence initial={false}>
          {orders.map((order) => (
            <OrderCard
              key={order.orderNumber}
              order={order}
              onView={handleView}
              onCancelOrder={handleCancelRequest}
              onInvoice={handleInvoice}
            />
          ))}
        </AnimatePresence>
      </ul>

      <OrderModal
        order={detail ?? selected}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        onCancelOrder={handleCancelRequest}
        onInvoice={handleInvoice}
      />

      <OrderCancelModal
        order={cancelTarget}
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        onCanceled={handleCanceled}
        onNotCancellable={handleNotCancellable}
      />

      <OrderInvoice
        order={invoiceOrder}
        open={Boolean(invoiceOrder)}
        onClose={() => setInvoiceOrder(null)}
      />
    </div>
  );
}