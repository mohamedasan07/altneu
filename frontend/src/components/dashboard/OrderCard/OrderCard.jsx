import { motion } from 'framer-motion';
import OrderStatusBadge from '../../orders/OrderStatusBadge/OrderStatusBadge';
import ItemThumb from '../../account/ItemThumb/ItemThumb';
import { canCancelOrder } from '../../../utils/orderStatus';
import { canShowInvoice } from '../../../utils/invoice';
import { formatINR } from '../../../utils/format';
import styles from './OrderCard.module.css';

const dateOf = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

/**
 * Compact order row — id, date, status, first item + count, total and actions.
 * Track Order is a UI-only placeholder. Cancel Order is shown only for
 * cancellable statuses (pending/confirmed/processing) and opens the
 * confirmation modal via onCancelOrder; the backend remains the authority.
 * Invoice opens the customer invoice overlay from the order's own snapshot
 * data (no extra API call); it only appears when the order has items.
 */
export default function OrderCard({ order, onView, onCancelOrder, onInvoice }) {
  const items = order?.items ?? [];
  const first = items[0];
  const restCount = Math.max(0, items.length - 1);
  const totalCount = items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
  const cancellable = canCancelOrder(order?.status);
  const invoicable = canShowInvoice(order);

  return (
    <motion.article
      className={styles.card}
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <header className={styles.head}>
        <div>
          <p className={styles.orderNo}>#{order.altneuNumber || order.orderNumber || '—'}</p>
          <p className={styles.date}>{dateOf(order.placedAt)}</p>
        </div>
        <OrderStatusBadge status={order.status} />
      </header>

      <div className={styles.items}>
        <div className={styles.itemLead}>
          <ItemThumb item={first} />
          <div className={styles.itemName}>
            <p>
              {first?.name || 'ALTNEU piece'}
              {restCount > 0 && <span className={styles.more}> +{restCount} more</span>}
            </p>
            <p className={styles.itemMeta}>
              {first?.quantity ? `Qty ${first.quantity}` : 'Qty 1'}
              {first?.size ? ` · Size ${first.size}` : ''}
            </p>
          </div>
        </div>
        <div className={styles.headCount}>
          {totalCount} {totalCount === 1 ? 'item' : 'items'}
        </div>
      </div>

      <div className={styles.foot}>
        <div className={styles.total}>
          <span>Total</span>
          <strong>{formatINR(order.totals?.grandTotal ?? 0)}</strong>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.details} onClick={() => onView(order)}>
            View Details
          </button>
          {cancellable && (
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={() => onCancelOrder && onCancelOrder(order)}
            >
              Cancel Order
            </button>
          )}
          <button
            type="button"
            className={styles.ghostBtn}
            aria-disabled="true"
            title="Order tracking arrives with a backend"
          >
            Track Order
          </button>
          {invoicable && onInvoice && (
            <button
              type="button"
              className={styles.invoiceBtn}
              onClick={() => onInvoice(order)}
            >
              Invoice
            </button>
          )}
        </div>
      </div>
    </motion.article>
  );
}