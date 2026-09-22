import { useEffect, useState } from 'react'
import { FiShoppingBag } from 'react-icons/fi'
import * as orderService from '../../services/order.service'
import Modal from '../ui/Modal'
import Loader from '../ui/Loader'
import Button from '../ui/Button'
import EmptyState from '../ui/EmptyState'
import { useToast } from '../toast/useToast'
import OrderStatusBadge from './OrderStatusBadge'
import OrderPaymentBadge from './OrderPaymentBadge'
import OrderTimeline from './OrderTimeline'
import {
  formatMoney,
  formatDateTime,
  formatCount,
} from '../../utils/format'
import {
  formatPaymentMethod,
  getOrderStatusMeta,
  getPaymentStatusMeta,
  ORDER_STATUS_META,
  PAYMENT_STATUS_META,
} from '../../utils/orderStatus'
import styles from './OrderDetailDrawer.module.css'

const ORDER_STATUS_OPTIONS = Object.entries(ORDER_STATUS_META).map(
  ([value, meta]) => ({ value, label: meta.label }),
)

const PAYMENT_STATUS_OPTIONS = Object.entries(PAYMENT_STATUS_META).map(
  ([value, meta]) => ({ value, label: meta.label }),
)

/**
 * Fetches + renders one order inside the drawer. Keyed by orderId (+ retry)
 * in OrderDetailDrawer so a fresh order always starts from the loading state.
 */
