import { useState } from 'react';
import {
  Activity, BarChart3, Boxes, Calendar, ChevronDown, ChevronLeft, Clock, Database, LayoutDashboard, Moon, Radio, RadioTower, Smile, Target, TrendingDown, Wifi,
} from 'lucide-react';
import { APP_NAME, APP_VERSION } from '../../constants/kpis';

// Accent classes per menu (active background, dot, idle icon color)
const ACCENT = {
  emerald: { bg: 'bg-emerald-600', dot: 'bg-emerald-300', icon: 'text-emerald-500' },
  blue: { bg: 'bg-blue-600', dot: 'bg-emerald-400', icon: 'text-blue-500' },
  amber: { bg: 'bg-amber-600', dot: 'bg-amber-300', icon: 'text-amber-500' },
  cyan: { bg: 'bg-cyan-600', dot: 'bg-cyan-300', icon: 'text-cyan-500' },
  teal: { bg: 'bg-teal-600', dot: 'bg-teal-300', icon: 'text-teal-500' },
  rose: { bg: 'bg-rose-600', dot: 'bg-rose-300', icon: 'text-rose-500' },
  violet: { bg: 'bg-violet-600', dot: 'bg-violet-300', icon: 'text-violet-500' },
};

function MenuButton({ id, label, Icon, accent, tag, activeMenu, onSelect, darkMode, size = 'md' }) {
  const active = activeMenu === id;
  const a = ACCENT[accent];
  const sizeClass = size === 'sm' ? 'px-2 py-1.5 rounded-md font-semibold' : size === 'lg' ? 'px-3 py-2 rounded-lg font-bold' : 'px-2.5 py-1.5 rounded-lg font-bold';
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={`w-full flex items-center justify-between ${sizeClass} text-xs transition cursor-pointer ${
        active
          ? `${a.bg} text-white shadow-xs`
          : darkMode ? 'text-slate-300 hover:text-white hover:bg-slate-800/80' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
      }`}
    >
      <div className={`flex items-center ${size === 'lg' ? 'gap-2.5' : 'gap-2'}`}>
        <Icon className={`${size === 'lg' ? 'w-4 h-4' : 'w-3.5 h-3.5'} ${active ? 'text-white' : a.icon}`} />
        <span>{label}</span>
      </div>
      {active
        ? <span className={`w-2 h-2 rounded-full ${a.dot} animate-pulse`}></span>
        : <span className="text-[10px] opacity-60">{tag}</span>}
    </button>
  );
}

function Group({ label, Icon, iconClass, open, onToggle, darkMode, children }) {
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg font-bold text-xs transition cursor-pointer ${
          darkMode ? 'text-slate-200 hover:bg-slate-800/80' : 'text-slate-800 hover:bg-slate-100'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <Icon className={`w-4 h-4 ${iconClass}`} />
          <span>{label}</span>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className={`mt-1 ml-2.5 pl-2.5 border-l space-y-1 ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
          {children}
        </div>
      )}
    </div>
  );
}

const SectionTitle = ({ children, first = false }) => (
  <div className={`${first ? 'py-1.5' : 'pt-3 pb-1'} px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400`}>{children}</div>
);

function DbStatusRow({ label, port, ok }) {
  const color = ok === null ? 'text-slate-400' : ok ? 'text-emerald-500' : 'text-rose-500';
  const dot = ok === null ? 'bg-slate-400' : ok ? 'bg-emerald-500' : 'bg-rose-500';
  return (
    <div className="flex items-center justify-between">
      <span className="opacity-70">{label}</span>
      <span className={`font-bold flex items-center gap-1 ${color}`} title={ok === false ? 'Not connected' : ''}>
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`}></span>
        {ok === false ? 'Offline' : port}
      </span>
    </div>
  );
}

