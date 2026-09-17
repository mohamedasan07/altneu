import { useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'name-asc', label: 'Name A–Z' },
  { value: 'name-desc', label: 'Name Z–A' },
  { value: 'bestsellers', label: 'Best Selling' },
];

const DEFAULT_SORT = 'newest';
const PARSE_INT = (value) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const buildSearchParams = (sp, patch, { clear = [] } = {}) => {
  const next = new URLSearchParams(sp);
  clear.forEach((key) => next.delete(key));
  Object.entries(patch).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '' || value === false) {
      next.delete(key);
    } else {
      next.set(key, String(value));
    }
  });
  return next;
};

/**
 * URL-synchronized product discovery state for the collections page.
 *
 * Single source of truth is the URL search params, so refreshing the page
 * (or sharing the link) preserves the exact filter set:
 *   ?category=tshirts&sale=true&price=500-2000&instock=true&sort=price-asc&q=tee
 *
 * Also derives: filtered+sorted product list, category counts, price bounds.
 */
export default function useFilters({ products = [], categoryId = null, priceStep = 50 }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const read = useMemo(() => {
    const priceRaw = searchParams.get('price');
    const [minRaw, maxRaw] = priceRaw ? priceRaw.split('-') : [];

    const priceMin = PARSE_INT(minRaw);
    const priceMax = PARSE_INT(maxRaw);
    const hasPrice =
      priceMin !== null || priceMax !== null;

    return {
      q: (searchParams.get('q') || '').trim(),
      category: categoryId || searchParams.get('category') || 'all',
      price: {
        min: hasPrice ? priceMin : null,
        max: hasPrice ? priceMax : null,
      },
      sale: searchParams.get('sale') === 'true',
      instock: searchParams.get('instock'), // null | 'true' | 'false'
      sort: SORT_OPTIONS.some((o) => o.value === searchParams.get('sort'))
        ? searchParams.get('sort')
        : DEFAULT_SORT,
    };
  }, [searchParams, categoryId]);

  // ---- Price bounds derived from the catalog ----
  const bounds = useMemo(() => {
    const prices = products.map((p) => Number(p.price) || 0).filter((n) => n > 0);
    if (!prices.length) return { min: 0, max: 1000 };
    const rawMin = Math.floor(Math.min(...prices) / priceStep) * priceStep;
    const rawMax = Math.ceil(Math.max(...prices) / priceStep) * priceStep;
    return { min: rawMin, max: Math.max(rawMax, rawMin + priceStep) };
  }, [products, priceStep]);

  const categories = useMemo(() => {
    const map = new Map();
    products.forEach((p) => {
      const key = String(p.category || '').toLowerCase().trim();
      if (!key) return;
      map.set(key, (map.get(key) || 0) + 1);
    });

    const desiredOrder = ['tshirts', 'shirts', 'jerseys', 'baggy'];

    const orderedCategories = [];
    const usedKeys = new Set();

    desiredOrder.forEach((desired) => {
      const foundKey = Array.from(map.keys()).find(
        (k) => k === desired || k === desired.replace(/s$/, '') || k + 's' === desired
      );

      if (foundKey && !usedKeys.has(foundKey)) {
        usedKeys.add(foundKey);
        const label = foundKey.charAt(0).toUpperCase() + foundKey.slice(1);
        orderedCategories.push({ id: foundKey, label, count: map.get(foundKey) });
      }
    });

    const otherCategories = [];
    for (const [id, count] of map.entries()) {
      if (!usedKeys.has(id) && !id.includes('accessor')) {
        const label = id.charAt(0).toUpperCase() + id.slice(1);
        otherCategories.push({ id, label, count });
      }
    }

    return [
      { id: 'all', label: 'All', count: products.length },
      ...orderedCategories,
      ...otherCategories
    ];
  }, [products]);

  const hasFilters =
    read.category !== 'all' ||
    read.q.length > 0 ||
    read.sale ||
    read.instock !== null ||
    (read.price.min !== null && read.price.max !== null);

  // ---- Write helpers (all URL-synced) ----
  const setFilter = useCallback(
    (patch, { clear = [], toCollections = false } = {}) => {
      const next = buildSearchParams(searchParams, patch, { clear });
      const queryString = next.toString();
      const target = queryString ? `/collections?${queryString}` : '/collections';
      if (toCollections) {
        navigate(target, { replace: true });
      } else {
        setSearchParams(next, { replace: true });
      }
    },
    [searchParams, navigate, setSearchParams]
  );

  const setCategory = useCallback(
    (category) => {
      setFilter(
        category === 'all' ? {} : { category },
        { clear: ['category'], toCollections: true }
      );
    },
    [setFilter]
  );

  const setSort = useCallback(
    (sort) => setFilter(sort === DEFAULT_SORT ? {} : { sort }, { clear: ['sort'] }),
    [setFilter]
  );

  const setSale = useCallback(
    (sale) => setFilter({ sale }, { clear: ['sale'] }),
    [setFilter]
  );

  const setInstock = useCallback(
    (instock) => setFilter(instock === null ? {} : { instock }, { clear: ['instock'] }),
    [setFilter]
  );

  const setPriceRange = useCallback(
    (min, max) => {
      const atBounds = min === bounds.min && max === bounds.max;
      setFilter(atBounds ? {} : { price: `${min}-${max}` }, { clear: ['price'] });
    },
    [setFilter, bounds]
  );

  const setQuery = useCallback(
    (q) => setFilter(q ? { q } : {}, { clear: ['q'] }),
    [setFilter]
  );

  const clearAll = useCallback(() => {
    navigate('/collections', { replace: true });
  }, [navigate]);

  // ---- Filtering + sorting pipeline ----
  const visible = useMemo(() => {
    let list = products;

    if (read.category !== 'all') {
      const target = read.category.toLowerCase();
      list = list.filter((p) => String(p.category || '').toLowerCase().trim() === target);
    }

    if (read.q) {
      const term = read.q.toLowerCase();
      list = list.filter((p) =>
        [p.name, p.category, p.description].some((f) =>
          String(f || '').toLowerCase().includes(term)
        )
      );
    }

    if (read.sale) {
      list = list.filter((p) => Boolean(p.sale));
    }

    if (read.instock === 'true') {
      list = list.filter((p) => (Number(p.stockQuantity) || 0) > 0);
    } else if (read.instock === 'false') {
      list = list.filter((p) => (Number(p.stockQuantity) || 0) <= 0);
    }

    if (read.price.min !== null || read.price.max !== null) {
      const min = read.price.min ?? bounds.min;
      const max = read.price.max ?? bounds.max;
      list = list.filter((p) => {
        const price = Number(p.price) || 0;
        return price >= min && price <= max;
      });
    }

    const sorted = [...list];
    switch (read.sort) {
      case 'price-asc':
        sorted.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
        break;
      case 'price-desc':
        sorted.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
        break;
      case 'name-asc':
        sorted.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
        break;
      case 'name-desc':
        sorted.sort((a, b) => String(b.name || '').localeCompare(String(a.name || '')));
        break;
      case 'bestsellers':
        sorted.sort(
          (a, b) =>
            (Number(b.sold) || 0) - (Number(a.sold) || 0) ||
            (Number(a.id) || 0) - (Number(b.id) || 0)
        );
        break;
      case 'newest':
      default:
        sorted.sort(
          (a, b) =>
            (Number(b.isNew) || 0) - (Number(a.isNew) || 0) ||
            (Number(a.id) || 0) - (Number(b.id) || 0)
        );
        break;
    }
    return sorted;
  }, [products, read, bounds]);

  const activeCount = useMemo(() => {
    let count = 0;
    if (read.category !== 'all') count += 1;
    if (read.q) count += 1;
    if (read.sale) count += 1;
    if (read.instock !== null) count += 1;
    if (read.price.min !== null && read.price.max !== null) count += 1;
    return count;
  }, [read]);

  return {
    filters: read,
    bounds,
    categories,
    visible,
    activeCount,
    hasFilters,
    setCategory,
    setSort,
    setSale,
    setInstock,
    setPriceRange,
    setQuery,
    clearAll,
  };
}