import { useEffect, useState } from 'react';
import { getJson } from '../../../api/client';

// Last-day KPI, TA and weekly status of every cell on the shown sites (/api/map/kpi), keyed by siteid_ci.
// Loaded after the geometry so sectors appear first.
export default function useCellKpi(enabled, siteIds) {
  const key = [...siteIds].sort().join(',');
  const [result, setResult] = useState({ key: null, data: null, error: null });
  const current = result.key === key;

  useEffect(() => {
    if (!enabled || current || !key) return undefined;
    let cancelled = false;
    getJson('/api/map/kpi', { site_ids: key })
      // a partial result (one database down) still carries the cells it could read
      .then(json => { if (!cancelled) setResult({ key, data: json, error: json.error || null }); })
      .catch(err => { if (!cancelled) setResult({ key, data: null, error: String(err) }); });
    return () => { cancelled = true; };
  }, [enabled, key, current]);

  return {
    loading: enabled && !!key && !current,
    error: current ? result.error : null,
    data: current ? result.data : null,
  };
}
