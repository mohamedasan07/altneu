import { useState } from 'react';
import { Link } from 'react-router-dom';
import Container from '../../ui/Container/Container';
import styles from './Footer.module.css';

const SOCIALS = [
  {
    label: 'Instagram',
    href: 'https://www.instagram.com/altneu.co/',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="3.6" />
        <path d="M16.8 7.2h.01" />
      </svg>
    ),
  },
  {
    label: 'Facebook',
    href: '#',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
      </svg>
    ),
  },
  {
    label: 'WhatsApp',
    href: 'https://api.whatsapp.com/send?phone=916381245772&text=Hi%20ALTNEU%2C%20I%20have%20an%20enquiry%20about%20your%20products.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
      </svg>
    ),
  },
];

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
      { to: '/account', label: 'My Account' },
      { to: '/account/orders', label: 'My Orders' },
      { to: '/wishlist', label: 'Wishlist' },
      { to: '/cart', label: 'Cart' },
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

          <ul className={styles.socialList}>
            {SOCIALS.map(({ label, href, icon }) => (
              <li key={label}>
                <a
                  href={href}
                  target={href !== '#' ? "_blank" : undefined}
                  rel={href !== '#' ? "noopener noreferrer" : undefined}
                  className={styles.socialLink}
                  aria-label={label}
                >
                  {icon}
                </a>
              </li>
            ))}
          </ul>
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

      <a
        href="https://api.whatsapp.com/send?phone=916381245772&text=Hi%20ALTNEU%2C%20I%20have%20an%20enquiry%20about%20your%20products."
        className={styles.floatingWhatsapp}
        aria-label="Chat on WhatsApp"
        target="_blank"
        rel="noopener noreferrer"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
        </svg>
      </a>
    </footer>
  );
}