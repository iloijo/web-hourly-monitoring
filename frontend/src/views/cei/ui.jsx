import { BarChart3, Loader2 } from 'lucide-react';
import ReactECharts from '../../lib/echarts';

export function Card({ title, Icon = BarChart3, iconClass = 'text-blue-500', meta, darkMode, className = '', children }) {
  return (
    <div className={`p-4 rounded-xl min-w-0 ${darkMode ? 'bg-slate-900 border border-slate-800 shadow-md shadow-black/20' : 'bg-white border border-slate-200 shadow-sm'} ${className}`}>
      <div className={`flex items-center justify-between gap-2 mb-3 border-b pb-2 ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={`w-4 h-4 shrink-0 ${iconClass}`} />
          <h2 className={`text-xs font-bold uppercase tracking-wider truncate ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>{title}</h2>
        </div>
        {meta && <div className="text-[11px] font-semibold text-slate-400 shrink-0">{meta}</div>}
      </div>
      {children}
    </div>
  );
}

export function Tile({ label, Icon, iconClass, value, valueClass, children, darkMode }) {
  return (
    <div className={`p-4 rounded-xl ${darkMode ? 'bg-slate-900 border border-slate-800' : 'bg-white border border-slate-200 shadow-sm'}`}>
      <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
        <span className="font-bold uppercase tracking-wider">{label}</span>
        <Icon className={`w-4 h-4 ${iconClass}`} />
      </div>
      <div className={`text-2xl font-black tracking-tight ${valueClass}`}>{value}</div>
      <div className="mt-1.5 text-[11px] text-slate-400">{children}</div>
    </div>
  );
}

export const Chart = ({ option, h = 260 }) => <ReactECharts option={option} notMerge lazyUpdate style={{ height: h, width: '100%' }} />;

export const Spinner = ({ text }) => (
  <div className="h-48 flex items-center justify-center gap-2 text-xs text-slate-400"><Loader2 className="w-4 h-4 animate-spin" />{text}</div>
);
