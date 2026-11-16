import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ScopeFilterPanel from './kpi/ScopeFilterPanel';
import KpiChartsPanel from './kpi/KpiChartsPanel';
import PropertiesPanel, { compareValues, PanelCapsule } from './kpi/PropertiesPanel';
import MarkerControl from './kpi/MarkerControl';
import ThresholdControl, { loadThresholdSettings } from './kpi/ThresholdControl';
import { buildKpiExport } from './kpi/kpiExport';
import useSiteProperties from '../hooks/useSiteProperties';

// Leaflet is only downloaded the first time the map is opened
const CellMapDrawer = lazy(() => import('./kpi/map/CellMapDrawer'));

const MAP_WIDTH_KEY = 'netpulse_cellmap_width';
const readMapWidth = () => {
  try {
    const w = Number(localStorage.getItem(MAP_WIDTH_KEY));
    if (w >= 360) return Math.min(w, window.innerWidth * 0.75);
  } catch { /* storage unavailable */ }
  return Math.round(window.innerWidth * 0.42);
};
// Floating (over the page) or pinned (the page makes room); floating by default
const MAP_PINNED_KEY = 'netpulse_cellmap_pinned';
const readMapPinned = () => {
  try { return localStorage.getItem(MAP_PINNED_KEY) === '1'; } catch { return false; }
};

