import { Link, useLocation } from 'react-router-dom';
import { useCart } from '../../../hooks/useCart';
import { useAuth } from '../../../hooks/useAuth';
import styles from './BottomNav.module.css';

const HOME_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const SHOP_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
  </svg>
);

const CART_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 7h14l-1 13H6L5 7z" />
    <path d="M9 7a3 3 0 0 1 6 0" />
  </svg>
);

const WISHLIST_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20s-7-4.6-7-10.1A4.4 4.4 0 0 1 12 6a4.4 4.4 0 0 1 7 3.8C19 15.4 12 20 12 20z" />
  </svg>
);

const ACCOUNT_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="7.5" r="3.5" />
    <path d="M5 20a7 7 0 0 1 14 0" />
  </svg>
);

export default function BottomNav() {
  const { pathname } = useLocation();
  const { count, openCart } = useCart();
  const { user } = useAuth();

  const isHome = pathname === '/';
  const isShop = pathname.startsWith('/collections') || pathname.startsWith('/product');
  const isWishlist = pathname.startsWith('/wishlist');
  const isAccount = pathname.startsWith('/account') || pathname.startsWith('/login');

  return (
    <nav className={styles.bottomNav} aria-label="Mobile Bottom Navigation">
      <Link to="/" className={`${styles.navItem} ${isHome ? styles.active : ''}`}>
        <div className={styles.iconWrapper}>{HOME_ICON}</div>
        <span className={styles.label}>Home</span>
      </Link>

      <Link to="/collections" className={`${styles.navItem} ${isShop ? styles.active : ''}`}>
        <div className={styles.iconWrapper}>{SHOP_ICON}</div>
        <span className={styles.label}>Shop</span>
      </Link>

      <button type="button" onClick={openCart} className={styles.navItem}>
        <div className={styles.iconWrapper}>
          {CART_ICON}
          {count > 0 && (
            <span className={styles.badge}>{count > 99 ? '99+' : count}</span>
          )}
        </div>
        <span className={styles.label}>Cart</span>
      </button>

      <Link to="/wishlist" className={`${styles.navItem} ${isWishlist ? styles.active : ''}`}>
        <div className={styles.iconWrapper}>{WISHLIST_ICON}</div>
        <span className={styles.label}>Wishlist</span>
      </Link>

      <Link to={user ? "/account" : "/login"} className={`${styles.navItem} ${isAccount ? styles.active : ''}`}>
        <div className={styles.iconWrapper}>{ACCOUNT_ICON}</div>
        <span className={styles.label}>Account</span>
      </Link>
    </nav>
  );
}
