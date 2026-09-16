import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../../../hooks/useCart';
import { useFocusTrap } from '../../../hooks/useFocusTrap';

import CartItem from '../CartItem/CartItem';
import CartSummary from '../CartSummary/CartSummary';
import EmptyCart from '../EmptyCart/EmptyCart';
import styles from './CartDrawer.module.css';

const PANEL_EASE = [0.22, 1, 0.36, 1];
const PANEL_TRANSITION = { duration: 0.38, ease: PANEL_EASE };

/**
 * Premium slide-in cart drawer.
 * Portal'd to <body>: blur overlay, right-side panel, focus trap,
 * ESC closes, click-outside closes, body scroll is locked while open.
 */
export default function CartDrawer() {
  const {
    items,
    count,
    totals,
    isOpen,
    removeFromCart,
    increaseQuantity,
    decreaseQuantity,
    closeCart,
  } = useCart();
  const panelRef = useFocusTrap(isOpen);
  const navigate = useNavigate();

  // ESC to close + body scroll lock.
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') closeCart();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, closeCart]);

  const empty = items.length === 0;

  const goTo = (path) => {
    closeCart();
    navigate(path);
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className={styles.root}>
          <motion.div
            className={styles.overlay}
            onClick={closeCart}
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          />

          <motion.aside
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cart-drawer-title"
            tabIndex={-1}
            className={styles.panel}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={PANEL_TRANSITION}
          >
            <header className={styles.header}>
              <div>
                <p className={styles.kicker}>Bag</p>
                <h2 id="cart-drawer-title" className={styles.title}>
                  Your Bag
                  <span className={styles.count}>
                    {count} {count === 1 ? 'item' : 'items'}
                  </span>
                </h2>
              </div>
              <button
                type="button"
                className={styles.close}
                onClick={closeCart}
                aria-label="Close cart"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <path d="M5 5l14 14" />
                  <path d="M19 5L5 19" />
                </svg>
              </button>
            </header>



            <div className={styles.body}>
              {empty ? (
                <EmptyCart onContinue={closeCart} />
              ) : (
                <ul className={styles.list} aria-label="Cart items">
                  <AnimatePresence initial={false}>
                    {items.map((item) => (
                      <CartItem
                        key={item.id}
                        item={item}
                        onRemove={() => removeFromCart(item.id)}
                        onIncrease={() => increaseQuantity(item.id)}
                        onDecrease={() => decreaseQuantity(item.id)}
                      />
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </div>

            {!empty && (
              <footer className={styles.footer}>
                <CartSummary items={items} />
                <button type="button" className={styles.checkout} onClick={() => goTo('/checkout')}>
                  Checkout
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 12h16" />
                    <path d="M13 5l7 7-7 7" />
                  </svg>
                </button>
                <button type="button" className={styles.continue} onClick={closeCart}>
                  Continue Shopping
                </button>
              </footer>
            )}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}