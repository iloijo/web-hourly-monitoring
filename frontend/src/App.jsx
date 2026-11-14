import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import DataLoadingOverlay from './components/DataLoadingOverlay';
import AppSidebar from './components/layout/AppSidebar';
import AppHeader from './components/layout/AppHeader';
import AppFooter from './components/layout/AppFooter';
import ThemePicker from './components/layout/ThemePicker';
import ExportButton from './components/layout/ExportButton';
import { THEMES, readStoredTheme, storeTheme } from './constants/themes';
import KpiMonitoringView from './views/KpiMonitoringView';
import LoginPage from './views/LoginPage';
import useReferenceData from './hooks/useReferenceData';
import useKpiMonitoring from './hooks/useKpiMonitoring';
import useIdleLogout from './hooks/useIdleLogout';
import { KPI_MENUS } from './constants/kpis';
import { getAuthToken, getStoredAuthUser, setAuthSession, updateStoredAuthUser, getJson, postJson } from './api/client';
import { MENU_ORDER } from './constants/menus';

const OverviewView = lazy(() => import('./views/OverviewView'));
const TimingAdvanceView = lazy(() => import('./components/TimingAdvanceView'));
const PacketLossView = lazy(() => import('./components/PacketLossView'));
const WorstCellView = lazy(() => import('./views/WorstCellView'));
const ZtzpView = lazy(() => import('./views/ZtzpView'));
const ClusterMonitoringView = lazy(() => import('./views/ClusterMonitoringView'));
const CeiView = lazy(() => import('./views/CeiView'));
const AdminView = lazy(() => import('./views/AdminView'));

// Worst Cell / ZTZP rows open the daily sector charts of that technology
const TECH_TO_MENU = { '2g': '2g', '4g': '4g-daily', '5g': '5g' };

