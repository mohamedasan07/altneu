import { Link } from 'react-router-dom';
import styles from './ShippingPage.module.css';

export default function ShippingPage() {
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>SHIPPING & ORDER POLICY</h1>
          <p className={styles.subtitle}>Last Updated: October 26, 2026</p>
        </header>

        <div className={styles.content}>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>1. Shipping & Delivery</h2>
            <p className={styles.sectionText}>
              ALTNEU operates exclusively as an online store and relies on our delivery partner,
              ST Courier, to fulfill orders across serviceable locations in India. We offer:
            </p>
            <ul className={styles.sectionList}>
              <li><strong>Standard Delivery:</strong> Doorstep delivery across serviceable locations in India via ST Courier, typically within 5–7 business days.</li>
            </ul>
            <p className={styles.sectionText}>
              <br />
              Please note that ALTNEU does not operate a physical retail store, and in-store pickup
              is not available. All delivery timeframes are estimates and are subject to stock availability
              and circumstances outside our reasonable control. Customers are responsible for providing
              a complete and accurate shipping address during checkout; incomplete addresses may lead to courier delays.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>2. Shipping Charges</h2>
            <p className={styles.sectionText}>
              We charge a fixed shipping fee of ₹80 per order across all serviceable locations in India.
              The ₹80 shipping charge is clearly displayed in your bag summary and at checkout before you complete
              your purchase and authorize payment. There are no hidden fees or surprise delivery surcharges.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>3. Payment Methods</h2>
            <p className={styles.sectionText}>
              We accept online payments via secure, PCI-DSS compliant payment gateways (Razorpay). Supported methods include:
            </p>
            <ul className={styles.sectionList}>
              <li>Credit / Debit Cards (Visa, Mastercard, RuPay)</li>
              <li>UPI (Google Pay, PhonePe, Paytm, and other UPI apps)</li>
              <li>Net Banking (Major Indian banks)</li>
            </ul>
            <p className={styles.sectionText}>
              <br />
              <strong>Cash on Delivery (COD) is unavailable.</strong>
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>4. Order Processing & Tracking</h2>
            <p className={styles.sectionText}>
              Once an order is successfully placed, you will receive an order confirmation email.
              This email confirms receipt of your order but does not signify final fulfillment acceptance.
              Your order is prepared and handed over to ST Courier for dispatch. Tracking
              information will be shared after dispatch when available, and can be monitored via your
              order history and public tracking link.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>5. Order Cancellation</h2>
            <p className={styles.sectionText}>
              <strong>Ordinary customer-requested cancellation is not offered once an order has been placed.</strong>
              {' '}Direct self-service cancellation is not supported on the storefront or via customer API endpoints.
              <br /><br />
              Please review your cart, sizing, and delivery address carefully before authorizing payment.
              If ALTNEU must cancel an order on our end due to inventory shortages, logistical impossibility, or suspected fraud,
              any payment received will be refunded to your original payment method via the payment gateway.
              Cancellation of an order does not automatically guarantee or claim instant refund completion; refunds depend on
              payment gateway and bank processing. This policy does not restrict statutory cancellation rights or remedies required by applicable consumer law.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>6. Returns</h2>
            <p className={styles.sectionText}>
              <strong>ALTNEU does not offer ordinary change-of-mind returns or exchanges.</strong>
              <br /><br />
              However, if you receive an incorrect, defective, deficient, spurious, or materially misdescribed product,
              you have the right to contact us for a resolution under applicable consumer protection laws and our internal inspection process.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>7. Refunds</h2>
            <p className={styles.sectionText}>
              <strong>ALTNEU does not offer ordinary refunds for change-of-mind purchases or ordinary order cancellations.</strong>
              <br /><br />
              Where applicable consumer protection law mandates a remedy for defective, damaged, or misdescribed goods, or if ALTNEU
              cancels an unfulfilled order, refunds will be initiated to the original payment method through the payment gateway.
              Gateway refunds typically reflect in the customer's account within 5–7 business days depending on your bank or payment provider.
              Cancellation of an order does not claim or guarantee instant refund completion.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>8. Damaged, Defective, or Incorrect Products</h2>
            <p className={styles.sectionText}>
              If you receive a damaged, incorrect, defective, or materially different product, please contact
              our support team promptly via our{' '}
              <Link to="/contact" className={styles.contactLink}>Contact page</Link> or by email at <strong>altneu07@gmail.com</strong>.
              Please provide:
            </p>
            <ul className={styles.sectionList}>
              <li>Your order number</li>
              <li>A clear description of the issue</li>
              <li>Clear photographs or unboxing video evidence demonstrating the issue</li>
            </ul>
            <p className={styles.sectionText}>
              <br />
              Our team will review the claim and provide the applicable statutory remedy (which may include a refund or
              replacement, subject to verification and stock availability) under applicable consumer protection law.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>9. Delivery Issues</h2>
            <p className={styles.sectionText}>
              If your tracking indicates an unexpected delay or your package cannot be delivered, please contact our support team.
              We will coordinate with our logistics partners to investigate shipment status.
              <br /><br />
              If a package cannot be delivered due to an incorrect or incomplete address provided by the customer,
              reshipment may incur additional delivery charges.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>10. Customer Support</h2>
            <p className={styles.sectionText}>
              For any questions regarding shipping, tracking, or order issues, please reach out to us:
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
              <strong>Delivery Partner:</strong> ST Courier
              <br />
              <strong>Fixed Shipping Fee:</strong> ₹80 per order across serviceable locations in India
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
