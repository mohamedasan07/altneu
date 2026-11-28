/**
 * Normalize the `/admin/categories` response into a clean array of category
 * objects while preserving existing identifiers and names.
 * Handles direct arrays, `{ categories }` / `{ data }` wrappers, and invalid
 * payloads (null, strings, HTML fallbacks) safely without crashing consumers.
 */
export function normalizeCategoriesResponse(data) {
  const raw = Array.isArray(data)
    ? data
    : Array.isArray(data?.categories)
      ? data.categories
      : Array.isArray(data?.data)
        ? data.data
        : []

  return raw
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      ...item,
      id: item.id ?? null,
      name: typeof item.name === 'string' ? item.name.trim() : String(item.name ?? '').trim(),
    }))
    .filter((item) => item.name.length > 0)
}
