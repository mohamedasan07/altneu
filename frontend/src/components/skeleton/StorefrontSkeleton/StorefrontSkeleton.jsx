import { memo } from 'react';
import Container from '../../ui/Container/Container';
import styles from './StorefrontSkeleton.module.css';

export function ProductCardSkeleton() {
  return (
    <div className={styles.card}>
      <div className={styles.media} />
      <div className={styles.body}>
        <div className={styles.titleLine} />
        <div className={styles.circleLine} />
      </div>
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }) {
  return (
    <div className={styles.grid}>
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function HeroSkeleton() {
  return <div className={styles.hero} />;
}

export function HomeSkeleton() {
  return (
    <div className={styles.page}>
      <HeroSkeleton />
      <div className={styles.marqueeSkeleton} />

      {/* New Arrivals Skeleton */}
      <section className={styles.section}>
        <Container>
          <div className={styles.sectionHead}>
            <div className={styles.kickerLine} />
            <div className={styles.headingLine} />
          </div>
        </Container>
        <div className={styles.rail}>
          <div className={styles.railTrack}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={styles.railItem}>
                <ProductCardSkeleton />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Shop By Category Skeleton */}
      <section className={styles.section}>
        <Container>
          <div className={styles.sectionHead}>
            <div className={styles.kickerLine} />
            <div className={styles.headingLine} />
            <div className={styles.tabsLine} />
          </div>
          <ProductGridSkeleton count={4} />
        </Container>
      </section>
    </div>
  );
}

export function CollectionsSkeleton() {
  return (
    <section className={`page ${styles.collectionsPage}`}>
      <header className={styles.collectionsHeader}>
        <div className={styles.kickerLine} />
        <div className={styles.headingLine} />
      </header>

      <div className={styles.collectionsLayout}>
        <aside className={styles.collectionsRail}>
          <div className={styles.sidebarSkeleton} />
        </aside>
        <div className={styles.collectionsResults}>
          <div className={styles.toolbarSkeleton} />
          <ProductGridSkeleton count={8} />
        </div>
      </div>
    </section>
  );
}

function StorefrontSkeleton({ variant = 'home' }) {
  if (variant === 'collections') {
    return <CollectionsSkeleton />;
  }
  return <HomeSkeleton />;
}

export default memo(StorefrontSkeleton);
