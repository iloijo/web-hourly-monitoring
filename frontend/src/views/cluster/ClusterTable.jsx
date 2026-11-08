import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export const REMARK_COLOR = { Improve: '#16a34a', Maintain: '#f97316', Degrade: '#800000' };
const REMARK_ORDER = { Degrade: 0, Maintain: 1, Improve: 2, 'N/A': 3, '-': 4 };

export const fmt = (v) => (v === null || v === undefined
  ? '–'
  : Number(v).toLocaleString('id-ID', { maximumFractionDigits: Math.abs(v) < 1 ? 3 : 2 }));

export function RemarkBadge({ remark }) {
  const color = REMARK_COLOR[remark];
  if (!color) return <span className="opacity-50">{remark}</span>;
  return <span className="px-2 py-0.5 rounded-md text-white text-[10px] font-bold" style={{ backgroundColor: color }}>{remark}</span>;
}

// Worst first: Degrade, then the largest move against the KPI direction
const sortSiteRows = (rows, polarity) => [...rows].sort((a, b) => {
  const r = REMARK_ORDER[a.remark] - REMARK_ORDER[b.remark];
  if (r) return r;
  const sign = polarity === 'down' ? -1 : 1;
  return sign * ((a.growth ?? 0) - (b.growth ?? 0));
});

const POLARITY_HINT = { up: '↑ higher is better', down: '↓ lower is better', neutral: 'neutral (no remark)' };

// Before / After / Delta / Growth / Remark per KPI; a row opens the per-site breakdown
export default function ClusterTable({ result, kpiIds, siteNamesMap, darkMode }) {
  const [open, setOpen] = useState(null);
  const head = darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600';
  const rowCls = darkMode ? 'border-slate-800 hover:bg-slate-800/70' : 'border-slate-100 hover:bg-blue-50';
  const subCls = darkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-100';
  const ids = kpiIds.filter(id => result.kpis[id]);

  return (
    // contain: the wide table scrolls inside this box instead of widening the page
    <div className="overflow-auto max-h-[70vh] rounded-xl border border-inherit" style={{ contain: 'inline-size' }}>
      <table className="min-w-full text-[11px] whitespace-nowrap">
        <thead className="sticky top-0 z-10">
          <tr className={head}>
            {[['KPI'], ['Unit'], ['Before', `${result.before.start} – ${result.before.end}`], ['After', `${result.after.start} – ${result.after.end}`], ['Delta'], ['Growth (%)'], ['Remark']]
              .map(([h, sub]) => (
                <th key={h} title={sub} className="px-3 py-1.5 text-left font-bold text-[10px] uppercase tracking-wider">{h}</th>
              ))}
          </tr>
        </thead>
        <tbody>
          {ids.length === 0 && <tr><td colSpan={7} className="px-3 py-3 opacity-60">No KPI selected.</td></tr>}
          {ids.map(id => {
            const k = result.kpis[id];
            const isOpen = open === id;
            const siteRows = isOpen ? sortSiteRows(result.site_rows[id] || [], k.polarity) : [];
            return (
              <Fragment key={id}>
                <tr onClick={() => setOpen(isOpen ? null : id)} className={`border-t cursor-pointer ${rowCls}`} title={POLARITY_HINT[k.polarity]}>
                  <td className="px-3 py-1.5 font-semibold">
                    <span className="inline-flex items-center gap-1">
                      {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      {k.title}
                      <span className="opacity-50 font-normal">{k.polarity === 'up' ? '↑' : k.polarity === 'down' ? '↓' : ''}</span>
                    </span>
                  </td>
                  <td className="px-3 py-1.5 opacity-70">{k.unit}{k.per_day ? ' /day' : ''}</td>
                  <td className="px-3 py-1.5 font-mono">{fmt(k.before)}</td>
                  <td className="px-3 py-1.5 font-mono">{fmt(k.after)}</td>
                  <td className="px-3 py-1.5 font-mono">{fmt(k.delta)}</td>
                  <td className="px-3 py-1.5 font-mono font-bold">{fmt(k.growth)}</td>
                  <td className="px-3 py-1.5"><RemarkBadge remark={k.remark} /></td>
                </tr>
                {isOpen && siteRows.map(r => (
                  <tr key={`${id}_${r.site}`} className={`border-t ${subCls}`}>
                    <td className="pl-9 pr-3 py-1 font-mono">{r.site}{siteNamesMap[r.site] ? <span className="font-sans opacity-60"> – {siteNamesMap[r.site]}</span> : null}</td>
                    <td className="px-3 py-1 opacity-50">{k.unit}</td>
                    <td className="px-3 py-1 font-mono">{fmt(r.before)}</td>
                    <td className="px-3 py-1 font-mono">{fmt(r.after)}</td>
                    <td className="px-3 py-1 font-mono">{fmt(r.delta)}</td>
                    <td className="px-3 py-1 font-mono">{fmt(r.growth)}</td>
                    <td className="px-3 py-1"><RemarkBadge remark={r.remark} /></td>
                  </tr>
                ))}
                {isOpen && siteRows.length === 0 && (
                  <tr className={`border-t ${subCls}`}><td colSpan={7} className="pl-9 py-1 opacity-60">No per-site data.</td></tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
