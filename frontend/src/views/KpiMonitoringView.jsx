import { useEffect, useRef, useState } from 'react';
import ScopeFilterPanel from './kpi/ScopeFilterPanel';
import KpiChartsPanel from './kpi/KpiChartsPanel';
import PropertiesPanel from './kpi/PropertiesPanel';
import MarkerControl from './kpi/MarkerControl';
import ThresholdControl, { loadThresholdSettings } from './kpi/ThresholdControl';
import { buildKpiExport } from './kpi/kpiExport';
import useSiteProperties from '../hooks/useSiteProperties';

// 2G / 4G Hourly / 4G Daily / 5G monitoring page body
export default function KpiMonitoringView({
  km, activeMenu, siteNamesMap, chartsPerRow, darkMode, sidebarOpen, markers, setMarkers, onExportData,
}) {
  const [propsOpen, setPropsOpen] = useState(false);
  const [sortedPropertyRows, setSortedPropertyRows] = useState([]);
  const [thresholdSettings, setThresholdSettings] = useState(loadThresholdSettings);
  const showProperties = (activeMenu === '4g-daily' || activeMenu === '4g-hourly') && km.aggregationScope === 'sector';
  const hasThresholds = activeMenu === '4g-hourly' || activeMenu === '4g-daily' || activeMenu === '5g';
  const props = useSiteProperties(showProperties && propsOpen, km.siteId);
  const sectors = km.sectorViewMode === 'sectoral' ? (km.sectoralSectors || []).map(Number) : [Number(km.selectedSector)];
  const propertyRows = props.rows.filter(r => sectors.includes(r.sector));
  const hasData = km.aggregationScope === 'sector' ? !!km.data?.sectors : !!km.aggregationData?.kpis;

  // Excel export of the charts (and the properties table when it is open). The getter reads the
  // latest screen state from a ref, so it is registered only when data appears or disappears.
  const exportInput = useRef(null);
  useEffect(() => {
    exportInput.current = {
      km, activeMenu, sectors,
      propertyRows: showProperties && propsOpen ? (sortedPropertyRows.length ? sortedPropertyRows : propertyRows) : [],
      propertyColumns: props.columns,
    };
  });
  useEffect(() => {
    if (!hasData) { onExportData(null); return undefined; }
    onExportData(() => buildKpiExport(exportInput.current));
    return () => onExportData(null);
  }, [hasData, onExportData]);

  return (
    <>
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
            onSortedRowsChange={setSortedPropertyRows}
          />
        </>
      )}
    </>
  );
}
