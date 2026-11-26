import { Link } from 'react-router-dom';
import styles from './TermsPage.module.css';

export default function TermsPage() {
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>TERMS & CONDITIONS</h1>
          <p className={styles.subtitle}>Last Updated: October 26, 2026</p>
        </header>

        <div className={styles.content}>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>1. Introduction</h2>
            <p className={styles.sectionText}>
              Welcome to ALTNEU. These Terms &amp; Conditions govern your access to and use of the ALTNEU website,
              operated by Harshan . A trading as ALTNEU (an Individual / Unregistered Business),
              including browsing the storefront, registering an account, placing orders, and purchasing products through our platform.
              By accessing or using our services, you agree to comply with and be bound by these terms.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>2. Website Use & Acceptance</h2>
            <p className={styles.sectionText}>
              By using this website and completing any purchase, you confirm your acceptance of these Terms & Conditions,
              subject to applicable law. If you do not agree with any part of these terms, please do not use our platform or place orders.
              <br /><br />
              You agree to provide accurate, current, and complete information during checkout and account registration.
              You agree to use this website solely for lawful purposes and must not misuse our systems, attempt unauthorized access,
              or interfere with platform security or operation.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>3. Products & Availability</h2>
            <p className={styles.sectionText}>
              We strive to display our streetwear pieces, colorways, sizing specifications, and materials as accurately as possible.
              However, due to display calibration variations on different screens, slight visual variations may occur.
              All items are offered subject to stock availability and production allocation.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>4. Pricing &amp; Shipping Charges</h2>
            <p className={styles.sectionText}>
              All product prices on the website are listed in Indian Rupees (INR).
              ALTNEU is an Individual / Unregistered Business and does not charge or collect Goods and Services Tax (GST) separately.
              A fixed shipping charge of ₹80 per order is calculated and clearly itemized at checkout before you authorize payment.
              We reserve the right to correct genuine typographical or pricing errors prior to order dispatch.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>5. Orders & Payment</h2>
            <p className={styles.sectionText}>
              Placing an order constitutes an offer to purchase under these terms. An order confirmation notification confirms
              receipt of your order details but does not represent final fulfillment acceptance. We reserve the right to decline or cancel
              an order due to inventory unavailability, unverified payment, incomplete shipping details, or suspected fraudulent activity.
              <br /><br />
              We accept online payments via secure, PCI-DSS compliant third-party payment gateways (Razorpay), supporting credit cards,
              debit cards, UPI, and net banking. <strong className={styles.highlight}>Cash on Delivery (COD) is not available.</strong>
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>6. Order Cancellation</h2>
            <p className={styles.sectionText}>
              <strong>Ordinary customer-initiated order cancellation is not offered once an order has been placed.</strong>
              {' '}Direct self-service cancellation is not supported on the storefront or via customer API endpoints.
              Please review your cart, sizing, and shipping information carefully before finalizing checkout.
              <br /><br />
              If ALTNEU must cancel an order due to stock unavailability, unforeseen fulfillment impossibility, or fraud prevention,
              any payment received will be refunded to the original payment method through the payment gateway.
              Cancellation of an order does not claim or guarantee instant refund completion; refunds are processed through the payment
              gateway to the original payment source and depend on gateway and bank confirmation.
              This policy does not restrict or limit any remedies required under applicable consumer protection law.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>7. Returns & Refunds</h2>
            <p className={styles.sectionText}>
              <strong>ALTNEU does not offer ordinary change-of-mind returns, exchanges, or change-of-mind refunds.</strong>
              <br /><br />
              Nothing in this policy excludes or limits statutory rights and remedies available to consumers under applicable law.
              If a product delivered to you is defective, damaged in transit, deficient, incorrect, spurious, or materially misdescribed,
              you are entitled to report the issue and request an appropriate remedy (which may include a refund or replacement, subject
              to verification and stock availability) in accordance with applicable consumer protection laws.
              <br /><br />
              To submit an inquiry or claim for a defective, damaged, or incorrect order, please contact our support team via our{' '}
              <Link to="/contact" className={styles.contactLink}>Contact page</Link> or by email at <strong>altneu07@gmail.com</strong>.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>8. Shipping & Delivery</h2>
            <p className={styles.sectionText}>
              Estimated delivery timeframes provided during checkout and order tracking are estimates based on standard courier handling.
              We partner with ST Courier to transport and deliver orders across serviceable locations in India.
              A fixed shipping charge of ₹80 per order applies and is clearly itemized at checkout before payment authorization.
              Tracking details are shared following dispatch once available.
              Customers are responsible for providing complete and accurate destination details; incomplete addresses may lead to courier delays.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>9. Intellectual Property</h2>
            <p className={styles.sectionText}>
              All trademarks, logos, brand names, visual artwork, designs, product photography, and text content displayed on this website
              are the proprietary intellectual property of ALTNEU or its licensors. Unauthorized reproduction, commercial distribution,
              or modification is strictly prohibited.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>10. Privacy & Data Handling</h2>
            <p className={styles.sectionText}>
              We handle customer personal data in accordance with our{' '}
              <Link to="/privacy" className={styles.contactLink}>Privacy Policy</Link>,
              which explains how your information is gathered, processed, and safeguarded.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>11. General Conditions</h2>
            <p className={styles.sectionText}>
              <strong>Third-Party Integrations:</strong> We utilize integrated third-party services—including payment gateways (Razorpay),
              authentication and database infrastructure (Supabase), transactional email providers (Brevo), media delivery (Cloudinary),
              and logistics carriers—to operate our storefront and fulfill purchases.
              <br /><br />
              <strong>Limitation of Liability:</strong> To the extent permitted by applicable law, ALTNEU shall not be liable for indirect,
              incidental, or consequential damages resulting from website use. Nothing in these terms excludes liabilities that cannot be
              lawfully excluded under applicable Indian consumer protection laws.
              <br /><br />
              <strong>Modifications:</strong> We reserve the right to amend these Terms & Conditions to reflect operational, legal, or
              regulatory updates. The revised terms will be published on this page with an updated revision date.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>12. Contact & Customer Support</h2>
            <p className={styles.sectionText}>
              For any questions regarding these Terms &amp; Conditions, order inquiries, or statutory complaints, please reach out to us:
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
