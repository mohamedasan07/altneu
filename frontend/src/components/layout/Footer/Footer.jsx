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
      { to: '/collections?category=accessories', label: 'Accessories' },
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
    title: 'Support',
    links: [
      { to: 'mailto:support@altnue.com', label: 'Contact', external: true },
    ],
  },
];

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <Container className={styles.inner}>
        <div className={styles.topSection}>
          <div className={styles.brandBlock}>
            <Link to="/" aria-label="ALTNEU Home">
              <img src="/images/altnue_admin_logo.png" alt="ALTNEU" className={styles.metallicLogo} />
            </Link>
            <p className={styles.tagline}>For the Unfiltered.</p>
          </div>
        </div>

        <div className={styles.groups}>
          {FOOTER_GROUPS.map((group) => (
            <nav key={group.title} aria-label={`Footer — ${group.title}`}>
              <h2 className={styles.groupTitle}>{group.title}</h2>
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
            </nav>
          ))}
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