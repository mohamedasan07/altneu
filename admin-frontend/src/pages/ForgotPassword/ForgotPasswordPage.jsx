import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FiMail, FiArrowRight } from 'react-icons/fi'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import styles from '../Login/LoginPage.module.css'
import { useAuth } from '../../hooks/useAuth'
import api from '../../services/api'

function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (submitting) return

    setError('')
    setSuccess(false)
    setSubmitting(true)

    try {
      const { data } = await api.post('/auth/forgot-password', { email })

      if (data.success) {
        setSuccess(true)
      } else {
        setError(data.error || 'An error occurred')
      }
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Network error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.page}>
      <main className={styles.authPanel}>
        <header className={styles.authHeader}>
          <img src="/images/admin1.png" alt="ALTNEU Admin Logo" className={styles.brandImage} />
          <h2 className={styles.authTitle}>Forgot your password?</h2>
          <p className={styles.authSubtitle}>
            Enter your admin email and we'll send you a password reset link.
          </p>
        </header>

        <div className={styles.authCard}>
          {success ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#10b981', marginBottom: '24px', fontSize: '15px' }}>
                If the account exists, a password reset email has been sent.
              </div>
              <Link to="/" className={styles.forgot}>
                Back to sign in
              </Link>
            </div>
          ) : (
            <form className={styles.form} onSubmit={handleSubmit} noValidate>
              {error && (
                <div className={styles.formError} role="alert">
                  {error}
                </div>
              )}

              <Input
                label="Email address"
                type="email"
                placeholder="you@company.com"
                icon={<FiMail size={16} />}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />

              <Button
                type="submit"
                size="lg"
                fullWidth
                loading={submitting}
                disabled={submitting || !email}
                style={{ marginTop: '24px' }}
              >
                {submitting ? 'Sending…' : 'Send reset link'}
                {!submitting && <FiArrowRight size={16} />}
              </Button>

              <div style={{ textAlign: 'center', marginTop: '24px' }}>
                <Link to="/" className={styles.forgot}>
                  Back to sign in
                </Link>
              </div>
            </form>
          )}

          <p className={styles.help}>
            Having trouble signing in?{' '}
            <a className={styles.helpLink} href="mailto:altneu07@gmail.com">
              Contact support
            </a>
          </p>
        </div>

        <footer className={styles.footer}>© {new Date().getFullYear()} ALTNEU. All rights reserved.</footer>
      </main>
    </div>
  )
}

export default ForgotPasswordPage
