import { memo, useMemo, useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../utils/cn';
import { resolveUrl } from '../../services';
import { getProductRating } from '../../utils/productRating';
import { colorNameFor, DEFAULT_COLOR, DEFAULT_SIZE } from '../../utils/cartConfig';
import { getStockInfo } from '../../utils/stock';
import { useCart } from '../../hooks/useCart';
import Rating from '../ui/Rating/Rating';
import QuickView from '../ui/QuickView/QuickView';
import WishlistButton from '../wishlist/WishlistButton/WishlistButton';
import ImageSkeleton from '../skeleton/ImageSkeleton/ImageSkeleton';
import styles from './ProductCard.module.css';

const inr = (n) => n.toLocaleString('en-IN');

function ProductCard({
  product,
  isNew = Boolean(product?.isNew),
  quickView = true,
  onAddToCart,
}) {
  const { addToCart, openCart } = useCart();
  const [open, setOpen] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const imgRef = useRef(null);

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

  const price = Number(product?.price) || 0;
  const oldPrice = Number(product?.oldPrice) || 0;
  const showOld = oldPrice > 0 && oldPrice > price;
  const discount = showOld ? Math.round((1 - price / oldPrice) * 100) : 0;
  const hasSale = Boolean(product?.sale) && showOld;
  const { outOfStock } = getStockInfo(product);
  const name = product?.name || 'Untitled';

  const primary = resolveUrl(product?.imageUrl);
  const secondary = resolveUrl(
    product?.secondaryImageUrl || product?.imageUrl2 || product?.imageGallery?.[1] || ''
  );

  const rating = useMemo(() => getProductRating(product), [product]);

  const handleQuickView = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (quickView) setOpen(true);
  };

  const addDefaults = (p, options) => {
    addToCart(p, {
      size: options?.size || DEFAULT_SIZE,
      color: DEFAULT_COLOR,
      colorName: colorNameFor(DEFAULT_COLOR),
      quantity: options?.quantity || 1,
    });
    openCart();
  };
  const handleAdd = onAddToCart || addDefaults;

  return (
    <>
      <article className={styles.card}>
        <div className={styles.media}>
          <Link
            to={`/product/${product?.id}`}
            className={styles.link}
            aria-label={`View ${name}`}
          >
            {!imageLoaded && <ImageSkeleton />}
            <img
              ref={imgRef}
              src={primary}
              alt={name}
              className={cn(
                styles.imgPrimary,
                !imageLoaded && styles.imgHidden,
                outOfStock && styles.imgSoldOut
              )}
              loading="lazy"
              decoding="async"
              onLoad={handleImageLoad}
              onError={handleImageError}
            />
            {secondary && (
              <img
                src={secondary}
                alt=""
                aria-hidden="true"
                className={cn(styles.imgSecondary, outOfStock && styles.imgSoldOut)}
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  e.currentTarget.style.opacity = '0';
                }}
              />
            )}
          </Link>

          {outOfStock && (
            <div className={styles.overlay} aria-hidden="true" />
          )}

          {(outOfStock || hasSale || isNew) && (
            <div className={styles.badges}>
              {outOfStock && <span className={styles.badgeSoldOut}>Sold Out</span>}
              {hasSale && <span className={styles.badgeSale}>Sale</span>}
              {isNew && <span className={styles.badgeNew}>New</span>}
            </div>
          )}



          <div className={styles.actionGroup}>
            <WishlistButton product={product} size="sm" className={styles.wishlist} />

            {quickView && (
              <button
                type="button"
                className={styles.quickView}
                onClick={handleQuickView}
                title="Quick View"
                aria-label="Quick view product"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className={styles.body}>
          <div className={styles.row}>
            <p className={styles.cat}>{product?.category || 'ALTNEU'}</p>
          </div>
          <h3 className={styles.name} title={name}>{name}</h3>

          <div className={styles.priceRow}>
            <span className={styles.price}>₹ {inr(price)}</span>
            {showOld && (
              <span className={styles.old} aria-hidden="true">
                ₹ {inr(oldPrice)}
              </span>
            )}
          </div>

          <button
            type="button"
            className={cn(styles.add, outOfStock && styles.addDisabled)}
            disabled={outOfStock}
            onClick={() => handleAdd(product)}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 7h14l-1 13H6L5 7z" />
              <path d="M9 7a3 3 0 0 1 6 0" />
            </svg>
            {outOfStock ? 'Sold Out' : 'Add to Cart'}
          </button>
        </div>
      </article>

      {quickView && (
        <QuickView
          product={product}
          open={open}
          onClose={() => setOpen(false)}
          rating={rating}
          isNew={isNew}
          onAddToCart={(p, options) => {
            handleAdd(p, options);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

export default memo(ProductCard);