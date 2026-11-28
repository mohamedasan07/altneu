import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import styles from './SellerInformationPage.module.css';

export default function SellerInformationPage() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Seller Information — ALTNEU';

    let metaDesc = document.querySelector('meta[name="description"]');
    let createdMeta = false;
    const previousDesc = metaDesc ? metaDesc.getAttribute('content') : '';
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
      createdMeta = true;
    }
    metaDesc.setAttribute(
      'content',
      'Official seller identity, principal business address, customer support, and grievance officer details for ALTNEU.'
    );

    return () => {
      document.title = previousTitle;
      if (createdMeta && metaDesc.parentNode) {
        metaDesc.parentNode.removeChild(metaDesc);
      } else if (metaDesc) {
        metaDesc.setAttribute('content', previousDesc || '');
      }
    };
  }, []);

  return (
    <section className={styles.page} aria-labelledby="seller-info-title">
      <div className={styles.container}>
        <header className={styles.header}>
          <span className={styles.eyebrow}>Legal &amp; Merchant Disclosures</span>
          <h1 id="seller-info-title" className={styles.title}>Seller Information</h1>
          <p className={styles.subtitle}>
            Official merchant identity, operating details, customer support, and grievance redressal contact for ALTNEU.
          </p>
        </header>

        <div className={styles.grid}>
          <section className={styles.card} aria-labelledby="seller-identity-heading">
            <h2 id="seller-identity-heading" className={styles.cardTitle}>
              Seller Identity
            </h2>
            <dl className={styles.list}>
              <div className={styles.row}>
                <dt className={styles.label}>Legal Seller Name</dt>
                <dd className={styles.value}>Harshan . A</dd>
              </div>
              <div className={styles.row}>
                <dt className={styles.label}>Trading Name</dt>
                <dd className={styles.value}>ALTNEU</dd>
              </div>
              <div className={styles.row}>
                <dt className={styles.label}>Business Classification</dt>
                <dd className={styles.value}>Individual / Unregistered Business</dd>
              </div>
            </dl>
          </section>

          <section className={styles.card} aria-labelledby="business-address-heading">
            <h2 id="business-address-heading" className={styles.cardTitle}>
              Business Address
            </h2>
            <dl className={styles.list}>
              <div className={styles.row}>
                <dt className={styles.label}>Principal Business Address</dt>
                <dd className={styles.value}>
                  10/43, Sivan Mela Vithi, Velankanni – 611111, Nagapattinam, Tamil Nadu, India
                </dd>
              </div>
              <div className={styles.row}>
                <dt className={styles.label}>Storefront Format</dt>
                <dd className={styles.note}>
                  ALTNEU is an online-only clothing business and does not operate a walk-in physical retail store.
                </dd>
              </div>
            </dl>
          </section>

          <section className={styles.card} aria-labelledby="customer-support-heading">
            <h2 id="customer-support-heading" className={styles.cardTitle}>
              Customer Support
            </h2>
            <dl className={styles.list}>
              <div className={styles.row}>
                <dt className={styles.label}>Customer-Care Email</dt>
                <dd className={styles.value}>
                  <a href="mailto:altneu07@gmail.com" className={styles.link}>
                    altneu07@gmail.com
                  </a>
                </dd>
              </div>
              <div className={styles.row}>
                <dt className={styles.label}>Phone &amp; WhatsApp</dt>
                <dd className={styles.value}>
                  <a href="tel:+916381245772" className={styles.link}>
                    +91 6381245772
                  </a>
                </dd>
              </div>
              <div className={styles.row}>
                <dt className={styles.label}>Direct Inquiry Form</dt>
                <dd className={styles.value}>
                  <Link to="/contact" className={styles.link}>
                    Visit Contact Page →
                  </Link>
                </dd>
              </div>
            </dl>
          </section>

          <section className={styles.card} aria-labelledby="grievance-officer-heading">
            <h2 id="grievance-officer-heading" className={styles.cardTitle}>
              Grievance Officer
            </h2>
            <dl className={styles.list}>
              <div className={styles.row}>
                <dt className={styles.label}>Name</dt>
                <dd className={styles.value}>Harshan . A</dd>
              </div>
              <div className={styles.row}>
                <dt className={styles.label}>Designation</dt>
                <dd className={styles.value}>Grievance Officer</dd>
              </div>
              <div className={styles.row}>
                <dt className={styles.label}>Grievance Email</dt>
                <dd className={styles.value}>
                  <a href="mailto:altneu07@gmail.com" className={styles.link}>
                    altneu07@gmail.com
                  </a>
                </dd>
              </div>
              <div className={styles.row}>
                <dt className={styles.label}>Contact Phone</dt>
                <dd className={styles.value}>
                  <a href="tel:+916381245772" className={styles.link}>
                    +91 6381245772
                  </a>
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <nav className={styles.policyNav} aria-label="Store Policies">
          <Link to="/terms" className={styles.policyLink}>Terms &amp; Conditions</Link>
          <Link to="/shipping" className={styles.policyLink}>Shipping &amp; Order Policy</Link>
          <Link to="/refund" className={styles.policyLink}>Refund &amp; Return Policy</Link>
          <Link to="/privacy" className={styles.policyLink}>Privacy Policy</Link>
        </nav>
      </div>
    </section>
  );
}
