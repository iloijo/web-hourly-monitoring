import { CheckCircle2, Menu, RefreshCw } from 'lucide-react';
import { MENU_META } from '../../constants/menus';

const BADGE = {
  rose: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
  amber: 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800',
  blue: 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  emerald: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
};

const crumbColor = (menu) =>
  menu === 'packet-loss' ? 'rose' : menu.startsWith('ta') || menu === '4g-daily' ? 'amber' : 'blue';

// Top bar: page title, KPI date range + Generate (KPI menus only), charts per row and page actions
export default function AppHeader({
  activeMenu, sidebarOpen, onOpenSidebar, km, isKpiMenu, onSwitchMenu,
  chartsPerRow, setChartsPerRow, darkMode, children,
}) {
  const meta = MENU_META[activeMenu] || { title: activeMenu, crumbGroup: '', crumb: '', db: 'onedb' };
  const isTwoDb = meta.db === 'twodb';
  const isDaily = activeMenu === '4g-daily';
  const dateInputClass = `border rounded-lg px-2.5 py-1 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer shadow-2xs ${
    darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'
  }`;
  const labelClass = `text-[11px] font-semibold ${darkMode ? 'text-slate-400' : 'text-slate-600'}`;
  const pillBox = `flex items-center p-0.5 rounded-lg border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'}`;

  return (
    <header className={`h-14 border-b px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 transition-colors duration-300 ${
      darkMode ? 'bg-slate-900/95 border-slate-800 backdrop-blur' : 'bg-white/95 border-slate-200 backdrop-blur'
    }`}>
      <div className="flex items-center gap-3">
        {!sidebarOpen && (
          <button
            type="button"
            onClick={onOpenSidebar}
            className={`p-1.5 rounded-lg border transition cursor-pointer shadow-2xs ${
              darkMode ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
            title="Open Sidebar"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}

        <div className="flex items-center gap-2">
          <h1 className={`text-sm sm:text-base font-black tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>{meta.title}</h1>
          <div className={`hidden md:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${BADGE[crumbColor(activeMenu)]}`}>
            <span className="opacity-70 font-medium">{meta.crumbGroup}</span>
            <span className="opacity-40">/</span>
            <span className="font-bold">{meta.crumb}</span>
          </div>
        </div>

        <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${BADGE[isTwoDb ? 'emerald' : 'amber']}`}>
          <CheckCircle2 className={`w-3 h-3 ${isTwoDb ? 'text-emerald-500' : 'text-amber-500'}`} />
          <span>{isTwoDb ? 'TwoDb Live' : 'OneDb Live'}</span>
        </div>
      </div>

      <form onSubmit={km.handleGetData} className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
        {isKpiMenu && (
          <>
            <div className="flex items-center gap-1.5">
              <span className={labelClass}>Start:</span>
              <input type="date" value={km.startDate} onChange={(e) => km.setStartDate(e.target.value)} className={dateInputClass} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className={labelClass}>End:</span>
              <input type="date" value={km.endDate} onChange={(e) => km.setEndDate(e.target.value)} className={dateInputClass} />
            </div>

            {activeMenu.startsWith('4g') && (
              <div className={pillBox}>
                {[['4g-hourly', 'Hourly', 'bg-blue-600'], ['4g-daily', 'Daily', 'bg-amber-600']].map(([menu, text, activeBg]) => {
                  const active = menu === '4g-daily' ? isDaily : !isDaily;
                  return (
                    <button
                      key={menu}
                      type="button"
                      onClick={() => onSwitchMenu(menu)}
                      className={`px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                        active ? `${activeBg} text-white shadow-xs` : darkMode ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {text}
                    </button>
                  );
                })}
              </div>
            )}

            <button
              type="submit"
              disabled={km.loading}
              className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold transition flex items-center gap-1.5 shadow-md shadow-blue-500/20 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${km.loading ? 'animate-spin' : ''}`} />
              <span>{km.loading ? 'Loading...' : 'Generate'}</span>
            </button>
          </>
        )}

        <div className={`hidden lg:flex ${pillBox}`}>
          {[1, 2, 3].map(num => (
            <button
              key={num}
              type="button"
              onClick={() => setChartsPerRow(num)}
              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all duration-200 cursor-pointer ${
                chartsPerRow === num
                  ? darkMode ? 'bg-blue-600 text-white shadow-xs' : 'bg-white text-blue-700 shadow-xs ring-1 ring-slate-200/50'
                  : darkMode ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {num}
            </button>
          ))}
        </div>

        {children}
      </form>
    </header>
  );
}
