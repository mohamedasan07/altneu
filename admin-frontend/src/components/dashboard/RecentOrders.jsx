import { formatMoney, formatDate } from '../../utils/format'
import { getOrderStatusMeta } from '../../utils/orderStatus'
import classNames from '../../utils/classNames'
import styles from './RecentOrders.module.css'

function RecentOrders({ orders = [] }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Order ID</th>
            <th scope="col">Customer</th>
            <th scope="col">Amount</th>
            <th scope="col">Status</th>
            <th scope="col">Date</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const statusMeta = getOrderStatusMeta(order.status)
            return (
              <tr key={order.id}>
                <td className={styles.orderId}>{order.altneuNumber || order.orderNumber}</td>
                <td className={styles.customer}>
                  {order.shipping?.name || order.contact?.name || '—'}
                </td>
                <td className={styles.amount}>
                  {formatMoney(order.totals?.grandTotal)}
                </td>
                <td>
                  <span
                    className={classNames(
                      styles.badge,
                      styles[statusMeta.accent] || styles.info,
                    )}
                  >
                    {statusMeta.label}
                  </span>
                </td>
                <td className={styles.date}>{formatDate(order.placedAt)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default RecentOrders
