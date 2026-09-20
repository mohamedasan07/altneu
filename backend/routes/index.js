import { Router } from 'express';
import healthRoutes from './health.routes.js';
import productRoutes from './product.routes.js';
import authRoutes from './auth.routes.js';
import adminRoutes from './admin.routes.js';
import uploadRoutes from './upload.routes.js';
import customerAuthRoutes from './customerAuth.routes.js';
import userRoutes from './user.routes.js';
import addressRoutes from './address.routes.js';
import cartRoutes from './cart.routes.js';
import orderRoutes from './order.routes.js';
import adminOrderRoutes from './adminOrder.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import adminCustomerRoutes from './adminCustomer.routes.js';
import wishlistRoutes from './wishlist.routes.js';
import contactRoutes from './contact.routes.js';

/**
 * Aggregates all modular API routers. New route modules register here without
 * touching the bootstrap file.
 */
const apiRouter = Router();

apiRouter.use(healthRoutes);
apiRouter.use('/products', productRoutes);
apiRouter.use('/auth', authRoutes);
apiRouter.use('/admin', adminRoutes);
apiRouter.use('/upload', uploadRoutes);
apiRouter.use('/customer/auth', customerAuthRoutes);
apiRouter.use('/customer', userRoutes);
apiRouter.use('/customer/addresses', addressRoutes);
apiRouter.use('/customer/cart', cartRoutes);
apiRouter.use('/customer/orders', orderRoutes);
apiRouter.use('/admin/orders', adminOrderRoutes);
apiRouter.use('/admin/dashboard', dashboardRoutes);
apiRouter.use('/admin/customers', adminCustomerRoutes);
apiRouter.use('/customer/wishlist', wishlistRoutes);
apiRouter.use('/contact', contactRoutes);

export default apiRouter;