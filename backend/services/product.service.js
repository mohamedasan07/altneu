import { ApiError } from '../utils/apiError.js';
import { logger } from '../utils/logger.js';
import {
  findAllProducts,
  findProductById,
  insertProduct,
  updateProductById,
  deleteProductById,
  findCategoryBySlug,
  insertCategory,
  deleteCategoryById,
} from '../repositories/product.repository.js';
import { deleteImage } from './upload.service.js';

/**
 * Product domain service — full CRUD backed exclusively by Supabase.
 *
 * Responsible for all product business logic: row → API mapping, slug
 * generation/uniqueness, category resolution (name → FK), and translating
 * repository results into typed ApiErrors (400/404/409/500). Controllers stay
 * thin and never touch the database.
 *
 * Public API shape (unchanged so both frontends keep working):
 *   { id, name, description, category, price, oldPrice, imageUrl,
 *     stockQuantity, sale, is_active }
 */

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
  return slug || 'product';
}

/**
 * Map a Supabase products row to the public API product shape.
 * Accepts either the embedded object form `{ name: 'shirts' }` (from the
 * PostgREST join) or a plain string, mirroring the legacy `category` field.
 */
function normalizeProduct(row) {
  if (!row) return null;

  const category =
    row.category && typeof row.category === 'object' ? row.category?.name : row.category;

  return {
    id: safeNumber(row.id, 0),
    name: safeString(row.name),
    slug: safeString(row.slug),
    description: safeString(row.description),
    category: safeString(category),
    price: safeNumber(row.price, 0),
    oldPrice: safeNumber(row.old_price, 0),
    imageUrl: safeString(row.image_url || row.image),
    imageGallery: Array.isArray(row.image_gallery) ? row.image_gallery : [],
    imageMetadata: Array.isArray(row.image_metadata) ? row.image_metadata : [],
    sizes: Array.isArray(row.sizes) ? row.sizes : [],
    stockQuantity: safeNumber(row.stock_quantity, 0),
    sale: Boolean(row.is_sale),
    isNew: Boolean(row.is_new),
    rating: safeNumber(row.rating, 0),
    ratingCount: safeNumber(row.rating_count, 0),
    createdAt: row.created_at || null,
    is_active: Boolean(row.is_active),
  };
}

/** Validate an id param before it reaches the database. */
function parseId(id) {
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    throw new ApiError(400, 'Invalid product id');
  }
  return numericId;
}

/** Build a consistent 500 for failed database operations. */
function toDbError(action, result) {
  logger.error(`[products] ${action} failed: ${result?.reason || 'unknown error'}`);
  const err = new ApiError(500, `Unable to ${action}. Please try again.`);
  err.detail = result?.reason;
  return err;
}

/**
 * Resolve a category name/slug to its id, creating the category row when it
 * does not exist yet (mirrors the behaviour of the seed script).
 *
 * @returns {Promise<{ id: number, created: boolean }>}
 */
async function resolveCategoryId(categoryName) {
  const slug = slugify(categoryName);
  const existing = await findCategoryBySlug(slug);
  if (!existing.ok) throw toDbError('resolve category', existing);
  if (existing.data) return { id: existing.data.id, created: false };

  const inserted = await insertCategory({
    name: safeString(categoryName) || slug,
    slug,
  });

  if (inserted.ok) return { id: inserted.data.id, created: true };

  // Unique-violation race (another request created the row concurrently).
  if (inserted.code === '23505') {
    const again = await findCategoryBySlug(slug);
    if (!again.ok) throw toDbError('resolve category', again);
    if (again.data) return { id: again.data.id, created: false };
  }

  throw toDbError('create category', inserted);
}

/**
 * Insert a product, retrying with a numeric suffix when the slug collides
 * (unique constraint on products.slug). Mirrors the seed script's dedup.
 */
async function insertWithUniqueSlug(row, baseSlug) {
  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
    const result = await insertProduct({ ...row, slug });
    if (result.ok) return result;
    if (result.code !== '23505') return result;
  }
  return { ok: false, reason: 'could not generate a unique slug', code: '23505' };
}

/** Update a product, retrying the new slug on collision like the create path. */
async function updateWithUniqueSlug(id, patch, baseSlug) {
  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
    const result = await updateProductById(id, { ...patch, slug });
    if (result.ok) return result;
    if (result.code !== '23505') return result;
  }
  return { ok: false, reason: 'could not generate a unique slug', code: '23505' };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * GET /api/products — customer catalog: ACTIVE products only.
 * Hidden products (is_active = false) are never exposed to customers.
 */
export async function listProducts() {
  const result = await findAllProducts({ activeOnly: true });
  if (!result.ok) throw toDbError('load products', result);
  return (result.data || []).map(normalizeProduct);
}

/**
 * GET /api/admin/products — ALL products (active + hidden). JWT-protected,
 * intended for the admin product management interface.
 */
export async function listAllProducts() {
  const result = await findAllProducts({ activeOnly: false });
  if (!result.ok) throw toDbError('load products', result);
  return (result.data || []).map(normalizeProduct);
}

/**
 * Load a raw product row regardless of active status.
 * Internal — used for admin update/delete existence checks.
 */
async function loadProductRow(id) {
  const numericId = parseId(id);
  const result = await findProductById(numericId);
  if (!result.ok) throw toDbError('load product', result);
  return result.data || null;
}

