// searchHistory — localStorage persistence for recent search terms.

const OLD_LEGACY_STORAGE_KEY = 'unsorted_search_history_v1';
const LEGACY_STORAGE_KEY = 'altnue_search_history_v1';
const STORAGE_KEY = 'altneu_search_history_v1';
export const MAX_RECENT_SEARCHES = 5;

/** Read the saved list. Never throws — returns [] on any fault. */
export function loadSearchHistory() {
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
    return parsed
      .filter((term) => typeof term === 'string' && term.trim().length > 0)
      .slice(0, MAX_RECENT_SEARCHES);
  } catch {
    return [];
  }
}

function persist(items) {
  try {
    const serialized = JSON.stringify(items);
    localStorage.setItem(STORAGE_KEY, serialized);
    localStorage.setItem(LEGACY_STORAGE_KEY, serialized);
    localStorage.setItem(OLD_LEGACY_STORAGE_KEY, serialized);
  } catch {
    /* storage unavailable — history runs in memory only */
  }
}

/**
 * Record a search term. Most-recent first, case-insensitive dedupe
 * (keeps the newest position), trimmed and capped at MAX_RECENT_SEARCHES.
 */
export function addSearchHistory(term) {
  const clean = typeof term === 'string' ? term.trim() : '';
  if (!clean) return loadSearchHistory();

  const rest = loadSearchHistory().filter(
    (existing) => existing.toLowerCase() !== clean.toLowerCase()
  );
  const next = [clean, ...rest].slice(0, MAX_RECENT_SEARCHES);
  persist(next);
  return next;
}

/** Persist an externally-managed list. */
export function saveSearchHistory(items) {
  persist(
    (Array.isArray(items) ? items : [])
      .filter((term) => typeof term === 'string' && term.trim().length > 0)
      .slice(0, MAX_RECENT_SEARCHES)
  );
}

export function clearSearchHistory() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    localStorage.removeItem(OLD_LEGACY_STORAGE_KEY);
  } catch {
    /* noop */
  }
}