import { memo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../../utils/cn';
import { CountriesList, StatesList } from '../../../hooks/useCheckout';
import styles from './CheckoutForm.module.css';

const EASE_OUT = [0.22, 1, 0.36, 1];

const Field = memo(function Field({ label, name, type = 'text', value, error, touched, onChange, onBlur, autoComplete, inputMode, select, children, optional, loadingText, helperText, prefix }) {
  const id = `checkout-${name}`;
  const invalid = Boolean(error) && touched;
  const placeholderText = optional ? `${label} (optional)` : label;

  return (
    <div className={styles.field}>
      <label htmlFor={id} className="sr-only">
        {label}
        {optional && <span className={styles.optional}>Optional</span>}
      </label>

      {select ? (
        <select
          id={id}
          name={name}
          className={cn(styles.control, invalid && styles.controlError)}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-error` : undefined}
        >
          <option value="" disabled>{placeholderText}</option>
          {children}
        </select>
      ) : prefix ? (
        <div className={cn(styles.inputWrapper, invalid && styles.inputWrapperError)}>
          <span className={styles.inputPrefix}>{prefix}</span>
          <input
            id={id}
            name={name}
            type={type}
            value={value}
            onChange={onChange}
            onBlur={onBlur}
            autoComplete={autoComplete}
            inputMode={inputMode}
            placeholder={placeholderText}
            className={cn(styles.control, styles.controlWithPrefix)}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? `${id}-error` : undefined}
          />
        </div>
      ) : (
        <input
          id={id}
          name={name}
          type={type}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          autoComplete={autoComplete}
          inputMode={inputMode}
          placeholder={placeholderText}
          className={cn(styles.control, invalid && styles.controlError)}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-error` : undefined}
        />
      )}

      {loadingText && (
        <motion.p
          className={styles.info}
          role="status"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: EASE_OUT }}
          style={{ fontSize: 'var(--text-xs)', color: '#666', marginTop: 'var(--space-1)' }}
        >
          {loadingText}
        </motion.p>
      )}

      {helperText && !invalid && !loadingText && (
        <p className={styles.info} style={{ fontSize: 'var(--text-xs)', color: 'var(--color-neutral-600)', marginTop: 'var(--space-1)' }}>
          {helperText}
        </p>
      )}

      {invalid && (
        <motion.p
          id={`${id}-error`}
          className={styles.error}
          role="alert"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: EASE_OUT }}
        >
          {error}
        </motion.p>
      )}
    </div>
  );
});

export default function CheckoutForm({ values, errors, touched, setField, handleBlur, isFetchingPin, pinError, localityOptions }) {
  return (
    <motion.form
      noValidate
      className={styles.form}
      aria-label="Shipping information"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35, ease: EASE_OUT }}
    >
      <Field
        label="Country/Region"
        name="country"
        select
        value={values.country}
        error={errors.country}
        touched={touched.country}
        onChange={setField('country')}
        onBlur={handleBlur('country')}
        autoComplete="country-name"
      >
        {CountriesList.map((country) => (
          <option key={country} value={country}>
            {country}
          </option>
        ))}
      </Field>

      <Field
        label="Full name"
        name="fullName"
        value={values.fullName}
        error={errors.fullName}
        touched={touched.fullName}
        onChange={setField('fullName')}
        onBlur={handleBlur('fullName')}
        autoComplete="name"
      />

      <Field
        label="Address"
        name="address"
        value={values.address}
        error={errors.address}
        touched={touched.address}
        onChange={setField('address')}
        onBlur={handleBlur('address')}
        autoComplete="street-address"
      />

      <Field
        label="House No. & Floor"
        name="apartment"
        value={values.apartment}
        error={errors.apartment}
        touched={touched.apartment}
        onChange={setField('apartment')}
        onBlur={handleBlur('apartment')}
        autoComplete="address-line2"
        optional
      />

      <div className={styles.grid3}>
        <Field
          label="City"
          name="city"
          value={values.city}
          error={errors.city}
          touched={touched.city}
          onChange={setField('city')}
          onBlur={handleBlur('city')}
          autoComplete="address-level2"
        />
        <Field
          label="State"
          name="state"
          select
          value={values.state}
          error={errors.state}
          touched={touched.state}
          onChange={setField('state')}
          onBlur={handleBlur('state')}
          autoComplete="address-level1"
        >
          {StatesList.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </Field>
        <Field
          label="PIN code"
          name="pincode"
          inputMode="numeric"
          value={values.pincode}
          error={pinError || errors.pincode}
          touched={touched.pincode || Boolean(pinError)}
          onChange={setField('pincode')}
          onBlur={handleBlur('pincode')}
          autoComplete="postal-code"
          loadingText={isFetchingPin ? 'Checking PIN...' : undefined}
        />
      </div>

      {localityOptions && localityOptions.length > 0 && (
        <Field
          label="LOCALITY / POST OFFICE"
          name="locality"
          select
          value={values.locality}
          error={errors.locality}
          touched={touched.locality}
          onChange={setField('locality')}
          onBlur={handleBlur('locality')}
        >
          {localityOptions.map((loc) => (
            <option key={loc} value={loc}>
              {loc}
            </option>
          ))}
        </Field>
      )}

      <Field
        label="Phone"
        name="phone"
        type="tel"
        inputMode="tel"
        value={values.phone}
        error={errors.phone}
        touched={touched.phone}
        onChange={setField('phone')}
        onBlur={handleBlur('phone')}
        autoComplete="tel-national"
        prefix="+91"
      />
    </motion.form>
  );
}
