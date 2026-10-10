import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '../../../utils/cn';
import styles from './SortDropdown.module.css';

/**
 * Custom listbox sort menu. Roving tabindex, arrow keys, Escape, outside-click.
 * Options are derived from SORT_OPTIONS (see useFilters).
 */
export default function SortDropdown({ options = [], value, onSelect }) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState('bottom');
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const optionRefs = useRef([]);

  const current = options.find((o) => o.value === value) || options[0];

  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) close();
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const move = (dir) => {
    const index = options.findIndex((o) => o.value === value);
    const next = (index + dir + options.length) % options.length;
    optionRefs.current[next]?.focus();
  };

  const pick = (optionValue) => {
    onSelect(optionValue);
    close();
    triggerRef.current?.focus();
  };

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Sort products"
        onClick={() => {
          if (!open && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            if (spaceBelow < 280) {
              setPlacement('top');
            } else {
              setPlacement('bottom');
            }
          }
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            optionRefs.current[0]?.focus();
          }
        }}
      >
        <span className={styles.triggerLabel}>Sort</span>
        <span className={styles.triggerValue}>{current?.label}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={cn(styles.chevron, open && styles.chevronOpen)}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            aria-label="Sort options"
            className={cn(styles.menu, placement === 'top' ? styles.menuTop : styles.menuBottom)}
            initial={{ opacity: 0, y: placement === 'top' ? 6 : -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: placement === 'top' ? 4 : -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
          >
            {options.map((option, index) => {
              const active = option.value === value;
              return (
                <motion.li key={option.value} className={styles.item} layout>
                  <button
                    ref={(el) => {
                      optionRefs.current[index] = el;
                    }}
                    type="button"
                    role="option"
                    aria-selected={active}
                    tabIndex={-1}
                    className={cn(styles.option, active && styles.optionActive)}
                    onClick={() => pick(option.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        move(1);
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        move(-1);
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        close();
                        triggerRef.current?.focus();
                      }
                    }}
                    onFocus={() => {
                      /* roving focus is handled by arrows */
                    }}
                  >
                    <span className={styles.dot} aria-hidden="true" />
                    {option.label}
                  </button>
                </motion.li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}