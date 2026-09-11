import { memo, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../utils/cn';
import { resolveUrl } from '../../services';
import { getProductRating } from '../../utils/productRating';
import { colorNameFor, DEFAULT_COLOR, DEFAULT_SIZE } from '../../utils/cartConfig';
import { useCart } from '../../hooks/useCart';
import Rating from '../ui/Rating/Rating';
import QuickView from '../ui/QuickView/QuickView';
import WishlistButton from '../wishlist/WishlistButton/WishlistButton';
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

  const price = Number(product?.price) || 0;
  const oldPrice = Number(product?.oldPrice) || 0;
  const showOld = oldPrice > 0 && oldPrice > price;
  const discount = showOld ? Math.round((1 - price / oldPrice) * 100) : 0;
  const stockQuantity = Number(product?.stockQuantity) || 0;
  const outOfStock = stockQuantity <= 0;
  const lowStock = !outOfStock && stockQuantity <= 5;
  const name = product?.name || 'Untitled';

  const primary = resolveUrl(product?.imageUrl);
  const secondary = resolveUrl(
    product?.secondaryImageUrl || product?.imageUrl2 || product?.imageGallery?.[1] || ''
  );

  const rating = useMemo(() => getProductRating(product), [product]);

  const handleQuickView = (e) => {
    e.preventDefault();
    if (quickView) setOpen(true);
  };

  const addDefaults = (p) => {
    addToCart(p, {
      size: DEFAULT_SIZE,
      color: DEFAULT_COLOR,
      colorName: colorNameFor(DEFAULT_COLOR),
      quantity: 1,
    });
    openCart();
  };
  const handleAdd = onAddToCart || addDefaults;

  return (
    <>
      <article
        className={cn(styles.card, outOfStock && styles.out)}
      >
        <div className={styles.media}>
          <Link
            to={`/product/${product?.id}`}
            className={styles.link}
            aria-label={`View ${name}`}
          >
            <img
              src={primary}
              alt={name}
              className={styles.imgPrimary}
              loading="lazy"
              decoding="async"
              onError={(e) => {
                e.currentTarget.style.opacity = '0';
              }}
            />
            {secondary && (
              <img
                src={secondary}
                alt=""
                aria-hidden="true"
                className={styles.imgSecondary}
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  e.currentTarget.style.opacity = '0';
                }}
              />
            )}
          </Link>

          {(product?.sale || isNew) && (
            <div className={styles.badges}>
              {product?.sale && <span className={styles.badgeSale}>Sale</span>}
              {isNew && <span className={styles.badgeNew}>New</span>}
            </div>
          )}

          {showOld && (
            <span className={styles.discount} aria-hidden="true">
              −{discount}%
            </span>
          )}

          <WishlistButton product={product} size="sm" className={styles.wishlist} />

          <div className={styles.quickWrap}>
            <button
              type="button"
              className={styles.quickView}
              onClick={handleQuickView}
            >
              Quick View
            </button>
          </div>
        </div>

        <div className={styles.body}>
          <div className={styles.row}>
            <p className={styles.cat}>{product?.category || 'ALTNEU'}</p>
          </div>
          <h3 className={styles.name}>{name}</h3>

          <div className={styles.priceRow}>
            <span className={styles.price}>₹ {inr(price)}</span>
            {showOld && (
              <span className={styles.old} aria-hidden="true">
                ₹ {inr(oldPrice)}
              </span>
            )}
          </div>

          <p className={cn(styles.stock, lowStock && styles.low)}>
            {outOfStock
              ? 'Out of stock'
              : lowStock
                ? `Only ${stockQuantity} left`
                : `In stock · ${stockQuantity}`}
          </p>

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
          onAddToCart={(p) => {
            handleAdd(p);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

export default memo(ProductCard);