import {
  listAllCategories,
  listActiveCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../services/category.service.js';

export async function listCategoriesHandler(_req, res) {
  const categories = await listAllCategories();
  res.json(categories);
}

export async function listActiveCategoriesHandler(_req, res) {
  const categories = await listActiveCategories();
  // Filter for public fields needed by storefront
  const publicCategories = categories.map(cat => ({
    id: cat.id,
    name: cat.name,
    slug: cat.slug,
    sortOrder: cat.sortOrder,
    productCount: cat.productCount,
    isActive: cat.isActive, // technically redundant since they are active
  }));
  res.json(publicCategories);
}

export async function createCategoryHandler(req, res) {
  const category = await createCategory(req.body);
  res.status(201).json({ ok: true, category });
}

export async function updateCategoryHandler(req, res) {
  const category = await updateCategory(req.params.id, req.body);
  res.json({ ok: true, category });
}

export async function deleteCategoryHandler(req, res) {
  await deleteCategory(req.params.id);
  res.json({ ok: true });
}
