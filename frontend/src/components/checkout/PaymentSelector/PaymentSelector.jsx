import { cn } from '../../../utils/cn';
import styles from './PaymentSelector.module.css';

/**
 * Payment-method radio list.
 */
export default function PaymentSelector({ methods, payment, onChange }) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>Payment method</legend>
      <div className={styles.subtitle}>All transactions are secure and encrypted.</div>

      <div className={styles.options}>
        {methods.map((method) => {
          const selected = method.id === payment;
          const isDisabled = Boolean(method.disabled);

          return (
            <label
              key={method.id}
              className={cn(styles.option, selected && styles.optionSelected, isDisabled && styles.optionDisabled)}
            >
              <input
                type="radio"
                name="payment"
                value={method.id}
                checked={selected}
                disabled={isDisabled}
                onChange={() => onChange(method.id)}
                className={styles.input}
              />
              <div className={styles.leftCol}>
                <span className={styles.radio} aria-hidden="true" />
                <span className={styles.body}>
                  <span className={styles.name}>{method.label}</span>
                </span>
              </div>

              <div className={styles.rightCol}>
                {isDisabled && <span className={styles.tag}>Coming soon</span>}
              </div>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
