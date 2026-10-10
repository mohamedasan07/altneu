import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authorize } from '../middleware/auth.middleware.js';
import { listAllProductsHandler } from '../controllers/product.controller.js';
import categoryRoutes from './category.routes.js';

/**
 * Admin-only API routes (JWT + role protected).
 *
 * Mounted at /api/admin via routes/index.js. Holds the endpoints the public
 * catalog must not expose — currently the full product list including hidden
 * (inactive) products.
 */
const router = Router();

// GET /api/admin/products — all products (active + hidden), admin only.
router.get('/products', authorize('admin'), asyncHandler(listAllProductsHandler));

// /api/admin/categories — category CRUD
router.use('/categories', authorize('admin'), categoryRoutes);

export default router;
