import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { NavLink } from 'react-router-dom';
import { cn } from '../../utils/cn';
import Logo from './Logo';
import NavLinks from './NavLinks';
import styles from './Navbar.module.css';

const SOCIALS = [
  {
    label: 'ALTNEU on Instagram',
    href: 'https://instagram.com',
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
    label: 'ALTNEU on X',
    href: 'https://x.com',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <path d="M4 4l16 16" />
        <path d="M20 4L4 20" />
      </svg>
    ),
  },
  {
    label: 'ALTNEU on YouTube',
    href: 'https://youtube.com',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2.5" y="6" width="19" height="12" rx="3.5" />
        <path d="M10.5 9.8l4.5 2.2-4.5 2.2v-4.4z" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
];

/**
 * Full-screen slide menu for mobile.
 * Locks body scroll while open, closes on Escape/navigation.
 */
export default function MobileMenu({ open, onClose }) {
  const [activeSubmenu, setActiveSubmenu] = useState(null);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      setActiveSubmenu(null);
    };
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          id="altneu-mobile-menu"
          className={styles.mobileMenu}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          <div className={styles.mobileTop}>
            {activeSubmenu ? (
              <button
                type="button"
                className={styles.mobileBackBtn}
                onClick={() => setActiveSubmenu(null)}
                aria-label="Go back"
              >
                &larr;
              </button>
            ) : (
              <Logo onClick={onClose} />
            )}
            <button
              type="button"
              className={styles.iconBtn}
              onClick={onClose}
              aria-label="Close menu"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12" />
                <path d="M18 6L6 18" />
              </svg>
            </button>
          </div>

          <nav className={styles.mobileNav} aria-label="Primary mobile">
            {activeSubmenu ? (
              <ul className={styles.mobileList}>
                {activeSubmenu.dropdown.map(sub => (
                  <li key={sub.label} className={styles.navItem}>
                    <NavLink
                      to={sub.to}
                      onClick={() => {
                        setActiveSubmenu(null);
                        onClose();
                      }}
                      className={({ isActive: subActive }) =>
                        cn(styles.mobileLink, subActive && styles.mobileLinkActive)
                      }
                    >
                      {sub.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            ) : (
              <NavLinks mobile onNavigate={onClose} onSubmenuOpen={setActiveSubmenu} />
            )}
          </nav>

          <div className={styles.mobileFooter}>
            <div>
              <p className={styles.mobileTagline}>For the Unfiltered.</p>
              <a href="mailto:altnuehq@gmail.com" className={styles.mobileMail}>
                altnuehq@gmail.com
              </a>
            </div>

            <ul className={styles.socialList}>
              {SOCIALS.map(({ label, href, icon }) => (
                <li key={label}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.socialLink}
                    aria-label={label}
                  >
                    {icon}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}