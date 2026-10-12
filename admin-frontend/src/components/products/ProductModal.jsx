import { useState, useCallback, useRef, useEffect } from 'react'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Button from '../ui/Button'
import ImageGalleryUploader from './ImageGalleryUploader'
import { formatCategory } from '../../utils/productStatus'
import styles from './ProductModal.module.css'

const AVAILABLE_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '26', '28', '30', '32', '34', '36']

function SizesMultiSelect({ value, onChange, label, hint }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  const selected = Array.isArray(value) ? value : []

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const toggleSize = (size) => {
    let next
    if (selected.includes(size)) {
      next = selected.filter(s => s !== size)
    } else {
      next = [...selected, size]
      next.sort((a, b) => AVAILABLE_SIZES.indexOf(a) - AVAILABLE_SIZES.indexOf(b))
    }
    onChange(next)
  }

  return (
    <div className={styles.multiSelectField} ref={containerRef}>
      {label && <label className={styles.selectLabel}>{label}</label>}
      <div
        className={`${styles.select} ${styles.multiSelectTrigger} ${open ? styles.open : ''}`}
        onClick={() => setOpen(prev => !prev)}
      >
        <span className={selected.length ? styles.valueText : styles.placeholderText}>
          {selected.length ? selected.join(', ') : 'Select sizes...'}
        </span>
      </div>

      {open && (
        <div className={styles.dropdown}>
          {AVAILABLE_SIZES.map(size => {
            const isSelected = selected.includes(size)
            return (
              <label key={size} className={styles.dropdownOption}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSize(size)}
                />
                <span>{size}</span>
              </label>
            )
          })}
        </div>
      )}
      {hint && <span className={styles.hint}>{hint}</span>}
    </div>
  )
}

function buildInitialForm(mode, product, categories) {
  if (mode === 'edit' && product) {
    let images = []
    if (product.imageMetadata && product.imageMetadata.length > 0) {
      images = product.imageMetadata
    } else {
      if (product.imageUrl) images.push({ url: product.imageUrl, publicId: null })
      if (product.imageGallery) {
        product.imageGallery.forEach(url => {
          if (url) images.push({ url, publicId: null })
        })
      }
    }

    return {
      name: product.name ?? '',
      description: product.description ?? '',
      category: product.category ?? '',
      price: product.price != null ? String(product.price) : '',
      oldPrice:
        product.oldPrice != null && Number(product.oldPrice) > 0
          ? String(product.oldPrice)
          : '',
      stockQuantity:
        product.stockQuantity != null ? String(product.stockQuantity) : '',
      images,
      sizes: Array.isArray(product.sizes) ? product.sizes : [],
      colors: '',
      sale: Boolean(product.sale),
      is_active: Boolean(product.is_active),
    }
  }

  return {
    name: '',
    description: '',
    category: categories[0] ?? '',
    price: '',
    oldPrice: '',
    stockQuantity: '',
    images: [],
    sizes: [],
    colors: '',
    sale: false,
    is_active: true,
  }
}

/**
 * Add / edit product form.
 *
 * Sizes and Colors are kept as form fields for parity with the sprint spec, but
 * the existing backend product routes do not store them (no sizes/colors
 * columns) — they are intentionally not sent to the API. See sprint report.
 */
