import styles from './TermsPage.module.css';

export default function TermsPage() {
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>TERMS & CONDITIONS</h1>
          <p className={styles.subtitle}>Last Updated: September 20, 2026</p>
        </header>

        <div className={styles.content}>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>1. Introduction</h2>
            <p className={styles.sectionText}>
              Welcome to ALTNEU. These Terms & Conditions govern your use of the ALTNEU website, 
              including browsing the website, placing orders, and any purchases made through the website. 
              By accessing our platform, you agree to comply with these terms.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>2. Website Use & Acceptance</h2>
            <p className={styles.sectionText}>
              By continuing to use this website and by placing an order, you confirm your acceptance 
              of these Terms & Conditions, subject to applicable law. If you do not agree with any 
              part of these terms, please refrain from using our services.
              <br /><br />
              You must provide accurate information when interacting with our website. You agree 
              to use this website only for lawful purposes. You are prohibited from misusing the 
              website, attempting to interfere with its operation, or gaining unauthorized access 
              to our systems. You are responsible for maintaining the security of your account, 
              if applicable.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>3. Products</h2>
            <p className={styles.sectionText}>
              We strive to display our products—including their descriptions, colors, and sizing—as 
              accurately as possible. However, due to screen display variations, the physical product 
              may have minor visual differences from what appears on your device. All products are 
              subject to availability and stock limitations.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>4. Pricing & Taxes</h2>
            <p className={styles.sectionText}>
              All prices displayed on the website are in Indian Rupees (INR) and include applicable 
              taxes unless stated otherwise. Shipping charges, if applicable, will be calculated and 
              displayed at checkout. We reserve the right to correct genuine pricing or display errors 
              at any time before order fulfillment.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>5. Orders & Payment</h2>
            <p className={styles.sectionText}>
              When you place an order, you are making an offer to purchase products subject to these 
              terms. An order confirmation email confirms receipt of your order, but not final 
              acceptance. We may need to cancel or refuse an order due to stock unavailability, 
              incorrect customer information, payment problems, or suspected fraud.
              <br /><br />
              We accept online payments via secure third-party payment gateways (e.g., Razorpay) as 
              displayed during checkout. <strong className={styles.highlight}>Cash on Delivery (COD) is not currently available.</strong>
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>6. Order Cancellation</h2>
            <p className={styles.sectionText}>
              <strong>Ordinary customer-initiated order cancellations are not currently offered once an order is placed.</strong> 
              Please review your cart carefully before completing your purchase. 
              <br /><br />
              If ALTNEU is unable to fulfill an order and must cancel it on our end, any payment already 
              made will be appropriately refunded to the original payment method. This does not affect any 
              remedies required by applicable law.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>7. Returns & Refunds</h2>
            <p className={styles.sectionText}>
              <strong>ALTNEU does not currently offer ordinary change-of-mind returns or ordinary refunds.</strong>
              <br /><br />
              However, this policy does not exclude or limit any rights or remedies you may have under 
              applicable consumer protection laws. If a product is defective, deficient, spurious, 
              materially misdescribed, or otherwise legally protected, we will provide the appropriate 
              remedy (which may include a refund or replacement) as required by law.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>8. Shipping & Delivery</h2>
            <p className={styles.sectionText}>
              Estimated delivery times provided at checkout or via order confirmation are estimates 
              only and are subject to stock availability and circumstances outside our reasonable control. 
              We rely on integrated third-party logistics partners for fulfillment.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>9. Intellectual Property</h2>
            <p className={styles.sectionText}>
              All content on this website, including but not limited to the ALTNEU brand name, logo, 
              photographs, graphics, product imagery, and written content, is owned by or licensed to 
              ALTNEU. You may not reproduce, distribute, or commercially exploit this content without 
              our express permission.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>10. Privacy</h2>
            <p className={styles.sectionText}>
              We respect your privacy. The collection and handling of your personal data are governed 
              by our separate Privacy Policy.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>11. General Conditions</h2>
            <p className={styles.sectionText}>
              <strong>User Conduct:</strong> You agree not to engage in unlawful use, fraud, unauthorized access, 
              or any malicious activity that interferes with the proper working of the ALTNEU website.
              <br /><br />
              <strong>Third-Party Services:</strong> We utilize integrated third-party services, such as payment processors 
              (e.g., Razorpay) and logistics providers, to operate our website and fulfill orders. Your interaction with 
              these services may be subject to their respective terms.
              <br /><br />
              <strong>Limitation of Liability:</strong> To the maximum extent permitted by applicable law, ALTNEU's liability 
              arising from your use of the website or the purchase of products shall be reasonably limited. Nothing in 
              these terms attempts to exclude liabilities that cannot be legally excluded under Indian consumer law.
              <br /><br />
              <strong>Force Majeure:</strong> We shall not be held liable for any delay or failure to perform our obligations 
              if such delay or failure arises from events outside our reasonable control (e.g., natural disasters, 
              strikes, or infrastructure failures), except where applicable law mandates otherwise.
              <br /><br />
              <strong>Changes to Terms:</strong> ALTNEU reserves the right to update these Terms & Conditions at any time. 
              The current version will always be published on this page, and the "Last Updated" date will reflect 
              the most recent modifications.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>12. Contact & Customer Support</h2>
            <p className={styles.sectionText}>
              For questions about these Terms, orders, or customer support,
              please contact us through:
              <br /><br />
              <strong>Email:</strong> altneu07@gmail.com
              <br /><br />
              For applicable customer grievances, please use the contact
              details provided in our Customer Support / Grievance section.
            </p>
          </section>

        </div>
      </div>
    </main>
  );
}
