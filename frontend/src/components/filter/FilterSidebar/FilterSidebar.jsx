import { cn } from '../../../utils/cn';
import AvailabilityFilter from '../AvailabilityFilter/AvailabilityFilter';
import SortDropdown from '../SortDropdown/SortDropdown';
import PriceSlider from '../PriceSlider/PriceSlider';
import SizeFilter from '../SizeFilter/SizeFilter';
import TypeFilter from '../TypeFilter/TypeFilter';
import { SORT_OPTIONS } from '../../../hooks/useFilters';
import styles from './FilterSidebar.module.css';

/**
 * Full filter set: size, availability, price range, sort.
 * Used inside the mobile/desktop drawer.
 */
export default function FilterSidebar({
  availableSizes,
  selectedSizes,
  onSizesChange,
  instock,
  onInstock,
  types,
  selectedTypes,
  onTypesChange,
  bounds,
  priceMin,
  priceMax,
  onPriceChange,
  sort,
  onSort,
  onFilterCommit,
}) {
  return (
    <div className={styles.sidebar}>
      {availableSizes?.length > 0 && (
        <section className={styles.section} aria-labelledby="filter-size">
          <h2 id="filter-size" className={styles.sectionTitle}>
            Size
          </h2>
          <SizeFilter
            availableSizes={availableSizes}
            selectedSizes={selectedSizes}
            onChange={onSizesChange}
            onFilterCommit={onFilterCommit}
          />
        </section>
      )}

      <section className={styles.section} aria-labelledby="filter-availability">
        <h2 id="filter-availability" className={styles.sectionTitle}>
          Availability
        </h2>
        <AvailabilityFilter
          instock={instock}
          onInstock={onInstock}
          onFilterCommit={onFilterCommit}
        />
      </section>

      {types?.length > 0 && (
        <section className={styles.section} aria-labelledby="filter-type">
          <h2 id="filter-type" className={styles.sectionTitle}>
            Type
          </h2>
          <TypeFilter
            types={types}
            selectedTypes={selectedTypes}
            onChange={onTypesChange}
            onFilterCommit={onFilterCommit}
          />
        </section>
      )}

      <section className={styles.section} aria-labelledby="filter-price">
        <h2 id="filter-price" className={styles.sectionTitle}>
          Price Range
        </h2>
        <PriceSlider
          min={bounds.min}
          max={bounds.max}
          step={100}
          valueMin={priceMin}
          valueMax={priceMax}
          onChange={(min, max) => {
            onPriceChange(min, max);
            onFilterCommit?.();
          }}
        />
      </section>

      <section className={styles.section} aria-labelledby="filter-sort">
        <h2 id="filter-sort" className={styles.sectionTitle}>
          Sort By
        </h2>
        <div style={{ position: 'relative', zIndex: 10 }}>
          <SortDropdown options={SORT_OPTIONS} value={sort} onSelect={onSort} />
        </div>
      </section>
    </div>
  );
}