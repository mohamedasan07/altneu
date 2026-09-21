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
      <svg
        width="120"
        height="120"
        viewBox="0 0 120 120"
        fill="none"
        aria-hidden="true"
        className={styles.art}
      >
        <defs>
          <linearGradient id="altneu-bag-grad" x1="24" y1="20" x2="96" y2="108" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2b2b2b" />
            <stop offset="1" stopColor="#101010" />
          </linearGradient>
        </defs>
        <rect x="18" y="14" width="84" height="92" rx="14" fill="url(#altneu-bag-grad)" stroke="rgba(255,255,255,0.12)" />
        <path d="M40 44v-6a20 20 0 0 1 40 0v6" stroke="rgba(255,255,255,0.35)" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M30 34h60l-3 20H33l-3-20z" stroke="rgba(255,255,255,0.35)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="60" cy="60" r="15" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" strokeDasharray="3 5" />
        <path d="M60 48l4.5 4.5L60 57l-4.5-4.5L60 48z" fill="#ff4757" />
        <path d="M72 70l2.5 2.5 6 6" stroke="#ff4757" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="88" cy="38" r="3" fill="#ff4757" opacity="0.9" />
      </svg>

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