import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { resolveUrl } from '../services/api';
import { useAuth } from './AuthContext';
import {
  addCartItem,
  clearGuestSessionId,
  ensureGuestSessionId,
  fetchCart,
  getStoredGuestSessionId,
  mergeCart,
  removeCartItem,
  updateCartItem,
} from '../services/cart';
import {
  cartTotals,
  colorNameFor,
  DEFAULT_COLOR,
  DEFAULT_SIZE,
  MAX_ITEM_QTY,
} from '../utils/cartConfig';
import { getStockInfo } from '../utils/stock';

const CartContext = createContext(null);

const clampQty = (qty, stock) => {
  const desired = Number.isFinite(qty) ? Math.max(1, Math.floor(qty)) : 1;
  const cap = Math.max(1, Math.min(MAX_ITEM_QTY, Number(stock) || MAX_ITEM_QTY));
  return Math.min(cap, desired);
};

/** Error message extraction — the API client throws Error with .message. */
const errorMessage = (err) =>
  err?.message || 'Something went wrong. Please try again.';

/** Map a server cart line to the frontend line shape consumers expect. */
function normalizeLine(line) {
  if (!line) return null;
  return {
    id: line.id,
    productId: line.productId,
    name: line.name || 'Untitled',
    category: '',
    price: Number(line.price) || 0,
    oldPrice: Number(line.oldPrice) || 0,
    size: line.size || '',
    color: line.color || '',
    colorName: line.colorName || line.color || '',
    imageUrl: resolveUrl(line.imageUrl),
    stockQuantity: Number(line.stockQuantity) || 0,
    quantity: Number(line.quantity) || 0,
  };
}

/**
 * Cart provider (Sprint 21.3 Phase 2) — now backed by the backend cart API.
 *
 * The public API is intentionally identical to the previous localStorage
 * implementation so every consumer (CartDrawer, CartPage, ProductPage,
 * ProductCard, WishlistGrid, Navbar CartButton, useCheckout) works without
 * change:
 *   { items, count, totals, isOpen, addToCart, removeFromCart,
 *     increaseQuantity, decreaseQuantity, clearCart,
 *     openCart, closeCart, toggleCart }
 * plus additive extras for loading/error handling: isLoading, error, retry.
 *
 * Identity: authenticated requests act on the customer cart (the shared API
 * client attaches the JWT); guests act on a persistent session cart keyed by a
 * stored sessionId. On login the guest cart is merged into the customer cart
 * and the guest session is cleared.
 */
