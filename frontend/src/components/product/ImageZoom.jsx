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

  useEffect(() => {
    if (imgRef.current?.complete) {
      setImageLoaded(true);
    }
  }, []);

  const handleImageLoad = () => setImageLoaded(true);
  const handleImageError = (e) => {
    setImageLoaded(true);
    e.currentTarget.style.opacity = '0';
  };

  const onMouseMove = (e) => {
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
      >
        {!imageLoaded && <ImageSkeleton />}
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
      </button>
      <span className={styles.hint} aria-hidden="true">
        Hover to zoom
      </span>
    </div>
  );
}