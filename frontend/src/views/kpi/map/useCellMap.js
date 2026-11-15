import { useEffect, useState } from 'react';
import { getJson } from '../../../api/client';

// Cells of a site (and its 1st tier when tier = 1) from /api/map/cells, loaded only while `enabled`
export default function useCellMap(enabled, siteId, tier) {
  const key = `${(siteId || '').toUpperCase()}|${tier}`;
  const [result, setResult] = useState({ key: null, data: null, error: null });
  const current = result.key === key;

  useEffect(() => {
    if (!enabled || current || !siteId) return undefined;
    let cancelled = false;
    getJson('/api/map/cells', { site_id: siteId.toUpperCase(), tier })
      .then(json => { if (!cancelled) setResult({ key, data: json, error: json.error || null }); })
      .catch(err => { if (!cancelled) setResult({ key, data: null, error: String(err) }); });
    return () => { cancelled = true; };
  }, [enabled, key, current, siteId, tier]);

  return {
    loading: enabled && !current,
    error: current ? result.error : null,
    data: current && !result.error ? result.data : null,
  };
}
