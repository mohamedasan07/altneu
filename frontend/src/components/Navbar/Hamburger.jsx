import { cn } from '../../utils/cn';
import styles from './Navbar.module.css';

export default function Hamburger({ open, onClick }) {
  return (
    <button
      type="button"
      className={cn(styles.iconBtn, styles.hamburger)}
      onClick={onClick}
      aria-label={open ? 'Close menu' : 'Open menu'}
      aria-expanded={open}
      aria-controls="altneu-mobile-menu"
    >
      <span className={cn(styles.burger, open && styles.burgerOpen)} aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </button>
  );
}