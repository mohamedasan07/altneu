import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { FiMail, FiLock, FiArrowRight } from 'react-icons/fi'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import { useAuth } from '../../hooks/useAuth'
import styles from './LoginPage.module.css'

function LoginPage() {
  const { isAuthenticated, login, sessionMessage } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // A restored session means we're already signed in — skip the form.
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (submitting) return // prevent double submit

    setError('')
    setSubmitting(true)

    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.page}>
      <main className={styles.authPanel}>


        <header className={styles.authHeader}>
          <img src="/images/test1_clean.png" alt="ALTNEU Admin Logo" className={styles.brandImage} />
          <h2 className={styles.authTitle}>Welcome back</h2>
          <p className={styles.authSubtitle}>
            Sign in to your admin account to continue.
          </p>
        </header>

        <div className={styles.authCard}>

          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            {error && (
              <div className={styles.formError} role="alert">
                {error}
              </div>
            )}

            {sessionMessage && (
              <div className={styles.formError} role="alert">
                {sessionMessage}
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

            <Input
              label="Password"
              type="password"
              placeholder="Enter your password"
              icon={<FiLock size={16} />}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />

            <div className={styles.formRow}>
              <label className={styles.remember}>
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                />
                <span>Remember me</span>
              </label>
              <a className={styles.forgot} href="#">
                Forgot password?
              </a>
            </div>

            <Button
              type="submit"
              size="lg"
              fullWidth
              loading={submitting}
              disabled={submitting}
            >
              {submitting ? 'Signing in…' : 'Sign in'}
              {!submitting && <FiArrowRight size={16} />}
            </Button>
          </form>

          <p className={styles.help}>
            Having trouble signing in?{' '}
            <a className={styles.helpLink} href="#">
              Contact support
            </a>
          </p>
        </div>

        <footer className={styles.footer}>© {new Date().getFullYear()} ALTNEU. All rights reserved.</footer>
      </main>
    </div>
  )
}

export default LoginPage
