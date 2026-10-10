import { cn } from '../../../utils/cn';
import styles from './TypeFilter.module.css';

export default function TypeFilter({ types = [], selectedTypes = [], onChange, onFilterCommit }) {
  if (!types || types.length === 0) return null;

  const toggleType = (typeId) => {
    let next;
    if (selectedTypes.includes(typeId)) {
      next = selectedTypes.filter(t => t !== typeId);
    } else {
      next = [...selectedTypes, typeId];
    }
    onChange(next);
    onFilterCommit?.();
  };

  return (
    <div className={styles.grid}>
      {types.map((type) => {
        const active = selectedTypes.includes(type.id);
        return (
          <button
            key={type.id}
            type="button"
            className={cn(styles.chip, active && styles.chipActive)}
            onClick={() => toggleType(type.id)}
            aria-pressed={active}
          >
            {type.label}
          </button>
        );
      })}
    </div>
  );
}
