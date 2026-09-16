import { Link } from 'react-router-dom';
import styles from './Navbar.module.css';

export default function Logo({ onClick }) {
  return (
    <Link to="/" className={styles.logo} onClick={onClick} aria-label="ALTNEU — home">
      <img src="/images/altneu_admin_logo.png" alt="ALTNEU" className={styles.logoImage} />
    </Link>
  );
}