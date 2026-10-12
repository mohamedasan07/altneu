import { memo } from 'react';
import { formatINR } from '../../../utils/format';
import { cartTotals } from '../../../utils/cartConfig';
import styles from './CartSummary.module.css';

/**
 * Checkout-style summary: subtotal, shipping, estimated tax, grand total.
 * Totals are computed automatically from live cart items.
 */
function CartSummary({ items = [] }) {
  const { subtotal, shipping, tax, grandTotal } = cartTotals(items);

  return (
    <section className={styles.summary} aria-label="Order summary">
      <dl className={styles.rows}>
        <div className={styles.row}>
          <dt>Subtotal</dt>
          <dd>{formatINR(subtotal)}</dd>
        </div>
        <div className={styles.row}>
          <dt>Shipping</dt>
          <dd className={shipping === 0 ? styles.free : styles.shipping}>
            {shipping === 0 ? 'Free' : formatINR(shipping)}
          </dd>
        </div>
        <div className={styles.row}>
          <dt>Estimated Tax</dt>
          <dd>{formatINR(tax)}</dd>
        </div>
        <div className={styles.note}>GST 5% · Standard delivery (₹69)</div>
      </dl>

      <div className={styles.grand}>
        <span>Grand Total</span>
        <strong>{formatINR(grandTotal)}</strong>
      </div>
    </section>
  );
}

export default memo(CartSummary);