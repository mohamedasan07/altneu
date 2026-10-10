import { cn } from '../../../utils/cn';
import styles from './SizeFilter.module.css';

export default function SizeFilter({ availableSizes = [], selectedSizes = [], onChange, onFilterCommit }) {
  if (!availableSizes || availableSizes.length === 0) return null;

  const toggleSize = (size) => {
    let next;
    if (selectedSizes.includes(size)) {
      next = selectedSizes.filter(s => s !== size);
    } else {
      next = [...selectedSizes, size];
    }
    onChange(next);
    onFilterCommit?.();
  };

  return (
    <div className={styles.grid}>
      {availableSizes.map((size) => {
        const active = selectedSizes.includes(size);
        return (
          <button
            key={size}
            type="button"
            className={cn(styles.chip, active && styles.chipActive)}
            onClick={() => toggleSize(size)}
            aria-pressed={active}
          >
            {size}
          </button>
        );
      })}
    </div>
  );
}
