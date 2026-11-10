import { useEffect, useMemo, useRef, useState } from 'react';
import { getJson } from '../api/client';
import {
  ALL_BAND_IDS, HOURLY_KPIS, SECTORAL_KPIS, DEFAULT_HOURLY_KPIS, DEFAULT_DAILY_KPIS, FALLBACK_DAILY_KPIS,
  REGIONAL_DEFAULT_KPIS, BAND_OPTIONS_4G, BAND_OPTIONS_5G, BAND_OPTIONS_2G, bandOptionsFor, orderKpiIds,
} from '../constants/kpis';
import { getInitialDateRange, loadLatestDates } from '../constants/dates';

const FALLBACK_5G_SITES = ['UPD012', 'UPD003', 'UPD076', 'SSU136', 'TER129', 'UPD183'];
const FALLBACK_2G_SITES = ['MRW002', 'UPD012', 'UPD183', 'COI350', 'UPD919'];

// Scopes whose filter changes query immediately; every other change waits for Generate
const AUTO_QUERY_SCOPES = ['regional', 'nop', 'city', 'kecamatan', 'site'];

const firstOnly = (list) => (list.length > 1 ? [list[0]] : list);

// State, handlers and data loading for the 2G / 4G Hourly / 4G Daily / 5G KPI monitoring menus
export default function useKpiMonitoring(activeMenu, ref) {
  const { allSites, sites5g, sites2g, siteNamesMap, hierarchyData, dailyKpisList, kpis5gList, kpis2gList } = ref;

  const [timeMode, setTimeMode] = useState('hourly');
  const [aggregationScope, setAggregationScope] = useState('sector');
  const [aggregationMode, setAggregationMode] = useState('full');

  const [selectedNops, setSelectedNops] = useState(['MAKASSAR']);
  const [selectedCities, setSelectedCities] = useState(['KOTA MAKASSAR']);
  const [selectedKecamatans, setSelectedKecamatans] = useState(['UJUNG PANDANG']);
  const [selectedSites, setSelectedSites] = useState(['MRW002']);
  const [cityFilterNops, setCityFilterNops] = useState(['MAKASSAR']);
  const [kecFilterNop, setKecFilterNop] = useState('MAKASSAR');
  const [kecFilterKab, setKecFilterKab] = useState('KOTA MAKASSAR');

  const [siteId, setSiteId] = useState('MRW002');
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
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);
  const menuRef = useRef(activeMenu);
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
      if (!datesEditedRef.current) applyDefaultDates(menuRef.current);
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
  const runRequest = (path, params, onData) => {
    const id = ++requestId.current;
    setLoading(true);
    getJson(path, params)
      .then(json => { if (id === requestId.current) onData(json); })
      .catch(err => {
        console.error(`Failed to fetch ${path}:`, err);
        if (id === requestId.current) onData({ error: 'Cannot connect to the backend API server.' });
      })
      .finally(() => { if (id === requestId.current) setLoading(false); });
  };

  const fetchSectorData = (targetSite, start, end, menu = activeMenu, cellType = filterType) => {
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
    }, setData);
  };

  const fetchScopeAggregationData = (scope, mode, start, end, nops, cities, kecs, sites, bands, menu = activeMenu) => {
    const pick = (list, fallback) => {
      const chosen = list && list.length > 0 ? list : fallback;
      return mode === 'band' ? chosen.slice(0, 1) : chosen;
    };
    const params = { scope, mode, start_date: start, end_date: end };
    if (scope === 'nop') params.nops = pick(nops, ['MAKASSAR']);
    else if (scope === 'city') params.cities = pick(cities, ['KOTA MAKASSAR']);
    else if (scope === 'kecamatan') params.kecamatans = pick(kecs, ['UJUNG PANDANG']);
    else if (scope === 'site') params.sites = pick(sites, [siteId]);

    const bandCount = bandOptionsFor(menu).length;
    if (bands && bands.length > 0 && bands.length < bandCount) params.bands = bands;

    const endpoint = {
      '2g': '/api/2g/aggregation',
      '5g': '/api/5g/aggregation',
      '4g-hourly': '/api/hourly/aggregation',
    }[menu] || '/api/daily/aggregation';
    runRequest(endpoint, params, setAggregationData);
  };

  const clearData = () => {
    requestId.current += 1; // drop any in-flight response
    setLoading(false);
    setData(null);
    setAggregationData(null);
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
    const next = newList && newList.length > 0 ? newList : [siteId];
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
        currentSites = selectedSites && selectedSites.length > 0 ? selectedSites : [siteId];
        if (!selectedSites.includes(siteId) && selectedSites.length <= 1) {
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

  // Called by App when the user opens a KPI menu: reset menu-specific state, no query
  const prepareMenu = (targetMenu) => {
    if (targetMenu === '5g') {
      const list = sites5g.length > 0 ? sites5g : FALLBACK_5G_SITES;
      if (!list.includes(siteId.toUpperCase())) setSiteId('UPD012');
      if (!selectedSites.some(s => list.includes(s))) setSelectedSites(['UPD012']);
      setSelectedBands(BAND_OPTIONS_5G.map(b => b.id));
    } else if (targetMenu === '2g') {
      const list = sites2g.length > 0 ? sites2g : FALLBACK_2G_SITES;
      if (!list.includes(siteId.toUpperCase())) setSiteId('MRW002');
      if (!selectedSites.some(s => list.includes(s))) setSelectedSites(['MRW002']);
      setSelectedBands(BAND_OPTIONS_2G.map(b => b.id));
    } else {
      setSelectedBands(BAND_OPTIONS_4G.map(b => b.id));
      if (targetMenu === '4g-hourly') {
        if (aggregationScope !== 'site') setAggregationScope('sector');
      }
    }

    setTimeMode(targetMenu === '4g-hourly' ? 'hourly' : 'daily');
    datesEditedRef.current = false;
    applyDefaultDates(targetMenu);
    clearData();
  };

  // Opened from Worst Cell / ZTZP: show that site's sector charts in the given KPI menu
  const openSiteInMenu = (menu, site) => {
    prepareMenu(menu);
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

  const handleCityNopsChange = (newList, nopOptions) => {
    const nextNops = newList.length > 0 ? newList : [nopOptions[0] || 'MAKASSAR'];
    setCityFilterNops(nextNops);
    const kabs = new Set();
    nextNops.forEach(n => (hierarchyData?.kabupaten_by_nop?.[n] || []).forEach(k => kabs.add(k)));
    const retained = selectedCities.filter(c => kabs.has(c));
    const nextCities = retained.length > 0 ? retained : Array.from(kabs).sort().slice(0, 1);
    if (nextCities.length > 0) {
      setSelectedCities(nextCities);
      fetchScopeAggregationData('city', aggregationMode, startDate, endDate, nextNops, nextCities, selectedKecamatans, selectedSites, selectedBands);
    }
  };

  const handleCitiesChange = (newList) => {
    setSelectedCities(newList);
    fetchScopeAggregationData('city', aggregationMode, startDate, endDate, cityFilterNops, newList, selectedKecamatans, selectedSites, selectedBands);
  };

  const handleKecNopChange = (nop) => {
    setKecFilterNop(nop);
    const kabs = Array.from(hierarchyData?.kabupaten_by_nop?.[nop] || []);
    if (kabs.length === 0) return;
    setKecFilterKab(kabs[0]);
    const kecs = Array.from(hierarchyData?.kecamatan_by_kab?.[kabs[0]] || []);
    if (kecs.length === 0) return;
    setSelectedKecamatans([kecs[0]]);
    fetchScopeAggregationData('kecamatan', aggregationMode, startDate, endDate, [nop], [kabs[0]], [kecs[0]], selectedSites, selectedBands);
  };

  const handleKecKabChange = (kab) => {
    setKecFilterKab(kab);
    const kecs = Array.from(hierarchyData?.kecamatan_by_kab?.[kab] || []);
    if (kecs.length === 0) return;
    setSelectedKecamatans([kecs[0]]);
    fetchScopeAggregationData('kecamatan', aggregationMode, startDate, endDate, [kecFilterNop], [kab], [kecs[0]], selectedSites, selectedBands);
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

  const cityOptions = useMemo(() => {
    if (cityFilterNops?.length > 0 && hierarchyData?.kabupaten_by_nop) {
      const set = new Set();
      cityFilterNops.forEach(n => (hierarchyData.kabupaten_by_nop[n] || []).forEach(k => set.add(k)));
      if (set.size > 0) return Array.from(set).sort();
    }
    return ['KOTA MAKASSAR', 'GOWA', 'MAROS', 'MOROWALI', 'KENDARI', 'PALU', 'MANADO'];
  }, [cityFilterNops, hierarchyData]);

  const kecCityOptions = useMemo(() => {
    const kabs = hierarchyData?.kabupaten_by_nop?.[kecFilterNop];
    return kabs ? Array.from(kabs).sort() : cityOptions;
  }, [kecFilterNop, hierarchyData, cityOptions]);

  const kecOptions = useMemo(() => {
    const kecs = hierarchyData?.kecamatan_by_kab?.[kecFilterKab];
    return kecs ? Array.from(kecs).sort() : ['UJUNG PANDANG', 'MAMAJANG', 'PANAKKUKANG', 'TAMALATE', 'BUNGKU TENGAH'];
  }, [kecFilterKab, hierarchyData]);

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
    data, aggregationData, loading,
    // derived
    activeBandOptions, allActiveBandIds, activeSitesList, activeKpiCatalog, activeSelectedKpiIds,
    availableSectors, nopOptions, cityOptions, kecCityOptions, kecOptions,
    currentSiteMeta, resolvedNeName,
    // handlers
    prepareMenu, handleSitesChange, openSiteInMenu, handleGetData, handleSelectSectorSite, handleSelectScope, handleSwitchAggregationMode,
    handleNopsChange, handleCityNopsChange, handleCitiesChange, handleKecNopChange, handleKecKabChange,
    handleKecamatansChange, handleToggleBand, handleToggleAllBands,
    handleToggleKpi, handleSelectAllKpis, handleDeselectAllKpis, handleToggleCategory, handleSelectDefaultKpis,
    handleSwitchSectorViewMode,
  };
}
