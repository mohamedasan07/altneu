import { useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import useCategories from './useCategories';

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

export const ALL_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '26', '28', '30', '32', '34', '36', '38'];

const AUTHORITATIVE_SIZES = {
  'XS': ['XS'], 'S': ['S'], 'M': ['M'], 'L': ['L'], 'XL': ['XL'], 'XXL': ['XXL'],
  '26': ['26', 'W26'], '28': ['28', 'W28'], '30': ['30', 'W30'],
  '32': ['32', 'W32'], '34': ['34', 'W34'], '36': ['36', 'W36'], '38': ['38', 'W38']
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

    const sizesRaw = searchParams.get('sizes');
    const sizes = sizesRaw ? sizesRaw.split(',') : [];

    const typesRaw = searchParams.get('types');
    const types = typesRaw ? typesRaw.split(',') : [];

    return {
      q: (searchParams.get('q') || '').trim(),
      category: categoryId || searchParams.get('category') || 'all',
      price: {
        min: hasPrice ? priceMin : null,
        max: hasPrice ? priceMax : null,
      },
      sale: searchParams.get('sale') === 'true',
      instock: searchParams.get('instock'), // null | 'true' | 'false'
      sizes,
      types,
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

  const { categories: fetchedCategories } = useCategories();

  const categories = useMemo(() => {
    const dynamicCategories = (fetchedCategories || []).map(cat => ({
      id: cat.slug, // Use slug for the URL and category filter
      label: cat.name.charAt(0).toUpperCase() + cat.name.slice(1).toLowerCase(),
      count: cat.productCount || 0,
    }));

    return [
      { id: 'all', label: 'View all', count: products.length },
      ...dynamicCategories
    ];
  }, [fetchedCategories, products.length]);

  const hasFilters =
    read.sale ||
    read.instock !== null ||
    read.sizes.length > 0 ||
    read.types.length > 0 ||
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

  const setSizes = useCallback(
    (sizes) => setFilter(sizes.length ? { sizes: sizes.join(',') } : {}, { clear: ['sizes'] }),
    [setFilter]
  );

  const setTypes = useCallback(
    (types) => setFilter(types.length ? { types: types.join(',') } : {}, { clear: ['types'] }),
    [setFilter]
  );

  const setQuery = useCallback(
    (q) => setFilter(q ? { q } : {}, { clear: ['q'] }),
    [setFilter]
  );

  const clearAll = useCallback(() => {
    const next = new URLSearchParams();
    if (read.category !== 'all') next.set('category', read.category);
    if (read.q) next.set('q', read.q);
    const queryString = next.toString();
    navigate(queryString ? `/collections?${queryString}` : '/collections', { replace: true });
  }, [navigate, read.category, read.q]);

  // ---- Filtering + sorting pipeline ----
  const visible = useMemo(() => {
    let list = products;

    if (read.category !== 'all') {
      const targetSlug = read.category.toLowerCase().trim();
      // Match against fetchedCategories to find the target category's name
      const targetCategory = (fetchedCategories || []).find(c => c.slug === targetSlug);
      const targetName = targetCategory ? targetCategory.name.toLowerCase().trim() : targetSlug;

      list = list.filter((p) => String(p.category || '').toLowerCase().trim() === targetName);
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

    if (read.types.length > 0) {
      const targetTypeNames = read.types.map(slug => {
        const cat = (fetchedCategories || []).find(c => c.slug === slug);
        return cat ? cat.name.toLowerCase().trim() : slug;
      });

      list = list.filter((p) => {
        const productCategory = String(p.category || '').toLowerCase().trim();
        return targetTypeNames.includes(productCategory);
      });
    }

    if (read.sizes.length > 0) {
      list = list.filter((p) => {
        if (!Array.isArray(p.sizes)) return false;
        const activeValues = read.sizes.flatMap(label => AUTHORITATIVE_SIZES[label] || [label]);
        return activeValues.some((size) => p.sizes.includes(size));
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
    if (read.sale) count += 1;
    if (read.instock !== null) count += 1;
    if (read.sizes.length > 0) count += 1;
    if (read.types.length > 0) count += 1;
    if (read.price.min !== null && read.price.max !== null) count += 1;
    return count;
  }, [read]);

  const availableSizes = ALL_SIZES;

  return {
    filters: read,
    bounds,
    categories,
    availableSizes,
    visible,
    activeCount,
    hasFilters,
    setCategory,
    setSort,
    setSale,
    setInstock,
    setPriceRange,
    setSizes,
    setTypes,
    setQuery,
    clearAll,
  };
}