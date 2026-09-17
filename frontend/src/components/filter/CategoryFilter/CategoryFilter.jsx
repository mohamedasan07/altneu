import { cn } from '../../../utils/cn';
import styles from './CategoryFilter.module.css';

/**
 * Single-select category list.
 */
export default function CategoryFilter({ categories = [], value = 'all', onChange }) {
  const filteredCategories = categories.filter((c) => c.id !== 'all');

  return (
    <div className={styles.group} role="radiogroup" aria-label="Category">
      {filteredCategories.map((category) => {
        const active = value === category.id;
        return (
          <button
            key={category.id}
            type="button"
            role="radio"
            aria-checked={active}
            className={cn(styles.option, active && styles.optionActive)}
            onClick={() => onChange(category.id)}
          >
            <span className={styles.label}>{category.label}</span>
          </button>
        );
      })}
    </div>
  );
}