export default function App() {
  const [themeId, setThemeId] = useState(readStoredTheme);
  const darkMode = THEMES.find(t => t.id === themeId)?.dark ?? false;
  const [activeMenu, setActiveMenu] = useState('overview');
  const [chartsPerRow, setChartsPerRow] = useState(3);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [markers, setMarkers] = useState([]); // temporary chart markers, cleared on reload
  const [exportGetter, setExportGetter] = useState(null);

  // Authentication state. authUser = { username, full_name, role_name, is_super, permissions: [menuId] }
  const [authUser, setAuthUser] = useState(getStoredAuthUser);
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(getAuthToken() && getStoredAuthUser()));

  // Menus this role may open (the server enforces the same rules on the API)
  const permissions = useMemo(() => authUser?.permissions || [], [authUser]);
  const can = useCallback((menu) => permissions.includes(menu), [permissions]);

  const ref = useReferenceData(isAuthenticated);
  const km = useKpiMonitoring(activeMenu, ref);
  const isKpiMenu = KPI_MENUS.includes(activeMenu) && permissions.includes(activeMenu);

  // Pages register a function returning their Excel sheets (or null when there is nothing to export)
  const registerExport = useCallback((getter) => setExportGetter(() => getter), []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    document.documentElement.dataset.palette = themeId;
    storeTheme(themeId);
  }, [themeId, darkMode]);

  const clearSession = useCallback(() => {
    setAuthSession(null);
    try {
      sessionStorage.removeItem('netpulse_last_activity');
    } catch {
      // Ignore storage errors
    }
    setAuthUser(null);
    setIsAuthenticated(false);
  }, []);

  // Check the session on startup and refresh the user's role / permissions from the server
  useEffect(() => {
    getJson('/api/auth/check')
      .then((data) => {
        if (data?.authenticated && data.user) {
          setAuthUser(data.user);
          setIsAuthenticated(true);
          // Open-access server (no users yet) needs no stored token
          if (getAuthToken()) updateStoredAuthUser(data.user);
        }
      })
      .catch(() => {
        // Unauthenticated or expired session
        clearSession();
      });

    window.addEventListener('netpulse:unauthorized', clearSession);
    return () => window.removeEventListener('netpulse:unauthorized', clearSession);
  }, [clearSession]);

  // Never stay on a page the role cannot open (e.g. role changed by the SuperAdmin)
  useEffect(() => {
    if (!isAuthenticated || !authUser || permissions.includes(activeMenu)) return;
    const first = MENU_ORDER.find((m) => permissions.includes(m));
    if (first) setActiveMenu(first);
  }, [isAuthenticated, authUser, permissions, activeMenu]);

  const handleLoginSuccess = (user) => {
    setAuthUser(user);
    setIsAuthenticated(true);
    setThemeId('ocean');
    storeTheme('ocean');
  };

  const handleLogout = useCallback(() => {
    // Revoke the token on the server; the local session is cleared either way
    if (getAuthToken()) postJson('/api/auth/logout').catch(() => {});
    clearSession();
  }, [clearSession]);

  // Auto logout after 30 minutes without mouse/keyboard/touch/scroll activity
  useIdleLogout(isAuthenticated, handleLogout, 30 * 60 * 1000);

  // Opening a menu never queries KPI data; the user picks a site or clicks Generate
  const handleSwitchMenu = (menu) => {
    if (menu === activeMenu || !can(menu)) return;
    setActiveMenu(menu);
    if (KPI_MENUS.includes(menu)) km.prepareMenu(menu);
  };

  const openSite = (tech, site) => {
    const menu = TECH_TO_MENU[tech];
    if (!can(menu)) return;
    setActiveMenu(menu);
    km.openSiteInMenu(menu, site);
  };

  const show = (menu) => activeMenu === menu && can(menu);

  const common = { darkMode, onExportData: registerExport };

  // If not authenticated, present the interactive NetPulse Animated Login Portal
  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className={`min-h-screen flex flex-row font-sans select-none transition-colors duration-300 overflow-x-clip ${
      darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-800'
    }`}>
      <AppSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeMenu={activeMenu}
        onSelectMenu={handleSwitchMenu}
        can={can}
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
          authUser={authUser}
          onLogout={handleLogout}
        >
          <ExportButton getPayload={exportGetter} darkMode={darkMode} />
          <ThemePicker themeId={themeId} onChange={setThemeId} darkMode={darkMode} />
        </AppHeader>

        <main className="p-4 sm:p-5 grow space-y-4">
          <Suspense fallback={<DataLoadingOverlay />}>
            {show('overview') && (
              <OverviewView onOpenSite={openSite} hierarchyData={ref.hierarchyData} {...common} />
            )}
            {(show('ta-4g') || show('ta-5g')) && (
              <TimingAdvanceView
                key={activeMenu}
                tech={activeMenu === 'ta-5g' ? '5g' : '4g'}
                allSites={activeMenu === 'ta-5g' && ref.sites5g.length > 0 ? ref.sites5g : ref.allSites}
                siteNamesMap={ref.siteNamesMap}
                {...common}
              />
            )}
            {show('packet-loss') && (
              <PacketLossView allSites={ref.allSites} siteNamesMap={ref.siteNamesMap} hierarchyData={ref.hierarchyData} {...common} />
            )}
            {show('worst-cell') && (
              <WorstCellView hierarchyData={ref.hierarchyData} onOpenSite={openSite} {...common} />
            )}
            {show('cluster') && (
              <ClusterMonitoringView refData={ref} chartsPerRow={chartsPerRow} authUser={authUser} {...common} />
            )}
            {show('cei') && <CeiView {...common} />}
            {show('ztzp') && (
              <ZtzpView hierarchyData={ref.hierarchyData} onOpenSite={openSite} {...common} />
            )}
            {show('admin') && <AdminView authUser={authUser} darkMode={darkMode} />}
          </Suspense>

          {isKpiMenu && (
            <KpiMonitoringView
              km={km}
              activeMenu={activeMenu}
              siteNamesMap={ref.siteNamesMap}
              chartsPerRow={chartsPerRow}
              sidebarOpen={sidebarOpen}
              markers={markers}
              setMarkers={setMarkers}
              {...common}
            />
          )}
        </main>

        <AppFooter activeMenu={activeMenu} km={km} isKpiMenu={isKpiMenu} darkMode={darkMode} />
      </div>

      {km.loading && <DataLoadingOverlay />}
    </div>
  );
}
