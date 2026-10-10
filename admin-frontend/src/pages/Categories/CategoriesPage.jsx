import { useCallback, useEffect, useMemo, useState } from 'react'
import { FiPlus, FiChevronLeft, FiChevronRight, FiTag, FiEdit2, FiTrash2, FiImage } from 'react-icons/fi'
import * as categoryService from '../../services/category.service'
import { useToast } from '../../components/toast/useToast'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import EmptyState from '../../components/ui/EmptyState'
import Modal from '../../components/ui/Modal'
import styles from './CategoriesPage.module.css'

const PAGE_SIZE = 10

function CategoriesPage() {
  const { showToast } = useToast()

  const [categories, setCategories] = useState([])
  const [loadState, setLoadState] = useState('loading')
  const [loadError, setLoadError] = useState('')

  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // 'all', 'active', 'hidden'
  const [sortBy, setSortBy] = useState('sortOrder') // 'sortOrder', 'name', 'productCount'
  const [page, setPage] = useState(1)

  const [modal, setModal] = useState(null) // { mode: 'add' | 'edit', category } | null
  const [deleteTarget, setDeleteTarget] = useState(null)

  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', imageUrl: '', sortOrder: 0, isActive: true })

  const load = useCallback(() => {
    setLoadState('loading')
    categoryService
      .listCategories()
      .then(data => {
        setCategories(data)
        setLoadState('ready')
      })
      .catch(error => {
        setLoadError(error.message)
        setLoadState('error')
      })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    let result = categories

    if (query) {
      const term = query.trim().toLowerCase()
      result = result.filter(c => c.name.toLowerCase().includes(term) || c.slug.toLowerCase().includes(term))
    }

    if (statusFilter === 'active') result = result.filter(c => c.isActive)
    if (statusFilter === 'hidden') result = result.filter(c => !c.isActive)

    result = [...result].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      if (sortBy === 'productCount') return (b.productCount || 0) - (a.productCount || 0)
      // default: sortOrder
      return a.sortOrder - b.sortOrder || a.id - b.id
    })

    return result
  }, [categories, query, statusFilter, sortBy])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageItems = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage],
  )

  const totalCategories = categories.length
  const activeCategories = categories.filter(c => c.isActive).length
  const assignedProducts = categories.reduce((sum, c) => sum + (c.productCount || 0), 0)

  const handleQueryChange = (e) => {
    setQuery(e.target.value)
    setPage(1)
  }

  const handleStatusFilterChange = (e) => {
    setStatusFilter(e.target.value)
    setPage(1)
  }

  const handleSortChange = (e) => {
    setSortBy(e.target.value)
    setPage(1)
  }

  const openAdd = () => {
    setForm({ name: '', description: '', imageUrl: '', sortOrder: 0, isActive: true })
    setModal({ mode: 'add', category: null })
  }

  const openEdit = (c) => {
    setForm({ name: c.name, description: c.description || '', imageUrl: c.imageUrl || '', sortOrder: c.sortOrder || 0, isActive: c.isActive })
    setModal({ mode: 'edit', category: c })
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (modal.mode === 'edit') {
        const updated = await categoryService.updateCategory(modal.category.id, form)
        setCategories(current => current.map(c => c.id === updated.id ? updated : c))
        showToast('Category updated successfully', 'success')
      } else {
        const created = await categoryService.createCategory(form)
        setCategories(current => [created, ...current])
        showToast('Category created successfully', 'success')
      }
      setModal(null)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setSaving(true)
    try {
      await categoryService.deleteCategory(deleteTarget.id)
      setCategories(current => current.filter(c => c.id !== deleteTarget.id))
      showToast('Category deleted successfully', 'success')
      setDeleteTarget(null)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const rangeStart = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(safePage * PAGE_SIZE, filtered.length)

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Categories</h1>
          <p className={styles.subtitle}>Organize and manage your store's collections.</p>
        </div>
        <Button variant="primary" onClick={openAdd}>
          <FiPlus size={16} aria-hidden="true" />
          Add Category
        </Button>
      </header>

      {loadState === 'ready' && (
        <div className={styles.summaryCards}>
          <div className={styles.summaryCard}>
            <span className={styles.summaryCardValue}>{totalCategories}</span>
            <span className={styles.summaryCardLabel}>Total Categories</span>
          </div>
          <div className={styles.summaryCard}>
            <span className={styles.summaryCardValue}>{activeCategories}</span>
            <span className={styles.summaryCardLabel}>Active Categories</span>
          </div>
          <div className={styles.summaryCard}>
            <span className={styles.summaryCardValue}>{assignedProducts}</span>
            <span className={styles.summaryCardLabel}>Products Assigned</span>
          </div>
        </div>
      )}

      <div className={styles.panel}>
        <div className={styles.toolbar}>
          <div className={styles.filters}>
            <Input
              placeholder="Search categories..."
              value={query}
              onChange={handleQueryChange}
              fullWidth={false}
              className={styles.search}
            />
            <select
              className={styles.select}
              value={statusFilter}
              onChange={handleStatusFilterChange}
              aria-label="Filter by status"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="hidden">Hidden Only</option>
            </select>
            <select
              className={styles.select}
              value={sortBy}
              onChange={handleSortChange}
              aria-label="Sort categories"
            >
              <option value="sortOrder">Sort by: Order</option>
              <option value="name">Sort by: Name</option>
              <option value="productCount">Sort by: Most Products</option>
            </select>
          </div>
        </div>

        {loadState === 'loading' && (
          <div className={styles.skeleton} aria-hidden="true">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className={styles.skeletonRow}>
                <span className={styles.skeletonImage} />
                <div>
                  <span className={styles.skeletonLineShort} style={{ marginBottom: '8px' }} />
                  <span className={styles.skeletonLine} style={{ maxWidth: '200px' }} />
                </div>
                <span className={styles.skeletonLineShort} />
              </div>
            ))}
          </div>
        )}

        {loadState === 'error' && (
          <div className={styles.stateWrap}>
            <EmptyState
              icon={<FiTag size={28} />}
              title="Couldn't load categories"
              description={loadError}
              action={<Button variant="outline" onClick={load}>Try Again</Button>}
            />
          </div>
        )}

        {loadState === 'ready' && filtered.length === 0 && (
          <div className={styles.stateWrap}>
            <EmptyState
              icon={<FiTag size={28} />}
              title={categories.length === 0 ? 'No categories yet' : 'No categories found'}
              description={categories.length === 0 ? 'Add your first category to get started.' : 'Try adjusting your search or filters.'}
              action={
                categories.length === 0 ? (
                  <Button variant="primary" onClick={openAdd}>
                    <FiPlus size={16} aria-hidden="true" /> Add Category
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => { setQuery(''); setStatusFilter('all'); }}>Clear Filters</Button>
                )
              }
            />
          </div>
        )}

        {loadState === 'ready' && filtered.length > 0 && (
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Products</th>
                  <th>Sort Order</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map(c => (
                  <tr key={c.id} className={styles.tableRow}>
                    <td>
                      <div className={styles.thumbnailWrap}>
                        {c.imageUrl ? (
                          <img src={c.imageUrl} alt="" className={styles.thumbnail} loading="lazy" />
                        ) : (
                          <div className={styles.emptyThumbnail} aria-hidden="true">
                            <FiImage size={20} />
                          </div>
                        )}
                        <div className={styles.catInfo}>
                          <span className={styles.catName}>{c.name}</span>
                          <span className={styles.catSlug}>/{c.slug}</span>
                        </div>
                      </div>
                    </td>
                    <td>{c.productCount || 0}</td>
                    <td>{c.sortOrder}</td>
                    <td>
                      {c.isActive ? (
                        <span className={`${styles.badge} ${styles.badgeActive}`}>Active</span>
                      ) : (
                        <span className={`${styles.badge} ${styles.badgeHidden}`}>Hidden</span>
                      )}
                    </td>
                    <td>
                      <div className={styles.actions}>
                        <button
                          type="button"
                          onClick={() => openEdit(c)}
                          className={styles.iconBtn}
                          aria-label={`Edit ${c.name}`}
                          title="Edit"
                        >
                          <FiEdit2 size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(c)}
                          className={`${styles.iconBtn} ${styles.danger}`}
                          aria-label={`Delete ${c.name}`}
                          title="Delete"
                        >
                          <FiTrash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {loadState === 'ready' && filtered.length > 0 && (
          <div className={styles.pagination}>
            <span className={styles.range}>
              Showing {rangeStart}–{rangeEnd} of {filtered.length} categories
            </span>
            <div className={styles.pageButtons}>
              <Button variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1}>
                <FiChevronLeft size={16} aria-hidden="true" /> Previous
              </Button>
              <span className={styles.pageInfo}>Page {safePage} of {totalPages}</span>
              <Button variant="outline" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}>
                Next <FiChevronRight size={16} aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <Modal open={Boolean(modal)} onClose={() => !saving && setModal(null)} title={modal?.mode === 'edit' ? 'Edit Category' : 'Add Category'}>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: '320px' }}>
          <Input
            label="Name"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Graphic Tees"
            required
            fullWidth
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.875rem', fontWeight: '500', color: 'var(--color-text-secondary)' }}>Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Optional category description"
              style={{
                width: '100%',
                minHeight: '80px',
                padding: 'var(--space-2) var(--space-3)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-strong)',
                background: 'var(--color-surface)',
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--font-size-base)',
                color: 'var(--color-text)',
                resize: 'vertical',
                lineHeight: 1.5
              }}
              rows={3}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <Input
              label="Image URL"
              value={form.imageUrl}
              onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))}
              placeholder="https://..."
              fullWidth
            />
            {form.imageUrl && (
              <div style={{ padding: '0.5rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-background-subtle)', width: 'fit-content' }}>
                <img 
                  src={form.imageUrl} 
                  alt="Preview" 
                  style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: 'var(--radius-sm)' }} 
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              </div>
            )}
          </div>
          <Input
            label="Sort Order"
            type="number"
            value={form.sortOrder}
            onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))}
            fullWidth
            hint="Lower numbers appear first"
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', padding: '0.5rem 0' }}>
            <input 
              type="checkbox" 
              checked={form.isActive} 
              onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} 
              style={{ width: '16px', height: '16px' }}
            />
            <span style={{ fontWeight: '500', color: 'var(--color-text)' }}>Active (visible on storefront)</span>
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
            <Button type="button" variant="ghost" onClick={() => setModal(null)} disabled={saving}>Cancel</Button>
            <Button type="submit" loading={saving}>{modal?.mode === 'edit' ? 'Save Changes' : 'Create Category'}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(deleteTarget)} onClose={() => !saving && setDeleteTarget(null)} title="Delete Category">
        <div style={{ padding: '0 0 1.5rem 0' }}>
          <p>Are you sure you want to delete the <strong>{deleteTarget?.name}</strong> category?</p>
          <p style={{ marginTop: '0.75rem', color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            This action cannot be undone. If products are assigned to this category, the deletion will be rejected to prevent data corruption.
          </p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
          <Button type="button" variant="ghost" onClick={() => setDeleteTarget(null)} disabled={saving}>Cancel</Button>
          <Button type="button" variant="danger" onClick={handleDelete} loading={saving}>Delete Category</Button>
        </div>
      </Modal>
    </div>
  )
}

export default CategoriesPage
