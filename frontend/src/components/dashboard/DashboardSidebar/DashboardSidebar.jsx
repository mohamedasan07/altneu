import { NavLink } from 'react-router-dom';
import { cn } from '../../../utils/cn';
import styles from './DashboardSidebar.module.css';

// Single source of truth for the account dashboard navigation.
export const DASHBOARD_SECTIONS = [
  { to: '/account', label: 'Dashboard', end: true, icon: <IconGrid /> },
  { to: '/account/orders', label: 'My Orders', icon: <IconBox /> },
  { to: '/account/wishlist', label: 'Wishlist', icon: <IconHeart /> },
  { to: '/account/addresses', label: 'Addresses', icon: <IconPin /> },
  { to: '/account/profile', label: 'Profile', icon: <IconUser /> },
  { to: '/account/settings', label: 'Settings', icon: <IconGear /> },
];

/**
 * Account sidebar. Fixed on desktop, slide-in drawer on mobile.
 * `open` + `onNavigate` drive the mobile drawer (parent owns the state).
 */
export default function DashboardSidebar({ open = false, onNavigate }) {
  return (
    <aside
      id="altneu-dashboard-sidebar"
      className={styles.sidebar}
      aria-label="Account navigation"
      aria-hidden={open ? undefined : true}
    >
      <nav className={styles.nav}>
        <p className={styles.kicker}>Account</p>
        <ul className={styles.list}>
          {DASHBOARD_SECTIONS.map(({ to, label, end, icon }, i) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                onClick={onNavigate}
                className={({ isActive }) => (isActive ? cn(styles.link, styles.linkActive) : styles.link)}
              >
                <span className={styles.icon} aria-hidden="true">
                  {icon}
                </span>
                <span>{label}</span>
                <span className={styles.index} aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className={styles.footer}>
        <NavLink to="/collections" className={styles.shop} onClick={onNavigate}>
          ← Back to shop
        </NavLink>
      </div>
    </aside>
  );
}

/* ---------------- Icons ---------------- */
function IconGrid() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  );
}
function IconBox() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7l8-4 8 4v10l-8 4-8-4V7z" />
      <path d="M4 7l8 4 8-4" />
      <path d="M12 11v10" />
    </svg>
  );
}
function IconHeart() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20s-7-4.6-7-10.1A4.4 4.4 0 0 1 12 6a4.4 4.4 0 0 1 7 3.8C19 15.4 12 20 12 20z" />
    </svg>
  );
}
function IconPin() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}
function IconUser() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="7.5" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}
function IconGear() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}