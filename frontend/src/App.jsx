import { Suspense, lazy, useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import DataLoadingOverlay from './components/DataLoadingOverlay';
import AppSidebar from './components/layout/AppSidebar';
import AppHeader from './components/layout/AppHeader';
import AppFooter from './components/layout/AppFooter';
import KpiMonitoringView from './views/KpiMonitoringView';
import useReferenceData from './hooks/useReferenceData';
import useKpiMonitoring from './hooks/useKpiMonitoring';
import { KPI_MENUS } from './constants/kpis';

const TimingAdvanceView = lazy(() => import('./components/TimingAdvanceView'));
const PacketLossView = lazy(() => import('./components/PacketLossView'));

export default function App() {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');
  const [activeMenu, setActiveMenu] = useState('4g-hourly');
  const [chartsPerRow, setChartsPerRow] = useState(3);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const ref = useReferenceData();
  const km = useKpiMonitoring(activeMenu, ref);
  const isKpiMenu = KPI_MENUS.includes(activeMenu);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

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
          <button
            type="button"
            onClick={() => setDarkMode(d => !d)}
            className={`w-9 h-9 rounded-lg border transition-all duration-300 cursor-pointer flex items-center justify-center active:scale-90 ${
              darkMode ? 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 shadow-2xs'
            }`}
            title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
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
            />
          )}
        </main>

        <AppFooter activeMenu={activeMenu} km={km} isKpiMenu={isKpiMenu} darkMode={darkMode} />
      </div>

      {km.loading && <DataLoadingOverlay />}
    </div>
  );
}
