import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '../ui/Button/Button';
import styles from './Hero.module.css';

const slides = [
  {
    id: 1,
    mobile: '/images/hero/traviscott%20mobile.png',
    desktop: '/images/hero/traviscott%202.png',
    alt: 'Travis Scott',
  },
  {
    id: 2,
    mobile: '/images/hero/fightclub%20mobile.png',
    desktop: '/images/hero/fightclub%202.png',
    alt: 'Fight Club',
  },
];

const slideVariants = {
  enter: {
    opacity: 0,
  },
  center: {
    zIndex: 1,
    opacity: 1,
  },
  exit: {
    zIndex: 0,
    opacity: 0,
  },
};


export default function Hero({ primaryCta = { label: 'SHOP NOW', to: '/collections' } }) {
  const [[page, direction], setPage] = useState([0, 0]);

  // Wrap around logic
  const imageIndex = Math.abs(page % slides.length);

  const paginate = (newDirection) => {
    setPage([page + newDirection, newDirection]);
  };

  useEffect(() => {
    const timer = setInterval(() => {
      paginate(1);
    }, 5000);
    return () => clearInterval(timer);
  }, [page]);

  return (
    <section className={styles.hero} aria-label="Hero Carousel">
      <div className={styles.carouselContainer}>
        <AnimatePresence initial={false} custom={direction}>
          <motion.picture
            key={page}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              opacity: { duration: 1.5, ease: 'easeInOut' },
            }}
            className={styles.picture}
          >
            <source media="(min-width: 1024px)" srcSet={slides[imageIndex].desktop} />
            <img
              src={slides[imageIndex].mobile}
              alt={slides[imageIndex].alt}
              className={styles.image}
              draggable="false"
            />
          </motion.picture>
        </AnimatePresence>
      </div>

      <div className={styles.overlay}>
        <div className={styles.ctaWrapper}>
          <Button to={primaryCta.to} variant="primary" size="lg" className={styles.cta}>
            {primaryCta.label}
          </Button>
        </div>
      </div>
    </section>
  );
}