import { useState } from 'react';
import { Link } from 'react-router-dom';
import Container from '../../ui/Container/Container';
import styles from './Footer.module.css';

const FOOTER_GROUPS = [
  {
    title: 'Shop',
    links: [
      { to: '/collections', label: 'All Products' },
      { to: '/collections?sort=newest', label: 'New Arrivals' },
      { to: '/collections?sale=true', label: 'Sale' },
    ],
  },
  {
    title: 'Collections',
    links: [
      { to: '/collections?category=tshirts', label: 'T-Shirts' },
      { to: '/collections?category=jerseys', label: 'Jerseys' },
      { to: '/collections?category=shirts', label: 'Shirts' },
      { to: '/collections?category=baggy', label: 'Baggy' },
    ],
  },
  {
    title: 'Account',
    links: [
      { to: '/login', label: 'Login' },
      { to: '/register', label: 'Register' },
      { to: '/cart', label: 'Cart' },
      { to: '/wishlist', label: 'Wishlist' },
      { to: '/profile', label: 'My Account' },
    ],
  },
  {
    title: 'Quick Links',
    links: [
      { to: '/about', label: 'About Us' },
      { to: '/contact', label: 'Contact' },
      { to: '/terms', label: 'Terms and Conditions' },
      { to: '/shipping', label: 'Shipping & Order Policy' },
    ],
  },
];

export default function Footer() {
  const [openGroup, setOpenGroup] = useState(null);

  const toggleGroup = (title) => {
    setOpenGroup(openGroup === title ? null : title);
  };

  return (
    <footer className={styles.footer}>
      <Container className={styles.inner}>
        <div className={styles.topSection}>
          <div className={styles.brandBlock}>
            <Link to="/" aria-label="ALTNEU Home">
              <img src="/images/altneu_admin_logo.png" alt="ALTNEU" className={styles.metallicLogo} />
            </Link>
            <p className={styles.tagline}>For the Unfiltered.</p>
          </div>
        </div>

        <div className={styles.groups}>
          {FOOTER_GROUPS.map((group) => {
            const isOpen = openGroup === group.title;
            return (
              <nav key={group.title} className={`${styles.navGroup} ${isOpen ? styles.isOpen : ''}`}>
                <button
                  className={styles.groupHeader}
                  onClick={() => toggleGroup(group.title)}
                  aria-expanded={isOpen}
                >
                  <h2 className={styles.groupTitle}>{group.title}</h2>
                  <svg
                    className={styles.chevron}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>
                <div className={styles.groupContent}>
                  <ul className={styles.groupList}>
                    {group.links.map((link) => (
                      <li key={link.label}>
                        {link.external ? (
                          <a href={link.to} className={styles.groupLink}>
                            {link.label}
                          </a>
                        ) : (
                          <Link to={link.to} className={styles.groupLink}>
                            {link.label}
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </nav>
            );
          })}
        </div>
      </Container>

      <div className={styles.bottomBar}>
        <Container className={styles.bottomInner}>
          <p className={styles.copy}>© {new Date().getFullYear()} ALTNEU. All rights reserved.</p>
        </Container>
      </div>
    </footer>
  );
}