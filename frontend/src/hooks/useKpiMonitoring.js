import { useEffect, useMemo, useRef, useState } from 'react';
import { getJson } from '../api/client';
import {
  ALL_BAND_IDS, HOURLY_KPIS, SECTORAL_KPIS, DEFAULT_HOURLY_KPIS, DEFAULT_DAILY_KPIS, FALLBACK_DAILY_KPIS,
  REGIONAL_DEFAULT_KPIS, KPI_MENUS, BAND_OPTIONS_4G, BAND_OPTIONS_5G, BAND_OPTIONS_2G, bandOptionsFor, orderKpiIds,
} from '../constants/kpis';
import { getInitialDateRange, loadLatestDates } from '../constants/dates';

const FALLBACK_5G_SITES = ['UPD012', 'UPD003', 'UPD076', 'SSU136', 'TER129', 'UPD183'];
const FALLBACK_2G_SITES = ['MRW002', 'UPD012', 'UPD183', 'COI350', 'UPD919'];

// Scopes whose filter changes query immediately; every other change waits for Generate
const AUTO_QUERY_SCOPES = ['regional', 'nop', 'city', 'kecamatan', 'site'];

const firstOnly = (list) => (list.length > 1 ? [list[0]] : list);

// No default site: the page starts empty until a site is chosen, then remembers the last one in this browser
const LAST_SITE_KEY = 'netpulse_last_site';
const readLastSite = () => {
  try { return (localStorage.getItem(LAST_SITE_KEY) || '').toUpperCase(); } catch { return ''; }
};

// Same for the NOP / City / Kecamatan filters: empty at first, then the last choice in this browser
const LAST_AREA_KEY = 'netpulse_last_area_filters';
const readLastArea = () => {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_AREA_KEY)) || {};
    const list = (x) => (Array.isArray(x) ? x.filter(i => typeof i === 'string') : []);
    const one = (x) => (typeof x === 'string' ? x : '');
    return { nops: list(v.nops), cityNops: list(v.cityNops), cities: list(v.cities), kecNop: one(v.kecNop), kecKab: one(v.kecKab), kecs: list(v.kecs) };
  } catch {
    return { nops: [], cityNops: [], cities: [], kecNop: '', kecKab: '', kecs: [] };
  }
};

