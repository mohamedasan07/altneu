import { cn } from '../../../utils/cn';
import { deliveryPriceFor } from '../../../hooks/useCheckout';
import styles from './DeliveryOptions.module.css';

/**
 * Free/paid delivery choice with price + ETA per option.
 */
export default function DeliveryOptions({ options, delivery, onChange, subtotal, addressComplete }) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>Delivery</legend>

      {!addressComplete ? (
        <div className={styles.emptyState}>
          Enter your shipping address to view available shipping methods.
        </div>
      ) : (
        <div className={styles.options}>
          {options.map((option) => {
            const selected = option.id === delivery;
            const fee = deliveryPriceFor(option.id, subtotal);
            return (
              <label key={option.id} className={cn(styles.option, selected && styles.optionSelected)}>
                <input
                  type="radio"
                  name="delivery"
                  value={option.id}
                  checked={selected}
                  onChange={() => onChange(option.id)}
                  className={styles.input}
                />
                <div className={styles.leftCol}>
                  <span className={styles.radio} aria-hidden="true" />
                  <span className={styles.body}>
                    <span className={styles.name}>{option.label}</span>
                    <span className={styles.note}>{option.note}</span>
                  </span>
                </div>
                <span className={styles.price}>
                  {fee === 0 ? 'Free' : `₹${fee}`}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}
