import { useCart } from '../../hooks/useCart';
import styles from './Navbar.module.css';

const CART_ICON = (
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
    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
    <path d="M3 6h18" />
    <path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
);

/**
 * Cart button — live item count from cart state, opens the cart drawer.
 */
export default function CartButton() {
  const { count, openCart } = useCart();
  const label = count > 0 ? `Open cart, ${count} items` : 'Open cart';

  return (
    <button type="button" className={styles.iconLink} onClick={openCart} aria-label={label}>
      {CART_ICON}
      {count > 0 && (
        <span className={styles.badge} aria-hidden="true">
          {count > 99 ? '99+' : count}
        </span>
      )}
      <span className="visually-hidden">
        Cart, {count} {count === 1 ? 'item' : 'items'}
      </span>
    </button>
  );
}