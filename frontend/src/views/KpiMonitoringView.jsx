import { useState } from 'react';
import ScopeFilterPanel from './kpi/ScopeFilterPanel';
import KpiChartsPanel from './kpi/KpiChartsPanel';
import PropertiesPanel from './kpi/PropertiesPanel';
import useSiteProperties from '../hooks/useSiteProperties';

// 2G / 4G Hourly / 4G Daily / 5G monitoring page body
export default function KpiMonitoringView({ km, activeMenu, siteNamesMap, chartsPerRow, darkMode, sidebarOpen, markers }) {
  const [propsOpen, setPropsOpen] = useState(false);
  const showProperties = activeMenu === '4g-daily' && km.aggregationScope === 'sector';
  const props = useSiteProperties(showProperties && propsOpen, km.siteId);
  const sectors = km.sectorViewMode === 'sectoral' ? km.sectoralSectors.map(Number) : [Number(km.selectedSector)];
  const propertyRows = props.rows.filter(r => sectors.includes(r.sector));

  return (
    <>
      <ScopeFilterPanel km={km} siteNamesMap={siteNamesMap} darkMode={darkMode} />
      <KpiChartsPanel
        km={km}
        activeMenu={activeMenu}
        siteNamesMap={siteNamesMap}
        chartsPerRow={chartsPerRow}
        darkMode={darkMode}
        markers={markers}
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
          />
        </>
      )}
    </>
  );
}
