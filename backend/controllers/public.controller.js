import { getPublicTrackingOrder } from '../services/order.service.js';

export async function trackOrderHandler(req, res) {
  const order = await getPublicTrackingOrder(req.body);
  res.json(order);
}
