import { cn } from '../../../utils/cn';
import styles from './ProductDetailsSkeleton.module.css';

export default function ProductDetailsSkeleton() {
  return (
    <div className={cn("page", styles.page)} aria-hidden="true">
      <div className={styles.article}>
        {/* Left Side: Gallery Skeleton */}
        <div className={styles.gallery}>
          <div className={styles.layout}>
            {/* Thumbnails */}
            <div className={styles.thumbStrip}>
              <div className={cn(styles.thumb, styles.glow)} />
              <div className={cn(styles.thumb, styles.glow)} />
              <div className={cn(styles.thumb, styles.glow)} />
            </div>
            {/* Main Image */}
            <div className={styles.main}>
              <div className={cn(styles.mainImg, styles.glow)} />
            </div>
          </div>
        </div>

        {/* Right Side: Info Skeleton */}
        <div className={styles.info}>
          <div>
            <div className={cn(styles.cat, styles.glow)} />
            <div className={cn(styles.title1, styles.glow)} />
            <div className={cn(styles.title2, styles.glow)} />
          </div>

          <div className={styles.priceBlock}>
            <div className={cn(styles.price, styles.glow)} />
            <div className={cn(styles.stock, styles.glow)} />
          </div>

          <div className={styles.desc}>
            <div className={cn(styles.descLine1, styles.glow)} />
            <div className={cn(styles.descLine2, styles.glow)} />
          </div>

          <div className={styles.choosers}>
            <div className={styles.sizeBlock}>
              <div className={cn(styles.sizeLabel, styles.glow)} />
              <div className={styles.sizeBtns}>
                <div className={cn(styles.sizeBtn, styles.glow)} />
                <div className={cn(styles.sizeBtn, styles.glow)} />
                <div className={cn(styles.sizeBtn, styles.glow)} />
              </div>
            </div>
            <div className={styles.qtyBlock}>
              <div className={cn(styles.qtyLabel, styles.glow)} />
              <div className={cn(styles.qtyInput, styles.glow)} />
            </div>
          </div>

          <div className={styles.actions}>
            <div className={cn(styles.addBtn, styles.glow)} />
            <div className={cn(styles.buyBtn, styles.glow)} />
            <div className={cn(styles.wishBtn, styles.glow)} />
          </div>

          <div>
            <div className={cn(styles.deliveryCard, styles.glow)} />
          </div>

          <div className={styles.accordion}>
            <div className={cn(styles.accordionCard, styles.glow)} />
            <div className={cn(styles.accordionCard, styles.glow)} />
            <div className={cn(styles.accordionCard, styles.glow)} />
            <div className={cn(styles.accordionCard, styles.glow)} />
          </div>
        </div>
      </div>
    </div>
  );
}
