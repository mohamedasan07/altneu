import { createContactMessage } from '../services/contact.service.js';
import { logger } from '../utils/logger.js';

async function sendBrevoNotification(data) {
  logger.info('sendBrevoNotification() started');
  const { BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME, CONTACT_NOTIFICATION_EMAIL } = process.env;

  if (!BREVO_API_KEY || !BREVO_SENDER_EMAIL || !BREVO_SENDER_NAME || !CONTACT_NOTIFICATION_EMAIL) {
    logger.warn('Brevo email configuration missing, skipping email notification');
    return;
  }

  const payload = {
    sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
    to: [{ email: CONTACT_NOTIFICATION_EMAIL }],
    replyTo: { email: data.email },
    subject: `ALTNEU Contact — ${data.subject}`,
    textContent: `New contact message\n\nName: ${data.name}\nEmail: ${data.email}\nPhone: ${data.phone}\nSubject: ${data.subject}\nMessage: ${data.message}\n\nSubmitted: ${new Date().toISOString()}\n`
  };

  logger.info('Preparing to send Brevo request', {
    brevoConfigured: !!BREVO_API_KEY,
    senderConfigured: !!(BREVO_SENDER_EMAIL && BREVO_SENDER_NAME),
    recipientConfigured: !!CONTACT_NOTIFICATION_EMAIL,
    endpoint: 'https://api.brevo.com/v3/smtp/email'
  });

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

    logger.info('Brevo request completed', {
      status: response.status,
      ok: response.ok
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Brevo API error: ${response.status} ${errorText}`);
    }
  } catch (error) {
    logger.error('Brevo request threw an error', {
      name: error.name,
      message: error.message
    });
    throw error;
  }
}

export async function submitContactForm(req, res, next) {
  try {
    const { name, email, phone, subject, message } = req.body;

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!email || typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!subject || typeof subject !== 'string' || subject.trim() === '') {
      return res.status(400).json({ error: 'Subject is required' });
    }
    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({ error: 'Message is required' });
    }
    if (!phone || typeof phone !== 'string' || phone.trim() === '') {
      return res.status(400).json({ error: 'Phone is required' });
    }

    // Length limits
    if (name.length > 100) return res.status(400).json({ error: 'Name is too long' });
    if (email.length > 255) return res.status(400).json({ error: 'Email is too long' });
    if (subject.length > 150) return res.status(400).json({ error: 'Subject is too long' });
    if (message.length > 2000) return res.status(400).json({ error: 'Message is too long (max 2000 characters)' });
    if (phone.length > 50) return res.status(400).json({ error: 'Phone is too long' });

    // Store in DB
    const record = await createContactMessage({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      subject: subject.trim(),
      message: message.trim(),
      status: 'new'
    });

    try {
      await sendBrevoNotification({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        subject: subject.trim(),
        message: message.trim()
      });
    } catch (brevoError) {
      logger.error('Failed to send Brevo contact notification:', brevoError);
    }

    res.status(201).json({ success: true, id: record.id });
  } catch (error) {
    logger.error('Failed to submit contact form:', error);
    next(error);
  }
}
