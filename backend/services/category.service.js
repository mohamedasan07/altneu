import { ApiError } from '../utils/apiError.js';
import { logger } from '../utils/logger.js';
import {
  findAllCategories,
  findActiveCategories,
  findCategoryById,
  findCategoryBySlug,
  insertCategory,
  updateCategoryById,
  deleteCategoryById,
  countProductsByCategoryId,
} from '../repositories/category.repository.js';

const SLUG_MAX_LENGTH = 80;
const SLUG_ATTEMPTS = 20;

function safeString(v) { return String(v ?? '').trim(); }
function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function slugify(value) {
  const slug = safeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH);
  return slug || 'category';
}

function toDbError(action, result) {
  logger.error(`[categories] ${action} failed: ${result?.reason || 'unknown error'}`);
  const err = new ApiError(500, `Unable to ${action}. Please try again.`);
  err.detail = result?.reason;
  return err;
}

function normalizeCategory(row) {
  if (!row) return null;
  return {
    id: safeNumber(row.id, 0),
    name: safeString(row.name),
    slug: safeString(row.slug),
    description: safeString(row.description),
    imageUrl: safeString(row.image_url),
    isActive: Boolean(row.is_active),
    sortOrder: safeNumber(row.sort_order, 0),
    productCount: safeNumber(row.productCount, 0),
  };
}

function parseId(id) {
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    throw new ApiError(400, 'Invalid category id');
  }
  return numericId;
}

async function insertWithUniqueSlug(row, baseSlug) {
  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
    const result = await insertCategory({ ...row, slug });
    if (result.ok) return result;
    if (result.code !== '23505') return result; // Not a unique constraint violation
  }
  return { ok: false, reason: 'could not generate a unique slug', code: '23505' };
}

async function updateWithUniqueSlug(id, patch, baseSlug) {
  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
    const result = await updateCategoryById(id, { ...patch, slug });
    if (result.ok) return result;
    if (result.code !== '23505') return result;
  }
  return { ok: false, reason: 'could not generate a unique slug', code: '23505' };
}

export async function listAllCategories() {
  const result = await findAllCategories();
  if (!result.ok) throw toDbError('load categories', result);
  return (result.data || []).map(normalizeCategory);
}

export async function listActiveCategories() {
  const result = await findActiveCategories();
  if (!result.ok) throw toDbError('load active categories', result);
  return (result.data || []).map(normalizeCategory);
}

export async function createCategory(input) {
  const name = safeString(input.name);
  if (!name) throw new ApiError(400, 'Category name is required');

  const row = {
    name,
    description: safeString(input.description) || null,
    image_url: safeString(input.imageUrl) || null,
    is_active: input.isActive ?? true,
    sort_order: safeNumber(input.sortOrder, 0),
  };

  const result = await insertWithUniqueSlug(row, slugify(name));

  if (!result.ok) {
    if (result.code === '23505') {
      throw new ApiError(409, 'A category with this name already exists');
    }
    throw toDbError('create category', result);
  }

  return normalizeCategory(result.data);
}

export async function updateCategory(id, input) {
  const numericId = parseId(id);

  const existing = await findCategoryById(numericId);
  if (!existing.ok) throw toDbError('load category', existing);
  if (!existing.data) throw new ApiError(404, 'Category not found');

  const patch = {};
  if (input.name !== undefined) patch.name = safeString(input.name);
  if (input.description !== undefined) patch.description = safeString(input.description) || null;
  if (input.imageUrl !== undefined) patch.image_url = safeString(input.imageUrl) || null;
  if (input.isActive !== undefined) patch.is_active = Boolean(input.isActive);
  if (input.sortOrder !== undefined) patch.sort_order = safeNumber(input.sortOrder, 0);

  const nameChanged = input.name !== undefined && patch.name !== existing.data.name;

  const result = nameChanged
    ? await updateWithUniqueSlug(numericId, patch, slugify(patch.name))
    : await updateCategoryById(numericId, patch);

  if (!result.ok) {
    if (result.code === '23505') {
      throw new ApiError(409, 'A category with this name already exists');
    }
    throw toDbError('update category', result);
  }

  return normalizeCategory(result.data);
}

export async function deleteCategory(id) {
  const numericId = parseId(id);

  const existing = await findCategoryById(numericId);
  if (!existing.ok) throw toDbError('load category', existing);
  if (!existing.data) throw new ApiError(404, 'Category not found');

  const countRes = await countProductsByCategoryId(numericId);
  if (!countRes.ok) throw toDbError('count products in category', countRes);

  if (countRes.count > 0) {
    throw new ApiError(
      409,
      `Cannot delete category "${existing.data.name}" because it is assigned to ${countRes.count} product(s). Reassign them first.`
    );
  }

  const result = await deleteCategoryById(numericId);
  if (!result.ok) throw toDbError('delete category', result);

  return true;
}
