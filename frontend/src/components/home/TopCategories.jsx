import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Container from '../ui/Container/Container';
import { fadeUp, stagger } from '../../utils/motion';
import styles from './TopCategories.module.css';

export default function TopCategories() {
  return (
    <section className={styles.section} aria-labelledby="top-categories-title">
      <Container>
        <motion.div
          className={styles.header}
          variants={stagger(0.12, 0.14)}
          initial={false}
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
        >
          <motion.div variants={fadeUp}>
            <p className={styles.kicker}>Collections</p>
            <h2 id="top-categories-title" className={styles.title}>
              Top Categories
            </h2>
          </motion.div>
        </motion.div>

        <motion.div
          className={styles.grid}
          variants={stagger(0.1, 0.1)}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.15 }}
        >
          <motion.div variants={fadeUp} className={`${styles.card} ${styles.primaryCard}`}>
            <img 
              src="/images/categories/jersey.png" 
              alt="Jersey Category" 
              className={styles.image} 
            />
            <div className={styles.overlay}>
              <h3 className={styles.categoryName}>Jersey</h3>
              <Link to="/collections?category=jerseys" className={styles.exploreBtn}>
                EXPLORE &rarr;
              </Link>
            </div>
          </motion.div>

          <motion.div variants={fadeUp} className={styles.card}>
            <img 
              src="/images/categories/shirt.png" 
              alt="Shirt Category" 
              className={styles.image} 
            />
            <div className={styles.overlay}>
              <h3 className={styles.categoryName}>Shirt</h3>
              <Link to="/collections?category=shirts" className={styles.exploreBtn}>
                EXPLORE &rarr;
              </Link>
            </div>
          </motion.div>

          <motion.div variants={fadeUp} className={styles.card}>
            <img 
              src="/images/categories/baggy.png" 
              alt="Baggy Category" 
              className={styles.image} 
            />
            <div className={styles.overlay}>
              <h3 className={styles.categoryName}>Baggy</h3>
              <Link to="/collections?category=baggy" className={styles.exploreBtn}>
                EXPLORE &rarr;
              </Link>
            </div>
          </motion.div>
        </motion.div>
      </Container>
    </section>
  );
}
