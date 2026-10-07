import { request } from './api.js';

export async function trackOrderPublic(orderNumber, contactRaw) {
  const data = await request('/api/public/track-order', {
    method: 'POST',
    body: JSON.stringify({
      orderNumber,
      contact: contactRaw,
    }),
  });
  return data;
}
