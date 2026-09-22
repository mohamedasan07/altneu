import { FiEye } from 'react-icons/fi'
import OrderStatusBadge from './OrderStatusBadge'
import OrderPaymentBadge from './OrderPaymentBadge'
import Button from '../ui/Button'
import { formatMoney, formatDateTime, formatCount } from '../../utils/format'
import styles from './OrderRow.module.css'

function OrderRow({ order, onView }) {
  const customerName =
    order.shipping?.name || order.contact?.name || '—'

  return (
    <tr>
      <td>
        <span className={styles.orderNumber}>{order.altneuNumber || order.orderNumber}</span>
      </td>

      <td>
        <span className={styles.name}>{customerName}</span>
        {order.shipping?.phone && (
          <span className={styles.sub}>{order.shipping.phone}</span>
        )}
      </td>

      <td className={styles.items}>{formatCount(order.totals?.count)}</td>

      <td className={styles.total}>
        {formatMoney(order.totals?.grandTotal)}
      </td>

      <td>
        <OrderStatusBadge status={order.status} />
      </td>

      <td>
        <OrderPaymentBadge status={order.paymentStatus} />
      </td>

      <td className={styles.date}>
        {formatDateTime(order.placedAt)}
      </td>

      <td>
        <div className={styles.actions}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onView(order)}
          >
            <FiEye size={14} aria-hidden="true" />
            View
          </Button>
        </div>
      </td>
    </tr>
  )
}

export default OrderRow