import { useEffect, useState } from 'react';
import { getJson } from '../../../api/client';

// Cells of a site (and its 1st tier when tier = 1) from /api/map/cells, loaded only while `enabled`.
// Bumping `version` reloads the same site (after an azimuth / tilt edit); the old data stays shown meanwhile.
export default function useCellMap(enabled, siteId, tier, version = 0, source = 'rno') {
  const key = `${(siteId || '').toUpperCase()}|${tier}|${source}|${version}`;
  const [last, setLast] = useState(null);
  const [result, setResult] = useState({ key: null, data: null, error: null });
  const current = result.key === key;

  useEffect(() => {
    if (!enabled || current || !siteId) return undefined;
    let cancelled = false;
    getJson('/api/map/cells', { site_id: siteId.toUpperCase(), tier, source })
      .then(json => {
        if (cancelled) return;
        setResult({ key, data: json, error: json.error || null });
        if (!json.error) setLast({ base: key.replace(/\|\d+$/, ''), data: json });
      })
      .catch(err => { if (!cancelled) setResult({ key, data: null, error: String(err) }); });
    return () => { cancelled = true; };
  }, [enabled, key, current, siteId, tier, source]);

  // while a reload of the same site runs, keep drawing the previous result
  const stale = !current && last && last.base === key.replace(/\|\d+$/, '') ? last.data : null;

  return {
    loading: enabled && !current,
    error: current ? result.error : null,
    data: current && !result.error ? result.data : stale,
  };
}
