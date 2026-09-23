import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as authApi from '../services/customerAuth';
import { supabase } from '../services/supabase';
import {
  getStoredToken,
  getStoredUser,
  setAuthStorage,
  clearAuthStorage,
} from '../services/authStorage';
import { UNAUTHORIZED_EVENT } from '../services/api';
import { normalizeEmail } from '../utils/authValidation';

const AuthContext = createContext(null);

/**
 * Customer authentication (Sprint 21.1 backend, wired here in 21.2).
 *
 * The public API is intentionally identical to the previous localStorage mock
 * so every consumer (LoginForm, RegisterForm, ForgotPasswordForm,
 * ProtectedRoute, ProfileDropdown, ProfileCard, SettingsPanel) works without
 * change:
 *   { user, isAuthenticated, login, register, logout, updateProfile }
 *
 * Sessions persist as a JWT + profile in localStorage. A 401 from any API call
 * clears the stored session centrally (services/api.js) and fires
 * UNAUTHORIZED_EVENT, which this provider listens for to drop the in-memory
 * user.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser());
  const [isInitializing, setIsInitializing] = useState(true);
  const isSupabaseSessionRef = useRef(false);
  const syncPromiseRef = useRef(null);

  // Centralized 401 → logout: any customer API call that returns 401 clears
  // the stored session and signs the user out in every open tab.
  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  // Listen for Supabase Auth state changes and sync the application user profile.
  // This inherently replaces the old refreshSession() on mount because Supabase
  // fires 'INITIAL_SESSION' automatically.
  useEffect(() => {
    let cancelled = false;

    let syncTimeout = null;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;

      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        const hasSession = Boolean(session);
        isSupabaseSessionRef.current = hasSession;

        // Defer API synchronization to avoid Supabase Auth deadlock.
        // Debounce with clearTimeout to avoid duplicate fetches if events fire rapidly.
        if (syncTimeout) clearTimeout(syncTimeout);

        syncTimeout = setTimeout(async () => {
          if (cancelled) return;

          if (syncPromiseRef.current) return;

          try {
            if (hasSession) {
              try {
                syncPromiseRef.current = authApi.fetchCurrentCustomer();
                const fresh = await syncPromiseRef.current;
                if (!cancelled) setUser(fresh);
              } catch {
                // Network errors or 401s (401 handled centrally)
              }
            } else if (event === 'INITIAL_SESSION' && getStoredToken()) {
              // No Supabase session on initial load. Safely preserve legacy session.
              try {
                syncPromiseRef.current = authApi.fetchCurrentCustomer();
                const fresh = await syncPromiseRef.current;
                if (!cancelled) {
                  setAuthStorage(getStoredToken(), fresh);
                  setUser(fresh);
                }
              } catch {
                // 401 is handled centrally; network errors keep the cached profile.
              }
            }
          } finally {
            syncPromiseRef.current = null;
            if (event === 'INITIAL_SESSION' && !cancelled) {
              setIsInitializing(false);
            }
          }
        }, 0);
      } else if (event === 'SIGNED_OUT') {
        if (syncTimeout) clearTimeout(syncTimeout);
        // Only clear the React state if we were actually relying on the Supabase session
        if (isSupabaseSessionRef.current) {
          setUser(null);
        }
        isSupabaseSessionRef.current = false;
      }
    });

    return () => {
      cancelled = true;
      if (syncTimeout) clearTimeout(syncTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async ({ email, password } = {}) => {
    const { token, user: account } = await authApi.loginCustomer({
      email: normalizeEmail(email),
      password,
    });
    setAuthStorage(token, account);
    setUser(account);
    return account;
  }, []);

  const register = useCallback(async (details = {}) => {
    const { token, user: account } = await authApi.registerCustomer({
      firstName: details.firstName,
      lastName: details.lastName,
      email: normalizeEmail(details.email),
      phone: details.phone,
      password: details.password,
    });
    setAuthStorage(token, account);
    setUser(account);
    return account;
  }, []);

  const logout = useCallback(async () => {
    if (isSupabaseSessionRef.current) {
      try {
        await supabase.auth.signOut();
      } catch {
        /* ignore network failure, continue clearing local state */
      }
    }
    clearAuthStorage();
    setUser(null);
    isSupabaseSessionRef.current = false;
  }, []);

  const updateProfile = useCallback(async (patch = {}) => {
    const { token, user: account } = await authApi.updateCustomerProfile(patch);
    setAuthStorage(token, account);
    setUser(account);
    return account;
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isInitializing,
      login,
      register,
      logout,
      updateProfile,
    }),
    [user, isInitializing, login, register, logout, updateProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}