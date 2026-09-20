// Services barrel — replaces the Sprint 1 placeholder stubs.

export { API_BASE, request, resolveUrl, UNAUTHORIZED_EVENT } from './api';
export { fetchProduct, fetchProducts } from './products';
export {
  addCartItem,
  clearGuestSessionId,
  ensureGuestSessionId,
  fetchCart,
  getStoredGuestSessionId,
  mergeCart,
  removeCartItem,
  updateCartItem,
} from './cart';
export { clearStoredWishlist, loadWishlist, saveWishlist } from './wishlistStorage';
export { addWishlistItem, fetchWishlist, removeWishlistItem } from './wishlist';
export { fetchOrder, fetchOrders, placeOrder, cancelOrder } from './orders';
export {
  confirmPasswordReset,
  fetchCurrentCustomer,
  loginCustomer,
  registerCustomer,
  requestPasswordReset,
  updateCustomerProfile,
} from './customerAuth';
export {
  createAddress,
  deleteAddress,
  fetchAddresses,
  updateAddress,
} from './addresses';
export { submitContactMessage } from './contact';