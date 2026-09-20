import styles from './ShippingPage.module.css';

export default function ShippingPage() {
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>SHIPPING & ORDER POLICY</h1>
          <p className={styles.subtitle}>Last Updated: September 20, 2026</p>
        </header>

        <div className={styles.content}>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>1. Shipping & Delivery</h2>
            <p className={styles.sectionText}>
              ALTNEU relies on integrated third-party logistics partners to fulfill your orders. 
              We offer the following delivery estimates based on the option selected at checkout:
            </p>
            <ul className={styles.sectionList}>
              <li><strong>Standard Delivery:</strong> Doorstep delivery, typically within 5–7 business days.</li>
              <li><strong>Express Delivery:</strong> Priority fulfillment for faster arrival.</li>
              <li><strong>Store Pickup:</strong> Free option, typically ready in 2 business days.</li>
            </ul>
            <p className={styles.sectionText}>
              <br />
              All delivery timeframes are estimates and are subject to stock availability and circumstances 
              outside our reasonable control. Delays may occur due to unforeseen logistical issues. 
              Customers are responsible for providing a complete and accurate shipping address; incomplete 
              addresses may lead to returned or delayed packages.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>2. Shipping Charges</h2>
            <p className={styles.sectionText}>
              Shipping charges are calculated dynamically based on your order subtotal and the delivery 
              method you select at checkout. Express delivery carries a flat premium fee (currently INR 199), 
              while standard delivery fees may vary. Store pickup is free. Exact charges will always be 
              clearly displayed before you complete your purchase.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>3. Payment Methods</h2>
            <p className={styles.sectionText}>
              We accept online payments via secure payment gateways. Supported methods include:
            </p>
            <ul className={styles.sectionList}>
              <li>Credit / Debit Cards (Visa, Mastercard, RuPay)</li>
              <li>UPI (GPay, PhonePe, Paytm, etc.)</li>
              <li>Net Banking (Major Indian banks)</li>
            </ul>
            <p className={styles.sectionText}>
              <br />
              <strong>Cash on Delivery (COD) is currently unavailable.</strong>
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>4. Order Processing</h2>
            <p className={styles.sectionText}>
              Once an order is successfully placed, you will receive an order confirmation email. 
              This email confirms receipt of your order but does not signify final legal acceptance. 
              Your order is then sent to our logistics partners for processing and dispatch. Tracking 
              information will be provided once the package is handed over to the courier.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>5. Order Cancellation</h2>
            <p className={styles.sectionText}>
              <strong>Ordinary customer-requested cancellation is currently not offered after an order has been successfully placed.</strong>
              <br /><br />
              Please review your cart carefully before completing your payment. If ALTNEU must cancel an order 
              on our end because we are unable to fulfill it (e.g., due to stock unavailability or fraud suspicion), 
              any payment already made will be refunded to your original payment method. This policy does not affect 
              any cancellation rights required by applicable consumer law.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>6. Returns</h2>
            <p className={styles.sectionText}>
              <strong>ALTNEU currently does not offer ordinary change-of-mind returns.</strong>
              <br /><br />
              However, if you receive an incorrect, defective, deficient, spurious, or materially misdescribed product, 
              you have the right to contact us for a resolution, subject to applicable law and our internal review process. 
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>7. Refunds</h2>
            <p className={styles.sectionText}>
              <strong>ALTNEU currently does not offer ordinary refunds for change-of-mind purchases or ordinary order cancellations.</strong>
              <br /><br />
              Where applicable consumer law mandates a remedy for defective or misdescribed goods, or if ALTNEU 
              cancels an unfulfilled order, refunds will be processed to the original payment method. We do not 
              limit any remedies that cannot legally be excluded. 
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>8. Damaged / Incorrect Products</h2>
            <p className={styles.sectionText}>
              If you receive a damaged, incorrect, defective, or materially different product, please contact 
              our support team immediately. You must provide:
            </p>
            <ul className={styles.sectionList}>
              <li>Your order number</li>
              <li>A clear description of the issue</li>
              <li>Relevant photographs or unboxing evidence</li>
            </ul>
            <p className={styles.sectionText}>
              <br />
              Our team will review the issue and provide the applicable remedy (which may include a refund or 
              replacement) under ALTNEU policy and applicable consumer law.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>9. Delivery Problems</h2>
            <p className={styles.sectionText}>
              If your tracking shows an issue, your delivery is significantly delayed, or the package cannot be 
              delivered, please reach out to our support team. We will coordinate with our logistics partners to 
              investigate the status of your shipment.
              <br /><br />
              If a package cannot be delivered because the customer entered an incorrect or incomplete address, 
              ALTNEU is not liable for the loss, and any reshipment may incur additional charges.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>10. Customer Support</h2>
            <p className={styles.sectionText}>
              For any questions regarding shipping, tracking, or order issues, please contact us at:
              <br /><br />
              <strong>Email:</strong> altneu07@gmail.com
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
