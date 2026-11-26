import { Link } from 'react-router-dom';
import styles from './RefundPage.module.css';

export default function RefundPage() {
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>REFUND & RETURN POLICY</h1>
          <p className={styles.subtitle}>Last Updated: October 26, 2026</p>
        </header>

        <div className={styles.content}>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>1. Overview</h2>
            <p className={styles.sectionText}>
              At ALTNEU, our streetwear drops are curated and fulfilled under strict quality standards.
              Please review our policy regarding returns, refunds, order cancellations, and payment processing before placing your order.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>2. Change-of-Mind Returns & Cancellations</h2>
            <p className={styles.sectionText}>
              <strong>ALTNEU does not offer ordinary change-of-mind returns, exchanges, or customer-initiated order cancellations once an order has been placed.</strong>
              {' '}Direct customer self-service cancellation is disabled on the website and via customer API endpoints.
              <br /><br />
              All orders are confirmed as final sales upon payment authorization.
              <strong className={styles.highlight}> Cash on Delivery (COD) is unavailable.</strong>
              {' '}We encourage customers to carefully review measurements, size charts, and cart contents prior to checkout.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>3. Statutory Rights for Defective, Damaged, or Incorrect Items</h2>
            <p className={styles.sectionText}>
              Nothing in this policy limits or excludes statutory rights and consumer remedies guaranteed under applicable Indian consumer protection laws.
              If you receive an item that is defective, damaged in transit, deficient, spurious, or materially different from what was ordered,
              you are entitled to report the issue for resolution.
              <br /><br />
              To initiate a review, please reach out to our team promptly with:
            </p>
            <ul className={styles.sectionList}>
              <li>Your order number</li>
              <li>A clear description of the defect or discrepancy</li>
              <li>Clear photographs or unboxing video evidence demonstrating the issue</li>
            </ul>
            <p className={styles.sectionText}>
              <br />
              Our support team will inspect the submitted evidence and provide the applicable statutory remedy
              (which may include a refund or replacement, subject to verification and stock availability).
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>4. Refund Processing & Payment Integrity</h2>
            <p className={styles.sectionText}>
              Where an eligible statutory claim is verified and approved, or in cases where ALTNEU must cancel an order due
              to unexpected inventory shortages or fulfillment impossibility:
            </p>
            <ul className={styles.sectionList}>
              <li>Refunds are initiated to the original method of payment through our secure payment gateway (Razorpay).</li>
              <li>Order cancellation does not claim or guarantee instant refund completion; refunds depend on payment gateway processing and bank confirmation.</li>
              <li>Once successfully confirmed by the gateway, funds typically reflect in your bank account or card balance within 5–7 business days, depending on your financial institution.</li>
              <li>Where appropriate and mutually agreed upon, a replacement item may be issued in lieu of a refund, subject to stock availability.</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>5. Customer Support &amp; Inquiries</h2>
            <p className={styles.sectionText}>
              For any questions regarding your order, policy inquiries, or statutory complaints, please contact us:
              <br /><br />
              <strong>Legal Seller Name:</strong> Harshan . A
              <br />
              <strong>Trading As:</strong> ALTNEU
              <br />
              <strong>Business Type:</strong> Individual / Unregistered Business
              <br />
              <strong>Principal Operating Address:</strong> 10/43, Sivan Mela Vithi, Velankanni – 611111, Nagapattinam, Tamil Nadu, India
              <br />
              <strong>Founder &amp; Grievance Officer:</strong> Harshan . A
              <br />
              <strong>Established:</strong> June 2026
              <br />
              <strong>Contact Form:</strong>{' '}
              <Link to="/contact" className={styles.contactLink}>altneu.in/contact</Link>
              <br />
              <strong>Support Email:</strong> altneu07@gmail.com
              <br />
              <strong>Customer Support Phone:</strong> +91 6381245772
              <br />
              <strong>WhatsApp Support:</strong> +91 6381245772
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