// Left navigation: Overview, Main KPI, Worst Cell / ZTZP, Others
export default function AppSidebar({ open, onClose, activeMenu, onSelectMenu, dbStatus, darkMode }) {
  const [kpiOpen, setKpiOpen] = useState(true);
  const [fourGOpen, setFourGOpen] = useState(true);
  const [taOpen, setTaOpen] = useState(true);
  const [okrOpen, setOkrOpen] = useState(true);
  const common = { activeMenu, onSelect: onSelectMenu, darkMode };

  return (
    <aside className={`fixed inset-y-0 left-0 z-40 w-64 transition-transform duration-300 ease-in-out flex flex-col shadow-2xl border-r ${
      darkMode ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
    } ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className={`h-14 border-b px-5 flex items-center justify-between ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center shadow-md shadow-blue-500/20 border border-blue-400/30 bg-slate-950 shrink-0">
            <img src="/netpulse-icon.png" alt="NetPulse Logo" className="w-full h-full object-cover" />
          </div>
          <div>
            <span className={`font-extrabold text-sm tracking-tight block leading-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>{APP_NAME}</span>
            <span className={`text-[10px] font-semibold tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{APP_VERSION}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={`p-1 rounded transition cursor-pointer ${darkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`}
          title="Hide Sidebar"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      </div>

      <div className="p-3 space-y-1 grow overflow-y-auto">
        <div className="mb-2">
          <MenuButton id="overview" label="Overview" Icon={LayoutDashboard} accent="blue" tag="OneDb" size="lg" {...common} />
        </div>

        <SectionTitle>Main KPI</SectionTitle>
        <Group label="KPI Monitoring" Icon={RadioTower} iconClass="text-blue-500" open={kpiOpen} onToggle={() => setKpiOpen(!kpiOpen)} darkMode={darkMode}>
          <div className="mb-0.5">
            <MenuButton id="2g" label="2G Monitoring" Icon={Radio} accent="emerald" tag="OneDb" {...common} />
          </div>
          <div className="mb-0.5">
            <button
              type="button"
              onClick={() => setFourGOpen(!fourGOpen)}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer ${
                activeMenu.startsWith('4g') && !fourGOpen
                  ? 'bg-blue-600 text-white'
                  : darkMode ? 'text-slate-200 hover:bg-slate-800/80' : 'text-slate-800 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <BarChart3 className="w-3.5 h-3.5 text-blue-500" />
                <span>4G Monitoring</span>
              </div>
              <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${fourGOpen ? 'rotate-180' : ''}`} />
            </button>
            {fourGOpen && (
              <div className={`mt-1 ml-2.5 pl-2.5 border-l space-y-1 ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
                <MenuButton id="4g-hourly" label="4G Hourly" Icon={Clock} accent="blue" tag="TwoDb" size="sm" {...common} />
                <MenuButton id="4g-daily" label="4G Daily" Icon={Calendar} accent="amber" tag="OneDb" size="sm" {...common} />
              </div>
            )}
          </div>
          <MenuButton id="5g" label="5G Monitoring" Icon={Wifi} accent="cyan" tag="OneDb" {...common} />
        </Group>
        <div className="pt-1">
          <MenuButton id="cluster" label="Cluster Monitoring" Icon={Boxes} accent="teal" tag="2G/4G/5G" size="lg" {...common} />
        </div>

        <div className="pt-1">
          <Group label="OKR" Icon={Target} iconClass="text-emerald-500" open={okrOpen} onToggle={() => setOkrOpen(!okrOpen)} darkMode={darkMode}>
            <MenuButton id="cei" label="CEI" Icon={Smile} accent="emerald" tag="OneDb/TwoDb" {...common} />
          </Group>
        </div>

        <SectionTitle>Worst Cell &amp; ZTZP</SectionTitle>
        <div className="space-y-1">
          <MenuButton id="worst-cell" label="Worst Cell Top-N" Icon={TrendingDown} accent="rose" tag="2G/4G/5G" size="lg" {...common} />
          <MenuButton id="ztzp" label="ZTZP" Icon={Moon} accent="violet" tag="2G/4G/5G" size="lg" {...common} />
        </div>

        <SectionTitle>Others</SectionTitle>
        <Group label="Timing Advance" Icon={Clock} iconClass="text-amber-500" open={taOpen} onToggle={() => setTaOpen(!taOpen)} darkMode={darkMode}>
          <MenuButton id="ta-4g" label="Timing Advance 4G" Icon={BarChart3} accent="amber" tag="OneDb" {...common} />
          <MenuButton id="ta-5g" label="Timing Advance 5G" Icon={BarChart3} accent="cyan" tag="OneDb" {...common} />
        </Group>
        <div className="space-y-1 pt-1 border-t border-slate-100 dark:border-slate-800">
          <MenuButton id="packet-loss" label="Packet Loss" Icon={Activity} accent="teal" tag="OneDb" size="lg" {...common} />
        </div>
      </div>

      <div className={`p-3 border-t text-xs ${darkMode ? 'border-slate-800 bg-slate-900/60' : 'border-slate-200 bg-slate-50'}`}>
        <div className="flex items-center gap-2 mb-1.5 font-bold">
          <Database className="w-3.5 h-3.5 text-blue-500" />
          <span className="text-[11px] text-slate-500 uppercase tracking-wider">Database Status</span>
        </div>
        <div className="text-[11px] font-mono leading-tight space-y-1">
          <DbStatusRow label="TwoDb (Hourly):" port="5434" ok={dbStatus.twodb_connected} />
          <DbStatusRow label="OneDb (Daily):" port="5432" ok={dbStatus.onedb_connected} />
        </div>
      </div>
    </aside>
  );
}
