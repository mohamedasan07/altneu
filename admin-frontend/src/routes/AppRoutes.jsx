import { Routes, Route } from 'react-router-dom'
import AdminLayout from '../layouts/AdminLayout'
import ProtectedRoute from '../components/ProtectedRoute'
import SessionLoading from '../components/SessionLoading'
import LoginPage from '../pages/Login/LoginPage'
import ForgotPasswordPage from '../pages/ForgotPassword/ForgotPasswordPage'
import ResetPasswordPage from '../pages/ResetPassword/ResetPasswordPage'
import DashboardPage from '../pages/Dashboard/DashboardPage'
import ProductsPage from '../pages/Products/ProductsPage'
import CategoriesPage from '../pages/Categories/CategoriesPage'
import OrdersPage from '../pages/Orders/OrdersPage'
import CustomersPage from '../pages/Customers/CustomersPage'
import AnalyticsPage from '../pages/Analytics/AnalyticsPage'
import { useAuth } from '../hooks/useAuth'
import { AUTH_STATUS } from '../context/authContext'

function NotFoundPage() {
  return <h1>Page not found</h1>
}

function AppRoutes() {
  const { status } = useAuth()

  // While a stored JWT is being validated against the backend, render NOTHING
  // but a loader — the login page and the protected shell both stay hidden
  // until we know the session is real.
  if (status === AUTH_STATUS.VALIDATING) {
    return <SessionLoading />
  }

  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* All admin pages are wrapped in ProtectedRoute (auth required). */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AdminLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default AppRoutes
