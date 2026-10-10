import { getSupabase } from '../database/client.js';

export async function findAllCategories() {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  const { data, error } = await supabase
    .from('categories')
    .select('*, products(count)')
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });

  if (error) return { ok: false, reason: error.message, code: error.code };

  const mappedData = data.map(cat => {
    const { products, ...rest } = cat;
    return {
      ...rest,
      productCount: products && products.length > 0 ? products[0].count : 0
    };
  });

  return { ok: true, data: mappedData };
}

export async function findActiveCategories() {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  const { data, error } = await supabase
    .from('categories')
    .select('*, products(count)')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });

  if (error) return { ok: false, reason: error.message, code: error.code };

  const mappedData = data.map(cat => {
    const { products, ...rest } = cat;
    return {
      ...rest,
      productCount: products && products.length > 0 ? products[0].count : 0
    };
  });

  return { ok: true, data: mappedData };
}

export async function findCategoryById(id) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('id', Number(id))
    .maybeSingle();

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}

export async function findCategoryBySlug(slug) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}

export async function insertCategory(row) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  const { data, error } = await supabase
    .from('categories')
    .insert(row)
    .select('*')
    .single();

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}

export async function updateCategoryById(id, patch) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  const { data, error } = await supabase
    .from('categories')
    .update(patch)
    .eq('id', Number(id))
    .select('*')
    .maybeSingle();

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, data };
}

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

export async function countProductsByCategoryId(categoryId) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };

  const { count, error } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', Number(categoryId));

  if (error) return { ok: false, reason: error.message, code: error.code };
  return { ok: true, count };
}
