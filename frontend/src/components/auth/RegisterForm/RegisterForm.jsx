import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../../hooks/useAuth';
import { validateRegister } from '../../../utils/authValidation';
import AuthField from '../AuthField/AuthField';
import styles from './RegisterForm.module.css';

/**
 * Register form — profile fields + password confirmation + terms.
 * Creates a mock account via AuthContext and logs the user straight in.
 */
export default function RegisterForm({ onSuccess }) {
  const { register } = useAuth();
  const [values, setValues] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    terms: false,
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const handleChange = (field) => (e) => {
    const raw = e.target.value;
    const next =
      field === 'terms'
        ? { ...values, [field]: e.target.checked }
        : { ...values, [field]: raw };
    setValues(next);
    setFormError('');
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const handleBlur = (field) => () => {
    const fieldErrors = validateRegister(values);
    setErrors((prev) => ({ ...prev, [field]: fieldErrors[field] || '' }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const fieldErrors = validateRegister(values);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).some((k) => fieldErrors[k])) return;

    setSubmitting(true);
    setFormError('');
    try {
      const user = await register(values);
      onSuccess?.(user);
    } catch (err) {
      if (err.field) {
        setErrors((prev) => ({ ...prev, [err.field]: err.message }));
      } else {
        setFormError(err.message || 'Unable to create your account.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const termsError = errors.terms;

  return (
    <motion.form
      className={styles.form}
      onSubmit={onSubmit}
      noValidate
      aria-label="Create your account"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      {formError && (
        <p className={styles.formError} role="alert">
          {formError}
        </p>
      )}

      <div className={styles.grid}>
        <AuthField
          id="register-first-name"
          label="First Name"
          type="text"
          name="firstName"
          autoComplete="given-name"
          placeholder="Ava"
          value={values.firstName}
          onChange={handleChange('firstName')}
          onBlur={handleBlur('firstName')}
          error={errors.firstName}
          required
        />

        <AuthField
          id="register-last-name"
          label="Last Name"
          type="text"
          name="lastName"
          autoComplete="family-name"
          placeholder="Kane"
          value={values.lastName}
          onChange={handleChange('lastName')}
          onBlur={handleBlur('lastName')}
          error={errors.lastName}
          required
        />
      </div>

      <AuthField
        id="register-email"
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        placeholder="you@unfiltered.com"
        value={values.email}
        onChange={handleChange('email')}
        onBlur={handleBlur('email')}
        error={errors.email}
        required
      />

      <AuthField
        id="register-phone"
        label="Phone"
        type="tel"
        name="phone"
        autoComplete="tel"
        placeholder="+91 98765 43210"
        value={values.phone}
        onChange={handleChange('phone')}
        onBlur={handleBlur('phone')}
        error={errors.phone}
        required
      />

      <div className={styles.grid}>
        <AuthField
          id="register-password"
          label="Password"
          type="password"
          name="password"
          autoComplete="new-password"
          placeholder="8+ characters"
          value={values.password}
          onChange={handleChange('password')}
          onBlur={handleBlur('password')}
          error={errors.password}
          hint="At least 8 characters."
          required
        />

        <AuthField
          id="register-confirm-password"
          label="Confirm Password"
          type="password"
          name="confirmPassword"
          autoComplete="new-password"
          placeholder="Repeat password"
          value={values.confirmPassword}
          onChange={handleChange('confirmPassword')}
          onBlur={handleBlur('confirmPassword')}
          error={errors.confirmPassword}
          required
        />
      </div>

      <div className={styles.terms}>
        <label className={styles.termsLabel}>
          <input
            type="checkbox"
            name="terms"
            checked={values.terms}
            onChange={handleChange('terms')}
            aria-describedby={termsError ? 'register-terms-error' : undefined}
            aria-invalid={termsError ? true : undefined}
          />
          <span>
            I agree to the <Link to="/terms" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>Terms of Service</Link> and{' '}
            <Link to="/privacy" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>Privacy Policy</Link>.
          </span>
        </label>
        {termsError && (
          <p id="register-terms-error" className={styles.termsError} role="alert">
            {termsError}
          </p>
        )}
      </div>

      <button type="submit" className={styles.submit} disabled={submitting}>
        {submitting ? 'Creating account…' : 'Create Account'}
      </button>
    </motion.form>
  );
}