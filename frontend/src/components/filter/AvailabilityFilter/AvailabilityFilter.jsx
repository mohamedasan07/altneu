import { cn } from '../../../utils/cn';
import styles from './AvailabilityFilter.module.css';

const STOCK_OPTIONS = [
  { id: null, label: 'All' },
  { id: 'true', label: 'In Stock' },
  { id: 'false', label: 'Out of Stock' },
];

export default function AvailabilityFilter({ instock, onInstock, onFilterCommit }) {
  return (
    <div className={styles.rows}>

      <div className={styles.segmented} role="radiogroup" aria-label="Stock status">
        {STOCK_OPTIONS.map((option) => {
          const active = instock === option.id;
          return (
            <button
              key={option.id ?? 'all'}
              type="button"
              role="radio"
              aria-checked={active}
              className={cn(styles.seg, active && styles.segActive)}
              onClick={() => {
                onInstock(option.id);
                onFilterCommit?.();
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
