import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  listCategoriesHandler,
  createCategoryHandler,
  updateCategoryHandler,
  deleteCategoryHandler,
} from '../controllers/category.controller.js';

const router = Router();

router.get('/', asyncHandler(listCategoriesHandler));
router.post('/', asyncHandler(createCategoryHandler));
router.put('/:id', asyncHandler(updateCategoryHandler));
router.delete('/:id', asyncHandler(deleteCategoryHandler));

export default router;
