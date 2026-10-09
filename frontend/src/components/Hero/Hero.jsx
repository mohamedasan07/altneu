import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
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
    mobile: '/images/hero/fightclub-new-mobile.png',
    desktop: '/images/hero/fightclub-new-desktop.png',
    alt: 'Fight Club',
  },
];

const slideVariants = {
  enter: {
    zIndex: 1,
    opacity: 0,
    scale: 1,
  },
  center: (prefersReducedMotion) => ({
    zIndex: 1,
    opacity: 1,
    scale: prefersReducedMotion ? 1 : 1.06,
    transition: {
      opacity: { duration: 1.5, ease: 'easeInOut' },
      scale: { duration: 6.5, ease: 'linear' },
    },
  }),
  exit: (prefersReducedMotion) => ({
    zIndex: 0,
    // Keep outgoing image opaque while incoming image fades in over it
    // Animating to 0.99 ensures Framer Motion keeps the component alive for the transition duration
    opacity: 0.99,
    scale: prefersReducedMotion ? 1 : 1.06,
    transition: {
      opacity: { duration: 1.5, ease: 'easeInOut' },
      scale: { duration: 1.5, ease: 'linear' },
    },
  }),
};


export default function Hero({ primaryCta = { label: 'SHOP NOW', to: '/collections' } }) {
  const prefersReducedMotion = useReducedMotion();
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
        <AnimatePresence initial={false} custom={prefersReducedMotion}>
          <motion.picture
            key={page}
            custom={prefersReducedMotion}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
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