import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useBoolean } from '../../hooks/useBoolean';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import DashboardSidebar from '../../components/dashboard/DashboardSidebar/DashboardSidebar';
import DashboardHeader from '../../components/dashboard/DashboardHeader/DashboardHeader';
import BottomNav from '../../components/layout/BottomNav/BottomNav';
import styles from './DashboardLayout.module.css';

/**
 * Account dashboard shell — persistent sidebar on desktop, slide-in drawer on
 * mobile. Renders the active account section via <Outlet/>.
 */
export default function DashboardLayout() {
  const { value: drawerOpen, setTrue, setFalse } = useBoolean(false);
  const location = useLocation();
  const drawerRef = useFocusTrap(drawerOpen);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    if (drawerOpen) setFalse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Escape closes the drawer on mobile.
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setFalse();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [drawerOpen, setFalse]);

  return (
    <div className={styles.layout}>
      {/* Desktop sidebar */}
      <div className={styles.sidebarDesktop}>
        <DashboardSidebar />
      </div>

      {/* Main column */}
      <div className={styles.content}>
        <DashboardHeader onOpenMenu={setTrue} />
        <main className={styles.body} id="account-main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>

      {/* Mobile drawer (portal'd so it overlays the whole viewport) */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {drawerOpen && (
              <motion.div
                className={styles.drawerRoot}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <motion.div
                  className={styles.overlay}
                  onClick={setFalse}
                  aria-hidden="true"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                />
                <motion.aside
                  ref={drawerRef}
                  className={styles.drawer}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="altneu-dashboard-sidebar"
                  initial={{ x: '-100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '-100%' }}
                  transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className={styles.drawerTop}>
                    <p className={styles.drawerKicker}>ALTNEU</p>
                    <button
                      type="button"
                      className={styles.drawerClose}
                      onClick={setFalse}
                      aria-label="Close account menu"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                        <path d="M6 6l12 12" />
                        <path d="M18 6L6 18" />
                      </svg>
                    </button>
                  </div>
                  <DashboardSidebar onNavigate={setFalse} />
                </motion.aside>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
      <BottomNav />
    </div>
  );
}