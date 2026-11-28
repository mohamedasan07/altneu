import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import Button from '../ui/Button/Button';
import styles from './Hero.module.css';

const AUTOPLAY_INTERVAL_MS = 5000;
const TRANSITION_DURATION_MS = 1500;

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

export default function Hero({ primaryCta = { label: 'SHOP NOW', to: '/collections' } }) {
  const prefersReducedMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const [prevIndex, setPrevIndex] = useState(null);
  const [isVisible, setIsVisible] = useState(() =>
    typeof document === 'undefined' ? true : document.visibilityState !== 'hidden'
  );
  const [loadedSlides, setLoadedSlides] = useState({});
  const transitionTimerRef = useRef(null);

  const clearTransitionTimer = useCallback(() => {
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
  }, []);

  const advanceSlide = useCallback(() => {
    setActiveIndex((current) => {
      const next = (current + 1) % slides.length;
      setPrevIndex(current);
      clearTransitionTimer();
      transitionTimerRef.current = setTimeout(() => {
        setPrevIndex(null);
        transitionTimerRef.current = null;
      }, TRANSITION_DURATION_MS);
      return next;
    });
  }, [clearTransitionTimer]);

  // Pause autoplay & clear any in-flight transition when tab is backgrounded or
  // restored from bfcache so stale/overlapping layers can never accumulate.
  useEffect(() => {
    const syncVisibility = () => {
      const visible = document.visibilityState !== 'hidden';
      setIsVisible(visible);
      clearTransitionTimer();
      setPrevIndex(null);
    };

    const handlePageShow = (event) => {
      if (event.persisted) {
        syncVisibility();
      }
    };

    document.addEventListener('visibilitychange', syncVisibility);
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      document.removeEventListener('visibilitychange', syncVisibility);
      window.removeEventListener('pageshow', handlePageShow);
      clearTransitionTimer();
    };
  }, [clearTransitionTimer]);

  // Single autoplay interval, active only while the tab is visible.
  useEffect(() => {
    if (!isVisible) return undefined;
    const intervalId = setInterval(advanceSlide, AUTOPLAY_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [isVisible, advanceSlide]);

  const handleImageReady = (id) => {
    setLoadedSlides((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
  };

  return (
    <section className={styles.hero} aria-label="Hero Carousel">
      <div className={styles.carouselContainer}>
        {slides.map((slide, index) => {
          const isActive = index === activeIndex;
          const isOutgoing = index === prevIndex && !isActive;
          const isShown = isActive || isOutgoing;

          return (
            <motion.picture
              key={slide.id}
              aria-hidden={!isActive}
              data-slide-active={isActive ? 'true' : 'false'}
              className={styles.picture}
              initial={false}
              animate={{
                opacity: isActive ? 1 : isOutgoing ? 0.99 : 0,
                scale: prefersReducedMotion ? 1 : isActive || isOutgoing ? 1.06 : 1,
              }}
              transition={{
                opacity: {
                  duration: isShown ? TRANSITION_DURATION_MS / 1000 : 0,
                  ease: 'easeInOut',
                },
                scale: {
                  duration: isActive ? 6.5 : isOutgoing ? 1.5 : 0,
                  ease: 'linear',
                },
              }}
              style={{
                zIndex: isActive ? 2 : isOutgoing ? 1 : 0,
                visibility: isShown ? 'visible' : 'hidden',
                pointerEvents: isActive ? 'auto' : 'none',
              }}
            >
              <source media="(min-width: 1024px)" srcSet={slide.desktop} />
              <img
                src={slide.mobile}
                alt={slide.alt}
                className={styles.image}
                draggable="false"
                decoding="async"
                loading={index === 0 ? 'eager' : 'lazy'}
                onLoad={() => handleImageReady(slide.id)}
                onError={() => handleImageReady(slide.id)}
                data-loaded={loadedSlides[slide.id] ? 'true' : 'false'}
              />
            </motion.picture>
          );
        })}
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
