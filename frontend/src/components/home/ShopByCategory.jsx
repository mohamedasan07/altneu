import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Container from '../ui/Container/Container';
import ProductCard from '../ProductCard/ProductCard';
import { fadeUp, stagger, EASE_OUT } from '../../utils/motion';
import styles from './ShopByCategory.module.css';

const TABS = [
  { label: 'BESTSELLERS', slug: 'bestsellers' },
  { label: 'JERSEYS', slug: 'jerseys' },
  { label: 'TSHIRTS', slug: 'tshirts' },
  { label: 'SHIRT', slug: 'shirts' },
  { label: 'BAGGY', slug: 'baggy' },
];

export default function ShopByCategory({ products = [], status = 'loading' }) {
  const [activeTab, setActiveTab] = useState('bestsellers');

  const filteredProducts = useMemo(() => {
    if (activeTab === 'bestsellers') {
      return products.filter((p) => p.sale).slice(0, 4);
    }
    return products.filter((p) => p.category === activeTab).slice(0, 4);
  }, [products, activeTab]);

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
              {TABS.map((tab) => (
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
          {status === 'loading'
            ? Array.from({ length: 4 }).map((_, i) => (
                <div className={styles.skeleton} key={i}>
                  <span />
                </div>
              ))
            : filteredProducts.map((product, i) => (
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