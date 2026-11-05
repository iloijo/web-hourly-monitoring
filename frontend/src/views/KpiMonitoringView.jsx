import ScopeFilterPanel from './kpi/ScopeFilterPanel';
import KpiChartsPanel from './kpi/KpiChartsPanel';

// 2G / 4G Hourly / 4G Daily / 5G monitoring page body
export default function KpiMonitoringView({ km, activeMenu, siteNamesMap, chartsPerRow, darkMode, markers }) {
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
    </>
  );
}
