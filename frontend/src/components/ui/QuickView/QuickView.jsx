import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { resolveUrl } from '../../../services';
import styles from './QuickView.module.css';

const inr = (n) => n.toLocaleString('en-IN');

export default function QuickView({ product, open, onClose, rating, isNew, onWishlist, onAddToCart }) {
  const [wish, setWish] = useState(false);
  const closeRef = useRef(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (open) {
      const onKey = (e) => e.key === 'Escape' && onClose();
      document.addEventListener('keydown', onKey);
      document.body.style.overflow = 'hidden';
      closeRef.current?.focus();
      return () => {
        document.removeEventListener('keydown', onKey);
        document.body.style.overflow = '';
      };
    }
    return undefined;
  }, [open, onClose]);

  if (!mounted) return null;

  const price = Number(product?.price) || 0;
  const oldPrice = Number(product?.oldPrice) || 0;
  const showOld = oldPrice > 0 && oldPrice > price;
  const discount = showOld ? Math.round((1 - price / oldPrice) * 100) : 0;
  const stockQuantity = Number(product?.stockQuantity) || 0;
  const outOfStock = stockQuantity <= 0;
  const name = product?.name || 'Untitled';
  const primary = resolveUrl(product?.imageUrl);
  const secondary = resolveUrl(
    product?.secondaryImageUrl || product?.imageUrl2 || product?.imageGallery?.[1] || ''
  );

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className={styles.backdrop}
          onClick={onClose}
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <motion.div
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-label={`Quick view: ${name}`}
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <button
              type="button"
              className={styles.close}
              onClick={onClose}
              ref={closeRef}
              aria-label="Close quick view"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
                strokeLinejoin="round" aria-hidden="true">
                <path d="M5 5l14 14" />
                <path d="M19 5L5 19" />
              </svg>
            </button>

            <div className={styles.grid}>
              <div className={styles.media}>
                <img src={primary} alt={name} />
                {secondary && (
                  <img
                    src={secondary}
                    alt=""
                    aria-hidden="true"
                    className={styles.imgSecondary}
                    onError={(e) => {
                      e.currentTarget.style.opacity = '0';
                    }}
                  />
                )}
                {(product?.sale || isNew) && (
                  <div className={styles.badges}>
                    {product?.sale && <span className={styles.badgeSale}>Sale</span>}
                    {isNew && <span className={styles.badgeNew}>New</span>}
                  </div>
                )}
                {showOld && (
                  <span className={styles.discount} aria-hidden="true">
                    −{discount}%
                  </span>
                )}
              </div>

              <div className={styles.info}>
                <p className={styles.cat}>{product?.category || 'ALTNEU'}</p>
                <h3 className={styles.name}>{name}</h3>

                <div className={styles.priceRow}>
                  <span className={styles.price}>₹ {inr(price)}</span>
                  {showOld && (
                    <span className={styles.old} aria-hidden="true">
                      ₹ {inr(oldPrice)}
                    </span>
                  )}
                </div>

                <p className={styles.desc}>
                  {product?.description || 'A ALTNEU piece. For the unfiltered.'}
                </p>

                <p className={styles.stock}>
                  {outOfStock
                    ? 'Out of stock'
                    : stockQuantity <= 5
                      ? `Only ${stockQuantity} left`
                      : `In stock · ${stockQuantity}`}
                </p>

                <button
                  type="button"
                  className={styles.add}
                  disabled={outOfStock}
                  onClick={() => onAddToCart && onAddToCart(product)}
                >
                  {outOfStock ? 'Sold Out' : 'Add to Cart'}
                </button>

                <button
                  type="button"
                  className={styles.wish}
                  onClick={() => setWish((w) => !w)}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill={wish ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 20s-7-4.6-7-10.1A4.4 4.4 0 0 1 12 6a4.4 4.4 0 0 1 7 3.8C19 15.4 12 20 12 20z" />
                  </svg>
                  {wish ? 'Wishlisted' : 'Add to Wishlist'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}