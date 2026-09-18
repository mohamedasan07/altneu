import { getHealth } from '../services/health.service.js';

/** GET /api/health */
export async function health(_req, res) {
  const healthData = await getHealth();
  res.status(200).json(healthData);
}