// State, handlers and data loading for the 2G / 4G Hourly / 4G Daily / 5G KPI monitoring menus
export default function useKpiMonitoring(activeMenu, ref) {
  const { allSites, sites5g, sites2g, siteNamesMap, hierarchyData, dailyKpisList, kpis5gList, kpis2gList } = ref;

  const [timeMode, setTimeMode] = useState('hourly');
  const [aggregationScope, setAggregationScope] = useState('sector');
  const [aggregationMode, setAggregationMode] = useState('full');

  const [lastArea] = useState(readLastArea);
  const [selectedNops, setSelectedNops] = useState(lastArea.nops);
  const [selectedCities, setSelectedCities] = useState(lastArea.cities);
  const [selectedKecamatans, setSelectedKecamatans] = useState(lastArea.kecs);
  const [selectedSites, setSelectedSites] = useState(() => { const s = readLastSite(); return s ? [s] : []; });
  const [cityFilterNops, setCityFilterNops] = useState(lastArea.cityNops);
  const [kecFilterNop, setKecFilterNop] = useState(lastArea.kecNop);
  const [kecFilterKab, setKecFilterKab] = useState(lastArea.kecKab);
  useEffect(() => {
    const v = { nops: selectedNops, cityNops: cityFilterNops, cities: selectedCities, kecNop: kecFilterNop, kecKab: kecFilterKab, kecs: selectedKecamatans };
    try { localStorage.setItem(LAST_AREA_KEY, JSON.stringify(v)); } catch { /* storage unavailable */ }
  }, [selectedNops, cityFilterNops, selectedCities, kecFilterNop, kecFilterKab, selectedKecamatans]);

  const [siteId, setSiteId] = useState(readLastSite);
  useEffect(() => {
    if (!siteId) return;
    try { localStorage.setItem(LAST_SITE_KEY, siteId.toUpperCase()); } catch { /* storage unavailable */ }
  }, [siteId]);
  const [selectedSector, setSelectedSector] = useState('1');
  const [selectedBands, setSelectedBands] = useState(ALL_BAND_IDS);
  const [filterType, setFilterType] = useState('all');
  const [sectorViewMode, setSectorViewMode] = useState('all');
  const [sectoralSectors, setSectoralSectors] = useState(['1', '2', '3']);

  const [selectedHourlyKpis, setSelectedHourlyKpis] = useState(DEFAULT_HOURLY_KPIS);
  const [selectedDailyKpiIds, setSelectedDailyKpiIds] = useState(DEFAULT_DAILY_KPIS);
  // null = untouched, which means "every KPI of the catalog" (also once the server catalog arrives)
  const [selected5gKpiIds, setSelected5gKpiIds] = useState(null);
  const [selected2gKpiIds, setSelected2gKpiIds] = useState(null);

  const initialDates = getInitialDateRange('hourly');
  const [startDate, setStartDate] = useState(initialDates.start);
  const [endDate, setEndDate] = useState(initialDates.end);

  const [data, setData] = useState(null);
  const [aggregationData, setAggregationData] = useState(null);
  const [fetchedAt, setFetchedAt] = useState(null); // when the data on screen was loaded
  const [loading, setLoading] = useState(false);
  // Requests are counted per menu: a newer request makes older answers of that menu stale,
  // and an answer for a menu the user already left goes into that menu's snapshot
  const requestIds = useRef({});
  const pendingMenus = useRef(new Set());
  // menu -> everything needed to show that menu again exactly as it was left
  const snapshots = useRef({});
  const menuRef = useRef(activeMenu);
  // The KPI menu whose state is in the hook right now (it stays there while a non-KPI page is open)
  const liveMenu = useRef(KPI_MENUS.includes(activeMenu) ? activeMenu : null);
  const datesEditedRef = useRef(false);
  useEffect(() => { menuRef.current = activeMenu; }, [activeMenu]);

  const applyDefaultDates = (menu) => {
    const dates = getInitialDateRange(menu === '4g-hourly' ? 'hourly' : 'daily', menu);
    setStartDate(dates.start);
    setEndDate(dates.end);
    return dates;
  };

  // Default dates follow the latest data in the DB (no KPI query). The answer can arrive after the
  // user opened another menu, so it is applied to the menu open at that moment, unless dates were edited.
  useEffect(() => {
    loadLatestDates().then(() => {
      if (!datesEditedRef.current) applyDefaultDates(liveMenu.current || menuRef.current);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const editStartDate = (v) => { datesEditedRef.current = true; setStartDate(v); };
  const editEndDate = (v) => { datesEditedRef.current = true; setEndDate(v); };

  const activeBandOptions = useMemo(() => bandOptionsFor(activeMenu), [activeMenu]);
  const allActiveBandIds = useMemo(() => activeBandOptions.map(b => b.id), [activeBandOptions]);

  const activeSitesList = useMemo(() => {
    if (activeMenu === '5g') return sites5g.length > 0 ? sites5g : FALLBACK_5G_SITES;
    if (activeMenu === '2g') return sites2g.length > 0 ? sites2g : FALLBACK_2G_SITES;
    return allSites;
  }, [activeMenu, sites5g, sites2g, allSites]);

  // ---------------------------------------------------------------------------
  // Data loading. A newer request makes older responses stale, so a slow answer
  // for a previous menu or site never overwrites the current one.
  // ---------------------------------------------------------------------------
  // field is 'data' (sector charts) or 'aggregationData' (scope charts)
  const applyResult = (menu, field, json) => {
    const at = json?.error ? null : Date.now();
    if (menu === liveMenu.current) {
      (field === 'data' ? setData : setAggregationData)(json);
      setFetchedAt(at);
    } else if (snapshots.current[menu]) {
      snapshots.current[menu] = { ...snapshots.current[menu], [field]: json, fetchedAt: at };
    }
  };

  const runRequest = (path, params, field, menu) => {
    const id = (requestIds.current[menu] || 0) + 1;
    requestIds.current[menu] = id;
    pendingMenus.current.add(menu);
    if (menu === menuRef.current) setLoading(true);
    const current = () => requestIds.current[menu] === id;
    getJson(path, params)
      .then(json => { if (current()) applyResult(menu, field, json); })
      .catch(err => {
        console.error(`Failed to fetch ${path}:`, err);
        if (current()) applyResult(menu, field, { error: 'Cannot connect to the backend API server.' });
      })
      .finally(() => {
        if (!current()) return;
        pendingMenus.current.delete(menu);
        if (menu === menuRef.current) setLoading(false);
      });
  };

  // Drops any in-flight answer of that menu
  const cancelRequests = (menu) => {
    requestIds.current[menu] = (requestIds.current[menu] || 0) + 1;
    pendingMenus.current.delete(menu);
  };

  const fetchSectorData = (targetSite, start, end, menu = activeMenu, cellType = filterType) => {
    if (!targetSite) return; // nothing chosen yet
    const endpoint = {
      '4g-daily': '/api/daily/payload_sectors',
      '5g': '/api/5g/payload_sectors',
      '2g': '/api/2g/payload_sectors',
    }[menu] || '/api/payload_sectors';
    runRequest(endpoint, {
      site_id: targetSite,
      start_date: start,
      end_date: end,
      cell_type: cellType,
      days_back: menu === '4g-hourly' ? 6 : 14,
    }, 'data', menu);
  };

  const fetchScopeAggregationData = (scope, mode, start, end, nops, cities, kecs, sites, bands, menu = activeMenu) => {
    const pick = (list, fallback) => {
      const chosen = list && list.length > 0 ? list : fallback;
      return mode === 'band' ? chosen.slice(0, 1) : chosen;
    };
    const params = { scope, mode, start_date: start, end_date: end };
    if (scope === 'nop') params.nops = pick(nops, []);
    else if (scope === 'city') params.cities = pick(cities, []);
    else if (scope === 'kecamatan') params.kecamatans = pick(kecs, []);
    else if (scope === 'site') params.sites = pick(sites, siteId ? [siteId] : []);

    // Nothing chosen yet (no default area): drop older answers and show the empty state
    const chosen = { nop: params.nops, city: params.cities, kecamatan: params.kecamatans, site: params.sites }[scope];
    if (chosen && chosen.length === 0) {
      cancelRequests(menu);
      setLoading(false);
      setAggregationData(null);
      setFetchedAt(null);
      return;
    }

    const bandCount = bandOptionsFor(menu).length;
    if (bands && bands.length > 0 && bands.length < bandCount) params.bands = bands;

    const endpoint = {
      '2g': '/api/2g/aggregation',
      '5g': '/api/5g/aggregation',
      '4g-hourly': '/api/hourly/aggregation',
    }[menu] || '/api/daily/aggregation';
    runRequest(endpoint, params, 'aggregationData', menu);
  };

  const clearData = (menu = activeMenu) => {
    cancelRequests(menu);
    setLoading(false);
    setData(null);
    setAggregationData(null);
    setFetchedAt(null);
  };

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  const handleGetData = (e) => {
    if (e) e.preventDefault();
    if (aggregationScope === 'sector') {
      fetchSectorData(siteId, startDate, endDate);
    } else {
      const nops = aggregationScope === 'city' ? cityFilterNops : selectedNops;
      fetchScopeAggregationData(aggregationScope, aggregationMode, startDate, endDate, nops, selectedCities, selectedKecamatans, selectedSites, selectedBands);
    }
  };

  // Filter Type is an explicit choice too: reload the sector charts already on screen
  const handleFilterTypeChange = (type) => {
    setFilterType(type);
    if (aggregationScope === 'sector' && data && !data.error) fetchSectorData(siteId, startDate, endDate, activeMenu, type);
  };

  // Picking a site in sector scope is an explicit choice, so it loads right away
  const handleSelectSectorSite = (s) => {
    setSiteId(s);
    setSelectedSites([s]);
    fetchSectorData(s, startDate, endDate);
  };

  const handleSitesChange = (newList) => {
    const next = newList && newList.length > 0 ? newList : (siteId ? [siteId] : []);
    setSelectedSites(next);
    if (next.length === 1 && next[0] !== siteId) {
      setSiteId(next[0]);
    }
    fetchScopeAggregationData('site', aggregationMode, startDate, endDate, selectedNops, selectedCities, selectedKecamatans, next, selectedBands);
  };

  const handleSelectScope = (newScope) => {
    if (newScope === aggregationScope) return;
    setAggregationScope(newScope);
    clearData();
    if (newScope === 'sector') {
      fetchSectorData(siteId, startDate, endDate);
    } else {
      let currentSites = selectedSites;
      if (newScope === 'site') {
        currentSites = selectedSites && selectedSites.length > 0 ? selectedSites : (siteId ? [siteId] : []);
        if (siteId && !selectedSites.includes(siteId) && selectedSites.length <= 1) {
          currentSites = [siteId];
          setSelectedSites([siteId]);
        }
      }
      const nops = newScope === 'city' ? cityFilterNops : selectedNops;
      fetchScopeAggregationData(newScope, aggregationMode, startDate, endDate, nops, selectedCities, selectedKecamatans, currentSites, selectedBands);
    }
  };

  const handleSwitchAggregationMode = (newMode) => {
    setAggregationMode(newMode);
    let nops = aggregationScope === 'city' ? cityFilterNops : selectedNops;
    let cities = selectedCities;
    let kecs = selectedKecamatans;
    let sites = selectedSites;
    if (newMode === 'band') {
      if (aggregationScope !== 'city') { nops = firstOnly(nops); setSelectedNops(nops); }
      cities = firstOnly(cities); setSelectedCities(cities);
      kecs = firstOnly(kecs); setSelectedKecamatans(kecs);
      sites = firstOnly(sites); setSelectedSites(sites);
    }
    if (aggregationScope !== 'sector') {
      fetchScopeAggregationData(aggregationScope, newMode, startDate, endDate, nops, cities, kecs, sites, selectedBands);
    }
  };

  // Everything a KPI menu shows: saved when the user leaves it, restored when they come back
  const takeSnapshot = () => ({
    timeMode, aggregationScope, aggregationMode,
    selectedNops, selectedCities, selectedKecamatans, selectedSites, cityFilterNops, kecFilterNop, kecFilterKab,
    siteId, selectedSector, selectedBands, filterType, sectorViewMode, sectoralSectors,
    startDate, endDate, datesEdited: datesEditedRef.current,
    data, aggregationData, fetchedAt,
  });

  const restoreSnapshot = (s) => {
    setTimeMode(s.timeMode); setAggregationScope(s.aggregationScope); setAggregationMode(s.aggregationMode);
    setSelectedNops(s.selectedNops); setSelectedCities(s.selectedCities); setSelectedKecamatans(s.selectedKecamatans);
    setSelectedSites(s.selectedSites); setCityFilterNops(s.cityFilterNops); setKecFilterNop(s.kecFilterNop); setKecFilterKab(s.kecFilterKab);
    setSiteId(s.siteId); setSelectedSector(s.selectedSector); setSelectedBands(s.selectedBands); setFilterType(s.filterType);
    setSectorViewMode(s.sectorViewMode); setSectoralSectors(s.sectoralSectors);
    setStartDate(s.startDate); setEndDate(s.endDate); datesEditedRef.current = s.datesEdited;
    setData(s.data); setAggregationData(s.aggregationData); setFetchedAt(s.fetchedAt);
  };

  // Logout: nothing of the previous user stays in memory
  const forgetMenus = () => {
    snapshots.current = {};
    Object.keys(requestIds.current).forEach(cancelRequests);
    clearData();
  };

  // Called by App when the user opens a KPI menu. The menu being left is saved; a menu seen before
  // comes back as it was left (no query). fresh = start the target menu from its defaults.
  const prepareMenu = (targetMenu, { fresh = false } = {}) => {
    menuRef.current = targetMenu;
    const live = liveMenu.current;
    if (live === targetMenu && !fresh) {
      // back from a non-KPI page: the state of this menu never left the hook
      setLoading(pendingMenus.current.has(targetMenu));
      return;
    }
    if (live && live !== targetMenu) snapshots.current[live] = takeSnapshot();
    liveMenu.current = targetMenu; // answers arriving from now on for this menu go on screen

    const saved = !fresh && snapshots.current[targetMenu];
    if (saved) {
      restoreSnapshot(saved);
      setLoading(pendingMenus.current.has(targetMenu));
      return;
    }

    if (targetMenu === '5g') {
      const list = sites5g.length > 0 ? sites5g : FALLBACK_5G_SITES;
      // the last 4G site may have no 5G cells: leave the picker empty instead of a fixed default
      if (!list.includes(siteId.toUpperCase())) setSiteId('');
      setSelectedSites(selectedSites.filter(s => list.includes(s)));
      setSelectedBands(BAND_OPTIONS_5G.map(b => b.id));
    } else if (targetMenu === '2g') {
      const list = sites2g.length > 0 ? sites2g : FALLBACK_2G_SITES;
      if (!list.includes(siteId.toUpperCase())) setSiteId('');
      setSelectedSites(selectedSites.filter(s => list.includes(s)));
      setSelectedBands(BAND_OPTIONS_2G.map(b => b.id));
    } else {
      if (!siteId) {
        // back from 2G/5G with an empty picker: restore the last site chosen in this browser
        const last = readLastSite();
        if (last && allSites.includes(last)) { setSiteId(last); setSelectedSites([last]); }
      }
      setSelectedBands(BAND_OPTIONS_4G.map(b => b.id));
      if (targetMenu === '4g-hourly') {
        if (aggregationScope !== 'site') setAggregationScope('sector');
      }
    }

    setTimeMode(targetMenu === '4g-hourly' ? 'hourly' : 'daily');
    datesEditedRef.current = false;
    applyDefaultDates(targetMenu);
    clearData(targetMenu);
  };

  // Opened from Worst Cell / ZTZP: show that site's sector charts in the given KPI menu
  const openSiteInMenu = (menu, site) => {
    prepareMenu(menu, { fresh: true });
    setAggregationScope('sector');
    setSiteId(site);
    const dates = getInitialDateRange(menu === '4g-hourly' ? 'hourly' : 'daily', menu);
    fetchSectorData(site, dates.start, dates.end, menu);
  };

  // NOP / City / Kecamatan filters query immediately (auto-query scopes)
  const handleNopsChange = (newList) => {
    setSelectedNops(newList);
    fetchScopeAggregationData('nop', aggregationMode, startDate, endDate, newList, selectedCities, selectedKecamatans, selectedSites, selectedBands);
  };

  const handleCityNopsChange = (newList) => {
    // An empty NOP list means "any NOP": the city list then shows every kabupaten
    const nextNops = newList;
    setCityFilterNops(nextNops);
    const kabs = new Set();
    nextNops.forEach(n => (hierarchyData?.kabupaten_by_nop?.[n] || []).forEach(k => kabs.add(k)));
    // keep the chosen cities that still belong to the NOPs; no city is picked automatically
    const nextCities = nextNops.length === 0 ? selectedCities : selectedCities.filter(c => kabs.has(c));
    setSelectedCities(nextCities);
    fetchScopeAggregationData('city', aggregationMode, startDate, endDate, nextNops, nextCities, selectedKecamatans, selectedSites, selectedBands);
  };

  const handleCitiesChange = (newList) => {
    setSelectedCities(newList);
    fetchScopeAggregationData('city', aggregationMode, startDate, endDate, cityFilterNops, newList, selectedKecamatans, selectedSites, selectedBands);
  };

  // A new NOP or kabupaten clears the levels under it; nothing is picked automatically
  const handleKecNopChange = (nop) => {
    setKecFilterNop(nop);
    setKecFilterKab('');
    setSelectedKecamatans([]);
    fetchScopeAggregationData('kecamatan', aggregationMode, startDate, endDate, [nop], [], [], selectedSites, selectedBands);
  };

  const handleKecKabChange = (kab) => {
    setKecFilterKab(kab);
    setSelectedKecamatans([]);
    fetchScopeAggregationData('kecamatan', aggregationMode, startDate, endDate, [kecFilterNop], [kab], [], selectedSites, selectedBands);
  };

  const handleKecamatansChange = (newList) => {
    setSelectedKecamatans(newList);
    fetchScopeAggregationData('kecamatan', aggregationMode, startDate, endDate, [kecFilterNop], [kecFilterKab], newList, selectedSites, selectedBands);
  };

  // Band selection
  const handleToggleBand = (bandId) => {
    if (selectedBands.includes(bandId)) {
      if (selectedBands.length > 1) setSelectedBands(selectedBands.filter(b => b !== bandId));
    } else {
      setSelectedBands([...selectedBands, bandId]);
    }
  };

  const handleToggleAllBands = () => {
    setSelectedBands(selectedBands.length === allActiveBandIds.length ? [allActiveBandIds[0]] : [...allActiveBandIds]);
  };

  // KPI selection (per menu)
  const activeKpiCatalog = useMemo(() => {
    if (activeMenu === '5g') return kpis5gList;
    if (activeMenu === '2g') return kpis2gList;
    if (activeMenu === '4g-daily') return dailyKpisList?.length > 0 ? dailyKpisList : FALLBACK_DAILY_KPIS;
    return HOURLY_KPIS;
  }, [activeMenu, kpis5gList, kpis2gList, dailyKpisList]);

  // Charts always follow a fixed KPI order, not the order the boxes were ticked
  const activeSelectedKpiIds = orderKpiIds({
    '5g': selected5gKpiIds ?? kpis5gList.map(k => k.id),
    '2g': selected2gKpiIds ?? kpis2gList.map(k => k.id),
    '4g-daily': selectedDailyKpiIds,
  }[activeMenu] || selectedHourlyKpis, activeKpiCatalog);

  const setActiveKpiIds = (next) => {
    // Resolve the "all" default before applying an updater
    const resolve = (catalog) => (prev) => {
      const base = prev ?? catalog.map(k => k.id);
      return typeof next === 'function' ? next(base) : next;
    };
    if (activeMenu === '5g') setSelected5gKpiIds(resolve(kpis5gList));
    else if (activeMenu === '2g') setSelected2gKpiIds(resolve(kpis2gList));
    else if (activeMenu === '4g-daily') setSelectedDailyKpiIds(next);
    else setSelectedHourlyKpis(next);
  };

  const handleToggleKpi = (kpiId) => {
    setActiveKpiIds(prev => (prev.includes(kpiId) ? prev.filter(id => id !== kpiId) : [...prev, kpiId]));
  };

  const handleSelectAllKpis = () => setActiveKpiIds(activeKpiCatalog.map(k => k.id));
  const handleDeselectAllKpis = () => setActiveKpiIds([]);

  const handleToggleCategory = (catKpiIds, shouldSelect) => {
    setActiveKpiIds(prev => {
      if (shouldSelect) return Array.from(new Set([...prev, ...catKpiIds]));
      const cat = new Set(catKpiIds);
      return prev.filter(id => !cat.has(id));
    });
  };

  const handleSelectDefaultKpis = () => {
    if (activeMenu === '5g') setSelected5gKpiIds(null);
    else if (activeMenu === '2g') setSelected2gKpiIds(null);
    else if (activeMenu === '4g-daily') setSelectedDailyKpiIds(DEFAULT_DAILY_KPIS);
    else setSelectedHourlyKpis(DEFAULT_HOURLY_KPIS);
  };

  // Sectoral preselects its main KPIs; All KPI goes back to the menu defaults
  const handleSwitchSectorViewMode = (mode) => {
    if (mode === sectorViewMode) return;
    setSectorViewMode(mode);
    if (mode === 'all') handleSelectDefaultKpis();
    else setActiveKpiIds(SECTORAL_KPIS.filter(id => activeKpiCatalog.some(k => k.id === id)));
  };

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------
  const availableSectors = data?.available_sectors || [1, 2, 3];
  const availableSectorsKey = availableSectors.join(',');

  // When the site's sector list changes, keep chosen sectors that still exist, else the first 3
  useEffect(() => {
    const avail = availableSectorsKey ? availableSectorsKey.split(',').filter(Boolean) : [];
    if (!avail.length) return;
    setSectoralSectors(prev => {
      const kept = prev.filter(s => avail.includes(s));
      return kept.length ? kept : avail.slice(0, 3);
    });
    setSelectedSector(prev => {
      return avail.includes(prev) ? prev : String(avail[0]);
    });
  }, [availableSectorsKey]);

  const nopOptions = useMemo(
    () => hierarchyData?.nops || ['BONE', 'KENDARI', 'MAKASSAR', 'MANADO', 'PALU', 'PARE-PARE', 'TERNATE'],
    [hierarchyData]
  );

  // Without a NOP filter the city list holds every kabupaten
  const cityOptions = useMemo(() => {
    const byNop = hierarchyData?.kabupaten_by_nop;
    if (!byNop) return [];
    const nops = cityFilterNops?.length > 0 ? cityFilterNops : Object.keys(byNop);
    const set = new Set();
    nops.forEach(n => (byNop[n] || []).forEach(k => set.add(k)));
    return Array.from(set).sort();
  }, [cityFilterNops, hierarchyData]);

  const kecCityOptions = useMemo(() => {
    const kabs = kecFilterNop ? hierarchyData?.kabupaten_by_nop?.[kecFilterNop] : null;
    return kabs ? Array.from(kabs).sort() : [];
  }, [kecFilterNop, hierarchyData]);

  const kecOptions = useMemo(() => {
    const kecs = kecFilterKab ? hierarchyData?.kecamatan_by_kab?.[kecFilterKab] : null;
    return kecs ? Array.from(kecs).sort() : [];
  }, [kecFilterKab, hierarchyData]);

  // Whether the current scope has what it needs to query (no default area or site any more)
  const scopeReady = {
    sector: !!siteId,
    nop: selectedNops.length > 0,
    city: selectedCities.length > 0,
    kecamatan: selectedKecamatans.length > 0,
    site: selectedSites.length > 0 || !!siteId,
  }[aggregationScope] ?? true;

  const siteKey = siteId.toUpperCase();
  const currentSiteMeta = hierarchyData?.site_map?.[siteKey] || data?.site_info || {
    site_id: siteId, nop: 'UNKNOWN', kabupaten: 'UNKNOWN', kecamatan: 'UNKNOWN',
  };
  const cleanNeName = siteNamesMap[siteKey]
    ? `${siteKey} - ${siteNamesMap[siteKey]}`
    : (data?.enodeb_name || currentSiteMeta?.enodeb_name || siteId);
  const resolvedNeName = data?.enodeb_name?.includes(' - ') ? data.enodeb_name : cleanNeName;

  return {
    activeMenu,
    // state
    timeMode, aggregationScope, aggregationMode,
    selectedNops, selectedCities, selectedKecamatans, selectedSites, setSelectedSites,
    cityFilterNops, kecFilterNop, kecFilterKab,
    siteId, selectedSector, setSelectedSector, selectedBands, filterType, setFilterType: handleFilterTypeChange,
    sectorViewMode, sectoralSectors, setSectoralSectors,
    startDate, setStartDate: editStartDate, endDate, setEndDate: editEndDate,
    data, aggregationData, loading, fetchedAt,
    // derived
    activeBandOptions, allActiveBandIds, activeSitesList, activeKpiCatalog, activeSelectedKpiIds,
    availableSectors, nopOptions, cityOptions, kecCityOptions, kecOptions, scopeReady,
    currentSiteMeta, resolvedNeName,
    // handlers
    prepareMenu, forgetMenus, handleSitesChange, openSiteInMenu, handleGetData, handleSelectSectorSite, handleSelectScope, handleSwitchAggregationMode,
    handleNopsChange, handleCityNopsChange, handleCitiesChange, handleKecNopChange, handleKecKabChange,
    handleKecamatansChange, handleToggleBand, handleToggleAllBands,
    handleToggleKpi, handleSelectAllKpis, handleDeselectAllKpis, handleToggleCategory, handleSelectDefaultKpis,
    handleSwitchSectorViewMode,
  };
}
