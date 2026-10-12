import { Link } from 'react-router-dom';
import styles from './RefundPage.module.css';

export default function RefundPage() {
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>REFUND & RETURN POLICY</h1>
          <p className={styles.subtitle}>Last Updated: September 20, 2026</p>
          <div className={styles.ownerNote}>
            <strong>Note for Store Owner:</strong> This policy reflects ALTNEU's existing verified terms. 
            Specific operational claim windows (e.g. 48-hour unboxing notification) and inspection procedures 
            require final confirmation before production launch.
          </div>
        </header>

        <div className={styles.content}>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>1. Overview</h2>
            <p className={styles.sectionText}>
              At ALTNEU, each drop is produced and fulfilled with strict quality standards. 
              Please review our policy regarding returns, refunds, and order cancellations before completing your purchase.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>2. Change-of-Mind Returns & Cancellations</h2>
            <p className={styles.sectionText}>
              <strong>ALTNEU does not currently offer ordinary change-of-mind returns or customer-initiated order cancellations once an order is placed.</strong>
              <br /><br />
              All sales are final once confirmed. We encourage customers to carefully review sizing charts, product measurements, 
              and cart contents prior to checkout.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>3. Defective, Damaged, or Incorrect Items</h2>
            <p className={styles.sectionText}>
              Nothing in this policy limits or excludes statutory rights and remedies guaranteed under applicable consumer protection laws.
              If you receive an item that is defective, damaged in transit, deficient, spurious, or materially different from what was ordered, 
              you are entitled to report the issue for resolution.
              <br /><br />
              To initiate an inspection, please reach out to our team immediately with:
            </p>
            <ul className={styles.sectionList}>
              <li>Your order number</li>
              <li>A clear description of the defect or discrepancy</li>
              <li>Clear photographs or unboxing video evidence demonstrating the issue</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>4. Refund Processing</h2>
            <p className={styles.sectionText}>
              Where an eligible defect or fulfillment error is verified by our team, or in cases where ALTNEU must cancel an order due 
              to unexpected inventory shortages or logistical impossibility:
            </p>
            <ul className={styles.sectionList}>
              <li>Refunds will be processed back to the original method of payment (via our secure payment gateway).</li>
              <li>Once initiated, refunds typically reflect in your account within 5–7 business days, depending on your bank or payment provider.</li>
              <li>Where appropriate and agreed upon, a replacement item may be issued in lieu of a refund, subject to stock availability.</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>5. Contact Support</h2>
            <p className={styles.sectionText}>
              For any questions regarding your order or this policy, please reach out via our{' '}
              <Link to="/contact" className={styles.contactLink}>Contact page</Link> or email us directly:
              <br /><br />
              <strong>Email:</strong> altneu07@gmail.com
              <br />
              <strong>WhatsApp Support:</strong> +91 6381245772
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