/**
 * GET /api/products/:id — single public product.
 * Returns null when not found OR when the product is hidden, so customers
 * can never reach an inactive product by id.
 */
export async function getProduct(id) {
  const row = await loadProductRow(id);
  if (!row || !row.is_active) return null;
  return normalizeProduct(row);
}

/** POST /api/products — create a product (category + product write). */
export async function createProduct(input) {
  const category = await resolveCategoryId(input.category);

  const row = {
    category_id: category.id,
    name: input.name,
    description: input.description ?? null,
    price: input.price,
    old_price: input.oldPrice ?? null,
    image_url: input.imageUrl,
    image_gallery: input.imageGallery ?? [],
    image_metadata: input.imageMetadata ?? [],
    sizes: input.sizes ?? [],
    stock_quantity: input.stockQuantity,
    is_sale: input.sale ?? false,
    is_new: input.isNew ?? false,
    is_active: input.isActive ?? true,
  };

  const result = await insertWithUniqueSlug(row, slugify(input.name));

  if (!result.ok) {
    // Rollback compensation: remove the category we just created so a failed
    // product insert does not leave an orphan row behind.
    if (category.created) {
      const cleanup = await deleteCategoryById(category.id);
      if (!cleanup.ok) {
        logger.warn(`[products] rollback of category ${category.id} failed: ${cleanup.reason}`);
      }
    }
    if (result.code === '23505') {
      throw new ApiError(409, 'A product with this name already exists');
    }
    throw toDbError('create product', result);
  }

  return normalizeProduct(result.data);
}

/** PUT /api/products/:id — partial update. */
export async function updateProduct(id, input) {
  const numericId = parseId(id);

  const existing = await loadProductRow(numericId);
  if (!existing) throw new ApiError(404, 'Product not found');

  const patch = {};

  let createdCategory = null;
  if (input.category !== undefined) {
    const category = await resolveCategoryId(input.category);
    patch.category_id = category.id;
    if (category.created) createdCategory = category.id;
  }
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description ?? null;
  if (input.price !== undefined) patch.price = input.price;
  if (input.oldPrice !== undefined) patch.old_price = input.oldPrice ?? null;

  const nextPrice = input.price !== undefined ? input.price : safeNumber(existing.price, 0);
  const nextOldPrice = input.oldPrice !== undefined
    ? input.oldPrice
    : (existing.old_price != null && Number(existing.old_price) > 0 ? Number(existing.old_price) : null);

  if ((input.price !== undefined || input.oldPrice !== undefined) && nextOldPrice != null) {
    if (nextOldPrice <= nextPrice) {
      throw new ApiError(400, 'Original price must be greater than current price');
    }
  }
  if (input.imageUrl !== undefined) patch.image_url = input.imageUrl;
  if (input.imageGallery !== undefined) patch.image_gallery = input.imageGallery;
  if (input.imageMetadata !== undefined) {
    patch.image_metadata = input.imageMetadata;
    const existingMetadata = Array.isArray(existing.image_metadata) ? existing.image_metadata : [];
    const newMetadata = Array.isArray(input.imageMetadata) ? input.imageMetadata : [];
    const newPublicIds = new Set(newMetadata.map(img => img.publicId).filter(Boolean));
    for (const oldImg of existingMetadata) {
      if (oldImg.publicId && !newPublicIds.has(oldImg.publicId)) {
        // Do not await here if we want to fire-and-forget, but awaiting ensures consistency
        deleteImage(oldImg.publicId).catch(err => logger.error('[products] deleteImage error', err));
      }
    }
  }
  if (input.sizes !== undefined) patch.sizes = input.sizes;
  if (input.stockQuantity !== undefined) patch.stock_quantity = input.stockQuantity;
  if (input.sale !== undefined) patch.is_sale = input.sale;
  if (input.isNew !== undefined) patch.is_new = Boolean(input.isNew);
  if (input.isActive !== undefined) patch.is_active = input.isActive;

  // When the name changes the slug must follow, staying unique.
  const result = input.name !== undefined
    ? await updateWithUniqueSlug(numericId, patch, slugify(input.name))
    : await updateProductById(numericId, patch);

  if (!result.ok) {
    // Rollback compensation: remove a category we just created so a failed
    // update does not leave an orphan row behind.
    if (createdCategory) {
      const cleanup = await deleteCategoryById(createdCategory);
      if (!cleanup.ok) {
        logger.warn(`[products] rollback of category ${createdCategory} failed: ${cleanup.reason}`);
      }
    }
    if (result.code === '23505') {
      throw new ApiError(409, 'A product with this name already exists');
    }
    throw toDbError('update product', result);
  }

  return normalizeProduct(result.data);
}

/** DELETE /api/products/:id — remove a product. */
export async function deleteProduct(id) {
  const numericId = parseId(id);

  const existing = await loadProductRow(numericId);
  if (!existing) throw new ApiError(404, 'Product not found');

  const result = await deleteProductById(numericId);
  if (!result.ok) throw toDbError('delete product', result);

  const existingMetadata = Array.isArray(existing.image_metadata) ? existing.image_metadata : [];
  for (const oldImg of existingMetadata) {
    if (oldImg.publicId) {
      deleteImage(oldImg.publicId).catch(err => logger.error('[products] deleteImage error', err));
    }
  }

  return true;
}
