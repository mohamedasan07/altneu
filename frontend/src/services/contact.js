import { request } from './api';

/**
 * Submits a contact form message.
 * @param {Object} data - { name, email, phone, subject, order_number, message }
 * @returns {Promise<{success: boolean, id: string}>}
 */
export async function submitContactMessage(data) {
  return request('/api/contact', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}
