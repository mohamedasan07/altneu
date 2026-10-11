import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import styles from './Navbar.module.css';

const PROFILE_ICON = (
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
    <circle cx="12" cy="7.5" r="3.5" />
    <path d="M5 20a7 7 0 0 1 14 0" />
  </svg>
);

/**
 * Profile button — the desktop account control.
 * Logged in: the account icon links straight through to the account dashboard.
 * Logged out: it links to the login route. Account sections (orders, wishlist,
 * addresses, logout) are reached from the dashboard sidebar, not a dropdown.
 */
export default function ProfileButton() {
  const { user } = useAuth();
  const to = user ? '/account' : '/login';
  const label = user ? 'Go to your account dashboard' : 'Login and create account';

  return (
    <Link to={to} className={styles.iconLink} aria-label={label}>
      {PROFILE_ICON}
      <span className="visually-hidden">{user ? 'Account dashboard' : 'Login'}</span>
    </Link>
  );
}