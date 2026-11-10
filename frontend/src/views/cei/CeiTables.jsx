import { fmt, weekLabel } from './charts';

const th = 'p-2.5 font-bold uppercase tracking-wider text-[11px]';
const td = 'px-2.5 py-1.5';
const headCls = (dark) => (dark ? 'bg-slate-800/60 text-slate-200' : 'bg-slate-50 text-slate-600');
const rowCls = (dark) => `border-t ${dark ? 'border-slate-800 hover:bg-slate-800/50' : 'border-slate-100 hover:bg-blue-50/50'}`;

// Thin inline bar used inside table cells
const Bar = ({ value, max, color }) => (
  <div className="h-1.5 w-full rounded-full bg-slate-200/60 dark:bg-slate-700/60 overflow-hidden">
    <div className={`h-full rounded-full ${color}`} style={{ width: `${max ? Math.min(100, (100 * value) / max) : 0}%` }} />
  </div>
);

export function NopTable({ rows, darkMode }) {
  const sorted = [...rows].sort((a, b) => (b.bad_pct ?? 0) - (a.bad_pct ?? 0));
  const maxPct = Math.max(...sorted.map(r => r.bad_pct || 0), 1);
  const total = rows.reduce((a, r) => ({ bad: a.bad + r.bad, total: a.total + r.total }), { bad: 0, total: 0 });
  return (
    <table className="w-full text-left text-xs border-collapse">
      <thead><tr className={headCls(darkMode)}>
        <th className={th}>NOP</th>
        <th className={`${th} text-right`}>Bad</th>
        <th className={`${th} text-right`}>Total</th>
        <th className={`${th} w-2/5`}>% Bad Cell</th>
      </tr></thead>
      <tbody>
        {sorted.map(r => (
          <tr key={r.nop} className={rowCls(darkMode)}>
            <td className={`${td} font-semibold`}>{r.nop}</td>
            <td className={`${td} text-right font-mono`}>{fmt(r.bad)}</td>
            <td className={`${td} text-right font-mono opacity-70`}>{fmt(r.total)}</td>
            <td className={td}>
              <div className="flex items-center gap-2">
                <span className="w-12 text-right font-mono font-bold">{fmt(r.bad_pct, 2)}%</span>
                <Bar value={r.bad_pct || 0} max={maxPct} color={r.bad_pct > 12 ? 'bg-rose-500' : 'bg-amber-400'} />
              </div>
            </td>
          </tr>
        ))}
        <tr className={`${rowCls(darkMode)} font-bold`}>
          <td className={td}>Total</td>
          <td className={`${td} text-right font-mono`}>{fmt(total.bad)}</td>
          <td className={`${td} text-right font-mono opacity-70`}>{fmt(total.total)}</td>
          <td className={`${td} font-mono`}>{total.total ? fmt((100 * total.bad) / total.total, 2) : '–'}%</td>
        </tr>
      </tbody>
    </table>
  );
}

export function KabupatenTable({ rows, week, prevWeek, darkMode }) {
  const maxDelta = Math.max(...rows.map(r => Math.abs(r.delta)), 1);
  return (
    <table className="w-full text-left text-xs border-collapse">
      <thead className="sticky top-0 z-10"><tr className={headCls(darkMode)}>
        <th className={th}>#</th>
        <th className={th}>Kabupaten</th>
        <th className={`${th} text-right`}>{weekLabel(prevWeek)}</th>
        <th className={`${th} text-right`}>{weekLabel(week)}</th>
        <th className={`${th} w-1/5`}>Delta</th>
        <th className={`${th} text-right`}>Growth</th>
        <th className={th}>Most KQI Issue</th>
        <th className={th}>Top Demarcation</th>
      </tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.kabupaten} className={rowCls(darkMode)}>
            <td className={`${td} opacity-50`}>{i + 1}</td>
            <td className={`${td} font-semibold whitespace-nowrap`}>{r.kabupaten}</td>
            <td className={`${td} text-right font-mono opacity-70`}>{fmt(r.bad_prev)}</td>
            <td className={`${td} text-right font-mono font-bold`}>{fmt(r.bad)}</td>
            <td className={td}>
              <div className="flex items-center gap-2">
                <span className={`w-9 text-right font-mono font-bold ${r.delta > 0 ? 'text-rose-500' : r.delta < 0 ? 'text-emerald-500' : ''}`}>{r.delta > 0 ? '+' : ''}{fmt(r.delta)}</span>
                <Bar value={Math.abs(r.delta)} max={maxDelta} color={r.delta > 0 ? 'bg-rose-500' : 'bg-emerald-500'} />
              </div>
            </td>
            <td className={`${td} text-right font-mono`}>{r.growth_pct === null ? 'new' : `${r.growth_pct > 0 ? '+' : ''}${fmt(r.growth_pct, 1)}%`}</td>
            <td className={`${td} whitespace-nowrap`}>{r.most_kqi || '–'}</td>
            <td className={`${td} whitespace-nowrap`}>{r.top_demarcation || '–'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ThresholdTable({ kqis, darkMode }) {
  return (
    <table className="w-full text-left text-xs border-collapse">
      <thead><tr className={headCls(darkMode)}>
        <th className={th}>KQI</th><th className={`${th} text-right`}>Threshold BH</th><th className={th}>Fail when</th>
      </tr></thead>
      <tbody>
        {kqis.map(k => (
          <tr key={k.key} className={rowCls(darkMode)}>
            <td className={td}>{k.label}</td>
            <td className={`${td} text-right font-mono`}>{fmt(k.threshold, 2)} {k.unit}</td>
            <td className={td}>{k.direction === 'below' ? 'below' : 'above'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
