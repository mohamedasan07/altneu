import { Link } from 'react-router-dom';
import styles from './Navbar.module.css';

export default function Logo({ onClick }) {
  return (
    <Link to="/" className={styles.logo} onClick={onClick} aria-label="ALTNEU — home">
      <span className={styles.logoText}>ALTNEU</span>
      <span className={styles.logoDot} aria-hidden="true">
        .
      </span>
    </Link>
  );
}