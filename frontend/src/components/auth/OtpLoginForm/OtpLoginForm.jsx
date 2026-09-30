import { useState, useRef, useEffect } from 'react';
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

  const inputRefs = useRef([]);

  useEffect(() => {
    if (step === 2 && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [step]);

  const handleEmailChange = (e) => {
    setEmail(e.target.value);
    setFormError('');
    if (errors.email) setErrors((prev) => ({ ...prev, email: '' }));
  };

  const handleOtpBoxChange = (e, index) => {
    const val = e.target.value.replace(/\D/g, '');
    if (val.length > 1) {
      const digits = val.slice(0, 6);
      setOtp(digits);
      setFormError('');
      if (errors.otp) setErrors((prev) => ({ ...prev, otp: '' }));
      const nextIndex = Math.min(digits.length, 5);
      inputRefs.current[nextIndex]?.focus();
      return;
    }

    const newOtpArray = Array.from({ length: 6 }, (_, i) => otp[i] || '');
    newOtpArray[index] = val;
    const newOtpStr = newOtpArray.join('');
    setOtp(newOtpStr);
    setFormError('');
    if (errors.otp) setErrors((prev) => ({ ...prev, otp: '' }));

    if (val !== '' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (e, index) => {
    const currentDigit = otp[index] || '';
    if (e.key === 'Backspace' && !currentDigit && index > 0) {
      const newOtpArray = Array.from({ length: 6 }, (_, i) => otp[i] || '');
      newOtpArray[index - 1] = '';
      setOtp(newOtpArray.join(''));
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\s/g, '').replace(/\D/g, '').slice(0, 6);
    if (pastedData) {
      setOtp(pastedData);
      setFormError('');
      if (errors.otp) setErrors((prev) => ({ ...prev, otp: '' }));
      const nextIndex = Math.min(pastedData.length, 5);
      if (inputRefs.current[nextIndex]) {
        inputRefs.current[nextIndex].focus();
      } else if (inputRefs.current[5]) {
        inputRefs.current[5].focus();
      }
    }
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

      <div className={styles.otpGroup}>
        <label className="sr-only">6-digit verification code</label>
        <div className={styles.otpBoxes} onPaste={handleOtpPaste}>
          {Array.from({ length: 6 }, (_, i) => otp[i] || '').map((digit, index) => (
            <input
              key={index}
              ref={(el) => (inputRefs.current[index] = el)}
              type="text"
              inputMode="numeric"
              autoComplete={index === 0 ? "one-time-code" : "off"}
              className={styles.otpInput}
              value={digit}
              onChange={(e) => handleOtpBoxChange(e, index)}
              onKeyDown={(e) => handleOtpKeyDown(e, index)}
              aria-label={`Digit ${index + 1}`}
              maxLength={6}
            />
          ))}
        </div>
        {errors.otp && (
          <p className={styles.inputError} role="alert">
            {errors.otp}
          </p>
        )}
      </div>

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
