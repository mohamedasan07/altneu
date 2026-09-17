import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import useProducts from '../../hooks/useProducts';
import useFilters, { SORT_OPTIONS } from '../../hooks/useFilters';
import ProductGrid from '../../components/ProductGrid/ProductGrid';
import FilterSidebar from '../../components/filter/FilterSidebar/FilterSidebar';
import SortDropdown from '../../components/filter/SortDropdown/SortDropdown';
import styles from './CollectionsPage.module.css';

/**
 * Catalog discovery page.
 * - Category pills, filter sidebar (drawer on mobile), sort dropdown.
 * - Every control writes to the URL (useFilters), so filters survive refresh
 *   and are shareable:  /collections?category=tshirts&price=500-2000&sort=price-asc
 */
export default function CollectionsPage() {
  const { products, status, error, reload } = useProducts();
  const { categoryId } = useParams();

  const {
    filters: read,
    bounds,
    categories,
    visible,
    activeCount,
    hasFilters,
    setCategory,
    setSort,
    setSale,
    setInstock,
    setPriceRange,
    clearAll,
  } = useFilters({ products, categoryId });

  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef(null);

  // Drawer lifecycle: focus close, ESC to dismiss, scroll lock, restore focus.
  useEffect(() => {
    if (!drawerOpen) return undefined;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => drawerRef.current?.focus(), 30);

    const onKey = (e) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);

    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
      document.getElementById('collections-filter-toggle')?.focus();
    };
  }, [drawerOpen]);

  const sharedSidebarProps = {
    categories,
    category: read.category,
    onCategory: setCategory,
    bounds,
    priceMin: read.price.min,
    priceMax: read.price.max,
    onPriceChange: setPriceRange,
    sale: read.sale,
    onSale: setSale,
    instock: read.instock,
    onInstock: setInstock,
    hasFilters,
    onReset: clearAll,
  };

  const pieceLabel = visible.length === 1 ? 'piece' : 'pieces';

  return (
    <section className={`page ${styles.page}`} aria-labelledby="collections-title">
      <header className={styles.header}>
        <p className="page-kicker">Catalog</p>
        <h1 id="collections-title" className={styles.title}>
          Collections
        </h1>
      </header>

      <div className={styles.layout}>
        <aside className={styles.rail} aria-label="Filters">
          <FilterSidebar {...sharedSidebarProps} />
        </aside>

        <div className={styles.results}>
          <div className={styles.toolbar}>
            <p className={styles.count} aria-live="polite">
              {status === 'ready' && (
                <>
                  {visible.length} {pieceLabel}
                  {hasFilters && (
                    <button type="button" className={styles.clearAll} onClick={clearAll}>
                      Clear all
                    </button>
                  )}
                </>
              )}
            </p>

            <div className={styles.toolbarRight}>
              <button
                type="button"
                id="collections-filter-toggle"
                className={styles.filterToggle}
                aria-haspopup="dialog"
                aria-expanded={drawerOpen}
                onClick={() => setDrawerOpen(true)}
              >
                Filters
                {activeCount > 0 && <span className={styles.filterCount}>{activeCount}</span>}
              </button>
              <SortDropdown options={SORT_OPTIONS} value={read.sort} onSelect={setSort} />
            </div>
          </div>

          <ProductGrid
            products={visible}
            status={status}
            error={error}
            onRetry={reload}
            emptyTitle="No products matched your search."
            emptyCopy="Try widening the price range or clearing a filter or two."
            onReset={hasFilters ? clearAll : undefined}
          />
        </div>
      </div>

      <AnimatePresence>
        {drawerOpen && (
          <div className={styles.drawerRoot}>
            <motion.button
              type="button"
              className={styles.backdrop}
              aria-label="Close filters"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
            />
            <motion.div
              ref={drawerRef}
              role="dialog"
              aria-modal="true"
              aria-label="Filters"
              tabIndex={-1}
              className={styles.drawer}
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            >
              <div className={styles.drawerHead}>
                <h2 className={styles.drawerTitle}>Filters</h2>
                <button
                  type="button"
                  className={styles.drawerClose}
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close filters"
                >
                  ✕
                </button>
              </div>
              <div className={styles.drawerBody}>
                <FilterSidebar
                  {...sharedSidebarProps}
                  onFilterCommit={() => setDrawerOpen(false)}
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </section>
  );
}