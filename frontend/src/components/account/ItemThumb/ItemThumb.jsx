import { useState, useRef, useEffect } from 'react';
import { cn } from '../../../utils/cn';
import ImageSkeleton from '../../skeleton/ImageSkeleton/ImageSkeleton';
import styles from './ItemThumb.module.css';

/**
 * Small product thumbnail with a graceful fallback: while no imageUrl is
 * present (mock orders) it shows the product's initial on a dark tile.
 */
export default function ItemThumb({ item, alt }) {
  const [failed, setFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const imgRef = useRef(null);

  useEffect(() => {
    if (imgRef.current?.complete) {
      setImageLoaded(true);
    }
  }, []);

  const handleLoad = () => setImageLoaded(true);
  const handleError = () => {
    setFailed(true);
    setImageLoaded(true);
  };

  const name = item?.name || 'U';
  const src = item?.imageUrl;
  const showImage = src && !failed;

  return (
    <span className={styles.thumb} aria-hidden="true">
      {showImage ? (
        <>
          {!imageLoaded && <ImageSkeleton />}
          <img
            ref={imgRef}
            src={src}
            alt=""
            loading="lazy"
            onLoad={handleLoad}
            onError={handleError}
            className={cn(styles.img, !imageLoaded && styles.imgHidden)}
          />
        </>
      ) : (
        <span className={styles.placeholder}>{name.charAt(0).toUpperCase()}</span>
      )}
    </span>
  );
}