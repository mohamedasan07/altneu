import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { FiX } from 'react-icons/fi'
import classNames from '../../utils/classNames'
import styles from './Modal.module.css'

function Modal({
  open,
  onClose,
  title,
  size = 'md',
  showClose = true,
  closeOnOverlay = true,
  children,
  className,
  footer,
}) {
  const prevFocusRef = useRef(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return undefined

    prevFocusRef.current = document.activeElement

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onCloseRef.current?.()
    }

    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
      prevFocusRef.current?.focus?.()
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div className={styles.overlay} onClick={() => closeOnOverlay && onClose?.()}>
      <div
        className={classNames(styles.dialog, styles[size], className)}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        {(title || showClose) && (
          <header className={styles.header}>
            <h2 className={styles.title}>{title}</h2>
            {showClose && (
              <button
                type="button"
                className={styles.close}
                onClick={onClose}
                aria-label="Close"
              >
                <FiX size={18} />
              </button>
            )}
          </header>
        )}

        <div className={styles.body}>{children}</div>

        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}

export default Modal
