import { Outlet } from 'react-router-dom';
import Navbar from '../../components/Navbar/Navbar';
import Footer from '../../components/layout/Footer/Footer';
import BottomNav from '../../components/layout/BottomNav/BottomNav';
import styles from './MainLayout.module.css';

/**
 * Shared shell: skip link → navbar → main (outlet) → footer.
 */
export default function MainLayout() {
  return (
    <div className={styles.layout}>
      <a href="#main-content" className={`${styles.skipLink} sr-only focus:not-sr-only`}>
        Skip to content
      </a>

      <Navbar />

      <main id="main-content" className={styles.main} tabIndex={-1}>
        <Outlet />
      </main>

      <Footer />
      <BottomNav />
    </div>
  );
}