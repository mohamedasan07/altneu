import { memo, useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../../utils/cn';
import { formatINR } from '../../../utils/format';
import ImageSkeleton from '../../skeleton/ImageSkeleton/ImageSkeleton';
import styles from './OrderSummary.module.css';

/**
 * Compact read-only order summary: mini cart lines + price breakdown.
 * Used in the checkout sidebar (desktop) and collapsed view (mobile).
 */
function OrderSummary({ items, totals, deliveryLabel }) {
  const rows = [
    { label: 'Subtotal', value: formatINR(totals.subtotal) },
    {
      label: 'Delivery',
      value: totals.shipping === 0 ? 'Free' : formatINR(totals.shipping),
      sub: deliveryLabel,
    },
    { label: 'Taxes', value: formatINR(totals.tax), sub: 'GST included' },
  ];

  return (
    <section className={styles.summary} aria-label="Order summary">
      <header className={styles.header}>
        <h2 className={styles.title}>Your order</h2>
        <span className={styles.count}>
          {totals.count} {totals.count === 1 ? 'item' : 'items'}
        </span>
      </header>

      <ul className={styles.lines}>
        {items.map((item) => (
          <OrderSummaryItem key={`${item.productId}-${item.size}-${item.color}`} item={item} />
        ))}
      </ul>

      <dl className={styles.rows}>
        {rows.map((row) =>
          row.value == null ? null : (
            <div key={row.label} className={styles.row}>
              <dt className={styles.rowLabel}>{row.label}</dt>
              <dd className={styles.rowValue}>
                {row.sub && <span className={styles.rowSub}>{row.sub}</span>}
                {row.value}
              </dd>
            </div>
          ),
        )}
      </dl>

      <div className={styles.total}>
        <span className={styles.totalLabel}>Total</span>
        <span className={styles.totalValue}>{formatINR(totals.grandTotal)}</span>
      </div>

      <p className={styles.note}>
        Taxes and delivery are final — no surprise charges at checkout.
      </p>
    </section>
  );
}

function OrderSummaryItem({ item }) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const imgRef = useRef(null);

  useEffect(() => {
    if (imgRef.current?.complete) {
      setImageLoaded(true);
    }
  }, []);

  const handleLoad = () => setImageLoaded(true);
  const handleError = (e) => {
    setImageLoaded(true);
    e.currentTarget.style.opacity = '0';
  };

  return (
    <li className={styles.line}>
      <Link to={`/product/${item.productId}`} className={styles.thumbLink}>
        {item.imageUrl ? (
          <>
            {!imageLoaded && <ImageSkeleton />}
            <img
              ref={imgRef}
              className={cn(styles.thumb, !imageLoaded && styles.imgHidden)}
              src={item.imageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              onLoad={handleLoad}
              onError={handleError}
            />
          </>
        ) : (
          <span className={styles.thumbFallback} aria-hidden="true">
            {(item.name || '?').charAt(0)}
          </span>
        )}
        <span className={styles.qty}>×{Number(item.quantity) || 0}</span>
      </Link>
      <div className={styles.lineBody}>
        <Link to={`/product/${item.productId}`} className={styles.name}>
          {item.name}
        </Link>
        <p className={styles.meta}>
          {item.size}
          {item.colorName && (
            <>
              <span className={styles.sep}>·</span>
              {item.colorName}
            </>
          )}
        </p>
      </div>
      <span className={styles.linePrice}>{formatINR((Number(item.price) || 0) * (Number(item.quantity) || 0))}</span>
    </li>
  );
}

export default memo(OrderSummary);