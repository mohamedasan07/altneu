import { Link } from 'react-router-dom';
import styles from './PrivacyPage.module.css';

export default function PrivacyPage() {
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>PRIVACY POLICY</h1>
          <p className={styles.subtitle}>Last Updated: October 26, 2026</p>
        </header>

        <div className={styles.content}>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>1. Introduction</h2>
            <p className={styles.sectionText}>
              ALTNEU, operated by Harshan . A trading as ALTNEU (an Individual / Unregistered Business),
              values your privacy and is committed to protecting your personal data. This Privacy Policy describes
              how we collect, use, store, and share information when you visit our storefront, register an account,
              place orders, or communicate with our team.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>2. Information We Collect</h2>
            <p className={styles.sectionText}>
              We collect only the information necessary to provide you with our streetwear apparel and storefront services:
            </p>
            <ul className={styles.sectionList}>
              <li><strong>Contact & Identity Information:</strong> Your name, email address, and phone number when creating an account, checking out as a guest, or contacting customer support.</li>
              <li><strong>Delivery & Billing Details:</strong> Shipping address, delivery recipient name, city, state, postal PIN code, and contact phone number.</li>
              <li><strong>Order & Transaction Records:</strong> Purchased items, sizes, quantities, order totals, timestamp, and order status history.</li>
              <li><strong>Payment Data:</strong> Online payments are processed directly by our PCI-DSS compliant payment gateway partner (Razorpay). ALTNEU does not store or process complete credit/debit card numbers, CVVs, UPI MPINs, or net banking passwords on our servers.</li>
              <li><strong>Customer Inquiries & Support Messages:</strong> Messages and evidence submitted via our Contact form, direct email, or WhatsApp support.</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>3. How We Use Your Information</h2>
            <p className={styles.sectionText}>
              We use your personal information solely for legitimate operational and fulfillment purposes:
            </p>
            <ul className={styles.sectionList}>
              <li>Fulfilling, processing, and delivering your orders.</li>
              <li>Authenticating customer login and account management.</li>
              <li>Sending transactional notifications, such as order confirmations, payment receipts, and delivery updates.</li>
              <li>Responding to customer support inquiries and resolving statutory claims.</li>
              <li>Preventing fraudulent transactions and ensuring web platform security.</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>4. Integrated Third-Party Services & Information Sharing</h2>
            <p className={styles.sectionText}>
              ALTNEU does not sell, rent, or trade your personal information. To operate our e-commerce platform and deliver orders,
              we integrate with trusted third-party service providers who process data strictly on our behalf:
            </p>
            <ul className={styles.sectionList}>
              <li><strong>Database & Authentication Infrastructure (Supabase):</strong> We use Supabase to securely store customer account profiles, active carts, order records, and manage token-based authentication.</li>
              <li><strong>Payment Processing (Razorpay):</strong> Online payments are authorized and settled securely through Razorpay. Transaction identifiers, amounts, and gateway payment statuses are shared to verify payment integrity and process refunds where applicable.</li>
              <li><strong>Transactional Email (Brevo):</strong> We use Brevo (formerly Sendinblue) to deliver transactional emails, including magic link login verification, order placement confirmations, and account notifications.</li>
              <li><strong>Media & Asset Delivery (Cloudinary):</strong> Storefront product imagery and media assets are hosted and delivered via Cloudinary's secure media delivery network.</li>
              <li><strong>Postal PIN-Code Verification:</strong> We utilize postal PIN code lookup services (api.postalpincode.in) during checkout to validate postal codes and auto-populate delivery districts and states across supported delivery areas.</li>
              <li><strong>Logistics & Courier Partners:</strong> Your delivery address, recipient name, and contact number are provided to our integrated logistics partners solely for package transport and doorstep delivery.</li>
              <li><strong>Customer Communication (WhatsApp):</strong> Direct customer support messaging is offered via WhatsApp for order assistance and customer inquiries.</li>
              <li><strong>Application Hosting & Infrastructure:</strong> Storefront and backend API services are hosted on secure cloud infrastructure providers (including Vercel and Render).</li>
              <li><strong>Legal Compliance:</strong> We may disclose information where required by applicable law, regulation, legal process, or governmental request.</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>5. Data Security & Retention</h2>
            <p className={styles.sectionText}>
              We implement industry-standard technical and organizational security controls to protect your data from unauthorized access,
              alteration, disclosure, or destruction. Access to production databases and customer information is strictly restricted to
              authorized service operations.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>6. Customer Rights & Account Access</h2>
            <p className={styles.sectionText}>
              You may view, update, or edit your saved addresses and order history by accessing your{' '}
              <Link to="/account" className={styles.contactLink}>Account Dashboard</Link>.
              If you wish to request data correction, inquire about your stored information, or request account closure,
              please reach out to us at <strong>altneu07@gmail.com</strong>.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>7. Grievance Officer &amp; Contact Information</h2>
            <p className={styles.sectionText}>
              In accordance with the Information Technology Act, 2000 and rules made thereunder,
              the details of our Grievance Officer and customer support channels are provided below:
              <br /><br />
              <strong>Legal Seller Name:</strong> Harshan . A
              <br />
              <strong>Trading As:</strong> ALTNEU
              <br />
              <strong>Business Type:</strong> Individual / Unregistered Business
              <br />
              <strong>Principal Operating Address:</strong> 10/43, Sivan Mela Vithi, Velankanni – 611111, Nagapattinam, Tamil Nadu, India
              <br />
              <strong>Founder:</strong> Harshan . A
              <br />
              <strong>Grievance Officer:</strong> Harshan . A
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
