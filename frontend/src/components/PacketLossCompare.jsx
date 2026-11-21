import { Fragment, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { getJson } from '../api/client';
import { shiftDate } from '../constants/dates';
import { RemarkBadge, fmt } from '../views/cluster/ClusterTable';
import { periodError } from '../views/cluster/PeriodControl';

const SITE_PAGE = 100;
const REMARK_RANK = { Degrade: 0, Maintain: 1, 'N/A': 2, Improve: 3, '-': 4 };

// Default periods: the last 7 days of the page's range as After, the 7 days before them as Before
export const defaultPeriod = (toDate) => ({
  before_start: shiftDate(toDate, -13), before_end: shiftDate(toDate, -7),
  after_start: shiftDate(toDate, -6), after_end: toDate,
});

// Worst first: loss rate Degrade, then the largest rise in loss rate
const worstFirst = (rows) => [...rows].sort((a, b) => {
  const ka = a.kpis.loss_rate;
  const kb = b.kpis.loss_rate;
  const r = (REMARK_RANK[ka.remark] ?? 5) - (REMARK_RANK[kb.remark] ?? 5);
  return r || (kb.delta ?? -Infinity) - (ka.delta ?? -Infinity);
});

// Rows of the Excel sheet: one per entity and one per site under it
export function compareSheetRows(result) {
  const rows = [];
  const add = (level, entity, site, name, kpis) => {
    const r = { Level: level, Entity: entity, Site: site, 'Site name': name };
    result.kpis.forEach(k => {
      const v = kpis[k.id];
      r[`${k.title} Before`] = v.before;
      r[`${k.title} After`] = v.after;
      r[`${k.title} Delta`] = v.delta;
      r[`${k.title} Growth %`] = v.growth;
      if (k.polarity !== 'neutral') r[`${k.title} Remark`] = v.remark;
    });
    rows.push(r);
  };
  result.entities.forEach(e => {
    add('Entity', e.entity, '', '', e.kpis);
    worstFirst(e.sites).forEach(s => add('Site', e.entity, s.site, s.name, s.kpis));
  });
  return rows;
}

// TWAMP Before vs After per entity of the scope (Cluster Monitoring rule), a row opens its sites
export default function PacketLossCompare({ params, toDate, period, setPeriod, result, setResult, darkMode }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);
  const [shown, setShown] = useState(SITE_PAGE);
  const p = period || defaultPeriod(toDate);
  const invalid = periodError(p);
  const paramsKey = JSON.stringify(params);

  const run = async () => {
    if (invalid) return;
    setLoading(true);
    setError('');
    try {
      const json = await getJson('/api/packet_loss/compare', { ...params, ...p });
      if (json.status === 'error') throw new Error(json.message || 'Failed to load data');
      setResult(json);
      setOpen(json.entities.length === 1 ? json.entities[0].entity : null);
      setShown(SITE_PAGE);
    } catch (e) {
      setError(String(e.message || e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  };
  // follows the page filters like the chart and the daily table
  useEffect(() => { run(); }, [paramsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const field = `border rounded-lg px-2 py-1 text-xs ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`;
  const head = darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600';
  const rowCls = darkMode ? 'border-slate-800 hover:bg-slate-800/60' : 'border-slate-100 hover:bg-blue-50/60';
  const subCls = darkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-100';
  const kpis = result?.kpis || [];
  const set = (key) => (e) => setPeriod({ ...p, [key]: e.target.value });

  const cells = (k, v) => (
    <Fragment key={k.id}>
      <td className="px-2 py-1.5 text-right font-mono border-l border-slate-500/15">{fmt(v.before)}</td>
      <td className="px-2 py-1.5 text-right font-mono">{fmt(v.after)}</td>
      {k.polarity !== 'neutral' && <>
        <td className="px-2 py-1.5 text-right font-mono">{fmt(v.delta)}</td>
        <td className="px-2 py-1.5"><RemarkBadge remark={v.remark} /></td>
      </>}
    </Fragment>
  );

  return (
    <div className={`rounded-2xl border overflow-hidden shadow-xs ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
      <div className="p-4 border-b flex flex-wrap items-end gap-3 border-slate-100 dark:border-slate-800 text-xs">
        {[['Before', 'before', 'text-blue-500'], ['After', 'after', 'text-emerald-500']].map(([label, key, color]) => (
          <div key={key} className="space-y-1">
            <div className={`font-bold ${color}`}>{label}</div>
            <div className="flex items-center gap-1.5">
              <input type="date" value={p[`${key}_start`]} onChange={set(`${key}_start`)} className={field} />
              <span className="opacity-50">–</span>
              <input type="date" value={p[`${key}_end`]} onChange={set(`${key}_end`)} className={field} />
            </div>
          </div>
        ))}
        <button type="button" onClick={run} disabled={loading || !!invalid}
          className="h-7 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1.5">
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Compare
        </button>
        <div className="text-[11px] text-slate-400 basis-full">
          Loss rate = lost / sent over the period; delay and jitter = mean of the days. Lower is better: remark Degrade / Improve when the change is beyond ±3 % (same rule as Cluster Monitoring). Click a row for its sites, worst first.
        </div>
        {invalid && <div className="text-rose-500 font-semibold basis-full">{invalid}</div>}
        {error && <div className="text-rose-500 font-semibold basis-full">{error}</div>}
        {result?.dropped?.length > 0 && (
          <div className="text-amber-600 basis-full" title={result.dropped.map(d => `${d.site} (${d.period}, ${d.days} day)`).join(', ')}>
            {result.dropped.length} site-day(s) left out: sent count above {result.outlier_factor}× the usual (broken counter) — {result.dropped.slice(0, 5).map(d => d.site).join(', ')}{result.dropped.length > 5 ? '…' : ''}
          </div>
        )}
      </div>

      {result && (
        <div className="overflow-auto max-h-[640px]" style={{ contain: 'inline-size' }}>
          <table className="min-w-full text-[11px] whitespace-nowrap">
            <thead className={`sticky top-0 z-10 ${head}`}>
              <tr className="text-[10px] uppercase tracking-wider">
                <th rowSpan={2} className="px-3 py-1.5 text-left">{result.scope === 'site' ? 'Site' : 'Entity'}</th>
                {kpis.map(k => (
                  <th key={k.id} colSpan={k.polarity === 'neutral' ? 2 : 4} className="px-2 py-1 text-center border-l border-slate-500/20">
                    {k.title} <span className="normal-case opacity-60">({k.unit})</span>
                  </th>
                ))}
              </tr>
              <tr className="text-[10px]">
                {kpis.map(k => (
                  <Fragment key={k.id}>
                    <th className="px-2 py-1 text-right font-semibold text-blue-500 border-l border-slate-500/20" title={`${result.before.start} – ${result.before.end}`}>Before</th>
                    <th className="px-2 py-1 text-right font-semibold text-emerald-500" title={`${result.after.start} – ${result.after.end}`}>After</th>
                    {k.polarity !== 'neutral' && <><th className="px-2 py-1 text-right font-semibold">Delta</th><th className="px-2 py-1 text-left font-semibold">Remark</th></>}
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.entities.length === 0 && (
                <tr><td colSpan={99} className="text-center py-8 text-slate-400">No TWAMP data in these periods.</td></tr>
              )}
              {result.entities.map(e => {
                const isOpen = open === e.entity;
                const sites = isOpen ? worstFirst(e.sites) : [];
                const single = result.scope === 'site';
                return (
                  <Fragment key={e.entity}>
                    <tr onClick={() => { if (!single) { setOpen(isOpen ? null : e.entity); setShown(SITE_PAGE); } }}
                      className={`border-t ${rowCls} ${single ? '' : 'cursor-pointer'}`}>
                      <td className="px-3 py-1.5 font-semibold">
                        <span className="inline-flex items-center gap-1">
                          {!single && (isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />)}
                          {e.entity}
                          {!single && <span className="font-normal opacity-50">({e.sites.length} sites)</span>}
                        </span>
                      </td>
                      {kpis.map(k => cells(k, e.kpis[k.id]))}
                    </tr>
                    {sites.slice(0, shown).map(s => (
                      <tr key={`${e.entity}_${s.site}`} className={`border-t ${subCls}`}>
                        <td className="pl-8 pr-3 py-1 font-mono" title={s.name}>
                          {s.site}<span className="font-sans opacity-60">{s.name && s.name !== s.site ? ` – ${s.name.replace(`${s.site} - `, '')}` : ''}</span>
                        </td>
                        {kpis.map(k => cells(k, s.kpis[k.id]))}
                      </tr>
                    ))}
                    {isOpen && sites.length > shown && (
                      <tr className={`border-t ${subCls}`}>
                        <td colSpan={99} className="pl-8 py-1.5">
                          <button type="button" onClick={() => setShown(n => n + SITE_PAGE)} className="text-blue-600 font-semibold cursor-pointer hover:underline">
                            Show {Math.min(SITE_PAGE, sites.length - shown)} more of {sites.length - shown} sites
                          </button>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!result && loading && <div className="p-6 text-xs opacity-70">Comparing the two periods…</div>}
    </div>
  );
}
