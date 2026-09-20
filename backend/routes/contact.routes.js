import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { submitContactForm } from '../controllers/contact.controller.js';

const contactRoutes = Router();

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many messages sent. Please try again later.' },
  handler: (_req, res, _next, options) => {
    res.status(options.statusCode).json(options.message);
  },
});

contactRoutes.post('/', contactLimiter, submitContactForm);

export default contactRoutes;
