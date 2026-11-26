import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../../hooks/useFocusTrap';
import { formatINR } from '../../../utils/format';
import {
  canShowInvoice,
  formatInvoiceDate,
  orderStatusLabel,
  paymentMethodLabel,
  paymentStatusLabel,
} from '../../../utils/invoice';
import styles from './OrderInvoice.module.css';

/**
 * Customer invoice overlay (Sprint 22.5 Phase 4).
 *
 * Renders a print-friendly invoice from the authenticated customer's OWN order
 * object (the same data already returned by GET /api/customer/orders/:id —
 * ownership is enforced by the backend before this ever renders). No extra API
 * call, no invoice-number/tax/paid claims: every value shown is a stored order
 * snapshot and the document reference is the order number itself.
 *
 * "Print / Save as PDF" calls window.print() from an explicit user action;
 * the @media print rules in OrderInvoice.module.css hide the storefront and
 * the overlay chrome so only the sheet prints (browser "Save as PDF").
 */
export default function OrderInvoice({ order, open, onClose }) {
  const panelRef = useFocusTrap(open);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open || !order || !canShowInvoice(order)) return null;

  const items = order.items || [];
  const shipping = order.shipping || {};
  const billing = order.billing || {};
  const contact = order.contact || {};
  const delivery = order.delivery || {};
  const totals = order.totals || {};

  const shipLines = [
    shipping.name,
    shipping.line1,
    shipping.line2,
    [shipping.city, shipping.state].filter(Boolean).join(', '),
    [shipping.pincode, shipping.country].filter(Boolean).join(' · '),
    shipping.phone ? `Phone: ${shipping.phone}` : '',
  ].filter(Boolean);

  const hasDistinctBilling = Boolean(
    billing.line1 || billing.city || (billing.name && billing.name !== shipping.name)
  );

  const billingLines = hasDistinctBilling
    ? [
        billing.name || contact.name || shipping.name,
        billing.line1,
        billing.line2,
        [billing.city, billing.state].filter(Boolean).join(', '),
        [billing.pincode, billing.country].filter(Boolean).join(' · '),
        billing.phone || contact.phone || shipping.phone ? `Phone: ${billing.phone || contact.phone || shipping.phone}` : '',
        billing.email || contact.email || shipping.email ? `Email: ${billing.email || contact.email || shipping.email}` : '',
      ].filter(Boolean)
    : [
        contact.name || shipping.name,
        contact.email || shipping.email ? `Email: ${contact.email || shipping.email}` : '',
        contact.phone || shipping.phone ? `Phone: ${contact.phone || shipping.phone}` : '',
        'Billing Address: Same as shipping address',
      ].filter(Boolean);

  const deliveryNote = delivery.note ? ` · ${delivery.note}` : '';

  return createPortal(
    <div className={styles.backdrop} onClick={onClose}>
      <div
        ref={panelRef}
        className={styles.shell}
        role="dialog"
        aria-modal="true"
        aria-labelledby="invoice-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.toolbar}>
          <button type="button" className={styles.closeBtn} ref={closeRef} onClick={onClose}>
            Close
          </button>
          <button type="button" className={styles.printBtn} onClick={() => window.print()}>
            Print / Save as PDF
          </button>
        </div>

        <div className={styles.scroll}>
          <article className={styles.sheet} data-invoice-sheet="true">
            <header className={styles.head}>
              <div className={styles.brandBlock}>
                <p className={styles.brand}>ALTNEU</p>
                <p className={styles.tagline}>For the Unfiltered.</p>
                <div className={styles.sellerDetails}>
                  <p className={styles.sellerName}><strong>Seller:</strong> Harshan . A (Trading as ALTNEU)</p>
                  <p className={styles.sellerMeta}>Business Type: Individual / Unregistered Business</p>
                  <p className={styles.sellerAddress}>
                    10/43, Sivan Mela Vithi, Velankanni – 611111,<br />
                    Nagapattinam, Tamil Nadu, India
                  </p>
                  <p className={styles.sellerContact}>
                    Email: altneu07@gmail.com · Phone: +91 6381245772
                  </p>
                </div>
              </div>
              <div className={styles.docMeta}>
                <h1 id="invoice-title" className={styles.docTitle}>
                  Order Receipt / Invoice
                </h1>
                <p className={styles.ref}>
                  Order Reference: <strong>{order.altneuNumber || order.orderNumber}</strong>
                </p>
                <p className={styles.date}>{formatInvoiceDate(order.placedAt)}</p>
                <p className={styles.docType}>Official Order Summary &amp; Receipt</p>
              </div>
            </header>

            <div className={styles.columns}>
              <section className={styles.block} aria-label="Billed To">
                <h2 className={styles.blockTitle}>Billed To</h2>
                <div className={styles.lines}>
                  {billingLines.length > 0 ? billingLines.map((l, i) => <p key={i}>{l}</p>) : <p>—</p>}
                </div>
              </section>
              <section className={styles.block} aria-label="Ship To">
                <h2 className={styles.blockTitle}>Ship To</h2>
                <div className={styles.lines}>
                  {shipLines.length > 0 ? shipLines.map((l, i) => <p key={i}>{l}</p>) : <p>—</p>}
                </div>
              </section>
            </div>

            <table className={styles.items}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th className={styles.qty}>Qty</th>
                  <th className={styles.right}>Unit Price</th>
                  <th className={styles.right}>Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const meta = [
                    it.size ? `Size ${it.size}` : '',
                    it.colorName || it.color || '',
                  ].filter(Boolean).join(' · ');
                  return (
                    <tr key={it.id ?? `${it.name}-${it.quantity}`}>
                      <td>
                        <span className={styles.itemName}>{it.name || 'Item'}</span>
                        {meta && <span className={styles.itemMeta}>{meta}</span>}
                      </td>
                      <td className={styles.qty}>{it.quantity}</td>
                      <td className={styles.right}>{formatINR(it.price)}</td>
                      <td className={styles.right}>
                        {formatINR((Number(it.price) || 0) * (Number(it.quantity) || 1))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className={styles.foot}>
              <section className={styles.metaBlock} aria-label="Order and payment">
                <h2 className={styles.blockTitle}>Order &amp; Payment</h2>
                <dl className={styles.dl}>
                  <div className={styles.dlRow}>
                    <dt>Status</dt>
                    <dd>{orderStatusLabel(order.status) || '—'}</dd>
                  </div>
                  <div className={styles.dlRow}>
                    <dt>Payment</dt>
                    <dd>{paymentStatusLabel(order.paymentStatus) || '—'}</dd>
                  </div>
                  <div className={styles.dlRow}>
                    <dt>Method</dt>
                    <dd>{paymentMethodLabel(order.paymentMethod) || '—'}</dd>
                  </div>
                  <div className={styles.dlRow}>
                    <dt>Delivery</dt>
                    <dd>{delivery.label || '—'}{deliveryNote}</dd>
                  </div>
                  <div className={styles.dlRow}>
                    <dt>Currency</dt>
                    <dd>{order.currency || 'INR'}</dd>
                  </div>
                  {order.couponCode && (
                    <div className={styles.dlRow}>
                      <dt>Coupon</dt>
                      <dd>{order.couponCode}</dd>
                    </div>
                  )}
                </dl>
              </section>

              <section className={styles.totals} aria-label="Totals">
                <h2 className={styles.blockTitle}>Summary</h2>
                <div className={styles.totalRows}>
                  <div className={styles.totalRow}>
                    <dt>Subtotal</dt>
                    <dd>{formatINR(totals.subtotal)}</dd>
                  </div>
                  {Number(totals.discount) > 0 && (
                    <div className={styles.totalRow}>
                      <dt>Discount</dt>
                      <dd className={styles.neg}>−{formatINR(totals.discount)}</dd>
                    </div>
                  )}
                  {Number(totals.shipping) > 0 && (
                    <div className={styles.totalRow}>
                      <dt>Shipping</dt>
                      <dd>{formatINR(totals.shipping)}</dd>
                    </div>
                  )}
                  {Number(totals.tax) > 0 && (
                    <div className={styles.totalRow}>
                      <dt>Tax</dt>
                      <dd>{formatINR(totals.tax)}</dd>
                    </div>
                  )}
                  <div className={styles.grandRow}>
                    <dt>Total</dt>
                    <dd>{formatINR(totals.grandTotal)}</dd>
                  </div>
                </div>
              </section>
            </div>

            <p className={styles.footerNote}>
              Order summary and receipt generated for your records. Issued by Harshan . A (Trading as ALTNEU), an Individual / Unregistered Business under Indian GST Law. This document is an order confirmation receipt and is not a GST Tax Invoice.
            </p>
          </article>
        </div>
      </div>
    </div>,
    document.body
  );
}