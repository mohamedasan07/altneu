import { useEffect } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import RegisterForm from '../../components/auth/RegisterForm/RegisterForm';
import styles from './RegisterPage.module.css';

/**
 * Register page. Creating an account signs the user straight in.
 */
export default function RegisterPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) navigate('/account', { replace: true });
  }, [isAuthenticated, navigate]);

  if (isAuthenticated) return <Navigate to="/account" replace />;

  return (
    <section className={`page ${styles.section}`} aria-labelledby="register-title">
      <header className={styles.header}>
        <p className="page-kicker">Join ALTNEU</p>
        <h1 id="register-title" className={styles.title}>
          Create your account.
        </h1>
        <p className="page-lead">Member-only drops, early access and a faster checkout.</p>
      </header>

      <motion.div
        className={styles.card}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <RegisterForm onSuccess={() => navigate('/account', { replace: true })} />

        <p className={styles.switch}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </motion.div>
    </section>
  );
}