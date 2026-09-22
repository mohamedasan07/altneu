import { FiChevronLeft, FiChevronRight } from 'react-icons/fi'
import OrderStatusBadge from '../orders/OrderStatusBadge'
import OrderPaymentBadge from '../orders/OrderPaymentBadge'
import Button from '../ui/Button'
import { formatDate, formatMoney } from '../../utils/format'
import styles from './CustomerOrders.module.css'

/**
 * Compact, read-only order history for one customer. Rendered from the
 * customer detail response (orders.items); order totals use backend values.
 * Previous / Next controls refetch the same customer detail with a new
 * order page — the list page is never reloaded.
 */
function CustomerOrders({ orders, onPageChange }) {
  const items = Array.isArray(orders?.items) ? orders.items : []
  const page = Number(orders?.pagination?.page) || 1
  const totalPages = Number(orders?.pagination?.totalPages) || 1

  if (!items.length) {
    return <p className={styles.empty}>No orders yet</p>
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Order</th>
              <th scope="col">Date</th>
              <th scope="col">Items</th>
              <th scope="col">Total</th>
              <th scope="col">Payment</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((order) => (
              <tr key={order.id}>
                <td>
                  <span className={styles.orderNumber}>
                    {order.altneuNumber || order.orderNumber}
                  </span>
                </td>
                <td className={styles.muted}>
                  {formatDate(order.placedAt)}
                </td>
                <td className={styles.muted}>{order.totals?.count ?? 0}</td>
                <td className={styles.total}>
                  {formatMoney(order.totals?.grandTotal)}
                </td>
                <td>
                  <OrderPaymentBadge status={order.paymentStatus} />
                </td>
                <td>
                  <OrderStatusBadge status={order.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className={styles.pagination}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
          >
            <FiChevronLeft size={14} aria-hidden="true" />
            Previous
          </Button>

          <span className={styles.pageInfo}>
            Page {page} of {totalPages}
          </span>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
          >
            Next
            <FiChevronRight size={14} aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  )
}

export default CustomerOrders