function ProductModal({ open, mode = 'add', product, categories, onClose, onSubmit }) {
  const [prevOpen, setPrevOpen] = useState(open)
  const [form, setForm] = useState(() =>
    buildInitialForm(mode, product, categories),
  )
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Reset the form state each time the modal opens (derived-state pattern).
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setForm(buildInitialForm(mode, product, categories))
      setErrors({})
      setSaving(false)
      setUploading(false)
    }
  }

  const setField = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }))
  }

  const validate = () => {
    const next = {}

    if (!form.name.trim()) next.name = 'Product name is required'
    if (!form.category) next.category = 'Category is required'

    const price = Number(form.price)
    if (form.price === '' || !Number.isFinite(price) || price < 0) {
      next.price = 'Enter a valid current price'
    }

    if (form.oldPrice !== '' && form.oldPrice !== null && form.oldPrice !== undefined) {
      const oldPrice = Number(form.oldPrice)
      if (!Number.isFinite(oldPrice) || oldPrice < 0) {
        next.oldPrice = 'Enter a valid original price'
      } else if (Number.isFinite(price) && oldPrice <= price) {
        next.oldPrice = 'Original price must be greater than current price'
      }
    }

    const stock = Number(form.stockQuantity)
    if (
      form.stockQuantity === '' ||
      !Number.isFinite(stock) ||
      stock < 0
    ) {
      next.stockQuantity = 'Enter a valid stock quantity'
    }

    if (form.images.length === 0) next.images = 'At least one product image is required'

    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!validate()) return

    setSaving(true)
    try {
      await onSubmit({
        name: form.name.trim(),
        description: form.description.trim(),
        category: form.category,
        price: Number(form.price),
        oldPrice:
          form.oldPrice !== '' && form.oldPrice != null && Number(form.oldPrice) > 0
            ? Number(form.oldPrice)
            : null,
        stockQuantity: Number(form.stockQuantity),
        imageUrl: form.images[0]?.url || '',
        imageGallery: form.images.slice(1).map(img => img.url),
        imageMetadata: form.images,
        sizes: form.sizes,
        sale: Boolean(form.sale),
        is_active: Boolean(form.is_active),
      })
      onClose()
    } catch {
      // Error already surfaced by the parent (toast); keep the modal open.
    } finally {
      setSaving(false)
    }
  }

  const handleClose = useCallback(() => {
    // Keep the modal open while a request or upload is in flight so we never
    // drop work on the server mid-flight.
    if (!saving && !uploading) onClose()
  }, [saving, uploading, onClose])

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={mode === 'edit' ? 'Edit Product' : 'Add Product'}
      size="lg"
    >
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <div className={styles.grid}>
          <div className={styles.full}>
            <Input
              label="Product Name"
              value={form.name}
              onChange={setField('name')}
              error={errors.name}
              placeholder="e.g. Graphic Tee"
              fullWidth
            />
          </div>

          <div className={styles.full}>
            <label className={styles.textareaLabel} htmlFor="product-description">
              Description
            </label>
            <textarea
              id="product-description"
              className={styles.textarea}
              value={form.description}
              onChange={setField('description')}
              placeholder="Short product description…"
              rows={3}
            />
          </div>

          <div>
            <label className={styles.selectLabel} htmlFor="product-category">
              Category
            </label>
            <select
              id="product-category"
              className={styles.select}
              value={form.category}
              onChange={setField('category')}
              aria-invalid={errors.category ? 'true' : undefined}
            >
              <option value="" disabled>
                Select category
              </option>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {formatCategory(item)}
                </option>
              ))}
            </select>
            {errors.category && (
              <span className={styles.fieldError}>{errors.category}</span>
            )}
          </div>

          <div>
            <Input
              label="Stock Quantity"
              type="number"
              min="0"
              step="1"
              value={form.stockQuantity}
              onChange={setField('stockQuantity')}
              error={errors.stockQuantity}
              placeholder="e.g. 40"
              hint="Units available for sale"
              fullWidth
            />
          </div>

          <div>
            <Input
              label="Current Price (₹)"
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={setField('price')}
              error={errors.price}
              placeholder="e.g. 999"
              hint="The actual price customer pays (prominent price)"
              fullWidth
            />
          </div>

          <div>
            <Input
              label="Original Price (₹)"
              type="number"
              min="0"
              step="0.01"
              value={form.oldPrice}
              onChange={setField('oldPrice')}
              error={errors.oldPrice}
              placeholder="e.g. 1499"
              hint="Normal/list price. Crossed out on store if greater than current price"
              fullWidth
            />
          </div>

          <div className={styles.full}>
            <label className={styles.uploaderLabel}>Product Images (Max 3)</label>
            <ImageGalleryUploader
              images={form.images}
              onChange={(images) =>
                setForm((current) => ({ ...current, images }))
              }
              error={errors.images}
              disabled={saving}
              onUploadingChange={setUploading}
            />
          </div>

          <div>
            <SizesMultiSelect
              label="Sizes"
              value={form.sizes}
              onChange={(value) => setForm((current) => ({ ...current, sizes: value }))}
            />
          </div>

          <div>
            <Input
              label="Colors"
              value={form.colors}
              onChange={setField('colors')}
              placeholder="Black, White"
              hint="Not persisted by the backend yet"
              fullWidth
            />
          </div>
        </div>

        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={form.sale}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                sale: event.target.checked,
              }))
            }
          />
          <span>Mark as On Sale</span>
        </label>

        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                is_active: event.target.checked,
              }))
            }
          />
          <span>Active (visible to customers)</span>
        </label>
        <span className={styles.toggleHint}>
          Hidden products stay on this admin list but never appear in the store.
        </span>

        <footer className={styles.footer}>
          <Button
            type="button"
            variant="ghost"
            onClick={handleClose}
            disabled={saving || uploading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            loading={saving}
            disabled={saving || uploading}
          >
            {mode === 'edit' ? 'Save Changes' : 'Add Product'}
          </Button>
        </footer>
      </form>
    </Modal>
  )
}

export default ProductModal
