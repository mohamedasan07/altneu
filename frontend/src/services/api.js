// API client — single fetch wrapper + asset URL resolution.
// Attaches the customer JWT (when present) and centralizes 401 → logout so
// every future customer-scoped consumer (cart, orders, wishlist, payments)
// inherits the same session handling.

import { clearAuthStorage, getStoredToken } from './authStorage.js';
import { supabase } from './supabase.js';
import {
  resolveApiBase,
  isLocalhost,
  isStagingPreview,
  PRODUCTION_BACKEND_URL,
} from '../utils/apiConfig.js';

export {
  resolveApiBase,
  isLocalhost,
  isStagingPreview,
  PRODUCTION_BACKEND_URL,
};

// Module-level API_BASE resolution with safe fallback
let initialApiBase = '';
try {
  initialApiBase = resolveApiBase();
} catch (err) {
  if (typeof console !== 'undefined' && console.error) {
    console.error(err.message);
  }
  initialApiBase = null;
}

export const API_BASE = initialApiBase;

/** Event dispatched on any 401 so AuthContext can clear the session. */
export const UNAUTHORIZED_EVENT = 'unsorted:unauthorized';

export async function request(path, options = {}) {
  // Re-resolve or validate API base URL dynamically to provide immediate diagnostic if missing
  const base = resolveApiBase();

  let token = null;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (data?.session?.access_token && !error) {
      token = data.session.access_token;
    }
  } catch (err) {
    // Fall back to existing legacy token behavior if Supabase fails
  }

  if (!token) {
    token = getStoredToken();
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const res = await fetch(`${base}${normalizedPath}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    if (res.status === 401) {
      clearAuthStorage();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
      }
    }

    let message = `Request failed (${res.status})`;
    let detail = null;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
      if (body?.detail) detail = body.detail;
    } catch {
      /* non-JSON error body — keep the generic message */
    }

    const err = new Error(message);
    err.status = res.status;
    if (detail) err.detail = detail;
    throw err;
  }

  return res.json();
}

// Local product assets were migrated to Cloudinary (Sprint 14A). The public id
// of each asset is the original filename with image extensions stripped and
// slugified, e.g. "/images/tshirt_1.jpeg" -> "tshirt_1". Bucketing them under
// the same URL scheme lets us mine stale snapshots (persisted wishlist/cart
// entries saved before the migration) without the local folder.
const CLOUDINARY_ASSET_ROOT = 'https://res.cloudinary.com/jtfzpgol/image/upload/unsorted/products';
const LEGACY_IMAGE_EXTENSIONS = ['.jpeg', '.jpg', '.png', '.webp', '.gif', '.avif', '.svg', '.bmp', '.jfif', '.pjpeg', '.pjp'];

function coreImageName(value) {
  let name = String(value || '').trim();
  let previous;
  do {
    previous = name;
    const lower = name.toLowerCase();
    for (const ext of LEGACY_IMAGE_EXTENSIONS) {
      if (lower.endsWith(ext)) {
        name = name.slice(0, -ext.length);
        break;
      }
    }
  } while (name !== previous);
  return name;
}

function migrateLegacyImageUrl(src) {
  const basename = coreImageName(String(src || '').split(/[\\/]/).pop() || '');
  const publicId = basename.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!publicId) return '';
  return `${CLOUDINARY_ASSET_ROOT}/${publicId}.jpg`;
}

/**
 * Resolve a product asset URL.
 * Cloudinary URLs (http/https, protocol-relative or data URIs) pass through
 * unchanged. Anything else is treated as a legacy local asset path and mapped
 * to its Cloudinary equivalent; unrecognized values resolve to ''.
 */
export function resolveUrl(src = '') {
  if (!src) return '';
  if (/^(https?:)?\/\//.test(src) || src.startsWith('data:')) return src;
  return migrateLegacyImageUrl(src);
}