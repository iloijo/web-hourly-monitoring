import { useEffect, useState } from 'react';
import { getJson } from '../api/client';

// 4G cell properties of a site, loaded only while `enabled` (panel open); reloads when the site changes
export default function useSiteProperties(enabled, siteId) {
  const [result, setResult] = useState({ site: null, data: null, error: null });
  const site = siteId.toUpperCase();
  const current = result.site === site;

  useEffect(() => {
    if (!enabled || current) return undefined;
    let cancelled = false;
    getJson('/api/daily/properties', { site_id: site })
      .then(json => { if (!cancelled) setResult({ site, data: json, error: json.error || null }); })
      .catch(err => { if (!cancelled) setResult({ site, data: null, error: String(err) }); });
    return () => { cancelled = true; };
  }, [enabled, site, current]);

  return {
    site,
    loading: enabled && !current,
    error: current ? result.error : null,
    loaded: current && !!result.data,
    columns: result.data?.columns || [],
    rows: current ? result.data?.rows || [] : [],
  };
}
