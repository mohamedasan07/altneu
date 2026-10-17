import { expireUnpaidOrders } from '../services/order.service.js';
import { processPendingRefundIntents } from '../services/refund.service.js';
import { ApiError } from '../utils/apiError.js';

/**
 * Internal Controller for maintenance, sweeping, and background jobs.
 */

/**
 * POST /api/internal/orders/expire-unpaid
 * Sweeper endpoint to expire unpaid orders past the timeout threshold and safely restore stock.
 */
export async function expireUnpaidOrdersHandler(req, res) {
  const rawTimeout = req.body?.timeoutMinutes ?? req.query?.timeoutMinutes;
  const rawBatch = req.body?.batchSize ?? req.query?.batchSize;

  let timeoutMinutes = 30;
  if (rawTimeout !== undefined && rawTimeout !== null) {
    const parsed = Number(rawTimeout);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new ApiError(400, 'timeoutMinutes must be a positive integer');
    }
    timeoutMinutes = parsed;
  }

  let batchSize = 50;
  if (rawBatch !== undefined && rawBatch !== null) {
    const parsed = Number(rawBatch);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new ApiError(400, 'batchSize must be a positive integer between 1 and 100');
    }
    batchSize = Math.min(parsed, 100);
  }

  const result = await expireUnpaidOrders({ timeoutMinutes, batchSize });

  res.status(200).json(result);
}

/**
 * POST /api/internal/refunds/process-intents
 * Sweeper endpoint to process pending durable refund intents for late captures.
 */
export async function processRefundIntentsHandler(req, res) {
  const rawBatch = req.body?.batchSize ?? req.query?.batchSize;

  let batchSize = 10;
  if (rawBatch !== undefined && rawBatch !== null) {
    const parsed = Number(rawBatch);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new ApiError(400, 'batchSize must be a positive integer between 1 and 50');
    }
    batchSize = Math.min(parsed, 50);
  }

  const result = await processPendingRefundIntents({ batchSize });

  res.status(200).json(result);
}

