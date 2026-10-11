import { motion } from 'framer-motion';
import Button from '../../ui/Button/Button';
import styles from './EmptyCart.module.css';

/**
 * Premium empty-cart state — inline illustration, copy, and a CTA that
 * routes the shopper straight back to the catalog.
 */
export default function EmptyCart({ onContinue }) {
  return (
    <motion.div
      className={styles.wrap}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className={styles.art} aria-hidden="true">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          focusable="false"
        >
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
          <path d="M3 6h18" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
      </div>

      <p className={styles.kicker}>Nothing yet</p>
      <h3 className={styles.title}>Your cart is empty.</h3>
      <p className={styles.copy}>
        Fresh drops are waiting. Find the piece that&apos;s got your name on it.
      </p>

      <Button
        to="/collections"
        variant="primary"
        size="md"
        className={styles.cta}
        onClick={onContinue}
      >
        Continue Shopping
      </Button>
    </motion.div>
  );
}