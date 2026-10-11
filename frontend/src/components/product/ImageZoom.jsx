import { useRef, useState, useEffect } from 'react';
import { cn } from '../../utils/cn';
import ImageSkeleton from '../skeleton/ImageSkeleton/ImageSkeleton';
import styles from './ImageZoom.module.css';

/**
 * Main product image with cursor-tracking zoom.
 * The button wrapper keeps the zoom target keyboard-accessible and
 * forwards click to open the fullscreen preview.
 */
export default function ImageZoom({ src, alt, onClick, eager = false }) {
  const imgRef = useRef(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setImageLoaded(false);
    setHasError(false);
    if (imgRef.current?.complete) {
      setImageLoaded(true);
    }
  }, [src]);

  const handleImageLoad = () => setImageLoaded(true);
  const handleImageError = () => {
    setImageLoaded(true);
    setHasError(true);
  };

  const onMouseMove = (e) => {
    if (hasError) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * 100;
    const py = ((e.clientY - rect.top) / rect.height) * 100;
    imgRef.current?.style.setProperty('--px', `${px}%`);
    imgRef.current?.style.setProperty('--py', `${py}%`);
  };

  return (
    <div className={styles.zoom} onMouseMove={onMouseMove}>
      <button
        type="button"
        className={styles.open}
        onClick={onClick}
        aria-label={`Open image: ${alt}`}
        disabled={hasError}
      >
        {!imageLoaded && !hasError && <ImageSkeleton />}
        {hasError ? (
          <div className={styles.fallbackBox} aria-label="Image unavailable">
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            <span>Image unavailable</span>
          </div>
        ) : (
          <img
            ref={imgRef}
            src={src}
            alt={alt}
            className={cn(styles.img, !imageLoaded && styles.imgHidden)}
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            onLoad={handleImageLoad}
            onError={handleImageError}
          />
        )}
      </button>
      {!hasError && (
        <span className={styles.hint} aria-hidden="true">
          Hover to zoom
        </span>
      )}
    </div>
  );
}