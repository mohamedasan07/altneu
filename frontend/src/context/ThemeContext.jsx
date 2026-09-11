import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const OLD_LEGACY_STORAGE_KEY = 'unsorted_theme';
const LEGACY_STORAGE_KEY = 'altnue_theme';
const STORAGE_KEY = 'altneu_theme';
const DEFAULT_THEME = 'dark';

const ThemeContext = createContext({ theme: DEFAULT_THEME, toggleTheme: () => {} });

function getInitialTheme() {
  try {
    let stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;

    stored = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      localStorage.setItem(STORAGE_KEY, stored);
      return stored;
    }

    stored = localStorage.getItem(OLD_LEGACY_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      localStorage.setItem(STORAGE_KEY, stored);
      return stored;
    }
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_THEME;
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
      localStorage.setItem(LEGACY_STORAGE_KEY, theme);
      localStorage.setItem(OLD_LEGACY_STORAGE_KEY, theme);
    } catch {
      /* storage unavailable */
    }
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    }),
    [theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}