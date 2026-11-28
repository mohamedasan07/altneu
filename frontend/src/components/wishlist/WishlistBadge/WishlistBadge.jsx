import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useWishlist } from '../../../hooks/useWishlist';
import styles from './WishlistBadge.module.css';

const HEART_ICON = (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
  </svg>
);

/** Navbar wishlist entry — heart icon + live count badge with a pop on change. */
export default function WishlistBadge() {
  const { count } = useWishlist();
  const reduceMotion = useReducedMotion();
  const label = count > 0 ? `Wishlist, ${count} saved items` : 'Wishlist';

  return (
    <Link to="/wishlist" className={styles.link} aria-label={label}>
      {HEART_ICON}
      {count > 0 && (
        <span className={styles.badge} aria-hidden="true">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={count}
              className={styles.value}
              initial={reduceMotion ? false : { scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={reduceMotion ? undefined : { scale: 0.5, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 520, damping: 26 }}
            >
              {count > 99 ? '99+' : count}
            </motion.span>
          </AnimatePresence>
        </span>
      )}
      <span className="visually-hidden">{label}</span>
    </Link>
  );
}