// 2G / 4G Hourly / 4G Daily / 5G monitoring page body
export default function KpiMonitoringView({
  km, activeMenu, siteNamesMap, chartsPerRow, darkMode, sidebarOpen, setSidebarOpen, markers, setMarkers, onExportData,
}) {
  const [propsOpen, setPropsOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapWidth, setMapWidth] = useState(readMapWidth);
  const [mapMounted, setMapMounted] = useState(false);
  const [mapPinned, setMapPinned] = useState(readMapPinned);
  const handleMapPinned = useCallback((v) => {
    setMapPinned(v);
    try { localStorage.setItem(MAP_PINNED_KEY, v ? '1' : '0'); } catch { /* storage unavailable */ }
  }, []);
  const handleMapWidth = useCallback((w) => {
    setMapWidth(w);
    try { localStorage.setItem(MAP_WIDTH_KEY, String(Math.round(w))); } catch { /* storage unavailable */ }
  }, []);
  const [propSort, setPropSort] = useState({ key: 'siteid_ci', direction: 'asc' });
  const [thresholdSettings, setThresholdSettings] = useState(loadThresholdSettings);
  const showProperties = (activeMenu === '4g-daily' || activeMenu === '4g-hourly') && km.aggregationScope === 'sector' && !!km.siteId;
  const hasThresholds = activeMenu === '4g-hourly' || activeMenu === '4g-daily' || activeMenu === '5g';
  const props = useSiteProperties(showProperties && propsOpen, km.siteId);
  const sectors = km.sectorViewMode === 'sectoral' ? (km.sectoralSectors || []).map(Number) : [Number(km.selectedSector)];
  const sectorKey = sectors.join(',');
  // Filtered + sorted once per data/sector/sort change (a new array every render re-rendered all charts in a loop)
  const propertyRows = useMemo(() => {
    const wanted = sectorKey.split(',').map(Number);
    return props.rows
      .filter(r => wanted.includes(r.sector))
      .sort((a, b) => compareValues(a[propSort.key], b[propSort.key], propSort.direction));
  }, [props.rows, sectorKey, propSort]);
  const handlePropSort = useCallback((key) => {
    setPropSort(prev => (prev.key === key
      ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: 'asc' }));
  }, []);
  const hasData = km.aggregationScope === 'sector' ? !!km.data?.sectors : !!km.aggregationData?.kpis;
  const mapVisible = showProperties && mapOpen;
  // Smooth open/close: only the drawer animates (transform). The charts make room in one step once the
  // drawer has finished sliding in, and get the space back as soon as it starts to close; animating
  // their margin re-laid out every chart on every frame, which made the slide stutter.
  const [mapSettled, setMapSettled] = useState(false);
  // A floating map covers the page and leaves the charts as they are; a pinned one pushes them aside
  const mapOffset = mapVisible && mapSettled && mapPinned ? mapWidth : 0; // page content
  const overlayOffset = mapVisible ? mapWidth : 0;           // capsule and properties sheet follow the drawer
  const openMap = () => { setMapMounted(true); setMapOpen(true); };
  const closeMap = () => { setMapSettled(false); setMapOpen(false); };
  const handleMapSlideEnd = useCallback((isOpen) => setMapSettled(isOpen), []);
  // While the map is pinned the left menu bar is hidden so the charts keep their width, and comes back
  // when the map closes or floats again (only if the map was what hid it)
  const pinnedOpen = mapVisible && mapPinned;
  const sidebarHiddenByMap = useRef(false);
  const sidebarSetter = useRef(setSidebarOpen);
  sidebarSetter.current = setSidebarOpen;
  useEffect(() => {
    if (pinnedOpen) {
      if (sidebarOpen) { sidebarHiddenByMap.current = true; sidebarSetter.current?.(false); }
    } else if (sidebarHiddenByMap.current) {
      sidebarHiddenByMap.current = false;
      sidebarSetter.current?.(true);
    }
  }, [pinnedOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  // Opened again by hand while pinned: the user wants it, leave it alone from now on
  const sidebarWasOpen = useRef(sidebarOpen);
  useEffect(() => {
    if (sidebarOpen && !sidebarWasOpen.current && pinnedOpen) sidebarHiddenByMap.current = false;
    sidebarWasOpen.current = sidebarOpen;
  }, [sidebarOpen, pinnedOpen]);
  // Leaving the KPI page with the map pinned gives the menu bar back
  useEffect(() => () => { if (sidebarHiddenByMap.current) sidebarSetter.current?.(true); }, []);
  const selectSectorFromMap = useCallback((sector) => km.setSelectedSector(String(sector)), [km]);

  // Excel export of the charts (and the properties table when it is open). The getter reads the
  // latest screen state from a ref, so it is registered only when data appears or disappears.
  const exportInput = useRef(null);
  useEffect(() => {
    exportInput.current = {
      km, activeMenu, sectors,
      propertyRows: showProperties && propsOpen ? propertyRows : [],
      propertyColumns: props.columns,
    };
  });
  useEffect(() => {
    if (!hasData) { onExportData(null); return undefined; }
    onExportData(() => buildKpiExport(exportInput.current));
    return () => onExportData(null);
  }, [hasData, onExportData]);

  return (
    <div
      className="space-y-4"
      style={{ marginRight: mapOffset }}
    >
      <ScopeFilterPanel km={km} activeMenu={activeMenu} siteNamesMap={siteNamesMap} darkMode={darkMode} />
      <KpiChartsPanel
        km={km}
        activeMenu={activeMenu}
        siteNamesMap={siteNamesMap}
        chartsPerRow={chartsPerRow}
        darkMode={darkMode}
        markers={markers}
        thresholdSettings={thresholdSettings}
        headerExtra={
          <div className="flex items-center gap-1.5 flex-wrap">
            <MarkerControl markers={markers} setMarkers={setMarkers} defaultDate={km.endDate} darkMode={darkMode} />
            {hasThresholds && (
              <ThresholdControl
                activeMenu={activeMenu}
                settings={thresholdSettings}
                onUpdateSettings={setThresholdSettings}
                darkMode={darkMode}
              />
            )}
          </div>
        }
      />
      {showProperties && (
        <>
          {/* keeps the last charts reachable above the open sheet */}
          {propsOpen && <div className="h-[46vh]" />}
          <PropertiesPanel
            props={props}
            rows={propertyRows}
            sectors={sectors}
            open={propsOpen}
            onOpenChange={setPropsOpen}
            darkMode={darkMode}
            sidebarOpen={sidebarOpen}
            sortConfig={propSort}
            onSort={handlePropSort}
            rightOffset={overlayOffset}
          />
          <PanelCapsule
            propsOpen={propsOpen}
            onToggleProps={() => setPropsOpen(o => !o)}
            mapOpen={mapOpen}
            onToggleMap={() => (mapOpen ? closeMap() : openMap())}
            rightOffset={overlayOffset}
          />
          {mapMounted && (
            <Suspense fallback={null}>
              <CellMapDrawer
                open={mapOpen}
                onClose={closeMap}
                onSlideEnd={handleMapSlideEnd}
                siteId={km.siteId}
                sectors={sectors}
                darkMode={darkMode}
                width={mapWidth}
                onWidthChange={handleMapWidth}
                canSelectSector={km.sectorViewMode !== 'sectoral'}
                onSelectSector={selectSectorFromMap}
                pinned={mapPinned}
                onPinnedChange={handleMapPinned}
              />
            </Suspense>
          )}
        </>
      )}
    </div>
  );
}