function OrderDetail({ orderId, onRetry, onOrderUpdated }) {
  const { showToast } = useToast()
  const [order, setOrder] = useState(null)
  const [state, setState] = useState('loading') // loading | ready | error
  const [error, setError] = useState('')
  const [statusDraft, setStatusDraft] = useState(null) // null → follow order.status
  const [paymentDraft, setPaymentDraft] = useState(null)
  const [saving, setSaving] = useState(null) // 'status' | 'payment' | null

  useEffect(() => {
    let ignore = false
    orderService
      .getOrder(orderId)
      .then((data) => {
        if (ignore) return
        setOrder(data)
        setState('ready')
      })
      .catch((err) => {
        if (ignore) return
        setError(err.message)
        setState('error')
      })
    return () => {
      ignore = true
    }
  }, [orderId])

  const handleStatusChange = async (event) => {
    const next = event.target.value
    if (!next || next === order.status || saving) return
    setStatusDraft(next)
    setSaving('status')
    try {
      const updated = await orderService.updateOrderStatus(order.id, next)
      setOrder(updated)
      showToast(`Status updated to ${getOrderStatusMeta(next).label}`, 'success')
      onOrderUpdated?.()
    } catch (err) {
      setStatusDraft(null)
      showToast(err.message, 'error')
    } finally {
      setSaving(null)
    }
  }

  const handlePaymentChange = async (event) => {
    const next = event.target.value
    if (!next || next === order.paymentStatus || saving) return
    setPaymentDraft(next)
    setSaving('payment')
    try {
      const updated = await orderService.updateOrderPaymentStatus(
        order.id,
        next,
      )
      setOrder(updated)
      showToast(
        `Payment updated to ${getPaymentStatusMeta(next).label}`,
        'success',
      )
      onOrderUpdated?.()
    } catch (err) {
      setPaymentDraft(null)
      showToast(err.message, 'error')
    } finally {
      setSaving(null)
    }
  }

  const shipping = order?.shipping || {}
  const contact = order?.contact || {}
  const totals = order?.totals || {}
  const addressLine1 = [shipping.line1, shipping.line2].filter(Boolean).join(', ')
  const addressLine2 = [shipping.city, shipping.state, shipping.pincode]
    .filter(Boolean)
    .join(', ')

  if (state === 'loading') {
    return (
      <div className={styles.stateWrap}>
        <Loader />
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className={styles.stateWrap}>
        <EmptyState
          icon={<FiShoppingBag size={28} />}
          title="Couldn't load order"
          description={error}
          action={
            <Button variant="outline" onClick={onRetry}>
              Try Again
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className={styles.content}>
      {/* ----- Summary: order number, badges + key dates ----- */}
      <div className={styles.summary}>
        <div className={styles.summaryLeft}>
          <span className={styles.orderNumber}>{order.altneuNumber || order.orderNumber}</span>
          <div className={styles.badges}>
            <OrderStatusBadge status={order.status} />
            <OrderPaymentBadge status={order.paymentStatus} />
          </div>
        </div>

        <dl className={styles.dates}>
          <div className={styles.dateItem}>
            <dt>Placed</dt>
            <dd>{formatDateTime(order.placedAt)}</dd>
          </div>
          <div className={styles.dateItem}>
            <dt>Created</dt>
            <dd>{formatDateTime(order.createdAt)}</dd>
          </div>
          <div className={styles.dateItem}>
            <dt>Updated</dt>
            <dd>{formatDateTime(order.updatedAt)}</dd>
          </div>
        </dl>
      </div>

      {/* ----- Update: status + payment ----- */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          Update Status &amp; Payment
        </h3>
        <div className={styles.updateGrid}>
          <label className={styles.field}>
            <span className={styles.label}>Status</span>
            <select
              className={styles.select}
              value={statusDraft ?? order.status}
              onChange={handleStatusChange}
              disabled={Boolean(saving)}
              aria-label="Update order status"
            >
              {ORDER_STATUS_OPTIONS.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                  disabled={option.value === order.status}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Payment</span>
            <select
              className={styles.select}
              value={paymentDraft ?? order.paymentStatus}
              onChange={handlePaymentChange}
              disabled={Boolean(saving)}
              aria-label="Update payment status"
            >
              {PAYMENT_STATUS_OPTIONS.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                  disabled={option.value === order.paymentStatus}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {saving && (
            <span className={styles.saving}>
              <Loader size="sm" />
              Updating…
            </span>
          )}
        </div>
      </section>

      {/* ----- Customer + Shipping ----- */}
      <div className={styles.grid}>
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Customer</h3>
          <dl className={styles.defList}>
            <div>
              <dt>Name</dt>
              <dd>{contact.name || '—'}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{contact.phone || '—'}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{contact.email || '—'}</dd>
            </div>
          </dl>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Shipping</h3>
          <dl className={styles.defList}>
            <div>
              <dt>Recipient</dt>
              <dd>{shipping.name || '—'}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{shipping.phone || '—'}</dd>
            </div>
            <div>
              <dt>Address</dt>
              <dd>
                <span className={styles.addressLine}>
                  {addressLine1 || '—'}
                </span>
                <span className={styles.addressLine}>
                  {addressLine2 || '—'}
                </span>
                <span className={styles.addressLine}>
                  {shipping.country || ''}
                </span>
              </dd>
            </div>
          </dl>
        </section>
      </div>

      {/* ----- Products ----- */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          Products ({formatCount(totals.count)})
        </h3>
        {order.items?.length ? (
          <ul className={styles.items}>
            {order.items.map((item) => (
              <li key={item.id} className={styles.item}>
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt=""
                    className={styles.itemImage}
                  />
                ) : (
                  <span className={styles.itemImage} aria-hidden="true" />
                )}
                <div className={styles.itemInfo}>
                  <span className={styles.itemName}>{item.name}</span>
                  <span className={styles.itemMeta}>
                    {[item.size, item.colorName].filter(Boolean).join(' · ')}
                  </span>
                </div>
                <span className={styles.itemQty}>× {item.quantity}</span>
                <span className={styles.itemPrice}>
                  {formatMoney(item.price * item.quantity)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.muted}>No items</p>
        )}
      </section>

      {/* ----- Payment + Totals ----- */}
      <div className={styles.grid}>
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Payment</h3>
          <dl className={styles.defList}>
            <div>
              <dt>Method</dt>
              <dd>{formatPaymentMethod(order.paymentMethod)}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <OrderPaymentBadge status={order.paymentStatus} />
              </dd>
            </div>
            {order.couponCode && (
              <div>
                <dt>Coupon</dt>
                <dd>{order.couponCode}</dd>
              </div>
            )}
          </dl>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Totals</h3>
          <dl className={styles.totals}>
            <div>
              <dt>Subtotal</dt>
              <dd>{formatMoney(totals.subtotal)}</dd>
            </div>
            {totals.discount > 0 && (
              <div>
                <dt>Discount</dt>
                <dd className={styles.discount}>
                  −{formatMoney(totals.discount)}
                </dd>
              </div>
            )}
            <div>
              <dt>Shipping</dt>
              <dd>{formatMoney(totals.shipping)}</dd>
            </div>
            <div>
              <dt>Tax</dt>
              <dd>{formatMoney(totals.tax)}</dd>
            </div>
            <div className={styles.grandTotal}>
              <dt>Total</dt>
              <dd>{formatMoney(totals.grandTotal)}</dd>
            </div>
          </dl>
        </section>
      </div>

      {/* ----- Timeline ----- */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Timeline</h3>
        <OrderTimeline order={order} />
      </section>

      {/* ----- Notes ----- */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Notes</h3>
        <p className={styles.notes}>{order.notes || 'No notes'}</p>
      </section>
    </div>
  )
}

function OrderDetailDrawer({ orderId, onClose, onOrderUpdated }) {
  const [retryKey, setRetryKey] = useState(0)

  return (
    <Modal
      open={Boolean(orderId)}
      onClose={onClose}
      size="lg"
      title="Order Details"
    >
      {orderId ? (
        <OrderDetail
          key={`${orderId}-${retryKey}`}
          orderId={orderId}
          onRetry={() => setRetryKey((current) => current + 1)}
          onOrderUpdated={onOrderUpdated}
        />
      ) : null}
    </Modal>
  )
}

export default OrderDetailDrawer