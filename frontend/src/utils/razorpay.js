/**
 * ALTNEU — Razorpay Checkout Script Loader (Phase 4 Storefront Integration)
 *
 * Dynamically loads the official Razorpay Checkout SDK (v1/checkout.js).
 * Enforces:
 * - Singleton load promise: deduplicates concurrent or repeated load invocations.
 * - Cache guard: reuses window.Razorpay if already loaded.
 * - DOM inspection: reuses existing script tag if one is already attached to DOM.
 * - SSR safety: safely resolves false when window is undefined.
 * - Error isolation: resolves false without crashing or throwing, permitting user-friendly retry states.
 */

const RAZORPAY_CHECKOUT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

let scriptPromise = null;

/**
 * Load the Razorpay Checkout script asynchronously.
 * @returns {Promise<boolean>} resolves true if Razorpay is available, false if loading failed.
 */
export function loadRazorpayScript() {
  if (typeof window === 'undefined') {
    return Promise.resolve(false);
  }

  // Already initialized on window
  if (typeof window.Razorpay === 'function') {
    return Promise.resolve(true);
  }

  // Existing in-flight load request
  if (scriptPromise) {
    return scriptPromise;
  }

  scriptPromise = new Promise((resolve) => {
    // Check if script tag was injected externally or in a previous run
    const existing = document.querySelector(`script[src="${RAZORPAY_CHECKOUT_URL}"]`);
    if (existing) {
      if (typeof window.Razorpay === 'function') {
        resolve(true);
        return;
      }
      existing.addEventListener('load', () => resolve(true), { once: true });
      existing.addEventListener('error', () => {
        scriptPromise = null;
        resolve(false);
      }, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = RAZORPAY_CHECKOUT_URL;
    script.async = true;

    script.onload = () => {
      resolve(typeof window.Razorpay === 'function');
    };

    script.onerror = () => {
      // Clear in-flight promise to allow retry on network/ad-block recovery
      scriptPromise = null;
      resolve(false);
    };

    document.body.appendChild(script);
  });

  return scriptPromise;
}

/**
 * Reset script loader cache (primarily for isolated test environments).
 */
export function resetRazorpayScriptCache() {
  scriptPromise = null;
}
