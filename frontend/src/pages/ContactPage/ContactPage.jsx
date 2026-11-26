import { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../components/ui/Button/Button';
import { submitContactMessage } from '../../services/contact';
import styles from './ContactPage.module.css';

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: 'Order Issue',
    message: ''
  });

  const [status, setStatus] = useState('normal'); // 'normal', 'sending', 'success', 'error'
  const [errorMessage, setErrorMessage] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (status === 'sending') return;

    setStatus('sending');
    setErrorMessage('');

    try {
      await submitContactMessage(formData);
      setStatus('success');
      setFormData({
        name: '',
        email: '',
        phone: '',
        subject: 'Order Issue',
        message: ''
      });
    } catch (err) {
      setStatus('error');
      setErrorMessage(err.message || 'Something went wrong. Please try again.');
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        {/* 1. HERO */}
        <section className={styles.hero}>
          <span className={styles.heroEyebrow}>CONTACT US</span>
          <h1 className={styles.heroTitle}>WE'D LOVE TO HEAR FROM YOU</h1>
          <p className={styles.heroSubtitle}>
            Have a question about our products, orders or collections?<br />
            We're here to help.
          </p>
        </section>

        {/* 2. SUPPORT CHANNELS */}
        <section className={styles.channels} aria-label="Customer Support Details">
          <div className={styles.channelCard}>
            <span className={styles.channelLabel}>Seller &amp; Legal Entity</span>
            <span className={styles.channelValue}>Harshan . A</span>
            <span className={styles.channelSub}>Trading as ALTNEU</span>
            <span className={styles.channelSub}>Individual / Unregistered Business</span>
            <span className={styles.channelSub}>Founder &amp; Grievance Officer: Harshan . A</span>
          </div>
          <div className={styles.channelCard}>
            <span className={styles.channelLabel}>Operating Address</span>
            <span className={styles.channelValue}>10/43, Sivan Mela Vithi</span>
            <span className={styles.channelSub}>Velankanni – 611111</span>
            <span className={styles.channelSub}>Nagapattinam, Tamil Nadu, India</span>
          </div>
          <div className={styles.channelCard}>
            <span className={styles.channelLabel}>Support Email</span>
            <a href="mailto:altneu07@gmail.com" className={styles.channelValue}>
              altneu07@gmail.com
            </a>
            <span className={styles.channelSub}>Direct email assistance</span>
          </div>
          <div className={styles.channelCard}>
            <span className={styles.channelLabel}>Phone &amp; WhatsApp</span>
            <a href="tel:+916381245772" className={styles.channelValue}>
              +91 6381245772
            </a>
            <a
              href="https://api.whatsapp.com/send?phone=916381245772&text=Hi%20ALTNEU%2C%20I%20have%20an%20enquiry%20about%20your%20products."
              target="_blank"
              rel="noopener noreferrer"
              className={styles.channelSubLink}
            >
              Chat on WhatsApp ↗
            </a>
          </div>
        </section>

        <div className={styles.formWrapper}>

          {/* 3. CONTACT FORM */}
          <section className={styles.formSection}>
            {status === 'success' ? (
              <div className={styles.successState}>
                <h2 className={styles.successTitle}>MESSAGE SENT</h2>
                <p className={styles.successBody}>We'll get back to you soon.</p>
                <Button variant="outline" onClick={() => setStatus('normal')}>
                  SEND ANOTHER MESSAGE
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className={styles.form}>
                {status === 'error' && (
                  <div className={styles.errorAlert} role="alert">
                    {errorMessage}
                  </div>
                )}

                <div className={styles.formGroup}>
                  <label htmlFor="name" className={styles.label}>Name *</label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    required
                    maxLength="100"
                    className={styles.input}
                    value={formData.name}
                    onChange={handleChange}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="email" className={styles.label}>Email *</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    required
                    maxLength="255"
                    className={styles.input}
                    value={formData.email}
                    onChange={handleChange}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="phone" className={styles.label}>Phone Number *</label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    required
                    maxLength="50"
                    className={styles.input}
                    value={formData.phone}
                    onChange={handleChange}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="subject" className={styles.label}>Subject *</label>
                  <select
                    id="subject"
                    name="subject"
                    required
                    className={styles.select}
                    value={formData.subject}
                    onChange={handleChange}
                  >
                    <option value="Order Issue">Order Issue</option>
                    <option value="Product Question">Product Question</option>
                    <option value="Delivery">Delivery</option>
                    <option value="Return / Refund">Return / Refund</option>
                    <option value="Payment">Payment</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="message" className={styles.label}>Message *</label>
                  <textarea
                    id="message"
                    name="message"
                    required
                    maxLength="2000"
                    rows="6"
                    className={styles.textarea}
                    value={formData.message}
                    onChange={handleChange}
                  />
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  disabled={status === 'sending'}
                  className={styles.submitBtn}
                >
                  {status === 'sending' ? 'SENDING...' : 'SEND MESSAGE'}
                </Button>
              </form>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
