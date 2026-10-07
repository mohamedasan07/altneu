import { ApiError } from '../utils/apiError.js';

/**
 * Admin order validation (Sprint 22.1 Phases 1–2).
 *
 * Single source of truth for the admin order contract: the query params the
 * admin frontend may send (list) and the write payloads it may submit
 * (status / payment updates). Mirrors the customer order module's strict
 * style — anything unrecognized throws a 400 with a combined, human-readable
 * message instead of being silently ignored.
 *
 * The sort/status/paymentStatus values are allowlisted (never interpolated
 * into a query), so the sort column can only ever be one of the known order
 * columns and a write can only ever set one of the schema's CHECK values.
 */

export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
];

export const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'];

const ORDER_SORTS = ['placed_at', 'order_number', 'grand_total', 'status'];

const MAX_SEARCH_LENGTH = 64;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Parse + validate the admin order list query string.
 * @param {object} query  req.query
 * @returns {{
 *   page: number,
 *   limit: number,
 *   search: string|null,
 *   status: string|null,
 *   paymentStatus: string|null,
 *   sort: 'placed_at'|'order_number'|'grand_total'|'status',
 *   order: 'asc'|'desc',
 * }}
 * @throws {ApiError} 400 when a value is invalid
 */
export function parseAdminOrderQuery(query = {}) {
  const errors = [];

  const page = Number(query.page ?? DEFAULT_PAGE);
  if (!Number.isInteger(page) || page < 1) {
    errors.push('page must be a positive integer');
  }

  const limit = Number(query.limit ?? DEFAULT_LIMIT);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    errors.push(`limit must be an integer between 1 and ${MAX_LIMIT}`);
  }

  const search = String(query.search ?? '').trim().slice(0, MAX_SEARCH_LENGTH);

  const status = String(query.status ?? '').trim();
  if (status && !ORDER_STATUSES.includes(status)) {
    errors.push(`status must be one of: ${ORDER_STATUSES.join(', ')}`);
  }

  const paymentStatus = String(query.paymentStatus ?? '').trim();
  if (paymentStatus && !PAYMENT_STATUSES.includes(paymentStatus)) {
    errors.push(`paymentStatus must be one of: ${PAYMENT_STATUSES.join(', ')}`);
  }

  const sort = String(query.sort ?? 'placed_at').trim();
  if (!ORDER_SORTS.includes(sort)) {
    errors.push(`sort must be one of: ${ORDER_SORTS.join(', ')}`);
  }

  const order = String(query.order ?? 'desc').trim().toLowerCase();
  if (order !== 'asc' && order !== 'desc') {
    errors.push('order must be "asc" or "desc"');
  }

  if (errors.length > 0) {
    throw new ApiError(400, errors.join('; '));
  }

  return {
    page,
    limit,
    search: search || null,
    status: status || null,
    paymentStatus: paymentStatus || null,
    sort,
    order,
  };
}

/**
 * Validate a status-update payload.
 * @param {object} body  request body
 * @returns {{ status: string }} a known order status
 * @throws {ApiError} 400 when status is missing or not one of ORDER_STATUSES
 */
export function validateStatusUpdatePayload(body = {}) {
  const status = String(body?.status ?? '').trim();
  if (!status) {
    throw new ApiError(400, 'status is required');
  }
  if (!ORDER_STATUSES.includes(status)) {
    throw new ApiError(400, `status must be one of: ${ORDER_STATUSES.join(', ')}`);
  }
  return { status };
}

/**
 * Validate a payment-status-update payload.
 * @param {object} body  request body
 * @returns {{ paymentStatus: string }} a known payment status
 * @throws {ApiError} 400 when paymentStatus is missing or not one of PAYMENT_STATUSES
 */
export function validatePaymentStatusUpdatePayload(body = {}) {
  const paymentStatus = String(body?.paymentStatus ?? '').trim();
  if (!paymentStatus) {
    throw new ApiError(400, 'paymentStatus is required');
  }
  if (!PAYMENT_STATUSES.includes(paymentStatus)) {
    throw new ApiError(400, `paymentStatus must be one of: ${PAYMENT_STATUSES.join(', ')}`);
  }
  return { paymentStatus };
}

/**
 * Validate a tracking-update payload.
 * @param {object} body  request body
 * @returns {{ carrier: string|null, carrierService: string|null, trackingNumber: string|null, trackingUrl: string|null, shippedAt: string|null }}
 * @throws {ApiError} 400 when invalid
 */
export function validateTrackingUpdatePayload(body = {}) {
  const carrier = body?.carrier ? String(body.carrier).trim() : null;
  const carrierService = body?.carrierService ? String(body.carrierService).trim() : null;
  const trackingNumber = body?.trackingNumber ? String(body.trackingNumber).trim() : null;
  const trackingUrl = body?.trackingUrl ? String(body.trackingUrl).trim() : null;
  const shippedAt = body?.shippedAt ? String(body.shippedAt).trim() : null;

  if (trackingUrl) {
    try {
      new URL(trackingUrl);
    } catch (e) {
      throw new ApiError(400, 'trackingUrl must be a valid URL');
    }
  }

  if (shippedAt) {
    if (isNaN(Date.parse(shippedAt))) {
      throw new ApiError(400, 'shippedAt must be a valid timestamp');
    }
  }

  return {
    carrier,
    carrierService,
    trackingNumber,
    trackingUrl,
    shippedAt,
  };
}
