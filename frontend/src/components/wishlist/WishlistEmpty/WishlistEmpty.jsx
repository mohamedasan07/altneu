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
      <svg
        width="120"
        height="120"
        viewBox="0 0 120 120"
        fill="none"
        aria-hidden="true"
        className={styles.art}
      >
        <defs>
          <linearGradient id="altneu-heart-grad" x1="22" y1="20" x2="98" y2="104" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2b2b2b" />
            <stop offset="1" stopColor="#101010" />
          </linearGradient>
        </defs>
        <path
          d="M60 96s-30-19-42-40C12 44 24 28 42 28c10 0 15 6 18 9 3-3 8-9 18-9 18 0 30 16 24 28-12 21-42 40-42 40z"
          fill="url(#altneu-heart-grad)"
          stroke="rgba(255,255,255,0.14)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M60 62l4.6 4.6 10.5 10.5"
          stroke="#ff4757"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="88" cy="36" r="3.5" fill="#ff4757" opacity="0.9" />
        <path d="M101 24l2 2 4 4" stroke="#ff4757" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="24" cy="84" r="2.5" fill="rgba(255,255,255,0.35)" />
        <circle cx="98" cy="84" r="2" fill="rgba(255,255,255,0.25)" />
      </svg>

      <p className={styles.kicker}>Saved</p>
      <h3 className={styles.title}>Your wishlist is waiting.</h3>
      <p className={styles.copy}>Save the pieces you love and come back anytime.</p>

      <Button to="/collections" variant="primary" size="md" className={styles.cta}>
        Browse Collection
      </Button>
    </motion.div>
  );
}