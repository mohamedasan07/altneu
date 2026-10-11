import { getSupabase } from '../database/client.js';

/**
 * Product data access — all reads AND writes go to Supabase (PostgreSQL).
 *
 * The service-role key is used (bypasses RLS), the same client as the rest of
 * the Sprint 13A foundation. Every method returns the shared result envelope:
 *   { ok: true,  data, [count] }
 *   { ok: false, reason, [code] }
 * so callers never touch Supabase error objects directly. `code` carries the
 * Postgres error code (e.g. '23505' unique violation) for 409 mapping.
 */

// `category:categories ( id, name, slug )` returns the joined category object
// (not the raw category_id), keeping the public API shape (`category: "shirts"`).
const PRODUCT_COLUMNS = `
  id,
  name,
  slug,
  description,
  price,
  old_price,
  image_url,
  image_gallery,
  image_metadata,
  sizes,
  stock_quantity,
  is_sale,
  is_new,
  is_active,
  rating,
  rating_count,
  created_at,
  updated_at,
  category:categories ( id, name, slug )
`;

/**
 * @param {{ activeOnly?: boolean }} options — activeOnly=true filters to
 *   `is_active = true` (customer catalog). Defaults to returning all rows.
 * @returns {Promise<{ok: boolean, data?: Array, reason?: string}>}
 */
export async function findAllProducts({ activeOnly = false } = {}) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  let query = supabase
    .from('products')
    .select(PRODUCT_COLUMNS)
    .order('id', { ascending: true });

  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}

/**
 * @param {number|string} id
 * @returns {Promise<{ok: boolean, data?: object|null, reason?: string}>}
 */
export async function findProductById(id) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  const numericId = Number(id);
  if (!Number.isFinite(numericId)) return { ok: true, data: null };

  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_COLUMNS)
    .eq('id', numericId)
    .maybeSingle();

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}

/**
 * @param {object} row  DB-ready product row (already resolved against categories)
 * @returns {Promise<{ok: boolean, data?: object|null, reason?: string, code?: string}>}
 */
export async function insertProduct(row) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  const { data, error } = await supabase
    .from('products')
    .insert(row)
    .select(PRODUCT_COLUMNS)
    .single();

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}

/**
 * @param {number|string} id
 * @param {object} patch  partial DB row (camelCase untouched; keys map 1:1)
 * @returns {Promise<{ok: boolean, data?: object|null, reason?: string, code?: string}>}
 */
export async function updateProductById(id, patch) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  const { data, error } = await supabase
    .from('products')
    .update(patch)
    .eq('id', Number(id))
    .select(PRODUCT_COLUMNS)
    .maybeSingle();

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}

/**
 * @param {number|string} id
 * @returns {Promise<{ok: boolean, data?: Array, reason?: string, code?: string}>}
 */
export async function deleteProductById(id) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  const { data, error } = await supabase
    .from('products')
    .delete()
    .eq('id', Number(id))
    .select('id');

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}

// ============================================================================
// Categories (used to resolve/normalize the `category` slug -> category_id FK)
// ============================================================================

/**
 * @param {string} slug
 * @returns {Promise<{ok: boolean, data?: object|null, reason?: string, code?: string}>}
 */
export async function findCategoryBySlug(slug) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  const { data, error } = await supabase
    .from('categories')
    .select('id, slug')
    .eq('slug', slug)
    .maybeSingle();

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}

/**
 * @param {{ name: string, slug: string }} row
 * @returns {Promise<{ok: boolean, data?: object|null, reason?: string, code?: string}>}
 */
export async function insertCategory(row) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  const { data, error } = await supabase
    .from('categories')
    .insert({ name: row.name, slug: row.slug, is_active: true })
    .select('id, slug')
    .single();

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}

/**
 * @param {number|string} id
 * @returns {Promise<{ok: boolean, data?: object|null, reason?: string, code?: string}>}
 */
export async function deleteCategoryById(id) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  const { data, error } = await supabase
    .from('categories')
    .delete()
    .eq('id', Number(id))
    .select('id');

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}
