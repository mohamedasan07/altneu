import { cn } from '../../../utils/cn';
import styles from './OrderStatusBadge.module.css';

export const ORDER_STATUSES = {
  delivered: { label: 'Delivered', className: styles.delivered },
  shipped: { label: 'Shipped', className: styles.shipped },
  processing: { label: 'Processing', className: styles.processing },
  confirmed: { label: 'Confirmed', className: styles.processing },
  pending: { label: 'Pending', className: styles.processing },
  cancelled: { label: 'Cancelled', className: styles.cancelled },
  refunded: { label: 'Refunded', className: styles.cancelled },
};

/**
 * Order status pill — semantic color per state, screen-reader friendly.
 */
export default function OrderStatusBadge({ status, className }) {
  const config = ORDER_STATUSES[status] ?? { label: status ?? 'Unknown', className: styles.processing };
  return (
    <span className={`${styles.badge} ${config.className} ${className || ''}`} role="status">
      {config.label}
    </span>
  );
}