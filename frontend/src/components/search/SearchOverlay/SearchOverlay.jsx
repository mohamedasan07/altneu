import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import useProducts from '../../../hooks/useProducts';
import useSearch from '../../../hooks/useSearch';
import {
  addSearchHistory,
  clearSearchHistory,
  loadSearchHistory,
} from '../../../services/searchHistory';
import SearchInput from '../SearchInput/SearchInput';
import SearchSuggestions from '../SearchSuggestions/SearchSuggestions';
import RecentSearches from '../RecentSearches/RecentSearches';
import styles from './SearchOverlay.module.css';

const PANEL_ID = 'altneu-search';
const LISTBOX_ID = 'altneu-search-results';

/**
 * Full-screen live search overlay.
 * - Debounced, instant results with highlighted matches.
 * - Recent searches + popular categories when idle.
 * - ESC / backdrop / ✕ to close, autofocus, focus trap, focus restore.
 * - ArrowUp/Down + Enter to drive results via aria-activedescendant.
 */
export default function SearchOverlay({ open, onClose, triggerRef }) {
  const navigate = useNavigate();
  const { products, status } = useProducts();
  const { query, setQuery, results, searching } = useSearch({ products });
  const reduceMotion = useReducedMotion();

  const [recent, setRecent] = useState(loadSearchHistory);
  const [activeIndex, setActiveIndex] = useState(0);
  const panelRef = useRef(null);
  const inputRef = useRef(null);

  const visibleResults = useMemo(() => results.slice(0, 6), [results]);
  const resultCount = visibleResults.length;
  // Sentinel index: “View all N results” row (when it exists)
  const viewAllIndex = results.length > 6 ? resultCount : -1;

  const popularCategories = useMemo(() => {
    const map = new Map();
    products.forEach((p) => {
      const key = String(p.category || '').toLowerCase().trim();
      if (key) map.set(key, (map.get(key) || 0) + 1);
    });
    const list = [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => ({ id, label: id, count }));
    return list.length ? list : null;
  }, [products]);

  // ---- Open lifecycle: scroll lock + autofocus ----
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);

    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      triggerRef?.current?.focus();
    };
  }, [open, setQuery, triggerRef]);

  // ---- Clamp active index when results change ----
  useEffect(() => {
    if (!searching) setActiveIndex(0);
    else if (activeIndex > resultCount) setActiveIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultCount, searching]);

  const close = useCallback(() => {
    setActiveIndex(0);
    onClose();
  }, [onClose]);

  const runSearch = useCallback(
    (term) => {
      const clean = term.trim();
      if (!clean) return;
      addSearchHistory(clean);
      setRecent(loadSearchHistory());
      close();
      navigate(`/collections?q=${encodeURIComponent(clean)}`);
    },
    [close, navigate]
  );

  const goToProduct = useCallback(
    (product) => {
      if (query.trim()) addSearchHistory(query);
      setRecent(loadSearchHistory());
      close();
      navigate(`/product/${product.id}`);
    },
    [close, navigate, query]
  );

  const goToCategory = useCallback(
    (categoryId) => {
      close();
      navigate(categoryId === 'all' ? '/collections' : `/collections?category=${categoryId}`);
    },
    [close, navigate]
  );

  // ---- Keyboard handling ----
  const handleInputKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (!searching) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => {
        const max = viewAllIndex === -1 ? resultCount - 1 : viewAllIndex;
        return i >= max ? 0 : i + 1;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => {
        const max = viewAllIndex === -1 ? resultCount - 1 : viewAllIndex;
        return i <= 0 ? max : i - 1;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < resultCount) {
        goToProduct(visibleResults[activeIndex]);
      } else if (activeIndex === viewAllIndex) {
        runSearch(query);
      } else if (query.trim()) {
        runSearch(query);
      }
    }
  };

  const handlePanelKeyDown = (e) => {
    if (e.key !== 'Tab' || !panelRef.current) return;
    const focusables = panelRef.current.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    );
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const activeDescendantId =
    searching && activeIndex >= 0 && activeIndex < resultCount
      ? `${LISTBOX_ID}-option-${activeIndex}`
      : undefined;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={styles.overlay}
          role="dialog"
          aria-modal="true"
          aria-label="Search ALTNEU"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          onClick={close}
        >
          <motion.div
            ref={panelRef}
            id={PANEL_ID}
            className={styles.panel}
            role="search"
            initial={reduceMotion ? false : { opacity: 0, y: -14, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -8, scale: 0.985 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handlePanelKeyDown}
          >
            <header className={styles.head}>
              <p className={styles.kicker}>ALTNEU</p>
              <button type="button" className={styles.close} onClick={close} aria-label="Close search">
                ✕
              </button>
            </header>

            <SearchInput
              ref={inputRef}
              id="altneu-search-input"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleInputKeyDown}
              controlsId={searching ? LISTBOX_ID : undefined}
              expanded={searching}
              activeDescendantId={activeDescendantId}
            />

            {searching ? (
              <SearchSuggestions
                results={results}
                query={query}
                status={status}
                listboxId={LISTBOX_ID}
                activeIndex={activeIndex}
                onHover={setActiveIndex}
                onSelect={goToProduct}
              />
            ) : (
              <RecentSearches
                terms={recent}
                onSelectTerm={runSearch}
                onClear={() => {
                  clearSearchHistory();
                  setRecent([]);
                }}
                categories={popularCategories}
                onSelectCategory={goToCategory}
              />
            )}

            <footer className={styles.foot}>
              <span>
                <kbd className={styles.kbd}>↑↓</kbd> navigate
              </span>
              <span>
                <kbd className={styles.kbd}>↵</kbd> select
              </span>
              <span>
                <kbd className={styles.kbd}>esc</kbd> close
              </span>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}