import classNames from '../../utils/classNames'
import styles from './Logo.module.css'

function Logo({ size = 'md', light = false, className }) {
  return (
    <div
      className={classNames(
        styles.logo,
        styles[size],
        light && styles.light,
        className,
      )}
    >
      <span className={styles.mark} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="3" width="7" height="7" rx="2" fill="currentColor" />
          <rect x="14" y="3" width="7" height="7" rx="2" fill="currentColor" opacity="0.55" />
          <rect x="3" y="14" width="7" height="7" rx="2" fill="currentColor" opacity="0.55" />
          <rect x="14" y="14" width="7" height="7" rx="2" fill="currentColor" />
        </svg>
      </span>
      <span className={styles.wordmark}>ALTNEU</span>
    </div>
  )
}

export default Logo
