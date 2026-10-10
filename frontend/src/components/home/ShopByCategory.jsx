import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Container from '../ui/Container/Container';
import ProductCard from '../ProductCard/ProductCard';
import { fadeUp, stagger, EASE_OUT } from '../../utils/motion';
import useCategories from '../../hooks/useCategories';
import styles from './ShopByCategory.module.css';

export default function ShopByCategory({ products = [], status = 'loading' }) {
  const [activeTab, setActiveTab] = useState('bestsellers');
  const { categories, status: catStatus } = useCategories();

  const tabs = useMemo(() => {
    const dynamicTabs = (categories || []).map(cat => ({
      label: cat.name.toUpperCase(),
      slug: cat.slug, // Keep slug for URL/internal matching
      name: cat.name // Use name for filtering
    }));
    return [{ label: 'BESTSELLERS', slug: 'bestsellers' }, ...dynamicTabs];
  }, [categories]);

  const filteredProducts = useMemo(() => {
    if (activeTab === 'bestsellers') {
      return products.filter((p) => p.sale).slice(0, 4);
    }
    const tab = tabs.find(t => t.slug === activeTab);
    const targetName = tab ? tab.name.toLowerCase().trim() : activeTab.toLowerCase().trim();
    return products.filter((p) => String(p.category || '').toLowerCase().trim() === targetName).slice(0, 4);
  }, [products, activeTab, tabs]);

  return (
    <section className={styles.section} aria-labelledby="categories-title">
      <Container>
        <motion.div
          className={styles.head}
          variants={stagger(0.1, 0.12)}
          initial={false}
          whileInView="visible"
          viewport={{ once: true, amount: 0.4 }}
        >
          <motion.div variants={fadeUp}>
            <p className={styles.kicker}>Shop</p>
            <h2 id="categories-title" className={styles.title}>
              By category
            </h2>
          </motion.div>

          <motion.div variants={fadeUp} className={styles.tabsWrap}>
            <div className={styles.tabs}>
              {tabs.map((tab) => (
                <button
                  key={tab.slug}
                  type="button"
                  className={`${styles.tab} ${activeTab === tab.slug ? styles.activeTab : ''}`}
                  onClick={() => setActiveTab(tab.slug)}
                >
                  {activeTab === tab.slug && (
                    <motion.div
                      layoutId="activeCategoryCapsule"
                      className={styles.activeCapsule}
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                  <span className={styles.tabLabel}>{tab.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>

        <motion.div
          className={styles.grid}
          variants={stagger(0.1, 0.1)}
          initial={false}
          whileInView="visible"
          viewport={{ once: true, amount: 0.15 }}
        >
          {filteredProducts.map((product, i) => (
            <motion.div
              key={`${activeTab}-${product.id}`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, ease: EASE_OUT, duration: 0.4 }}
            >
              <ProductCard product={product} />
            </motion.div>
          ))}

          {status !== 'loading' && filteredProducts.length === 0 && (
            <div className={styles.emptyState}>
              <p>No products found in this category.</p>
            </div>
          )}
        </motion.div>

        {status !== 'loading' && filteredProducts.length > 0 && (
          <motion.div
            className={styles.viewAllWrap}
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.8 }}
          >
            <Link
              to={activeTab === 'bestsellers' ? '/collections?sale=true' : `/collections?category=${activeTab}`}
              className={styles.viewAllBtn}
            >
              View All
            </Link>
          </motion.div>
        )}
      </Container>
    </section>
  );
}