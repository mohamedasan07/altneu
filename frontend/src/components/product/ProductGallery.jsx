import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { cn } from '../../utils/cn';
import ImageZoom from './ImageZoom';
import ThumbnailStrip from './ThumbnailStrip';
import styles from './ProductGallery.module.css';

/**
 * ProductGallery:
 * - Desktop: large prominent main image + horizontal thumbnail strip beneath it.
 * - Mobile: swipe gallery with natural touch scroll snap, discreet image counter (e.g. 1 / 3),
 *   pagination dots, desktop thumbnail strip hidden.
 * - Fullscreen lightbox with keyboard & arrow navigation.
 */
export default function ProductGallery({
  images = [],
  productName = 'Product',
  productId,
}) {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const mobileSliderRef = useRef(null);

  // Touch tracking for mobile swipe gesture
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchDeltaX = useRef(0);
  const isSwipingHorizontal = useRef(false);

  // Mouse drag tracking for simulated desktop/responsive swipe
  const isMouseDown = useRef(false);
  const mouseStartX = useRef(0);

  useEffect(() => setMounted(true), []);

  const clampedImages = Array.isArray(images) ? images.filter(Boolean) : [];

  // Reset index when product changes or image list changes
  const imageKey = clampedImages.join('|');
  useEffect(() => {
    setActive(0);
    if (mobileSliderRef.current) {
      mobileSliderRef.current.scrollTo({ left: 0, behavior: 'instant' });
    }
  }, [productId, imageKey]);

  // Keep mobile scroll position synced when active changes
  const scrollMobileTo = useCallback((index) => {
    if (mobileSliderRef.current) {
      const width = mobileSliderRef.current.clientWidth;
      if (width > 0) {
        mobileSliderRef.current.scrollTo({
          left: index * width,
          behavior: 'smooth',
        });
      }
    }
  }, []);

  const handleSelect = useCallback(
    (index) => {
      const clamped = Math.max(0, Math.min(index, clampedImages.length - 1));
      setActive(clamped);
      scrollMobileTo(clamped);
    },
    [clampedImages.length, scrollMobileTo]
  );

  const next = useCallback(() => {
    if (!clampedImages.length) return;
    handleSelect((active + 1) % clampedImages.length);
  }, [active, clampedImages.length, handleSelect]);

  const prev = useCallback(() => {
    if (!clampedImages.length) return;
    handleSelect((active - 1 + clampedImages.length) % clampedImages.length);
  }, [active, clampedImages.length, handleSelect]);

  // Mobile scroll listener (syncs active index from native CSS scroll-snap)
  const handleMobileScroll = (e) => {
    const el = e.currentTarget;
    if (!el || el.clientWidth === 0) return;
    const newIndex = Math.round(el.scrollLeft / el.clientWidth);
    if (
      newIndex >= 0 &&
      newIndex < clampedImages.length &&
      newIndex !== active
    ) {
      setActive(newIndex);
    }
  };

  // Touch swipe handling (ensures reliable mobile swipe even in custom gesture environments)
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchDeltaX.current = 0;
    isSwipingHorizontal.current = false;
  };

  const handleTouchMove = (e) => {
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - touchStartX.current;
    const diffY = currentY - touchStartY.current;

    // Detect horizontal swipe vs vertical scroll
    if (!isSwipingHorizontal.current && Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 8) {
      isSwipingHorizontal.current = true;
    }

    if (isSwipingHorizontal.current) {
      touchDeltaX.current = diffX;
    }
  };

  const handleTouchEnd = () => {
    if (isSwipingHorizontal.current) {
      const threshold = 35; // px
      if (touchDeltaX.current < -threshold) {
        // Swiped left -> next
        const target = Math.min(active + 1, clampedImages.length - 1);
        handleSelect(target);
      } else if (touchDeltaX.current > threshold) {
        // Swiped right -> prev
        const target = Math.max(active - 1, 0);
        handleSelect(target);
      }
    }
    isSwipingHorizontal.current = false;
    touchDeltaX.current = 0;
  };

  // Mouse drag handling for responsive testing
  const handleMouseDown = (e) => {
    isMouseDown.current = true;
    mouseStartX.current = e.clientX;
  };

  const handleMouseUp = (e) => {
    if (!isMouseDown.current) return;
    isMouseDown.current = false;
    const diffX = e.clientX - mouseStartX.current;
    const threshold = 40;
    if (diffX < -threshold) {
      const target = Math.min(active + 1, clampedImages.length - 1);
      handleSelect(target);
    } else if (diffX > threshold) {
      const target = Math.max(active - 1, 0);
      handleSelect(target);
    }
  };

  // Lightbox keyboard navigation
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, next, prev]);

  if (!mounted || !clampedImages.length) {
    return <div className={styles.empty} aria-label="No images available" />;
  }

  const current = clampedImages[Math.min(active, clampedImages.length - 1)] || null;

  return (
    <div className={styles.gallery} data-testid="product-gallery">
      {/* ---------------- Desktop Gallery Layout ---------------- */}
      <div className={styles.desktopGallery}>
        <div className={styles.mainWrapper}>
          <ImageZoom
            key={current}
            src={current}
            alt={`${productName} — image ${active + 1}`}
            eager
            onClick={() => setOpen(true)}
          />
          {/* Subtle counter badge on desktop main image */}
          <div
            className={styles.counterBadge}
            aria-label={`Image ${active + 1} of ${clampedImages.length}`}
          >
            {active + 1} / {clampedImages.length}
          </div>
        </div>

        {/* Horizontal thumbnail strip beneath the main image */}
        {clampedImages.length > 1 && (
          <ThumbnailStrip
            images={clampedImages}
            activeIndex={active}
            onSelect={handleSelect}
            label={`${productName} images`}
          />
        )}
      </div>

      {/* ---------------- Mobile Swipe Gallery Layout ---------------- */}
      <div className={styles.mobileGallery}>
        <div
          ref={mobileSliderRef}
          className={styles.mobileSlider}
          onScroll={handleMobileScroll}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          role="region"
          aria-label={`${productName} image carousel`}
          tabIndex={0}
        >
          {clampedImages.map((src, index) => (
            <div
              key={`${src}-${index}`}
              className={styles.mobileSlide}
              aria-hidden={index !== active}
            >
              <button
                type="button"
                className={styles.slideButton}
                onClick={() => {
                  setActive(index);
                  setOpen(true);
                }}
                aria-label={`View full image ${index + 1} of ${clampedImages.length}`}
              >
                <img
                  src={src}
                  alt={`${productName} — image ${index + 1}`}
                  className={styles.mobileImg}
                  loading={index === 0 ? 'eager' : 'lazy'}
                  decoding="async"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    if (e.currentTarget.nextElementSibling) {
                      e.currentTarget.nextElementSibling.style.display = 'flex';
                    }
                  }}
                />
                <div className={styles.mobileFallback} style={{ display: 'none' }}>
                  <span>Image unavailable</span>
                </div>
              </button>
            </div>
          ))}
        </div>

        {/* Discreet current-image counter badge */}
        <div
          className={cn(styles.counterBadge, styles.mobileCounterBadge)}
          aria-label={`Image ${active + 1} of ${clampedImages.length}`}
        >
          {active + 1} / {clampedImages.length}
        </div>

        {/* Pagination Dots on Mobile */}
        {clampedImages.length > 1 && (
          <div className={styles.dots} role="tablist" aria-label="Image pagination">
            {clampedImages.map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === active}
                aria-label={`Go to image ${i + 1}`}
                className={cn(styles.dot, i === active && styles.dotActive)}
                onClick={() => handleSelect(i)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ---------------- Fullscreen Lightbox ---------------- */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                className={styles.lightbox}
                role="dialog"
                aria-modal="true"
                aria-label={`${productName} image ${active + 1}`}
                onClick={() => setOpen(false)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <motion.button
                  type="button"
                  className={styles.close}
                  onClick={() => setOpen(false)}
                  aria-label="Close fullscreen image"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 5l14 14" />
                    <path d="M19 5L5 19" />
                  </svg>
                </motion.button>

                {clampedImages.length > 1 && (
                  <motion.button
                    type="button"
                    className={styles.nav}
                    onClick={(e) => {
                      e.stopPropagation();
                      prev();
                    }}
                    aria-label="Previous image"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                  >
                    ‹
                  </motion.button>
                )}

                <motion.img
                  key={current}
                  src={current}
                  alt={`${productName} — image ${active + 1}`}
                  className={styles.lightboxImg}
                  onClick={(e) => e.stopPropagation()}
                  initial={{ opacity: 0.4, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.25 }}
                />

                {clampedImages.length > 1 && (
                  <button
                    type="button"
                    className={styles.nav}
                    onClick={(e) => {
                      e.stopPropagation();
                      next();
                    }}
                    aria-label="Next image"
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                  >
                    ›
                  </button>
                )}

                <span className={styles.counter} aria-hidden="true">
                  {active + 1} / {clampedImages.length}
                </span>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}