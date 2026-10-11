import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiMenu, FiSearch, FiBell, FiLogOut } from 'react-icons/fi'
import { useAuth } from '../../hooks/useAuth'
import * as dashboardService from '../../services/dashboard.service'
import * as productService from '../../services/product.service'
import * as orderService from '../../services/order.service'
import * as customerService from '../../services/customer.service'
import { timeAgo, formatMoney } from '../../utils/format'
import classNames from '../../utils/classNames'
import styles from './Topbar.module.css'

function Topbar({ onToggleSidebar }) {
  const { admin, logout } = useAuth()
  const initial = admin?.name?.charAt(0)?.toUpperCase() || 'A'
  const navigate = useNavigate()

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState({ products: [], orders: [], customers: [] })
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const searchRef = useRef(null)

  const [allProducts, setAllProducts] = useState([])
  useEffect(() => {
    productService.listProducts().then(setAllProducts).catch(console.error)
  }, [])

  const handleSearchChange = (e) => {
    const val = e.target.value
    setSearchQuery(val)
    if (!val.trim()) {
      setSearchResults({ products: [], orders: [], customers: [] })
      setIsSearchOpen(false)
    }
  }

  useEffect(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return

    let cancelled = false
    const timer = setTimeout(() => {
      const matchedProducts = allProducts
        .filter(p => p.name.toLowerCase().includes(q))
        .slice(0, 3)

      Promise.all([
        orderService.listOrders({ search: q, limit: 3 }),
        customerService.listCustomers({ search: q, limit: 3 })
      ]).then(([ordersRes, customersRes]) => {
        if (cancelled) return
        setSearchResults({
          products: matchedProducts,
          orders: ordersRes.orders || [],
          customers: customersRes.customers || []
        })
        setIsSearchOpen(true)
      }).catch(console.error)
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [searchQuery, allProducts])

  const [recentActivity, setRecentActivity] = useState([])
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const bellRef = useRef(null)

  useEffect(() => {
    dashboardService.getDashboard().then(res => {
      setRecentActivity(res.recentActivity || [])
    }).catch(console.error)
  }, [])

  useEffect(() => {
    function handleClickOutside(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setIsSearchOpen(false)
      }
      if (bellRef.current && !bellRef.current.contains(e.target)) {
        setIsNotificationsOpen(false)
      }
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setIsSearchOpen(false)
        setIsNotificationsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const hasSearchResults =
    searchResults.products.length > 0 ||
    searchResults.orders.length > 0 ||
    searchResults.customers.length > 0

  // Map an activity item to an existing admin page only when it carries a real
  // id. Items without a safe identifier stay non-clickable.
  const activityRoute = (activity) => {
    if (activity.id == null) return null
    if (activity.type === 'order') return `/orders?view=${activity.id}`
    if (activity.type === 'update') return `/products?edit=${activity.id}`
    if (activity.type === 'product') return `/products?edit=${activity.id}`
    return null
  }

  return (
    <header className={styles.topbar}>
      <div className={styles.left}>
        <button
          type="button"
          className={styles.iconButton}
          onClick={onToggleSidebar}
          aria-label="Toggle menu"
        >
          <FiMenu size={20} />
        </button>

        <div className={styles.search} ref={searchRef}>
          <FiSearch size={16} className={styles.searchIcon} />
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Search orders, products, customers…"
            value={searchQuery}
            onChange={handleSearchChange}
            onFocus={() => { if (searchQuery.trim()) setIsSearchOpen(true) }}
          />
          {isSearchOpen && (
            <div className={classNames(styles.dropdown, styles.searchDropdown)}>
              {hasSearchResults ? (
                <>
                  {searchResults.products.length > 0 && (
                    <>
                      <div className={styles.dropdownHeader}>Products</div>
                      {searchResults.products.map(p => (
                        <button
                          type="button"
                          key={p.id}
                          className={styles.dropdownItem}
                          onClick={() => {
                            setIsSearchOpen(false)
                            navigate(`/products?edit=${p.id}`)
                          }}
                        >
                          <span className={styles.dropdownItemTitle}>{p.name}</span>
                          <span className={styles.dropdownItemSub}>{formatMoney(p.price)}</span>
                        </button>
                      ))}
                    </>
                  )}
                  {searchResults.orders.length > 0 && (
                    <>
                      <div className={styles.dropdownHeader}>Orders</div>
                      {searchResults.orders.map(o => (
                        <button
                          type="button"
                          key={o.id}
                          className={styles.dropdownItem}
                          onClick={() => {
                            setIsSearchOpen(false)
                            navigate(`/orders?view=${o.id}`)
                          }}
                        >
                          <span className={styles.dropdownItemTitle}>
                            Order #{o.altneuNumber || o.orderNumber || (typeof o.id === 'string' ? o.id.slice(0, 8) : o.id)}
                          </span>
                          <span className={styles.dropdownItemSub}>
                            {(o.shipping?.name || o.contact?.name || o.customerName || 'Customer')} - {formatMoney(o.totals?.grandTotal ?? o.total ?? 0)}
                          </span>
                        </button>
                      ))}
                    </>
                  )}
                  {searchResults.customers.length > 0 && (
                    <>
                      <div className={styles.dropdownHeader}>Customers</div>
                      {searchResults.customers.map(c => (
                        <button
                          type="button"
                          key={c.id}
                          className={styles.dropdownItem}
                          onClick={() => {
                            setIsSearchOpen(false)
                            navigate(`/customers?view=${c.id}`)
                          }}
                        >
                          <span className={styles.dropdownItemTitle}>{c.name}</span>
                          <span className={styles.dropdownItemSub}>{c.email}</span>
                        </button>
                      ))}
                    </>
                  )}
                </>
              ) : (
                <div className={styles.emptyState}>No results found for "{searchQuery}"</div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className={styles.right}>
        <div className={styles.bellWrapper} ref={bellRef}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Notifications"
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
          >
            <FiBell size={20} />
            {recentActivity.length > 0 && <span className={styles.badge} aria-hidden="true" />}
          </button>

          {isNotificationsOpen && (
            <div className={styles.dropdown}>
              <div className={styles.dropdownHeader}>Recent Activity</div>
              {recentActivity.length > 0 ? (
                recentActivity.slice(0, 5).map((activity, i) => {
                  const route = activityRoute(activity)
                  const clickable = Boolean(route)
                  return (
                    <button
                      type="button"
                      key={activity.id || i}
                      className={styles.dropdownItem}
                      disabled={!clickable}
                      onClick={() => {
                        if (!clickable) return
                        setIsNotificationsOpen(false)
                        navigate(route)
                      }}
                    >
                      <span className={styles.dropdownItemTitle}>{activity.title}</span>
                      <span className={styles.dropdownItemSub}>
                        {activity.detail} · {timeAgo(activity.time)}
                      </span>
                    </button>
                  )
                })
              ) : (
                <div className={styles.emptyState}>No recent activity</div>
              )}
            </div>
          )}
        </div>

        <div className={styles.user} title={admin?.email}>
          <div className={styles.avatar}>{initial}</div>
          <div className={styles.userMeta}>
            <span className={styles.userName}>{admin?.name || 'Admin'}</span>
            <span className={styles.userRole}>
              {admin?.role || 'Administrator'}
            </span>
          </div>
        </div>

        <button
          type="button"
          className={styles.iconButton}
          onClick={logout}
          aria-label="Logout"
          title="Logout"
        >
          <FiLogOut size={20} />
        </button>
      </div>
    </header>
  )
}

export default Topbar
