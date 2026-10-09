import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FiLock, FiArrowRight } from 'react-icons/fi'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import styles from '../Login/LoginPage.module.css'
import api from '../../services/api'

function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) {
      setError('Invalid or missing reset token.')
    }
  }, [token])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (submitting || !token) return

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long')
      return
    }

    setError('')
    setSuccess(false)
    setSubmitting(true)

    try {
      const { data } = await api.post('/auth/reset-password', { token, password })

      if (data.success) {
        setSuccess(true)
      } else {
        setError(data.error || 'Invalid or expired token')
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
          <h2 className={styles.authTitle}>Set a new password</h2>
          <p className={styles.authSubtitle}>
            Please enter your new password below.
          </p>
        </header>

        <div className={styles.authCard}>
          {success ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#10b981', marginBottom: '24px', fontSize: '15px' }}>
                Your password has been reset successfully.
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
                label="New password"
                type="password"
                placeholder="Enter new password"
                icon={<FiLock size={16} />}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />

              <Input
                label="Confirm password"
                type="password"
                placeholder="Re-enter new password"
                icon={<FiLock size={16} />}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />

              <Button
                type="submit"
                size="lg"
                fullWidth
                loading={submitting}
                disabled={submitting || !password || !confirmPassword || !!error && !token}
                style={{ marginTop: '24px' }}
              >
                {submitting ? 'Resetting…' : 'Reset Password'}
                {!submitting && <FiArrowRight size={16} />}
              </Button>
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

export default ResetPasswordPage
