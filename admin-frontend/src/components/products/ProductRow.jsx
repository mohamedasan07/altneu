import { FiEdit2, FiTrash2 } from 'react-icons/fi'
import ProductImage from './ProductImage'
import {
  deriveProductStatus,
  PRODUCT_STATUS,
  formatCategory,
} from '../../utils/productStatus'
import classNames from '../../utils/classNames'
import styles from './ProductRow.module.css'

const STATUS_ACCENTS = {
  active: 'active',
  sale: 'sale',
  out: 'out',
}

function ProductRow({ product, onEdit, onDelete }) {
  const status = deriveProductStatus(product)
  const price = Number(product.price) || 0
  const stock = Number(product.stockQuantity) || 0

  return (
    <tr>
      <td data-label="Image">
        <ProductImage src={product.imageUrl} alt={product.name} size="md" />
      </td>

      <td data-label="Name">
        <span className={styles.name}>{product.name}</span>
      </td>

      <td data-label="Category">
        <span className={styles.category}>
          {formatCategory(product.category)}
        </span>
      </td>

      <td data-label="Price" className={styles.price}>
        ₹{price.toLocaleString('en-IN')}
      </td>

      <td data-label="Stock">
        <span
          className={classNames(styles.stock, stock === 0 && styles.stockZero)}
        >
          {stock}
        </span>
      </td>

      <td data-label="Status">
        <span className={classNames(styles.badge, styles[STATUS_ACCENTS[status]])}>
          {PRODUCT_STATUS[status]}
        </span>
      </td>

      <td data-label="Actions">
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.action}
            onClick={() => onEdit(product)}
            aria-label={`Edit ${product.name}`}
            title="Edit"
          >
            <FiEdit2 size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={classNames(styles.action, styles.actionDanger)}
            onClick={() => onDelete(product)}
            aria-label={`Delete ${product.name}`}
            title="Delete"
          >
            <FiTrash2 size={16} aria-hidden="true" />
          </button>
        </div>
      </td>
    </tr>
  )
}

export default ProductRow
