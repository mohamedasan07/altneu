import { Link } from 'react-router-dom';
import styles from './PrivacyPage.module.css';

export default function PrivacyPage() {
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>PRIVACY POLICY</h1>
          <p className={styles.subtitle}>Last Updated: September 20, 2026</p>
          <div className={styles.ownerNote}>
            <strong>Note for Store Owner:</strong> This policy outlines the active data collection practices 
            used in the ALTNEU web application (orders, accounts, Razorpay payments, logistics). Any specific 
            third-party analytics tools, cookie compliance banners, or retention intervals require owner confirmation before production.
          </div>
        </header>

        <div className={styles.content}>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>1. Introduction</h2>
            <p className={styles.sectionText}>
              ALTNEU values your privacy. This Privacy Policy describes how we collect, use, and protect your 
              personal information when you browse our website, create an account, purchase products, or interact with our services.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>2. Information We Collect</h2>
            <p className={styles.sectionText}>
              We collect information necessary to provide you with our products and services:
            </p>
            <ul className={styles.sectionList}>
              <li><strong>Contact & Identity Details:</strong> Your name, email address, and phone number when registering an account, placing an order, or submitting an inquiry.</li>
              <li><strong>Delivery Information:</strong> Your shipping address, billing address, city, state, pin code, and delivery preferences.</li>
              <li><strong>Order History:</strong> Details of items purchased, sizes, transaction dates, and delivery status.</li>
              <li><strong>Payment Information:</strong> Online payments are processed directly and securely through PCI-DSS compliant third-party payment gateways (e.g., Razorpay). ALTNEU does not store or process your complete credit/debit card numbers, CVVs, or online banking credentials.</li>
              <li><strong>Customer Inquiries:</strong> Any information and messages you provide when reaching out via our contact forms or support channels.</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>3. How We Use Your Information</h2>
            <p className={styles.sectionText}>
              Your information is used strictly for legitimate business and fulfillment purposes:
            </p>
            <ul className={styles.sectionList}>
              <li>Processing, verifying, and fulfilling your orders.</li>
              <li>Coordinating with courier and logistics partners for accurate delivery.</li>
              <li>Sending transactional notifications, order confirmations, and tracking updates.</li>
              <li>Responding to customer support requests and resolving disputes.</li>
              <li>Maintaining the security and integrity of customer accounts and preventing fraudulent activity.</li>
              <li>Sending brand updates or newsletter emails only where you have explicitly opted in (such as opting in during checkout).</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>4. Information Sharing & Third Parties</h2>
            <p className={styles.sectionText}>
              We do not sell, rent, or trade your personal data. We only share information with trusted third parties strictly necessary to operate our business:
            </p>
            <ul className={styles.sectionList}>
              <li><strong>Payment Processors:</strong> Gateways (e.g., Razorpay) to securely authorize and process transactions.</li>
              <li><strong>Logistics & Couriers:</strong> Delivery partners to transport and hand over your parcels.</li>
              <li><strong>Statutory Authorities:</strong> When required by applicable law, regulation, or legal process.</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>5. Data Security & Storage</h2>
            <p className={styles.sectionText}>
              We implement industry-standard organizational and technical measures to protect your personal information against unauthorized access, loss, or misuse. 
              While no Internet transmission is completely infallible, we continuously review and strengthen our platform protections.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>6. Your Rights & Account Control</h2>
            <p className={styles.sectionText}>
              You have the right to access and update your saved personal information and delivery addresses at any time through your{' '}
              <Link to="/account" className={styles.contactLink}>Account Dashboard</Link>.
              If you wish to request data correction or account deletion, you may reach out to our team at any time.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>7. Contact Us</h2>
            <p className={styles.sectionText}>
              If you have any questions, concerns, or requests regarding this Privacy Policy, please contact us at:
              <br /><br />
              <strong>Email:</strong> altneu07@gmail.com
              <br />
              <strong>WhatsApp:</strong> +91 6381245772
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
