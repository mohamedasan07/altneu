import { formatINR } from '../../../utils/format';
import { FLAT_SHIPPING_FEE } from '../../../utils/cartConfig';
import styles from './ShippingProgress.module.css';

/**
 * Standard delivery info banner.
 */
export default function ShippingProgress() {
  return (
    <section className={styles.wrap} aria-label="Shipping information">
      <div className={styles.copy}>
        <p className={styles.prompt}>
          Standard Delivery: <strong className={styles.amount}>{formatINR(FLAT_SHIPPING_FEE)}</strong> fixed shipping per order across India via ST Courier.
        </p>
      </div>
    </section>
  );
}