import { useState, useRef, useEffect } from 'react';
import { cn } from '../../utils/cn';
import ImageSkeleton from '../skeleton/ImageSkeleton/ImageSkeleton';
import styles from './ThumbnailStrip.module.css';

/**
 * Horizontal strip of gallery thumbnails beneath the main image.
 * Keyboard-focusable, exposes selection via aria.
 */
export default function ThumbnailStrip({ images = [], activeIndex = 0, onSelect, label }) {
  if (!images.length || images.length <= 1) return null;

  return (
    <div
      className={styles.strip}
      role="listbox"
      aria-label={label || 'Product image thumbnails'}
      aria-orientation="horizontal"
    >
      {images.map((src, i) => (
        <ThumbnailItem
          key={`${src}-${i}`}
          src={src}
          index={i}
          total={images.length}
          selected={i === activeIndex}
          onSelect={() => onSelect?.(i)}
        />
      ))}
    </div>
  );
}

function ThumbnailItem({ src, index, total, selected, onSelect }) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef(null);

  useEffect(() => {
    setImageLoaded(false);
    setHasError(false);
    if (imgRef.current?.complete) {
      setImageLoaded(true);
    }
  }, [src]);

  const handleLoad = () => setImageLoaded(true);
  const handleError = () => {
    setImageLoaded(true);
    setHasError(true);
  };

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      aria-label={`View image ${index + 1} of ${total}`}
      className={cn(styles.thumb, selected && styles.active)}
      onClick={onSelect}
    >
      {!imageLoaded && !hasError && <ImageSkeleton />}
      {hasError ? (
        <div className={styles.thumbFallback} aria-label="Thumbnail unavailable">
          <svg
            width="18"
            height="18"
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
        </div>
      ) : (
        <img
          ref={imgRef}
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={handleLoad}
          onError={handleError}
          className={cn(styles.thumbImg, !imageLoaded && styles.imgHidden)}
        />
      )}
    </button>
  );
}