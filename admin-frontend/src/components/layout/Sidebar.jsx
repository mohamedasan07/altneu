import { NavLink } from 'react-router-dom'
import {
  FiGrid,
  FiPackage,
  FiShoppingBag,
  FiUsers,
  FiBarChart2,
  FiLogOut,
} from 'react-icons/fi'
import classNames from '../../utils/classNames'
import { useAuth } from '../../hooks/useAuth'
import styles from './Sidebar.module.css'

const NAV_ITEMS = [
  { label: 'Dashboard', to: '/dashboard', icon: FiGrid, end: true },
  { label: 'Products', to: '/products', icon: FiPackage },
  { label: 'Orders', to: '/orders', icon: FiShoppingBag },
  { label: 'Customers', to: '/customers', icon: FiUsers },
  { label: 'Analytics', to: '/analytics', icon: FiBarChart2 },
]

function Sidebar({ mobileOpen = false, desktopCollapsed = false, onCloseMobile }) {
  const { logout } = useAuth()

  return (
    <aside
      className={classNames(
        styles.sidebar,
        mobileOpen && styles.isOpenMobile,
        desktopCollapsed && styles.isCollapsedDesktop
      )}
      aria-hidden={desktopCollapsed && !mobileOpen}
    >
      <div className={styles.header}>
        <div className={styles.logoWrapper}>
          <img
            src="/images/altnue_admin_logo.png"
            alt="ALTNEU"
            className={styles.logoImage}
          />
        </div>
      </div>

      <nav className={styles.nav} aria-label="Primary">
        <ul className={styles.navList}>
          {NAV_ITEMS.map(({ label, to, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                onClick={onCloseMobile}
                className={({ isActive }) =>
                  classNames(styles.navItem, isActive && styles.isActive)
                }
              >
                <Icon size={18} className={styles.navIcon} />
                <span>{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.navItem}
          onClick={logout}
        >
          <FiLogOut size={18} className={styles.navIcon} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  )
}

export default Sidebar
