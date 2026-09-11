import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import { useWishlist } from '../../hooks/useWishlist';
import { useAddresses } from '../../hooks/useAddresses';
import { useOrders } from '../../hooks/useOrders';
import DashboardCard from '../../components/dashboard/DashboardCard/DashboardCard';
import OrderCard from '../../components/dashboard/OrderCard/OrderCard';
import OrderModal from '../../components/dashboard/OrderModal/OrderModal';
import OrderCancelModal from '../../components/dashboard/OrderCancelModal/OrderCancelModal';
import OrderInvoice from '../../components/dashboard/OrderInvoice/OrderInvoice';
import StatsCards from '../../components/account/StatsCards/StatsCards';
import QuickActions from '../../components/account/QuickActions/QuickActions';
import ItemThumb from '../../components/account/ItemThumb/ItemThumb';
import { formatINR } from '../../utils/format';
import styles from './DashboardPage.module.css';

const EASE_OUT = [0.22, 1, 0.36, 1];

const initialsOf = (user) => {
  const first = (user?.firstName || '').trim().charAt(0);
  const last = (user?.lastName || '').trim().charAt(0);
  return (first || last || 'U').toUpperCase() + (last || '');
};

const memberSince = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

/**
 * Account dashboard — welcome, stats, quick actions, recent orders and a
 * wishlist preview. Orders come from the customer order API; profile stats
 * come from the address/auth APIs. Recent orders support cancellation and
 * invoice viewing the same way as the full Orders page.
 */
export default function DashboardPage() {
  const { user } = useAuth();
  const { items: wishlist, count: wishlistCount } = useWishlist();
  const { addresses } = useAddresses();
  const { orders, reload, getOrder } = useOrders();

  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [invoiceOrder, setInvoiceOrder] = useState(null);
  const [notice, setNotice] = useState('');

  const handleView = async (order) => {
    setSelected(order);
    setDetail(order);
    try {
      const fresh = await getOrder(order.id);
      setDetail(fresh);
    } catch {
      /* keep the list copy — the modal still renders */
    }
  };

  const handleCancelRequest = (order) => setCancelTarget(order);

  const handleInvoice = (order) => {
    setSelected(null);
    setDetail(null);
    setCancelTarget(null);
    setInvoiceOrder(order);
  };

  const handleCanceled = async () => {
    setNotice('Order cancelled — the items have been released back to stock.');
    await reload();
    setCancelTarget(null);
    setSelected(null);
    setDetail(null);
  };

  const handleNotCancellable = async () => {
    setNotice('This order is no longer cancellable.');
    await reload();
    setCancelTarget(null);
    setSelected(null);
    setDetail(null);
  };

  const recentOrders = orders.slice(0, 3);
  const firstWishlist = wishlist.slice(0, 4);
  const since = memberSince(user?.createdAt);

  return (
    <div className={styles.page}>
      {notice && (
        <div className={styles.notice} role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} aria-label="Dismiss notice">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M5 5l14 14" />
              <path d="M19 5L5 19" />
            </svg>
          </button>
        </div>
      )}

      <motion.section
        className={styles.welcome}
        aria-label="Welcome"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
      >
        <div className={styles.avatar} aria-hidden="true">
          {initialsOf(user)}
        </div>
        <div>
          <p className="page-kicker">ALTNEU</p>
          <h1 className={styles.title}>Welcome back, {firstNameOr(user)}.</h1>
          {since && <p className={styles.since}>Member since {since}</p>}
        </div>
      </motion.section>

      <StatsCards ordersCount={orders.length} wishlistCount={wishlistCount} addressesCount={addresses.length} />

      <DashboardCard kicker="Shortcuts" title="Quick actions">
        <QuickActions />
      </DashboardCard>

      <section className={styles.grid} aria-label="Orders and wishlist">
        <DashboardCard
          kicker="Recent orders"
          title="Latest drops"
          action={
            <Link to="/account/orders" className={styles.cardLink}>
              View all
            </Link>
          }
        >
          {recentOrders.length === 0 ? (
            <p className={styles.empty}>No orders yet — your first drop is one click away.</p>
          ) : (
            <div className={styles.list}>
              {recentOrders.map((order) => (
                <OrderCard
                  key={order.orderNumber}
                  order={order}
                  onView={handleView}
                  onCancelOrder={handleCancelRequest}
                  onInvoice={handleInvoice}
                />
              ))}
            </div>
          )}
        </DashboardCard>

        <DashboardCard
          kicker="Wishlist"
          title={`${wishlistCount} saved piece${wishlistCount === 1 ? '' : 's'}`}
          action={
            <Link to="/account/wishlist" className={styles.cardLink}>
              Go to wishlist
            </Link>
          }
        >
          {firstWishlist.length === 0 ? (
            <p className={styles.empty}>Nothing saved yet — keep what you love.</p>
          ) : (
            <ul className={styles.wishList}>
              {firstWishlist.map((item) => (
                <li key={item.id}>
                  <Link to={`/product/${item.id}`} className={styles.wishItem}>
                    <ItemThumb item={item} />
                    <span className={styles.wishInfo}>
                      <span className={styles.wishName}>{item.name}</span>
                      <span className={styles.wishPrice}>
                        {Number(item.price) > 0 ? formatINR(item.price) : ''}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DashboardCard>
      </section>

      <OrderModal
        order={detail ?? selected}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        onCancelOrder={handleCancelRequest}
        onInvoice={handleInvoice}
      />

      <OrderCancelModal
        order={cancelTarget}
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        onCanceled={handleCanceled}
        onNotCancellable={handleNotCancellable}
      />

      <OrderInvoice
        order={invoiceOrder}
        open={Boolean(invoiceOrder)}
        onClose={() => setInvoiceOrder(null)}
      />
    </div>
  );
}

function firstNameOr(user) {
  const name = (user?.firstName || '').trim();
  return name || (user?.email ? user.email.split('@')[0] : 'Member');
}