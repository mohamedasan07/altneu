import { Suspense, lazy } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import MainLayout from '../layouts/MainLayout/MainLayout';
import DashboardLayout from '../layouts/DashboardLayout/DashboardLayout';
import Loader from '../components/ui/Loader/Loader';
import ProtectedRoute from '../components/auth/ProtectedRoute/ProtectedRoute';

// Code-split pages: each is its own chunk, loaded on first visit.
const HomePage = lazy(() => import('../pages/HomePage/HomePage'));
const CollectionsPage = lazy(() => import('../pages/CollectionsPage/CollectionsPage'));
const ProductPage = lazy(() => import('../pages/ProductPage/ProductPage'));
const WishlistPage = lazy(() => import('../pages/WishlistPage/WishlistPage'));
const CartPage = lazy(() => import('../pages/CartPage/CartPage'));
const CheckoutPage = lazy(() => import('../pages/CheckoutPage/CheckoutPage'));
const OrderSuccessPage = lazy(() => import('../pages/OrderSuccessPage/OrderSuccessPage'));
const LoginPage = lazy(() => import('../pages/LoginPage/LoginPage'));
const RegisterPage = lazy(() => import('../pages/RegisterPage/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('../pages/ForgotPasswordPage/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('../pages/ResetPasswordPage/ResetPasswordPage'));
const DashboardPage = lazy(() => import('../pages/DashboardPage/DashboardPage'));
const OrdersPage = lazy(() => import('../pages/OrdersPage/OrdersPage'));
const AddressesPage = lazy(() => import('../pages/AddressesPage/AddressesPage'));
const SettingsPage = lazy(() => import('../pages/SettingsPage/SettingsPage'));
const ProfilePage = lazy(() => import('../pages/ProfilePage/ProfilePage'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage/NotFoundPage'));
const AboutPage = lazy(() => import('../pages/AboutPage/AboutPage'));
const ContactPage = lazy(() => import('../pages/ContactPage/ContactPage'));
const TermsPage = lazy(() => import('../pages/TermsPage/TermsPage'));
const ShippingPage = lazy(() => import('../pages/ShippingPage/ShippingPage'));

const TRANSITION = { duration: 0.3, ease: [0.22, 1, 0.36, 1] };

export default function AppRouter() {
  const location = useLocation();

  return (
    <Suspense fallback={<Loader fullscreen label="Loading page" />}>
      {/* Keyed by pathname so each navigation replays the entry transition */}
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={TRANSITION}
        style={{ display: 'flex', flexDirection: 'column', flex: 1 }}
      >
        <Routes location={location}>
          {/* Standalone checkout route to avoid storefront layout */}
          <Route path="checkout" element={<CheckoutPage />} />

          <Route element={<MainLayout />}>
            <Route index element={<HomePage />} />
            <Route path="about" element={<AboutPage />} />
            <Route path="contact" element={<ContactPage />} />
            <Route path="terms" element={<TermsPage />} />
            <Route path="shipping" element={<ShippingPage />} />
            <Route path="collections" element={<CollectionsPage />} />
            <Route path="collections/:categoryId" element={<CollectionsPage />} />
            <Route path="product/:productId" element={<ProductPage />} />
            <Route path="wishlist" element={<WishlistPage />} />
            <Route path="cart" element={<CartPage />} />
            <Route path="checkout/success" element={<OrderSuccessPage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="register" element={<RegisterPage />} />
            <Route path="forgot-password" element={<ForgotPasswordPage />} />
            <Route path="reset-password" element={<ResetPasswordPage />} />
          </Route>

          {/* Authenticated account dashboard — replaces the storefront chrome */}
          <Route element={<ProtectedRoute />}>
            <Route path="account" element={<DashboardLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="orders" element={<OrdersPage />} />
              <Route path="wishlist" element={<WishlistPage />} />
              <Route path="addresses" element={<AddressesPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </motion.div>
    </Suspense>
  );
}
