import { useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../../../services/supabase';
import { validateEmail, normalizeEmail } from '../../../utils/authValidation';
import AuthField from '../AuthField/AuthField';
import styles from './OtpLoginForm.module.css';

export default function OtpLoginForm() {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleEmailChange = (e) => {
    setEmail(e.target.value);
    setFormError('');
    if (errors.email) setErrors((prev) => ({ ...prev, email: '' }));
  };

  const handleOtpChange = (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setOtp(val);
    setFormError('');
    if (errors.otp) setErrors((prev) => ({ ...prev, otp: '' }));
  };

  const handleSendOtp = async (e) => {
    e?.preventDefault();
    const emailError = validateEmail(email);
    if (emailError) {
      setErrors({ email: emailError });
      return;
    }

    setSubmitting(true);
    setFormError('');

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizeEmail(email),
        options: {
          shouldCreateUser: true,
        },
      });

      if (error) throw error;

      setStep(2);
    } catch (err) {
      setFormError(err.message || 'Failed to send verification code.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (otp.length !== 6) {
      setErrors({ otp: 'Please enter a 6-digit code.' });
      return;
    }

    setSubmitting(true);
    setFormError('');

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: normalizeEmail(email),
        token: otp,
        type: 'email',
      });

      if (error) throw error;

    } catch (err) {
      setFormError(err.message || 'Invalid or expired verification code.');
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 1) {
    return (
      <motion.form
        className={styles.form}
        onSubmit={handleSendOtp}
        noValidate
        aria-label="Sign in with email"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        {formError && (
          <p className={styles.formError} role="alert">
            {formError}
          </p>
        )}

        <AuthField
          id="otp-email"
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={handleEmailChange}
          error={errors.email}
          required
        />

        <button type="submit" className={styles.submit} disabled={submitting}>
          {submitting ? 'Sending…' : 'Continue'}
        </button>
      </motion.form>
    );
  }

  return (
    <motion.form
      className={styles.form}
      onSubmit={handleVerifyOtp}
      noValidate
      aria-label="Verify your email"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <p className={styles.message}>
        Check your email. We've sent a 6-digit verification code to <strong>{email}</strong>.
      </p>

      {formError && (
        <p className={styles.formError} role="alert">
          {formError}
        </p>
      )}

      <AuthField
        id="otp-code"
        label="6-digit code"
        type="text"
        name="otp"
        autoComplete="one-time-code"
        placeholder="000000"
        value={otp}
        onChange={handleOtpChange}
        error={errors.otp}
        required
      />

      <div className={styles.row}>
        <button
          type="button"
          className={styles.actionLink}
          onClick={() => setStep(1)}
          disabled={submitting}
        >
          Change email
        </button>

        <button
          type="button"
          className={styles.actionLink}
          onClick={handleSendOtp}
          disabled={submitting}
        >
          Resend code
        </button>
      </div>

      <button type="submit" className={styles.submit} disabled={submitting || otp.length !== 6}>
        {submitting ? 'Verifying…' : 'Verify'}
      </button>
    </motion.form>
  );
}
