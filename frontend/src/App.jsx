import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
const CrowdsourceView = lazy(() => import('./views/CrowdsourceView'));
const AdminView = lazy(() => import('./views/AdminView'));

// A page kept mounted between visits: hidden (not unmounted) while another menu is open
function KeptPage({ active, children }) {
  return (
    <div hidden={!active} className="space-y-4">
      <Suspense fallback={active ? <DataLoadingOverlay /> : null}>{children}</Suspense>
    </div>
  );
}

// Worst Cell / ZTZP rows open the daily sector charts of that technology
const TECH_TO_MENU = { '2g': '2g', '4g': '4g-daily', '5g': '5g' };

export default function App() {
  const [themeId, setThemeId] = useState(readStoredTheme);
  const darkMode = THEMES.find(t => t.id === themeId)?.dark ?? false;
  const [activeMenu, setActiveMenu] = useState('overview');
  const [chartsPerRow, setChartsPerRow] = useState(3);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [markers, setMarkers] = useState([]); // temporary chart markers, cleared on reload
  // menu -> export function registered by that page (pages stay mounted, so each keeps its own)
  const [exportGetters, setExportGetters] = useState({});
  // Pages opened in this session stay mounted (hidden) so switching back shows them as they were left
  const [visited, setVisited] = useState(() => new Set());
  const scrollByMenu = useRef({});

  // Authentication state. authUser = { username, full_name, role_name, is_super, permissions: [menuId] }
  const [authUser, setAuthUser] = useState(getStoredAuthUser);
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(getAuthToken() && getStoredAuthUser()));

  // Menus this role may open (the server enforces the same rules on the API)
  const permissions = useMemo(() => authUser?.permissions || [], [authUser]);
  const can = useCallback((menu) => permissions.includes(menu), [permissions]);

  const ref = useReferenceData(isAuthenticated);
  const km = useKpiMonitoring(activeMenu, ref);
  const isKpiMenu = KPI_MENUS.includes(activeMenu) && permissions.includes(activeMenu);

  // Pages register a function returning their Excel sheets (or null when there is nothing to export).
  // One stable register function per page, so a hidden page never replaces the visible page's export.
  const exportRegistrars = useMemo(() => {
    const make = (key) => (getter) => setExportGetters((prev) => (prev[key] === getter ? prev : { ...prev, [key]: getter }));
    return Object.fromEntries([...MENU_ORDER, 'kpi'].map((m) => [m, make(m)]));
  }, []);
  const exportGetter = (isKpiMenu ? exportGetters.kpi : exportGetters[activeMenu]) || null;

  // Updated during render (not in an effect) so the page is marked visited in the same pass
  if (!visited.has(activeMenu)) setVisited(new Set(visited).add(activeMenu));

  // Each page keeps its own scroll position; a page shown again also re-measures its charts and maps
  // (they were laid out at zero size while hidden)
  useLayoutEffect(() => {
    window.scrollTo(0, scrollByMenu.current[activeMenu] || 0);
    const raf = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    return () => cancelAnimationFrame(raf);
  }, [activeMenu]);

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
    // Nothing of this user's pages stays in memory for the next login
    setVisited(new Set());
    setExportGetters({});
    scrollByMenu.current = {};
  }, []);

  // KPI menus keep their data in the hook (one per app): forget it on logout too
  const forgetRef = useRef(km.forgetMenus);
  useEffect(() => { forgetRef.current = km.forgetMenus; });
  useEffect(() => {
    if (!isAuthenticated) forgetRef.current();
  }, [isAuthenticated]);

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
  const rememberScroll = () => { scrollByMenu.current[activeMenu] = window.scrollY; };

  const handleSwitchMenu = (menu) => {
    if (menu === activeMenu || !can(menu)) return;
    rememberScroll();
    setActiveMenu(menu);
    if (KPI_MENUS.includes(menu)) km.prepareMenu(menu);
  };

  const openSite = (tech, site) => {
    const menu = TECH_TO_MENU[tech];
    if (!can(menu)) return;
    rememberScroll();
    scrollByMenu.current[menu] = 0; // a new site starts at the top
    setActiveMenu(menu);
    km.openSiteInMenu(menu, site);
  };

  const show = (menu) => activeMenu === menu && can(menu);
  // Mounted when it is open now or was opened before in this session (and the role still allows it)
  const keep = (menu) => (activeMenu === menu || visited.has(menu)) && can(menu);
  const pageProps = (menu) => ({ darkMode, onExportData: exportRegistrars[menu] });

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

      <div className={`flex-1 min-w-0 flex flex-col min-h-screen transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-0'}`}>
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
          {keep('overview') && (
            <KeptPage active={activeMenu === 'overview'}>
              <OverviewView onOpenSite={openSite} hierarchyData={ref.hierarchyData} {...pageProps('overview')} />
            </KeptPage>
          )}
          {['ta-4g', 'ta-5g'].map((menu) => keep(menu) && (
            <KeptPage key={menu} active={activeMenu === menu}>
              <TimingAdvanceView
                tech={menu === 'ta-5g' ? '5g' : '4g'}
                allSites={menu === 'ta-5g' && ref.sites5g.length > 0 ? ref.sites5g : ref.allSites}
                siteNamesMap={ref.siteNamesMap}
                {...pageProps(menu)}
              />
            </KeptPage>
          ))}
          {keep('packet-loss') && (
            <KeptPage active={activeMenu === 'packet-loss'}>
              <PacketLossView allSites={ref.allSites} siteNamesMap={ref.siteNamesMap} hierarchyData={ref.hierarchyData} {...pageProps('packet-loss')} />
            </KeptPage>
          )}
          {keep('worst-cell') && (
            <KeptPage active={activeMenu === 'worst-cell'}>
              <WorstCellView hierarchyData={ref.hierarchyData} onOpenSite={openSite} {...pageProps('worst-cell')} />
            </KeptPage>
          )}
          {keep('cluster') && (
            <KeptPage active={activeMenu === 'cluster'}>
              <ClusterMonitoringView refData={ref} chartsPerRow={chartsPerRow} authUser={authUser} {...pageProps('cluster')} />
            </KeptPage>
          )}
          {keep('cei') && (
            <KeptPage active={activeMenu === 'cei'}><CeiView {...pageProps('cei')} /></KeptPage>
          )}
          {keep('crowdsource') && (
            <KeptPage active={activeMenu === 'crowdsource'}><CrowdsourceView {...pageProps('crowdsource')} /></KeptPage>
          )}
          {keep('ztzp') && (
            <KeptPage active={activeMenu === 'ztzp'}>
              <ZtzpView hierarchyData={ref.hierarchyData} onOpenSite={openSite} {...pageProps('ztzp')} />
            </KeptPage>
          )}
          {/* Admin always reloads: users and roles must be fresh */}
          {show('admin') && (
            <Suspense fallback={<DataLoadingOverlay />}><AdminView authUser={authUser} darkMode={darkMode} /></Suspense>
          )}

          {isKpiMenu && (
            <KpiMonitoringView
              km={km}
              activeMenu={activeMenu}
              siteNamesMap={ref.siteNamesMap}
              chartsPerRow={chartsPerRow}
              sidebarOpen={sidebarOpen}
              setSidebarOpen={setSidebarOpen}
              markers={markers}
              setMarkers={setMarkers}
              darkMode={darkMode}
              onExportData={exportRegistrars.kpi}
            />
          )}
        </main>

        <AppFooter activeMenu={activeMenu} km={km} isKpiMenu={isKpiMenu} darkMode={darkMode} />
      </div>

      {isKpiMenu && km.loading && <DataLoadingOverlay />}
    </div>
  );
}
