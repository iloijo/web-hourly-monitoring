import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Map as MapIcon } from 'lucide-react';
import ScopeFilterPanel from './kpi/ScopeFilterPanel';
import KpiChartsPanel from './kpi/KpiChartsPanel';
import PropertiesPanel, { compareValues } from './kpi/PropertiesPanel';
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

// 2G / 4G Hourly / 4G Daily / 5G monitoring page body
export default function KpiMonitoringView({
  km, activeMenu, siteNamesMap, chartsPerRow, darkMode, sidebarOpen, markers, setMarkers, onExportData,
}) {
  const [propsOpen, setPropsOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapWidth, setMapWidth] = useState(readMapWidth);
  const [mapMounted, setMapMounted] = useState(false);
  const handleMapWidth = useCallback((w) => {
    setMapWidth(w);
    try { localStorage.setItem(MAP_WIDTH_KEY, String(Math.round(w))); } catch { /* storage unavailable */ }
  }, []);
  const [propSort, setPropSort] = useState({ key: 'siteid_ci', direction: 'asc' });
  const [thresholdSettings, setThresholdSettings] = useState(loadThresholdSettings);
  const showProperties = (activeMenu === '4g-daily' || activeMenu === '4g-hourly') && km.aggregationScope === 'sector';
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
  const mapOffset = mapVisible ? mapWidth : 0;
  const openMap = () => { setMapMounted(true); setMapOpen(true); };
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
      className="space-y-4 transition-[margin] duration-300"
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
            rightOffset={mapOffset}
          />
          {!mapOpen && (
            <button
              type="button"
              onClick={openMap}
              className="fixed bottom-5 right-[165px] z-40 flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold shadow-lg transition cursor-pointer bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/30"
              title="Show cell map (DESIQA)"
            >
              <MapIcon className="w-4 h-4" />
              <span>Map</span>
            </button>
          )}
          {mapMounted && (
            <Suspense fallback={null}>
              <CellMapDrawer
                open={mapOpen}
                onClose={() => setMapOpen(false)}
                siteId={km.siteId}
                sectors={sectors}
                darkMode={darkMode}
                width={mapWidth}
                onWidthChange={handleMapWidth}
                canSelectSector={km.sectorViewMode !== 'sectoral'}
                onSelectSector={selectSectorFromMap}
              />
            </Suspense>
          )}
        </>
      )}
    </div>
  );
}
