import { useEffect } from 'react';
import { Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import LoginForm from '../../components/auth/LoginForm/LoginForm';
import SocialLogin from '../../components/auth/SocialLogin/SocialLogin';
import styles from './LoginPage.module.css';

/**
 * Login page. Redirects authenticated users to their account.
 * Successful sign-in returns to the page that originally requested auth.
 */
export default function LoginPage() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const from = location.state?.from || '/account';
  const resetDone = Boolean(location.state?.resetDone);

  useEffect(() => {
    if (isAuthenticated) navigate(from, { replace: true });
  }, [isAuthenticated, from, navigate]);

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  return (
    <section className={`page ${styles.section}`} aria-labelledby="login-title">
      <header className={styles.header}>
        <p className="page-kicker">Account</p>
        <h1 id="login-title" className={styles.title}>
          Welcome back.
        </h1>
        <p className="page-lead">Sign in to your account and pick up where you left off.</p>
      </header>

      <motion.div
        className={styles.card}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        {resetDone && (
          <p className={styles.banner} role="status">
            Your password has been updated. Please sign in with your new
            password.
          </p>
        )}

        <LoginForm onSuccess={() => navigate(from, { replace: true })} />

        <div className={styles.divider} role="separator">
          <span>or continue with</span>
        </div>

        <SocialLogin />

        <p className={styles.switch}>
          New to ALTNEU? <Link to="/register">Create an account</Link>
        </p>
      </motion.div>
    </section>
  );
}