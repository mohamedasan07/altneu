import { createContactMessage } from '../services/contact.service.js';
import { logger } from '../utils/logger.js';

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

    res.status(201).json({ success: true, id: record.id });
  } catch (error) {
    logger.error('Failed to submit contact form:', error);
    next(error);
  }
}
