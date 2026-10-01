import { useState, useRef, useEffect } from 'react';
import { cn } from '../../utils/cn';
import ImageSkeleton from '../skeleton/ImageSkeleton/ImageSkeleton';
import styles from './ThumbnailStrip.module.css';

/**
 * Vertical/horizontal list of gallery thumbs.
 * Keyboard-focusable, exposes selection via aria.
 */
export default function ThumbnailStrip({ images = [], activeIndex = 0, onSelect, label }) {
  if (!images.length) return null;

  return (
    <div
      className={styles.strip}
      role="listbox"
      aria-label={label || 'Product images'}
      aria-orientation="vertical"
    >
      {images.map((src, i) => (
        <ThumbnailItem
          key={src}
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
  const imgRef = useRef(null);

  useEffect(() => {
    if (imgRef.current?.complete) {
      setImageLoaded(true);
    }
  }, []);

  const handleLoad = () => setImageLoaded(true);
  const handleError = (e) => {
    setImageLoaded(true);
    e.currentTarget.style.opacity = '0';
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
      {!imageLoaded && <ImageSkeleton />}
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
    </button>
  );
}