import { memo, useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { formatINR } from '../../../utils/format';
import { cn } from '../../../utils/cn';
import { MAX_ITEM_QTY } from '../../../utils/cartConfig';
import QuantitySelector from '../QuantitySelector/QuantitySelector';
import ImageSkeleton from '../../skeleton/ImageSkeleton/ImageSkeleton';
import styles from './CartItem.module.css';

const EXIT = {
  opacity: 0,
  x: 48,
  height: 0,
  marginBottom: 0,
  paddingTop: 0,
  paddingBottom: 0,
  transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
};

/**
 * Single cart line. Memoized — only re-renders when its own line changes,
 * so quantity updates on one product never redraw the whole list.
 */
function CartItem({ item, onRemove, onIncrease, onDecrease }) {
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

  const unitPrice = Number(item.price) || 0;
  const lineTotal = unitPrice * (Number(item.quantity) || 0);
  const maxQty = Math.max(1, Math.min(MAX_ITEM_QTY, Number(item.stockQuantity) || MAX_ITEM_QTY));

  return (
    <motion.li
      className={styles.item}
      layout
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={EXIT}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link
        to={`/product/${item.productId}`}
        className={styles.thumbLink}
        aria-label={`View ${item.name}`}
      >
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
      </Link>

      <div className={styles.details}>
        <div className={styles.top}>
          <Link to={`/product/${item.productId}`} className={styles.name}>
            {item.name}
          </Link>
          <button
            type="button"
            className={styles.remove}
            onClick={onRemove}
            aria-label={`Remove ${item.name} from cart`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M5 5l14 14" />
              <path d="M19 5L5 19" />
            </svg>
          </button>
        </div>

        <p className={styles.meta}>
          <span>Size</span> {item.size}
          <span className={styles.metaSep}>·</span>
          <span>Color</span> {item.colorName || item.color}
        </p>

        <div className={styles.bottom}>
          <QuantitySelector
            compact
            value={Number(item.quantity) || 1}
            max={maxQty}
            onChange={(value) => (value > item.quantity ? onIncrease?.() : onDecrease?.())}
            label="Quantity"
          />
          <div className={styles.price}>
            <span className={styles.unit}>₹ {unitPrice.toLocaleString('en-IN')} each</span>
            <span className={styles.total}>{formatINR(lineTotal)}</span>
          </div>
        </div>
      </div>
    </motion.li>
  );
}

export default memo(CartItem);