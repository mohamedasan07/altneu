import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { cn } from '../../utils/cn';
import Container from '../ui/Container/Container';
import Logo from './Logo';
import NavLinks from './NavLinks';
import SearchButton from './SearchButton';
import WishlistBadge from '../wishlist/WishlistBadge/WishlistBadge';
import CartButton from './CartButton';
import ProfileButton from './ProfileButton';
import Hamburger from './Hamburger';
import MobileMenu from './MobileMenu';
import styles from './Navbar.module.css';

/**
 * Premium navigation shell.
 * - Sticky, transparent over the hero, solidifies on scroll.
 * - Reveals on mount; mobile menu is a full-screen overlay.
 */
export default function Navbar() {
  const { pathname } = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Track scroll for the sticky appearance change.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close the mobile menu on navigation.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <motion.header
      className={cn(
        styles.navbar,
        scrolled && styles.navbarScrolled
      )}
      initial={{ y: -72, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <Container className={styles.navInner}>
        <Hamburger open={menuOpen} onClick={() => setMenuOpen((v) => !v)} />

        <Logo />

        <nav className={styles.desktopNav} aria-label="Primary">
          <NavLinks />
        </nav>

        <div className={styles.navActions}>
          <SearchButton />

          <div className={styles.desktopWishlist}>
            <WishlistBadge />
          </div>

          <CartButton />

          <div className={styles.desktopActions}>
            <ProfileButton />
          </div>
        </div>
      </Container>

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </motion.header>
  );
}