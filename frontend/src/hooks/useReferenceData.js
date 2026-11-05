import { useEffect, useState } from 'react';
import { getJson } from '../api/client';
import { FALLBACK_DAILY_KPIS, FALLBACK_5G_KPIS, FALLBACK_2G_KPIS } from '../constants/kpis';

// Reference data loaded once on mount: DB status, site lists, site names, hierarchy and KPI catalogs.
// These are small lookups, not KPI queries.
export default function useReferenceData() {
  const [dbStatus, setDbStatus] = useState({ twodb_connected: null, onedb_connected: null });
  const [allSites, setAllSites] = useState([]);
  const [sites5g, setSites5g] = useState([]);
  const [sites2g, setSites2g] = useState([]);
  const [siteNamesMap, setSiteNamesMap] = useState({});
  const [hierarchyData, setHierarchyData] = useState({ nops: [], tree: {}, site_map: {}, sites: [] });
  const [dailyKpisList, setDailyKpisList] = useState(FALLBACK_DAILY_KPIS);
  const [kpis5gList, setKpis5gList] = useState(FALLBACK_5G_KPIS);
  const [kpis2gList, setKpis2gList] = useState(FALLBACK_2G_KPIS);

  useEffect(() => {
    const mergeNames = (names) => {
      if (names && typeof names === 'object') setSiteNamesMap(prev => ({ ...prev, ...names }));
    };
    const warn = (what) => (err) => console.error(`Could not fetch ${what}:`, err);

    getJson('/api/status').then(setDbStatus).catch(() => setDbStatus({ twodb_connected: false, onedb_connected: false }));
    getJson('/api/sites').then(json => {
      if (Array.isArray(json.sites)) setAllSites(json.sites);
      mergeNames(json.site_names);
    }).catch(warn('sites'));
    getJson('/api/site_names').then(mergeNames).catch(() => {});
    getJson('/api/hierarchy').then(json => { if (json?.tree) setHierarchyData(json); }).catch(warn('hierarchy'));
    getJson('/api/daily/kpi_list').then(json => { if (Array.isArray(json?.kpis)) setDailyKpisList(json.kpis); }).catch(warn('daily KPI catalog'));
    getJson('/api/5g/sites').then(json => {
      if (Array.isArray(json.sites)) setSites5g(json.sites);
      mergeNames(json.site_names);
    }).catch(warn('5G sites'));
    getJson('/api/5g/kpi_list').then(json => { if (Array.isArray(json?.kpis)) setKpis5gList(json.kpis); }).catch(warn('5G KPI catalog'));
    getJson('/api/2g/sites').then(json => {
      if (Array.isArray(json.sites)) setSites2g(json.sites);
      mergeNames(json.site_names);
    }).catch(warn('2G sites'));
    getJson('/api/2g/kpi_list').then(json => { if (Array.isArray(json?.kpis)) setKpis2gList(json.kpis); }).catch(warn('2G KPI catalog'));
  }, []);

  return {
    dbStatus, allSites, sites5g, sites2g, siteNamesMap, hierarchyData,
    dailyKpisList, kpis5gList, kpis2gList,
  };
}
