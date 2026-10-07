import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { trackOrderPublic } from '../../services/tracking.service';
import { fetchOrder } from '../../services/orders';
import { useAuth } from '../../hooks/useAuth';
import OrderTimeline from '../../components/orders/OrderTimeline/OrderTimeline';
import styles from './TrackOrderPage.module.css';

const dateOf = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

export default function TrackOrderPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const idFromQuery = searchParams.get('id') || '';

  const [orderNumber, setOrderNumber] = useState(idFromQuery);
  const [contact, setContact] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState(null);

  useEffect(() => {
    if (user && idFromQuery) {
      setLoading(true);
      fetchOrder(idFromQuery)
        .then((data) => setOrder(data))
        .catch((err) => setError(err.message || 'Failed to load order'))
        .finally(() => setLoading(false));
    }
  }, [user, idFromQuery]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!orderNumber || !contact) return;

    setLoading(true);
    setError('');
    setOrder(null);

    try {
      const data = await trackOrderPublic(orderNumber, contact);
      setOrder(data);
    } catch (err) {
      setError(err.message || 'Failed to track order');
    } finally {
      setLoading(false);
    }
  };

  if (user && idFromQuery && !order && loading) {
    return (
      <div className={styles.page}>
        <p>Loading order details...</p>
      </div>
    );
  }

  if (user && idFromQuery && !order && error) {
    return (
      <div className={styles.page}>
        <div className={styles.error} role="alert">{error}</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Track Your Order</h1>
        <p className={styles.subtitle}>Enter your order details to check the latest status.</p>
      </header>

      {(!user || !idFromQuery) && !order && (
        <div className={styles.card}>
          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.field}>
              <label htmlFor="orderNumber" className={styles.label}>Order Number *</label>
              <input
                id="orderNumber"
                type="text"
                required
                className={styles.input}
                placeholder="e.g. ALT26XXX"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="contact" className={styles.label}>Email or Phone Number *</label>
              <input
                id="contact"
                type="text"
                required
                className={styles.input}
                placeholder="Matching your shipping details"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
              />
            </div>

            {error && <div className={styles.error} role="alert">{error}</div>}

            <button type="submit" className={styles.submit} disabled={loading || !orderNumber || !contact}>
              {loading ? 'SEARCHING...' : 'TRACK ORDER'}
            </button>
          </form>
        </div>
      )}

      {order && (
        <section className={styles.result} aria-live="polite">
          <header className={styles.resultHead}>
            <h2 className={styles.resultTitle}>Order #{order.altneuNumber || order.orderNumber}</h2>
            <p className={styles.resultDate}>Placed {dateOf(order.placedAt)}</p>
          </header>

          <OrderTimeline history={order.history} status={order.status} />

          {order.tracking && order.tracking.carrier ? (
            <div className={styles.carrierInfo}>
              <p className={styles.carrierLine}>
                <span>Carrier</span>
                <span>{order.tracking.carrier} {order.tracking.carrierService ? `- ${order.tracking.carrierService}` : ''}</span>
              </p>
              {order.tracking.trackingNumber && (
                <p className={styles.carrierLine}>
                  <span>Tracking Number</span>
                  <span>{order.tracking.trackingNumber}</span>
                </p>
              )}
              {order.tracking.trackingUrl && (
                <p className={styles.carrierLine}>
                  <span>Link</span>
                  <a href={order.tracking.trackingUrl} target="_blank" rel="noreferrer" className={styles.trackingLink}>
                    Track on carrier site
                  </a>
                </p>
              )}
            </div>
          ) : (
            <div className={styles.carrierInfo}>
              <p className={styles.carrierLine} style={{ justifyContent: 'center' }}>
                Tracking information will appear after shipment.
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
