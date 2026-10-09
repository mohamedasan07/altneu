import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

/**
 * Format a date for the email (e.g. 10 Sept 2026, 10:22 PM)
 */
function formatDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true
  });
}

function formatMoney(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

export async function sendOrderConfirmationEmail(order) {
  const { BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME } = process.env;

  if (!BREVO_API_KEY || !BREVO_SENDER_EMAIL || !BREVO_SENDER_NAME) {
    logger.warn('[email] Brevo email configuration missing, skipping order confirmation email');
    return;
  }

  const customerName = order.shipping?.name || order.contact?.name || 'Customer';
  const customerEmail = order.contact?.email;

  if (!customerEmail) {
    logger.warn(`[email] Order ${order.id} has no customer email, skipping confirmation`);
    return;
  }

  const logoUrl = 'https://altneu-admin.vercel.app/images/admin1.png';
  const trackingUrl = `${config.frontend.url || 'https://altneu.in'}/track-order?order=${order.altneuNumber}`;

  const itemsHtml = (order.items || []).map(item => `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
      <tr>
        <td width="90" valign="top">
          <img src="${item.imageUrl}" alt="${item.name}" width="90" style="width: 90px; border-radius: 6px; display: block;" />
        </td>
        <td valign="top" style="padding-left: 20px;">
          <h4 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: #fafafa; letter-spacing: 0.02em;">${item.name}</h4>
          <p style="margin: 0 0 8px 0; font-size: 14px; color: #a1a1aa;">
            ${item.size ? `Size: ${item.size}` : ''}
            ${item.color ? ` | Color: ${item.colorName || item.color}` : ''}
          </p>
          <p style="margin: 0; font-size: 14px; color: #a1a1aa;">Qty: ${item.quantity}</p>
        </td>
        <td valign="top" align="right" style="font-size: 16px; font-weight: 600; color: #fafafa;">
          ${formatMoney(item.price * item.quantity)}
        </td>
      </tr>
    </table>
  `).join('');

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Confirmed - ${order.altneuNumber}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #09090b;
      color: #fafafa;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    table {
      border-collapse: collapse;
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    a {
      color: #fafafa;
      text-decoration: none;
    }
    .container {
      width: 100%;
      max-width: 680px;
      margin: 0 auto;
      background-color: #121214;
    }
    .header {
      text-align: center;
      padding: 40px 20px 30px;
      border-top: 1px solid #3f3f46;
      border-bottom: 1px solid #3f3f46;
      background-color: #121214;
    }
    .header img {
      height: 48px;
      display: block;
      margin: 0 auto;
    }
    .header-tagline {
      font-size: 13px;
      color: #a1a1aa;
      letter-spacing: 0.05em;
      margin: 16px 0 0 0;
    }
    .content {
      padding: 50px 40px;
    }
    .eyebrow {
      font-size: 12px;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: #a1a1aa;
      text-align: center;
      margin-bottom: 12px;
    }
    .title {
      font-size: 32px;
      font-weight: 600;
      text-align: center;
      margin: 0 0 20px 0;
      color: #fafafa;
      letter-spacing: -0.02em;
    }
    .subtitle {
      font-size: 16px;
      color: #e4e4e7;
      text-align: center;
      line-height: 1.6;
      margin: 0 0 40px 0;
    }
    .success-box {
      background-color: #18181b;
      border: 1px solid #27272a;
      border-radius: 8px;
      padding: 24px;
      text-align: center;
      margin-bottom: 48px;
    }
    .success-box h3 {
      color: #10b981;
      margin: 0 0 10px 0;
      font-size: 18px;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .success-box p {
      margin: 0;
      color: #a1a1aa;
      font-size: 15px;
      line-height: 1.5;
    }
    .meta-table {
      width: 100%;
      margin-bottom: 48px;
    }
    .meta-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #a1a1aa;
      margin-bottom: 8px;
    }
    .meta-value {
      font-size: 16px;
      font-weight: 600;
      color: #fafafa;
    }
    .section-title {
      font-size: 20px;
      font-weight: 600;
      color: #fafafa;
      margin: 0 0 24px 0;
      border-bottom: 1px solid #27272a;
      padding-bottom: 16px;
    }
    .summary-table {
      width: 100%;
      margin-bottom: 48px;
      border-top: 1px solid #27272a;
      padding-top: 24px;
    }
    .summary-row td {
      padding: 12px 0;
      font-size: 15px;
      color: #e4e4e7;
    }
    .summary-row.total td {
      font-size: 20px;
      font-weight: 600;
      color: #fafafa;
      border-top: 1px solid #27272a;
      padding-top: 20px;
      margin-top: 8px;
    }
    .card {
      background-color: #18181b;
      border: 1px solid #27272a;
      border-radius: 8px;
      padding: 28px;
      margin-bottom: 24px;
    }
    .card-title {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #a1a1aa;
      margin: 0 0 16px 0;
    }
    .card-text {
      font-size: 15px;
      color: #e4e4e7;
      line-height: 1.6;
      margin: 0;
    }
    .button-container {
      text-align: center;
      margin: 56px 0;
    }
    .button {
      display: inline-block;
      background-color: #fafafa;
      color: #09090b !important;
      font-size: 15px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      text-decoration: none;
      padding: 18px 48px;
      border-radius: 4px;
    }
    .trust-section {
      width: 100%;
      margin-top: 40px;
      margin-bottom: 20px;
      border-top: 1px solid #27272a;
      border-bottom: 1px solid #27272a;
      padding: 40px 0;
    }
    .trust-title {
      font-size: 15px;
      font-weight: 600;
      color: #fafafa;
      margin: 0 0 6px 0;
    }
    .trust-text {
      font-size: 14px;
      color: #a1a1aa;
      margin: 0;
    }
    .footer {
      text-align: center;
      padding: 48px 20px;
      background-color: #18181b;
      border-top: 1px solid #27272a;
    }
    .footer img {
      height: 48px;
      display: block;
      margin: 0 auto 16px auto;
    }
    .footer-tagline {
      font-size: 15px;
      color: #a1a1aa;
      margin: 0 0 24px 0;
    }
    .footer p {
      font-size: 13px;
      color: #71717a;
      margin: 0 0 8px 0;
    }

    @media only screen and (max-width: 600px) {
      .content {
        padding: 40px 20px !important;
      }
      .trust-column {
        display: block !important;
        width: 100% !important;
        padding-bottom: 32px !important;
      }
      .trust-column:last-child {
        padding-bottom: 0 !important;
      }
    }
  </style>
</head>
<body>
  <table width="100%" bgcolor="#09090b" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <!-- Main Container -->
        <table class="container" cellpadding="0" cellspacing="0">

          <!-- Header -->
          <tr>
            <td class="header">
              <img src="${logoUrl}" alt="ALTNEU" height="48" style="height: 48px; width: auto; border: 0;" />
              <p class="header-tagline">For the Unfiltered.</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td class="content">
              <div class="eyebrow">ORDER CONFIRMED</div>
              <h1 class="title">Thank you, ${customerName}.</h1>
              <p class="subtitle">Your order has been received successfully. We are preparing your order with care.</p>

              <div class="success-box">
                <h3>✓ Your order is confirmed</h3>
                <p>We'll keep you updated as your order moves toward delivery.</p>
              </div>

              <!-- Meta Data -->
              <table class="meta-table" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="50%" valign="top">
                    <div class="meta-label">ORDER NUMBER</div>
                    <div class="meta-value">${order.altneuNumber}</div>
                  </td>
                  <td width="50%" valign="top" align="right">
                    <div class="meta-label">ORDER DATE</div>
                    <div class="meta-value">${formatDate(order.placedAt)}</div>
                  </td>
                </tr>
              </table>

              <!-- Items -->
              <h2 class="section-title">Your Order</h2>
              ${itemsHtml}

              <!-- Summary -->
              <table class="summary-table" cellpadding="0" cellspacing="0">
                <tr class="summary-row">
                  <td>Subtotal</td>
                  <td align="right">${formatMoney(order.totals.subtotal)}</td>
                </tr>
                <tr class="summary-row">
                  <td>Delivery / Shipping</td>
                  <td align="right">${order.totals.shipping > 0 ? formatMoney(order.totals.shipping) : 'Free'}</td>
                </tr>
                ${order.totals.discount > 0 ? `
                <tr class="summary-row">
                  <td>Discount</td>
                  <td align="right">-${formatMoney(order.totals.discount)}</td>
                </tr>
                ` : ''}
                <tr class="summary-row total">
                  <td>Total</td>
                  <td align="right">${formatMoney(order.totals.grandTotal)}</td>
                </tr>
              </table>

              <!-- Delivery Details -->
              <div class="card">
                <h3 class="card-title">DELIVERY DETAILS</h3>
                <p class="card-text">
                  ${order.shipping.name}<br>
                  ${order.shipping.phone}<br>
                  ${order.shipping.line1}<br>
                  ${order.shipping.line2 ? `${order.shipping.line2}<br>` : ''}
                  ${order.shipping.city}, ${order.shipping.state} - ${order.shipping.pincode}<br>
                  ${order.shipping.country}
                </p>
              </div>

              <!-- Payment -->
              <div class="card">
                <h3 class="card-title">PAYMENT</h3>
                <p class="card-text">
                  <strong>Method:</strong> ${order.paymentMethod === 'cod' ? 'Cash on Delivery' : (order.paymentMethod === 'advance' ? 'Advance Payment' : 'Online Payment')}<br>
                  <strong>Status:</strong> <span style="text-transform: capitalize;">${order.paymentStatus}</span>
                </p>
              </div>

              <!-- CTA -->
              <div class="button-container">
                <a href="${trackingUrl}" class="button">TRACK YOUR ORDER</a>
                <p style="font-size: 13px; color: #a1a1aa; margin-top: 24px;">Keep your order number <strong>${order.altneuNumber}</strong> for future reference.</p>
              </div>

              <!-- Trust Section -->
              <table class="trust-section" cellpadding="0" cellspacing="0">
                <tr>
                  <td class="trust-column" width="33%" align="center" valign="top">
                    <p class="trust-title">Authentic</p>
                    <p class="trust-text">Original products</p>
                  </td>
                  <td class="trust-column" width="33%" align="center" valign="top">
                    <p class="trust-title">Carefully Packed</p>
                    <p class="trust-text">Secure packaging</p>
                  </td>
                  <td class="trust-column" width="33%" align="center" valign="top">
                    <p class="trust-title">Support</p>
                    <p class="trust-text">We're here to help</p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="footer">
              <img src="${logoUrl}" alt="ALTNEU" height="48" style="height: 48px; width: auto; border: 0;" />
              <p class="footer-tagline">For the Unfiltered.</p>
              <p>altneu07@gmail.com</p>
              <p style="margin-top: 16px;">© ${new Date().getFullYear()} ALTNEU. All rights reserved.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  const payload = {
    sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
    to: [{ email: customerEmail, name: customerName }],
    subject: `Order Confirmed - ${order.altneuNumber} | ALTNEU`,
    htmlContent: htmlContent
  };

  logger.info(`[email] Sending order confirmation email for ${order.id} to ${customerEmail}`);

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[email] Brevo API error for order ${order.id}: ${response.status} ${errorText}`);
    } else {
      logger.info(`[email] Successfully sent order confirmation for ${order.id}`);
    }
  } catch (error) {
    logger.error(`[email] Failed to send confirmation email for ${order.id}`, error);
  }
}

export async function sendAdminPasswordReset(adminEmail, adminName, rawToken) {
  const { BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME } = process.env;

  if (!BREVO_API_KEY || !BREVO_SENDER_EMAIL || !BREVO_SENDER_NAME) {
    logger.warn('[email] Brevo email configuration missing, skipping password reset email');
    return;
  }

  const logoUrl = 'https://altneu-admin.vercel.app/images/admin1.png';
  // Use frontend URL from config, default to admin vercel for admin links if possible.
  // Wait, config.adminFrontendUrl is not defined yet in config, we can use config.admin.url if we add it,
  // or hardcode the known production domain if process.env.ADMIN_URL exists.
  const adminUrl = process.env.ADMIN_URL || 'https://altneu-admin.vercel.app';
  const resetUrl = `${adminUrl}/reset-password?token=${rawToken}`;

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Admin Password | ALTNEU</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #09090b;
      color: #fafafa;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    table {
      border-collapse: collapse;
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    a {
      color: #fafafa;
      text-decoration: none;
    }
    .container {
      width: 100%;
      max-width: 680px;
      margin: 0 auto;
      background-color: #121214;
    }
    .header {
      text-align: center;
      padding: 40px 20px 30px;
      border-top: 1px solid #3f3f46;
      border-bottom: 1px solid #3f3f46;
      background-color: #121214;
    }
    .header img {
      height: 48px;
      display: block;
      margin: 0 auto;
    }
    .header-tagline {
      font-size: 13px;
      color: #a1a1aa;
      letter-spacing: 0.05em;
      margin: 16px 0 0 0;
    }
    .content {
      padding: 50px 40px;
      text-align: center;
    }
    .eyebrow {
      font-size: 12px;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: #a1a1aa;
      text-align: center;
      margin-bottom: 12px;
    }
    .title {
      font-size: 32px;
      font-weight: 600;
      text-align: center;
      margin: 0 0 20px 0;
      color: #fafafa;
      letter-spacing: -0.02em;
    }
    .subtitle {
      font-size: 16px;
      color: #e4e4e7;
      text-align: center;
      line-height: 1.6;
      margin: 0 0 40px 0;
    }
    .button-container {
      text-align: center;
      margin: 40px 0;
    }
    .button {
      display: inline-block;
      background-color: #fafafa;
      color: #09090b !important;
      font-size: 15px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      text-decoration: none;
      padding: 18px 48px;
      border-radius: 4px;
    }
    .footer {
      text-align: center;
      padding: 48px 20px;
      background-color: #18181b;
      border-top: 1px solid #27272a;
    }
    .footer img {
      height: 48px;
      display: block;
      margin: 0 auto 16px auto;
    }
    .footer-tagline {
      font-size: 15px;
      color: #a1a1aa;
      margin: 0 0 24px 0;
    }
    .footer p {
      font-size: 13px;
      color: #71717a;
      margin: 0 0 8px 0;
    }
  </style>
</head>
<body>
  <table width="100%" bgcolor="#09090b" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table class="container" cellpadding="0" cellspacing="0">

          <!-- Header -->
          <tr>
            <td class="header">
              <img src="${logoUrl}" alt="ALTNEU" height="48" style="height: 48px; width: auto; border: 0;" />
              <p class="header-tagline">For the Unfiltered.</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td class="content">
              <div class="eyebrow">SECURITY ALERT</div>
              <h1 class="title">RESET YOUR ADMIN PASSWORD</h1>
              <p class="subtitle">Hello, ${adminName || 'Admin'}.<br><br>We received a request to reset your ALTNEU admin password.</p>

              <div class="button-container">
                <a href="${resetUrl}" class="button">RESET PASSWORD</a>
                <p style="font-size: 13px; color: #a1a1aa; margin-top: 24px;">This link expires in 15 minutes.</p>
                <p style="font-size: 13px; color: #a1a1aa; margin-top: 8px;">If you did not request this, you can safely ignore this email.</p>
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="footer">
              <img src="${logoUrl}" alt="ALTNEU" height="48" style="height: 48px; width: auto; border: 0;" />
              <p class="footer-tagline">For the Unfiltered.</p>
              <p>altneu07@gmail.com</p>
              <p style="margin-top: 16px;">© ${new Date().getFullYear()} ALTNEU. All rights reserved.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  const payload = {
    sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
    to: [{ email: adminEmail, name: adminName || 'Admin' }],
    subject: 'Reset Your Admin Password | ALTNEU',
    htmlContent: htmlContent
  };

  logger.info(`[email] Sending admin password reset email to ${adminEmail}`);

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[email] Brevo API error for password reset: ${response.status} ${errorText}`);
    } else {
      logger.info('[email] Successfully sent admin password reset email');
    }
  } catch (error) {
    logger.error('[email] Failed to send admin password reset email', error);
  }
}
