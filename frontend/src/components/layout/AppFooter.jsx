import { MENU_META } from '../../constants/menus';

// Everything sits on the left: the bottom-right corner is taken by the floating 4G Properties | Map capsule
export default function AppFooter({ activeMenu, km, isKpiMenu, darkMode }) {
  const scope = km.aggregationScope;
  return (
    <footer className={`border-t px-6 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${
      darkMode ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-500'
    }`}>
      <div>
        <span className="font-semibold">Database: </span>
        <span className="font-mono font-medium">{MENU_META[activeMenu]?.source}</span>
      </div>
      {isKpiMenu && km.data?.enodeb_name && scope === 'sector' && (
        <div className={`hidden sm:inline px-2 py-0.5 rounded border font-mono text-[11px] ${
          darkMode ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-600'
        }`}>
          Target NE: {km.data.enodeb_name}
        </div>
      )}
      {isKpiMenu && (
        <div>
          <span className="font-semibold">Scope: </span>
          <span className="font-bold uppercase tracking-wider text-blue-500">
            {scope === 'sector' ? `Sector ${km.selectedSector}` : `${scope} (${km.aggregationMode})`}
          </span>
        </div>
      )}
    </footer>
  );
}
