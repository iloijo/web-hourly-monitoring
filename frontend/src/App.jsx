import { Suspense, lazy, useEffect, useState } from 'react';
import DataLoadingOverlay from './components/DataLoadingOverlay';
import AppSidebar from './components/layout/AppSidebar';
import AppHeader from './components/layout/AppHeader';
import AppFooter from './components/layout/AppFooter';
import ThemePicker from './components/layout/ThemePicker';
import { THEMES, readStoredTheme, storeTheme } from './constants/themes';
import KpiMonitoringView from './views/KpiMonitoringView';
import useReferenceData from './hooks/useReferenceData';
import useKpiMonitoring from './hooks/useKpiMonitoring';
import { KPI_MENUS } from './constants/kpis';

const TimingAdvanceView = lazy(() => import('./components/TimingAdvanceView'));
const PacketLossView = lazy(() => import('./components/PacketLossView'));

export default function App() {
  const [themeId, setThemeId] = useState(readStoredTheme);
  const darkMode = THEMES.find(t => t.id === themeId)?.dark ?? false;
  const [activeMenu, setActiveMenu] = useState('4g-hourly');
  const [chartsPerRow, setChartsPerRow] = useState(3);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const ref = useReferenceData();
  const km = useKpiMonitoring(activeMenu, ref);
  const isKpiMenu = KPI_MENUS.includes(activeMenu);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    document.documentElement.dataset.palette = themeId;
    storeTheme(themeId);
  }, [themeId, darkMode]);

  // Opening a menu never queries KPI data; the user picks a site or clicks Generate
  const handleSwitchMenu = (menu) => {
    if (menu === activeMenu) return;
    setActiveMenu(menu);
    if (KPI_MENUS.includes(menu)) km.prepareMenu(menu);
  };

  return (
    <div className={`min-h-screen flex flex-row font-sans select-none transition-colors duration-300 overflow-x-hidden ${
      darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-800'
    }`}>
      <AppSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeMenu={activeMenu}
        onSelectMenu={handleSwitchMenu}
        dbStatus={ref.dbStatus}
        darkMode={darkMode}
      />

      <div className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-0'}`}>
        <AppHeader
          activeMenu={activeMenu}
          sidebarOpen={sidebarOpen}
          onOpenSidebar={() => setSidebarOpen(true)}
          km={km}
          isKpiMenu={isKpiMenu}
          onSwitchMenu={handleSwitchMenu}
          chartsPerRow={chartsPerRow}
          setChartsPerRow={setChartsPerRow}
          darkMode={darkMode}
        >
          <ThemePicker themeId={themeId} onChange={setThemeId} darkMode={darkMode} />
        </AppHeader>

        <main className="p-4 sm:p-5 grow overflow-y-auto space-y-4">
          <Suspense fallback={<DataLoadingOverlay />}>
            {(activeMenu === 'ta-4g' || activeMenu === 'ta-5g') && (
              <TimingAdvanceView
                key={activeMenu}
                tech={activeMenu === 'ta-5g' ? '5g' : '4g'}
                darkMode={darkMode}
                allSites={activeMenu === 'ta-5g' && ref.sites5g.length > 0 ? ref.sites5g : ref.allSites}
                siteNamesMap={ref.siteNamesMap}
              />
            )}
            {activeMenu === 'packet-loss' && (
              <PacketLossView
                darkMode={darkMode}
                allSites={ref.allSites}
                siteNamesMap={ref.siteNamesMap}
                hierarchyData={ref.hierarchyData}
              />
            )}
          </Suspense>

          {isKpiMenu && (
            <KpiMonitoringView
              km={km}
              activeMenu={activeMenu}
              siteNamesMap={ref.siteNamesMap}
              chartsPerRow={chartsPerRow}
              darkMode={darkMode}
              sidebarOpen={sidebarOpen}
            />
          )}
        </main>

        <AppFooter activeMenu={activeMenu} km={km} isKpiMenu={isKpiMenu} darkMode={darkMode} />
      </div>

      {km.loading && <DataLoadingOverlay />}
    </div>
  );
}
