import { useEffect, useRef, useState } from 'react'
import { FiImage, FiRefreshCw, FiTrash2 } from 'react-icons/fi'
import classNames from '../../utils/classNames'
import { uploadImage } from '../../services/upload.service'
import styles from './ImageGalleryUploader.module.css'

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

export default function ImageGalleryUploader({
  images = [], // Array of { url, publicId }
  onChange,
  error,
  disabled = false,
  onUploadingChange,
}) {
  const inputRef = useRef(null)
  const clearTimerRef = useRef(null)

  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [notice, setNotice] = useState(null)
  const [replacingIndex, setReplacingIndex] = useState(null)

  useEffect(() => () => clearTimeout(clearTimerRef.current), [])

  const notifyUploading = (isUploading) => {
    onUploadingChange?.(isUploading)
  }

  const showNotice = (kind, text, autoClear = false) => {
    clearTimeout(clearTimerRef.current)
    setNotice({ kind, text })
    if (autoClear) {
      clearTimerRef.current = setTimeout(() => setNotice(null), 3000)
    }
  }

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) return

    if (!ACCEPTED_TYPES.includes(file.type)) {
      showNotice('error', 'Unsupported file type — choose JPG, PNG or WEBP.')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      showNotice('error', 'File is too large — maximum size is 5 MB.')
      return
    }

    setNotice(null)
    setUploading(true)
    notifyUploading(true)
    setProgress(0)

    try {
      const { url, publicId } = await uploadImage(file, (pct) => setProgress(pct))
      const nextImages = [...images]
      
      if (replacingIndex !== null) {
        nextImages[replacingIndex] = { url, publicId }
      } else {
        nextImages.push({ url, publicId })
      }
      
      onChange(nextImages)
      showNotice('success', 'Image uploaded successfully', true)
    } catch (err) {
      showNotice('error', err.message)
    } finally {
      setUploading(false)
      notifyUploading(false)
      setReplacingIndex(null)
    }
  }

  const openPicker = (index = null) => {
    if (disabled || uploading) return
    setReplacingIndex(index)
    inputRef.current?.click()
  }

  const handleRemove = (index) => {
    if (disabled || uploading) return
    const nextImages = [...images]
    nextImages.splice(index, 1)
    onChange(nextImages)
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.galleryGrid}>
        {images.map((img, idx) => (
          <div key={idx} className={styles.imageSlot}>
            <div className={classNames(styles.imageTile, styles.imageContainer)}>
              <img src={img.url} alt={`Product ${idx + 1}`} className={styles.preview} />
              <div className={styles.overlay}>
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={() => openPicker(idx)}
                  disabled={disabled || uploading}
                  aria-label="Replace image"
                >
                  <FiRefreshCw size={14} />
                  <span>Replace</span>
                </button>
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={() => handleRemove(idx)}
                  disabled={disabled || uploading}
                  aria-label="Remove image"
                >
                  <FiTrash2 size={14} />
                  <span>Remove</span>
                </button>
              </div>
            </div>
            <div className={styles.imageLabel}>
              Image {idx + 1} {idx === 0 && <span className={styles.primaryBadge}>(Primary)</span>}
            </div>
          </div>
        ))}

        {images.length < 3 && (
          <div className={styles.imageSlot}>
            <button
              type="button"
              className={classNames(
                styles.imageTile,
                styles.dropzone,
                error && styles.hasError,
                disabled && styles.disabled,
              )}
              onClick={() => openPicker(null)}
              disabled={disabled || uploading}
              aria-label="Upload product image"
            >
              {uploading && replacingIndex === null ? (
                <span className={styles.progressWrap} aria-hidden="true">
                  <span className={styles.progressBar} style={{ width: `${progress}%` }} />
                </span>
              ) : (
                <span className={styles.placeholder}>
                  <FiImage size={24} aria-hidden="true" />
                  <span className={styles.placeholderTitle}>Add image</span>
                </span>
              )}
            </button>
            <div className={styles.imageLabel}>
              Image {images.length + 1} {images.length === 0 && <span className={styles.primaryBadge}>(Primary)</span>}
            </div>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className={styles.input}
        onChange={handleFileChange}
        disabled={disabled || uploading}
        tabIndex={-1}
        aria-hidden="true"
      />

      {uploading && replacingIndex !== null && (
        <p className={styles.uploading} role="status" aria-live="polite">
          Replacing image… {progress}%
        </p>
      )}

      {notice?.kind === 'success' && !uploading && (
        <p className={styles.success} role="status" aria-live="polite">
          {notice.text}
        </p>
      )}

      {notice?.kind === 'error' && !uploading && (
        <p className={styles.error} role="alert">
          {notice.text}
        </p>
      )}

      {error && !notice && (
        <span className={styles.fieldError}>{error}</span>
      )}
    </div>
  )
}
