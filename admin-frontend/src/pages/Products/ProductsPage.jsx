import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FiPlus, FiChevronLeft, FiChevronRight, FiPackage } from 'react-icons/fi'
import * as productService from '../../services/product.service'
import { useToast } from '../../components/toast/useToast'
import ProductTable from '../../components/products/ProductTable'
import ProductSearch from '../../components/products/ProductSearch'
import ProductFilters from '../../components/products/ProductFilters'
import ProductModal from '../../components/products/ProductModal'
import DeleteModal from '../../components/products/DeleteModal'
import Button from '../../components/ui/Button'
import EmptyState from '../../components/ui/EmptyState'
import { deriveProductStatus } from '../../utils/productStatus'
import styles from './ProductsPage.module.css'

const PAGE_SIZE = 10

const BASE_CATEGORIES = ['tshirts', 'shirts', 'jerseys', 'baggy']

function ProductsPage() {
  const { showToast } = useToast()
  const [searchParams] = useSearchParams()
  const editId = searchParams.get('edit')

  const [products, setProducts] = useState([])
  const [loadState, setLoadState] = useState('loading') // loading | ready | error
  const [loadError, setLoadError] = useState('')

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)

  const [modal, setModal] = useState(null) // { mode, product } | null
  const [deleteTarget, setDeleteTarget] = useState(null)

  const applyProducts = useCallback((data) => {
    setProducts(Array.isArray(data) ? data : [])
    setLoadState('ready')
  }, [])

  const applyError = useCallback((message) => {
    setLoadError(message)
    setLoadState('error')
  }, [])

  useEffect(() => {
    let ignore = false
    productService
      .listProducts()
      .then((data) => {
        if (ignore) return
        applyProducts(data)
        // Deep-link: /products?edit=<id> opens the existing edit modal.
        if (editId) {
          const target = (Array.isArray(data) ? data : []).find(
            (p) => String(p.id) === String(editId),
          )
          if (target) setModal({ mode: 'edit', product: target })
        }
      })
      .catch((error) => {
        if (!ignore) applyError(error.message)
      })
    return () => {
      ignore = true
    }
  }, [applyProducts, applyError, editId])

  const reload = () => {
    setLoadState('loading')
    setLoadError('')
    productService
      .listProducts()
      .then(applyProducts)
      .catch(applyError)
  }

  const handleQueryChange = (value) => {
    setQuery(value)
    setPage(1)
  }

  const handleCategoryChange = (value) => {
    setCategory(value)
    setPage(1)
  }

  const handleStatusChange = (value) => {
    setStatus(value)
    setPage(1)
  }

  const clearFilters = () => {
    setQuery('')
    setCategory('all')
    setStatus('all')
    setPage(1)
  }

  const categories = useMemo(() => {
    const fromData = [
      ...new Set(products.map((p) => p.category).filter(Boolean)),
    ]
    return fromData.length ? fromData : BASE_CATEGORIES
  }, [products])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return products.filter((product) => {
      const matchesSearch =
        !term || product.name?.toLowerCase().includes(term)
      const matchesCategory =
        category === 'all' || product.category === category
      const matchesStatus =
        status === 'all' || deriveProductStatus(product) === status
      return matchesSearch && matchesCategory && matchesStatus
    })
  }, [products, query, category, status])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageItems = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage],
  )

  const handleSave = async (payload) => {
    try {
      if (modal?.mode === 'edit') {
        const updated = await productService.updateProduct(
          modal.product.id,
          payload,
        )
        setProducts((current) =>
          current.map((p) => (p.id === updated.id ? updated : p)),
        )
        showToast('Product updated successfully', 'success')
      } else {
        const created = await productService.createProduct(payload)
        setProducts((current) => [created, ...current])
        showToast('Product created successfully', 'success')
      }
    } catch (error) {
      showToast(error.message, 'error')
      throw error
    }
  }

  const handleDelete = async (product) => {
    // Optimistic removal.
    setProducts((current) => current.filter((p) => p.id !== product.id))
    try {
      await productService.deleteProduct(product.id)
      showToast('Product deleted successfully', 'success')
    } catch (error) {
      reload()
      showToast(error.message, 'error')
      throw error
    }
  }

  const openAdd = () => setModal({ mode: 'add', product: null })
  const openEdit = (product) => setModal({ mode: 'edit', product })

  const rangeStart = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(safePage * PAGE_SIZE, filtered.length)

  return (
    <div className={styles.page}>
      {/* ----- Header ----- */}
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Products</h1>
          <p className={styles.subtitle}>Manage your store inventory</p>
        </div>

        <Button variant="primary" onClick={openAdd}>
          <FiPlus size={16} aria-hidden="true" />
          Add Product
        </Button>
      </header>

      <div className={styles.panel}>
        {/* ----- Toolbar ----- */}
        <div className={styles.toolbar}>
          <ProductSearch value={query} onChange={handleQueryChange} />
          <ProductFilters
            categories={categories}
            category={category}
            status={status}
            onCategoryChange={handleCategoryChange}
            onStatusChange={handleStatusChange}
          />
        </div>

        {/* ----- Body states ----- */}
        {loadState === 'loading' && (
          <div className={styles.skeleton} aria-hidden="true">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className={styles.skeletonRow}>
                <span className={styles.skeletonImage} />
                <span className={styles.skeletonLine} />
                <span className={styles.skeletonLineShort} />
              </div>
            ))}
          </div>
        )}

        {loadState === 'error' && (
          <div className={styles.stateWrap}>
            <EmptyState
              icon={<FiPackage size={28} />}
              title="Couldn't load products"
              description={loadError}
              action={
                <Button variant="outline" onClick={reload}>
                  Try Again
                </Button>
              }
            />
          </div>
        )}

        {loadState === 'ready' && filtered.length === 0 && (
          <div className={styles.stateWrap}>
            <EmptyState
              icon={<FiPackage size={28} />}
              title={products.length === 0 ? 'No products yet' : 'No products found'}
              description={
                products.length === 0
                  ? 'Add your first product to start selling.'
                  : 'Try adjusting your search or filters.'
              }
              action={
                products.length === 0 ? (
                  <Button variant="primary" onClick={openAdd}>
                    <FiPlus size={16} aria-hidden="true" />
                    Add Product
                  </Button>
                ) : (
                  <Button variant="outline" onClick={clearFilters}>
                    Clear Filters
                  </Button>
                )
              }
            />
          </div>
        )}

        {loadState === 'ready' && filtered.length > 0 && (
          <ProductTable
            products={pageItems}
            onEdit={openEdit}
            onDelete={setDeleteTarget}
          />
        )}

        {/* ----- Pagination ----- */}
        {loadState === 'ready' && filtered.length > 0 && (
          <div className={styles.pagination}>
            <span className={styles.range}>
              Showing {rangeStart}–{rangeEnd} of {filtered.length} products
            </span>

            <div className={styles.pageButtons}>
              <Button
                variant="outline"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={safePage <= 1}
              >
                <FiChevronLeft size={16} aria-hidden="true" />
                Previous
              </Button>

              <span className={styles.pageInfo}>
                Page {safePage} of {totalPages}
              </span>

              <Button
                variant="outline"
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
                disabled={safePage >= totalPages}
              >
                Next
                <FiChevronRight size={16} aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ----- Modals ----- */}
      <ProductModal
        open={Boolean(modal)}
        mode={modal?.mode || 'add'}
        product={modal?.product}
        categories={categories}
        onClose={() => setModal(null)}
        onSubmit={handleSave}
      />

      <DeleteModal
        open={Boolean(deleteTarget)}
        product={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  )
}

export default ProductsPage
