// SettingsStorage — localStorage persistence for account preferences.
// Covers notification + privacy switches. Theme persists separately via the
// existing ThemeContext (unsorted_theme).

const OLD_LEGACY_STORAGE_KEY = 'unsorted_settings_v1';
const LEGACY_STORAGE_KEY = 'altnue_settings_v1';
const STORAGE_KEY = 'altneu_settings_v1';

const DEFAULTS = {
  notifications: {
    marketingEmails: true,
    orderUpdates: true,
    securityAlerts: true,
  },
  privacy: {
    personalizedRecommendations: true,
    shareWithPartners: false,
  },
  updatedAt: null,
};

function mergeDeep(base, stored) {
  if (!stored || typeof stored !== 'object') return base;
  return {
    ...base,
    ...stored,
    notifications: { ...base.notifications, ...(stored.notifications || {}) },
    privacy: { ...base.privacy, ...(stored.privacy || {}) },
  };
}

/** Read saved settings, falling back to (and persisting) defaults. */
export function loadSettings() {
  let stored = null;
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
    if (raw) stored = JSON.parse(raw);
  } catch {
    stored = null;
  }

  const settings = mergeDeep(DEFAULTS, stored);
  if (!stored) try {
    const serialized = JSON.stringify(settings);
    localStorage.setItem(STORAGE_KEY, serialized);
    localStorage.setItem(LEGACY_STORAGE_KEY, serialized);
    localStorage.setItem(OLD_LEGACY_STORAGE_KEY, serialized);
  } catch { /* noop */ }
  return settings;
}

/** Persist settings (swallows storage failures). */
export function saveSettings(settings) {
  try {
    const serialized = JSON.stringify({ ...settings, updatedAt: new Date().toISOString() });
    localStorage.setItem(STORAGE_KEY, serialized);
    localStorage.setItem(LEGACY_STORAGE_KEY, serialized);
    localStorage.setItem(OLD_LEGACY_STORAGE_KEY, serialized);
  } catch {
    /* storage unavailable */
  }
}

export function clearStoredSettings() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    localStorage.removeItem(OLD_LEGACY_STORAGE_KEY);
  } catch {
    /* noop */
  }
}