import { motion } from 'framer-motion';
import Button from '../../ui/Button/Button';
import styles from './WishlistEmpty.module.css';

/** Premium empty-wishlist state — illustration, copy, and a Browse Collection CTA. */
export default function WishlistEmpty() {
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
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
        </svg>
      </div>

      <p className={styles.kicker}>Saved</p>
      <h3 className={styles.title}>Your wishlist is waiting.</h3>
      <p className={styles.copy}>Save the pieces you love and come back anytime.</p>

      <Button to="/collections" variant="primary" size="md" className={styles.cta}>
        Browse Collection
      </Button>
    </motion.div>
  );
}