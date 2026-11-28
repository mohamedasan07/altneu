import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { resolveUrl } from '../../../services';
import { cn } from '../../../utils/cn';
import { getStockInfo } from '../../../utils/stock';
import ImageSkeleton from '../../skeleton/ImageSkeleton/ImageSkeleton';
import SizeSelector from '../../product/SizeSelector';
import WishlistButton from '../../wishlist/WishlistButton/WishlistButton';
import styles from './QuickView.module.css';

const inr = (n) => n.toLocaleString('en-IN');

export default function QuickView({
  product,
  open,
  onClose,
  rating,
  isNew,
  onAddToCart,
}) {
  const closeRef = useRef(null);
  const imgRef = useRef(null);
  const [mounted, setMounted] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [selectedSize, setSelectedSize] = useState(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setImageLoaded(false);
    if (imgRef.current?.complete) {
      setImageLoaded(true);
    }
  }, [open, product]);

  const { stockQuantity, outOfStock, lowStock } = getStockInfo(product);

  const isApparel = ['tshirts', 'jerseys', 'shirts', 'baggy', 'apparel'].includes(
    String(product?.category || '').toLowerCase().trim()
  );
  const productSizes = Array.isArray(product?.sizes) && product?.sizes.length > 0
    ? product.sizes
    : (isApparel ? ['XS', 'S', 'M', 'L', 'XL', 'XXL'] : []);
  const unavailable = outOfStock
    ? productSizes
    : (Array.isArray(product?.unavailableSizes) ? product.unavailableSizes : []);

  // Initialize selected size when product changes
  useEffect(() => {
    if (productSizes.length > 0) {
      const firstAvailable = productSizes.find((s) => !unavailable.includes(s));
      setSelectedSize(firstAvailable || productSizes[0]);
    } else {
      setSelectedSize(null);
    }
  }, [product?.id, outOfStock]);

  useEffect(() => {
    if (open) {
      const onKey = (e) => e.key === 'Escape' && onClose();
      document.addEventListener('keydown', onKey);
      document.body.style.overflow = 'hidden';
      closeRef.current?.focus();
      return () => {
        document.removeEventListener('keydown', onKey);
        document.body.style.overflow = '';
      };
    }
    return undefined;
  }, [open, onClose]);

  const handleImageLoad = () => setImageLoaded(true);
  const handleImageError = (e) => {
    setImageLoaded(true);
    e.currentTarget.style.opacity = '0';
  };

  if (!mounted || !product) return null;

  const price = Number(product?.price) || 0;
  const oldPrice = Number(product?.oldPrice) || 0;
  const showOld = oldPrice > 0 && oldPrice > price;
  const discount = showOld ? Math.round((1 - price / oldPrice) * 100) : 0;
  const hasSale = Boolean(product?.sale) && showOld;
  const name = product?.name || 'Untitled';
  const primary = resolveUrl(product?.imageUrl);
  const secondary = resolveUrl(
    product?.secondaryImageUrl || product?.imageUrl2 || product?.imageGallery?.[1] || ''
  );

  const handleAdd = () => {
    if (outOfStock) return;
    onAddToCart && onAddToCart(product, {
      size: selectedSize,
      quantity: 1,
    });
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className={styles.backdrop}
          onClick={onClose}
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <motion.div
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-label={`Quick view: ${name}`}
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <button
              type="button"
              className={styles.close}
              onClick={onClose}
              ref={closeRef}
              aria-label="Close quick view"
              title="Close"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M18 6L6 18" />
                <path d="M6 6l12 12" />
              </svg>
            </button>

            <div className={styles.grid}>
              {/* Left section — Product image (approx 52%) */}
              <div className={styles.media}>
                <div className={styles.imageWrapper}>
                  {!imageLoaded && <ImageSkeleton />}
                  <img
                    ref={imgRef}
                    src={primary}
                    alt={name}
                    className={cn(
                      styles.img,
                      !imageLoaded && styles.imgHidden,
                      outOfStock && styles.imgSoldOut
                    )}
                    onLoad={handleImageLoad}
                    onError={handleImageError}
                  />
                  {secondary && (
                    <img
                      src={secondary}
                      alt=""
                      aria-hidden="true"
                      className={cn(styles.imgSecondary, outOfStock && styles.imgSoldOut)}
                      onError={(e) => {
                        e.currentTarget.style.opacity = '0';
                      }}
                    />
                  )}
                </div>

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

                {showOld && (
                  <span className={styles.discountBadge} aria-hidden="true">
                    −{discount}%
                  </span>
                )}
              </div>

              {/* Right section — Product details (approx 48%) */}
              <div className={styles.info}>
                <div className={styles.headerBlock}>
                  <p className={styles.cat}>{product?.category || 'ALTNEU'}</p>
                  <h2 className={styles.name}>{name}</h2>

                  <div className={styles.priceRow}>
                    <span className={styles.price}>₹ {inr(price)}</span>
                    {showOld && (
                      <span className={styles.old} aria-hidden="true">
                        ₹ {inr(oldPrice)}
                      </span>
                    )}
                    {showOld && (
                      <span className={styles.saveBadge}>Save ₹ {inr(oldPrice - price)}</span>
                    )}
                  </div>

                  <div className={styles.availability}>
                    <span
                      className={cn(
                        styles.dot,
                        outOfStock ? styles.dotOut : lowStock ? styles.dotLow : styles.dotIn
                      )}
                      aria-hidden="true"
                    />
                    <span className={styles.availabilityText}>
                      {outOfStock
                        ? 'Sold Out'
                        : lowStock
                          ? `Only ${stockQuantity} left in stock`
                          : `In stock · ${stockQuantity}`}
                    </span>
                  </div>
                </div>

                {product?.description && (
                  <p className={styles.desc}>{product.description}</p>
                )}

                {productSizes.length > 0 && (
                  <div className={styles.sizeSection}>
                    <SizeSelector
                      sizes={productSizes}
                      value={selectedSize}
                      onChange={setSelectedSize}
                      unavailable={unavailable}
                      label="Available Sizes"
                    />
                  </div>
                )}

                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.add}
                    disabled={outOfStock}
                    onClick={handleAdd}
                  >
                    {outOfStock ? 'Sold Out' : 'Add to Cart'}
                  </button>
                  <WishlistButton
                    product={product}
                    size="md"
                    className={styles.wishlistBtn}
                  />
                </div>

                <Link
                  to={`/product/${product?.id}`}
                  onClick={onClose}
                  className={styles.detailLink}
                >
                  View full product details →
                </Link>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
