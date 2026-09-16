import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '../ui/Button/Button';
import styles from './Hero.module.css';

const slides = [
  {
    id: 2,
    mobile: '/images/hero/hero-2.jpg',
    desktop: '/images/hero/hero-2-desktop.png',
    alt: 'Model in black graphic T-shirt and blue baggy jeans standing outdoors',
  },
  {
    id: 1,
    mobile: '/images/hero/hero-1.jpg',
    desktop: '/images/hero/hero-1-desktop.png',
    alt: 'Model in black graphic T-shirt and blue baggy jeans near glass architecture',
  },
];

const slideVariants = {
  enter: (direction) => ({
    x: direction > 0 ? '100%' : '-100%',
    opacity: 0.5,
  }),
  center: {
    zIndex: 1,
    x: 0,
    opacity: 1,
  },
  exit: (direction) => ({
    zIndex: 0,
    x: direction < 0 ? '100%' : '-100%',
    opacity: 0.5,
  }),
};

const swipeConfidenceThreshold = 10000;
const swipePower = (offset, velocity) => Math.abs(offset) * velocity;

export default function Hero({ primaryCta = { label: 'SHOP NOW', to: '/collections' } }) {
  const [[page, direction], setPage] = useState([0, 0]);

  // Wrap around logic
  const imageIndex = Math.abs(page % slides.length);

  const paginate = (newDirection) => {
    setPage([page + newDirection, newDirection]);
  };

  const goToSlide = (idx) => {
    const newDirection = idx > imageIndex ? 1 : -1;
    if (idx !== imageIndex) {
      setPage([idx, newDirection]);
    }
  };

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
              x: { type: 'spring', stiffness: 300, damping: 30 },
              opacity: { duration: 0.2 },
            }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={1}
            onDragEnd={(e, { offset, velocity }) => {
              const swipe = swipePower(offset.x, velocity.x);

              if (swipe < -swipeConfidenceThreshold) {
                paginate(1);
              } else if (swipe > swipeConfidenceThreshold) {
                paginate(-1);
              }
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

        <div className={styles.dots} role="tablist">
          {slides.map((slide, idx) => (
            <button
              key={slide.id}
              role="tab"
              aria-selected={idx === imageIndex}
              aria-label={`Go to slide ${idx + 1}`}
              onClick={() => goToSlide(idx)}
              className={`${styles.dot} ${idx === imageIndex ? styles.dotActive : ''}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}