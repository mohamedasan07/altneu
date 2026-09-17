import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '../../utils/cn';
import styles from './Navbar.module.css';

// Single source of truth for navigation links — shared by desktop + mobile.
export const NAV_ITEMS = [
  { to: '/', label: 'HOME', end: true },
  { to: '/collections', label: 'SHOP ALL', requireEmptySearch: true },
  {
    to: '/collections?category=apparel',
    label: 'APPAREL',
    requiredSearch: '?category=apparel',
    dropdown: [
      { to: '/collections?category=tshirts', label: 'TSHIRTS' },
      { to: '/collections?category=shirts', label: 'SHIRTS' },
      { to: '/collections?category=jerseys', label: 'JERSEYS' },
      { to: '/collections?category=baggy', label: 'BAGGY' },
    ]
  },
  { to: '/about', label: 'ABOUT' },
  { to: '/contact', label: 'CONTACT' },
];

/**
 * Renders the primary navigation links.
 * `mobile` renders the large touch-friendly list used by MobileMenu.
 */
export default function NavLinks({ mobile = false, onNavigate }) {
  const location = useLocation();

  return (
    <ul className={mobile ? styles.mobileList : styles.navList}>
      {NAV_ITEMS.map(({ to, label, end, requireEmptySearch, requiredSearch, dropdown }, index) => {
        const basePath = to.split('?')[0];
        const isPathMatch = end
          ? location.pathname === basePath
          : location.pathname.startsWith(basePath);

        let isActive = isPathMatch;
        if (isPathMatch) {
          if (requireEmptySearch && location.search && location.search !== '') {
            isActive = false;
          } else if (requiredSearch && location.search !== requiredSearch) {
            isActive = false;
          }
        }

        return (
          <li key={label} className={styles.navItem}>
            <NavLink
              to={to}
              end={end}
              onClick={onNavigate}
              className={() =>
                cn(
                  mobile ? styles.mobileLink : styles.link,
                  isActive && (mobile ? styles.mobileLinkActive : styles.linkActive)
                )
              }
            >
              {mobile && (
                <span className={styles.mobileIndex} aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
              )}
              {label}
              {!mobile && dropdown && (
                <svg className={styles.chevron} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              )}
            </NavLink>

            {/* Desktop dropdown */}
            {!mobile && dropdown && (
              <div className={styles.dropdown}>
                {dropdown.map(sub => (
                  <NavLink key={sub.label} to={sub.to} className={styles.dropdownLink}>
                    {sub.label}
                  </NavLink>
                ))}
              </div>
            )}

            {/* Mobile dropdown inline */}
            {mobile && dropdown && (
              <ul className={styles.mobileDropdown}>
                {dropdown.map(sub => (
                  <li key={sub.label}>
                    <NavLink
                      to={sub.to}
                      onClick={onNavigate}
                      className={({ isActive: subActive }) =>
                        cn(styles.mobileDropdownLink, subActive && styles.mobileDropdownLinkActive)
                      }
                    >
                      {sub.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}