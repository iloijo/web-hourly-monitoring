import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export const REMARK_COLOR = {
  Improve: '#16a34a',
  Improved: '#16a34a',
  Maintain: '#f97316',
  Maintained: '#f97316',
  Degrade: '#dc2626',
  Degraded: '#dc2626',
};
const REMARK_ORDER = {
  Degrade: 0,
  Degraded: 0,
  Maintain: 1,
  Maintained: 1,
  Improve: 2,
  Improved: 2,
  'N/A': 3,
  '-': 4,
};

export const fmt = (v) => (v === null || v === undefined
  ? '–'
  : Number(v).toLocaleString('id-ID', { maximumFractionDigits: Math.abs(v) < 1 ? 3 : 2 }));

export function RemarkBadge({ remark }) {
  const color = REMARK_COLOR[remark];
  if (!color) return <span className="opacity-50">{remark}</span>;
  return <span className="px-2 py-0.5 rounded-md text-white text-[10px] font-bold" style={{ backgroundColor: color }}>{remark}</span>;
}

// Worst first: Degrade, then the largest move against the KPI direction
export const sortSiteRows = (rows, polarity) => [...rows].sort((a, b) => {
  const r = REMARK_ORDER[a.remark] - REMARK_ORDER[b.remark];
  if (r) return r;
  const sign = polarity === 'down' ? -1 : 1;
  return sign * ((a.growth ?? 0) - (b.growth ?? 0));
});

const POLARITY_HINT = { up: '↑ higher is better', down: '↓ lower is better', neutral: 'neutral (no remark)' };

// Before / After / Delta / Growth / Remark per KPI; a row opens the per-site breakdown
export default function ClusterTable({ result, kpiIds, siteNamesMap, darkMode, compact = false, fullHeight = false }) {
  const [open, setOpen] = useState(null);
  const borderCls = darkMode ? 'border-slate-700/80' : 'border-slate-200/90';
  const head = darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600';
  const rowCls = darkMode ? 'border-slate-700/80 hover:bg-slate-800/70' : 'border-slate-200/90 hover:bg-blue-50';
  const subCls = darkMode ? 'bg-slate-900/60 border-slate-700/80' : 'bg-slate-50 border-slate-200/90';
  const stickyBg = darkMode ? 'bg-slate-900' : 'bg-white';
  const stickySubBg = darkMode ? 'bg-slate-900' : 'bg-slate-50';
  const ids = kpiIds.filter(id => result.kpis[id]);

  const pCell = compact ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-[11px]';
  const pHead = compact ? 'px-2 py-1.5 text-[10px]' : 'px-3 py-1.5 text-[10px]';

  return (
    <div className={`rounded-2xl border ${borderCls} shadow-xs overflow-hidden flex flex-col ${
      darkMode ? 'bg-slate-800/90' : 'bg-white'
    } ${fullHeight ? '' : (compact ? 'max-h-[calc(100vh-160px)] min-h-[350px]' : 'max-h-[75vh]')}`}>
      {compact && (
        <div className={`px-3 py-2 border-b ${borderCls} flex items-center justify-between text-xs font-bold ${
          darkMode ? 'bg-slate-800/90 text-slate-200' : 'bg-slate-50 text-slate-700'
        }`}>
          <span className="uppercase tracking-wider text-[11px]">Table Summary</span>
          <span className="text-[10px] font-normal opacity-70">({ids.length} KPIs)</span>
        </div>
      )}
      {/* contain: the wide table scrolls inside this box instead of widening the page */}
      <div className={`overflow-x-auto ${fullHeight ? '' : 'overflow-y-auto grow'}`} style={{ contain: 'inline-size' }}>
        <table className="min-w-full whitespace-nowrap">
          <thead className="sticky top-0 z-10">
            <tr className={head}>
              {[['KPI'], ['Unit'], ['Before', `${result.before.start} – ${result.before.end}`], ['After', `${result.after.start} – ${result.after.end}`], ['Delta'], ['Growth (%)'], ['Remark']]
                .map(([h, sub], idx) => (
                  <th
                    key={h}
                    title={sub}
                    className={`${pHead} text-left font-bold uppercase tracking-wider ${
                      idx === 0 ? `sticky left-0 z-20 ${head} shadow-xs border-r ${borderCls}` : ''
                    }`}
                  >
                    {h}
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {ids.length === 0 && <tr><td colSpan={7} className="px-3 py-3 opacity-60 text-xs">No KPI selected.</td></tr>}
            {ids.map(id => {
              const k = result.kpis[id];
              const isOpen = open === id;
              const siteRows = isOpen ? sortSiteRows(result.site_rows[id] || [], k.polarity) : [];
              return (
                <Fragment key={id}>
                  <tr onClick={() => setOpen(isOpen ? null : id)} className={`border-t cursor-pointer ${rowCls}`} title={POLARITY_HINT[k.polarity]}>
                    <td className={`${pCell} font-semibold sticky left-0 z-10 ${stickyBg} border-r ${borderCls} shadow-xs`}>
                      <span className="inline-flex items-center gap-1">
                        {isOpen ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
                        <span className="truncate max-w-[140px] sm:max-w-none">{k.title}</span>
                        <span className="opacity-50 font-normal">{k.polarity === 'up' ? '↑' : k.polarity === 'down' ? '↓' : ''}</span>
                      </span>
                    </td>
                    <td className={`${pCell} opacity-70`}>{k.unit}{k.per_day ? ' /day' : ''}</td>
                    <td className={`${pCell} font-mono`}>{fmt(k.before)}</td>
                    <td className={`${pCell} font-mono`}>{fmt(k.after)}</td>
                    <td className={`${pCell} font-mono`}>{fmt(k.delta)}</td>
                    <td className={`${pCell} font-mono font-bold`}>{fmt(k.growth)}</td>
                    <td className={pCell}><RemarkBadge remark={k.remark} /></td>
                  </tr>
                  {isOpen && siteRows.map(r => (
                    <tr key={`${id}_${r.site}`} className={`border-t ${subCls}`}>
                      <td className={`${compact ? 'pl-6 pr-2 py-1 text-[10px]' : 'pl-9 pr-3 py-1 text-[11px]'} font-mono sticky left-0 z-10 ${stickySubBg} border-r ${borderCls} shadow-xs`}>
                        {r.site}{siteNamesMap[r.site] ? <span className="font-sans opacity-60"> – {siteNamesMap[r.site]}</span> : null}
                      </td>
                      <td className={`${pCell} opacity-50`}>{k.unit}</td>
                      <td className={`${pCell} font-mono`}>{fmt(r.before)}</td>
                      <td className={`${pCell} font-mono`}>{fmt(r.after)}</td>
                      <td className={`${pCell} font-mono`}>{fmt(r.delta)}</td>
                      <td className={`${pCell} font-mono`}>{fmt(r.growth)}</td>
                      <td className={pCell}><RemarkBadge remark={r.remark} /></td>
                    </tr>
                  ))}
                  {isOpen && siteRows.length === 0 && (
                    <tr className={`border-t ${subCls}`}><td colSpan={7} className="pl-9 py-1 opacity-60 text-xs">No per-site data.</td></tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