export function CartProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [items, setItems] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const counterRef = useRef(0);
  const queueRef = useRef(Promise.resolve());

  /** Serialize server applies so responses never race each other. */
  const enqueue = useCallback((task) => {
    const run = queueRef.current.then(task, task);
    queueRef.current = run.catch(() => {});
    return run;
  }, []);

  /** Which cart this request should hit: null (JWT) or a guest sessionId. */
  const getSessionId = useCallback(() => (isAuthenticated ? null : ensureGuestSessionId()), [isAuthenticated]);

  /** Apply an authoritative server cart to local state. */
  const applyCart = useCallback((cart) => {
    setItems((cart?.items || []).map(normalizeLine).filter(Boolean));
  }, []);

  /** Re-fetch the current cart (reconcile after a failed mutation). */
  const reconcile = useCallback(async () => {
    const sessionId = getSessionId();
    const cart = await fetchCart(sessionId);
    applyCart(cart);
  }, [getSessionId, applyCart]);

  /**
   * Load the correct cart on mount and re-sync whenever auth changes.
   * guest→customer transition merges the guest cart first; logout returns to
   * a fresh guest session (empty cart).
   */
  useEffect(() => {
    let cancelled = false;
    async function sync() {
      setIsLoading(true);
      try {
        if (isAuthenticated) {
          // Login transition: fold the stored guest cart into the customer
          // cart before loading, so nothing is lost.
          const guestSession = getStoredGuestSessionId();
          if (guestSession) {
            try {
              const cart = await mergeCart({ sessionId: guestSession });
              clearGuestSessionId();
              if (!cancelled) applyCart(cart);
            } catch {
              /* merge failed — still load the customer cart below */
            }
          }
          if (!cancelled) {
            const cart = await fetchCart(null);
            applyCart(cart);
          }
        } else {
          const sessionId = ensureGuestSessionId();
          const cart = await fetchCart(sessionId);
          if (!cancelled) applyCart(cart);
        }
        if (!cancelled) setError(null);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    sync();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, applyCart]);

  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);
  const toggleCart = useCallback(() => setIsOpen((v) => !v), []);

  const retry = useCallback(() => {
    setError(null);
    const sync = async () => {
      try {
        await reconcile();
      } catch (err) {
        setError(errorMessage(err));
      }
    };
    enqueue(sync);
  }, [enqueue, reconcile]);

  const addToCart = useCallback(
    (product, options = {}) => {
      const productId = product?.id;
      const price = Number(product?.price);
      if (productId === undefined || !Number.isFinite(price) || price <= 0) return;

      // Never add a sold-out/unavailable product, whatever entry point called
      // this. Buttons are disabled in the UI; this guard is the last line of
      // defence before the optimistic update and the server round-trip.
      if (getStockInfo(product).outOfStock) return;

      const size = options.size ?? DEFAULT_SIZE;
      const color = options.color ?? DEFAULT_COLOR;
      const colorName = options.colorName ?? colorNameFor(color);
      const quantity = clampQty(options.quantity, product.stockQuantity);

      // Optimistic UI: the drawer opens instantly; the server response below
      // reconciles ids/quantities to the authoritative cart.
      setItems((prev) => {
        const existing = prev.find(
          (item) => item.productId === productId && item.size === size && item.color === color
        );
        if (existing) {
          return prev.map((item) =>
            item.productId === productId && item.size === size && item.color === color
              ? { ...item, quantity: clampQty(item.quantity + quantity, item.stockQuantity) }
              : item
          );
        }
        counterRef.current += 1;
        return [
          ...prev,
          {
            id: `pending-${counterRef.current}`,
            productId,
            name: product.name || 'Untitled',
            category: product.category || '',
            price,
            oldPrice: Number(product.oldPrice) || 0,
            size,
            color,
            colorName,
            imageUrl: resolveUrl(product.imageUrl),
            stockQuantity: Number(product.stockQuantity) || 0,
            quantity,
          },
        ];
      });
      setIsOpen(true);

      enqueue(async () => {
        try {
          const cart = await addCartItem({
            sessionId: getSessionId(),
            productId,
            size,
            color,
            colorName,
            quantity,
          });
          applyCart(cart);
          setError(null);
        } catch (err) {
          setError(errorMessage(err));
          try {
            await reconcile();
          } catch {
            /* keep optimistic state if reconcile also fails */
          }
        }
      });
    },
    [enqueue, getSessionId, applyCart, reconcile]
  );

  const removeFromCart = useCallback(
    (id) => {
      const line = itemsRef.current.find((item) => item.id === id);
      if (!line) return;

      setItems((prev) => prev.filter((item) => item.id !== id));

      // Pending optimistic lines have no server id yet — skip the call; the
      // add's response supersedes them.
      if (String(id).startsWith('pending-')) return;

      enqueue(async () => {
        try {
          const cart = await removeCartItem({ sessionId: getSessionId(), itemId: id });
          applyCart(cart);
          setError(null);
        } catch (err) {
          setError(errorMessage(err));
          try {
            await reconcile();
          } catch {
            /* keep optimistic state if reconcile also fails */
          }
        }
      });
    },
    [enqueue, getSessionId, applyCart, reconcile]
  );

  const increaseQuantity = useCallback(
    (id) => {
      const line = itemsRef.current.find((item) => item.id === id);
      if (!line) return;
      const nextQty = clampQty(line.quantity + 1, line.stockQuantity);
      if (nextQty === line.quantity) return;

      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, quantity: nextQty } : item)));
      if (String(id).startsWith('pending-')) return;

      enqueue(async () => {
        try {
          const cart = await updateCartItem({ sessionId: getSessionId(), itemId: id, quantity: nextQty });
          applyCart(cart);
          setError(null);
        } catch (err) {
          setError(errorMessage(err));
          try {
            await reconcile();
          } catch {
            /* keep optimistic state if reconcile also fails */
          }
        }
      });
    },
    [enqueue, getSessionId, applyCart, reconcile]
  );

  const decreaseQuantity = useCallback(
    (id) => {
      const line = itemsRef.current.find((item) => item.id === id);
      if (!line) return;
      const nextQty = Math.max(1, line.quantity - 1);
      if (nextQty === line.quantity) return;

      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, quantity: nextQty } : item)));
      if (String(id).startsWith('pending-')) return;

      enqueue(async () => {
        try {
          const cart = await updateCartItem({ sessionId: getSessionId(), itemId: id, quantity: nextQty });
          applyCart(cart);
          setError(null);
        } catch (err) {
          setError(errorMessage(err));
          try {
            await reconcile();
          } catch {
            /* keep optimistic state if reconcile also fails */
          }
        }
      });
    },
    [enqueue, getSessionId, applyCart, reconcile]
  );

  const clearCart = useCallback(() => {
    const current = itemsRef.current;
    const serverLines = current.filter((item) => !String(item.id).startsWith('pending-'));
    setItems([]);
    if (serverLines.length === 0) return;

    enqueue(async () => {
      try {
        await Promise.all(
          serverLines.map((item) =>
            removeCartItem({ sessionId: getSessionId(), itemId: item.id }).catch(() => null)
          )
        );
        setError(null);
      } catch (err) {
        setError(errorMessage(err));
        try {
          await reconcile();
        } catch {
          /* keep empty state if reconcile also fails */
        }
      }
    });
  }, [enqueue, getSessionId, reconcile]);

  const totals = useMemo(() => cartTotals(items), [items]);

  const value = useMemo(
    () => ({
      items,
      count: totals.count,
      totals,
      isOpen,
      isLoading,
      error,
      addToCart,
      removeFromCart,
      increaseQuantity,
      decreaseQuantity,
      clearCart,
      openCart,
      closeCart,
      toggleCart,
      retry,
    }),
    [items, totals, isOpen, isLoading, error, addToCart, removeFromCart, increaseQuantity, decreaseQuantity, clearCart, openCart, closeCart, toggleCart, retry]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within a CartProvider');
  return ctx;
}