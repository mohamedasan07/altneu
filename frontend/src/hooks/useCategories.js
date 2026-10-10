import { useCallback, useEffect, useState } from 'react';
import { fetchCategories } from '../services';

const cache = { promise: null };

function cachedFetch() {
  if (!cache.promise) {
    cache.promise = fetchCategories().catch((err) => {
      cache.promise = null;
      throw err;
    });
  }
  return cache.promise;
}

export default function useCategories() {
  const [categories, setCategories] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const list = await cachedFetch();
      setCategories(list);
      setStatus('ready');
    } catch (err) {
      setError(err);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const reload = useCallback(async () => {
    cache.promise = null;
    await load();
  }, [load]);

  return { categories, status, error, reload };
}
