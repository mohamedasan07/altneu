import { useRef, useState } from 'react';
import SearchOverlay from '../search/SearchOverlay/SearchOverlay';
import styles from './Navbar.module.css';

const SEARCH_ICON = (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="7" />
    <line x1="16.5" y1="16.5" x2="21" y2="21" />
  </svg>
);

/**
 * Navbar search trigger. Owned by the Navbar module; delegates the overlay
 * (live search, suggestions, history) to components/search/SearchOverlay.
 */
export default function SearchButton() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.iconBtn}
        onClick={() => setOpen((v) => !v)}
        aria-label="Search"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="altneu-search"
      >
        {SEARCH_ICON}
      </button>

      <SearchOverlay open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} />
    </>
  );
}