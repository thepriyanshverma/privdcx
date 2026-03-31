import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

const FILTER_KEYS = ['workspace_id', 'facility_id', 'entity_id', 'severity'];

function normalizeValue(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

export function useSharedFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo(() => {
    const result = {};
    for (const key of FILTER_KEYS) {
      result[key] = normalizeValue(searchParams.get(key));
    }
    if (!result.workspace_id) {
      result.workspace_id = normalizeValue(localStorage.getItem('active_workspace_id'));
    }
    return result;
  }, [searchParams]);

  const setFilter = (key, value) => {
    const next = new URLSearchParams(searchParams);
    const normalized = normalizeValue(value);
    if (normalized) {
      next.set(key, normalized);
    } else {
      next.delete(key);
    }
    setSearchParams(next, { replace: true });
  };

  const setFilters = (partial) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(partial || {})) {
      const normalized = normalizeValue(value);
      if (normalized) {
        next.set(key, normalized);
      } else {
        next.delete(key);
      }
    }
    setSearchParams(next, { replace: true });
  };

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    for (const key of FILTER_KEYS) {
      const value = normalizeValue(filters[key]);
      if (value) params.set(key, value);
    }
    return params.toString();
  }, [filters]);

  return {
    filters,
    setFilter,
    setFilters,
    queryString,
  };
}

export default useSharedFilters;
