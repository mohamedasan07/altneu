import { Link, useLocation } from 'react-router-dom';
import { DASHBOARD_SECTIONS } from '../DashboardSidebar/DashboardSidebar';
import styles from './DashboardHeader.module.css';

/**
 * Dashboard top bar — page title, mobile drawer trigger and a quick shop link.
 * Title is derived from the active account section.
 */
export default function DashboardHeader({ onOpenMenu }) {
  const { pathname } = useLocation();
  const current = DASHBOARD_SECTIONS.find((s) => (s.end ? pathname === s.to : pathname.startsWith(s.to)));
  const title = current?.label ?? 'Account';

  return (
    <header className={styles.header}>
      <button
        type="button"
        className={styles.menu}
        onClick={onOpenMenu}
        aria-label="Open account menu"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M3.5 7h17" />
          <path d="M3.5 12h17" />
          <path d="M3.5 17h17" />
        </svg>
      </button>

      <div>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.crumb}>Account / {title}</p>
      </div>

      <Link to="/collections" className={styles.shop}>
        ← Back to shop
      </Link>
    </header>
  );
}