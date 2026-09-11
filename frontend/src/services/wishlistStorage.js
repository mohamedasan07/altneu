// WishlistStorage — localStorage persistence for saved products.

const OLD_LEGACY_STORAGE_KEY = 'unsorted_wishlist_v1';
const LEGACY_STORAGE_KEY = 'altnue_wishlist_v1';
const STORAGE_KEY = 'altneu_wishlist_v1';

function isValid(saved) {
  return (
    saved &&
    typeof saved === 'object' &&
    saved.id !== undefined &&
    saved.id !== null &&
    typeof saved.name === 'string'
  );
}

/** Read persisted wishlist. Never throws — returns [] on any fault. */
export function loadWishlist() {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (raw) {
        localStorage.setItem(STORAGE_KEY, raw);
      }
    }
    if (!raw) {
      raw = localStorage.getItem(OLD_LEGACY_STORAGE_KEY);
      if (raw) {
        localStorage.setItem(STORAGE_KEY, raw);
      }
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValid);
  } catch {
    return [];
  }
}

/** Persist the current wishlist. Swallows storage failures. */
export function saveWishlist(items) {
  try {
    const serialized = JSON.stringify(items);
    localStorage.setItem(STORAGE_KEY, serialized);
    localStorage.setItem(LEGACY_STORAGE_KEY, serialized);
    localStorage.setItem(OLD_LEGACY_STORAGE_KEY, serialized);
  } catch {
    /* storage unavailable — wishlist runs in memory only */
  }
}

export function clearStoredWishlist() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    localStorage.removeItem(OLD_LEGACY_STORAGE_KEY);
  } catch {
    /* noop */
  }
}