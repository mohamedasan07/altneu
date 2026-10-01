import { AnimatePresence, motion } from 'framer-motion';
import Button from '../ui/Button/Button';
import ProductCard from '../ProductCard/ProductCard';
import { EASE_OUT } from '../../utils/motion';
import styles from './ProductGrid.module.css';



const cell = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: EASE_OUT },
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    transition: { duration: 0.2, ease: EASE_OUT },
  },
};

/**
 * Product grid with layout-animated cells. Handles loading skeletons,
 * error, plain empty catalogs, and the discovery empty state (with a
 * Reset Filters action) — used by the collections filters.
 */
export default function ProductGrid({
  products = [],
  status = 'ready',
  error = null,
  onRetry,
  emptyTitle,
  emptyCopy,
  onReset,
}) {


  if (status === 'error') {
    return (
      <div className={styles.state} role="alert">
        <p className={styles.stateTitle}>Failed to load products.</p>
        <p className={styles.stateCopy}>
          {error?.message || 'Is the backend running?'}
        </p>
        {onRetry && (
          <Button variant="outline" size="md" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    );
  }

  if (!products.length) {
    return (
      <motion.div
        className={`${styles.state} ${styles.stateCentered}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE_OUT }}
      >
        <svg
          className={styles.emptyArt}
          width="88"
          height="88"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="20.4" y1="20.4" x2="16.5" y2="16.5" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
        <p className={styles.stateTitle}>{emptyTitle || 'No products yet.'}</p>
        <p className={styles.stateCopy}>
          {emptyCopy || 'Check back soon for new drops.'}
        </p>
        {onReset && (
          <div className={styles.emptyActions}>
            <Button variant="primary" size="md" onClick={onReset}>
              Reset Filters
            </Button>
            <Button variant="outline" size="md" to="/">
              Continue Shopping
            </Button>
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <motion.ul className={styles.grid} aria-label="Product list" layout>
      <AnimatePresence mode="popLayout" initial={false}>
        {products.map((product) => (
          <motion.li
            key={product.id}
            className={styles.cell}
            variants={cell}
            layout
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ layout: { duration: 0.35, ease: EASE_OUT } }}
          >
            <ProductCard product={product} />
          </motion.li>
        ))}
      </AnimatePresence>
    </motion.ul>
  );
}