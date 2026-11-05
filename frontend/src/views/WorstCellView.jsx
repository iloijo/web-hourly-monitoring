import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, MousePointerClick, TrendingDown } from 'lucide-react';
import { getJson } from '../api/client';
import { latestDates, loadLatestDates } from '../constants/dates';
import { FilterLabel } from '../components/filters/FilterLabel';
import SimpleSelect from '../components/filters/SimpleSelect';
import CellScopeFilters from './cells/CellScopeFilters';
import { scopeLabel, scopeParams } from './cells/scope';

const TECH_MENU = { '2g': '2g', '4g': '4g-daily', '5g': '5g' };
const fmtNum = (v) => (v === null || v === undefined ? '–' : Number(v).toLocaleString('id-ID'));

// Worst Cell Top-N (WPC) per KPI for 2G / 4G / 5G. Clicking a row opens that site's sector charts.
export default function WorstCellView({ hierarchyData, darkMode, onOpenSite, onExportData }) {
  const [filters, setFilters] = useState({ tech: '4g', scope: 'regional', nops: [], cities: [], kecamatans: [], kecKab: '' });
  const [dates, setDates] = useState({ start: latestDates['4g-daily'], end: latestDates['4g-daily'] });
  const [topN, setTopN] = useState(10);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  // Default: the latest day of the chosen technology (1 day, like the WPC report)
  useEffect(() => {
    loadLatestDates().then(d => {
      const day = d[TECH_MENU[filters.tech]];
      setDates({ start: day, end: day });
    });
  }, [filters.tech]);

  const load = (f = filters) => {
    const id = ++requestId.current;
    setLoading(true);
    getJson('/api/worstcell', { tech: f.tech, start_date: dates.start, end_date: dates.end, top_n: topN, ...scopeParams(f) })
      .then(json => { if (id === requestId.current) setResult({ ...json, filters: f }); })
      .catch(err => { if (id === requestId.current) setResult({ error: String(err) }); })
      .finally(() => { if (id === requestId.current) setLoading(false); });
  };

  // Excel export of what is on screen: one sheet per KPI
  useEffect(() => {
    if (!result?.kpis?.length) { onExportData(null); return undefined; }
    onExportData(() => ({
      filename: `WorstCell_${result.tech.toUpperCase()}_${result.start_date}_${result.end_date}`,
      sheets: result.kpis.map(k => ({
        name: `${k.title} (${k.op}${k.threshold})`,
        columns: ['Rank', 'Cell Name', 'Site', 'Branch', 'NOP', 'Kabupaten', 'Kecamatan', 'FAIL', `${k.title} (${k.unit})`, 'Hari Melanggar', 'Hari Data'],
        rows: k.rows.map((r, i) => [i + 1, r.cell, r.site, r.branch, r.nop, r.kabupaten, r.kecamatan, r.fail, r.value, r.days_breach, r.days]),
      })),
    }));
    return () => onExportData(null);
  }, [result, onExportData]);

  const isRange = result && result.start_date !== result.end_date;
  const card = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm';
  const head = darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600';
  const rowCls = darkMode ? 'border-slate-800 hover:bg-slate-800/70' : 'border-slate-100 hover:bg-blue-50';
  const dateCls = `border rounded-lg px-2.5 py-1.5 text-xs font-semibold cursor-pointer ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`;

  return (
    <>
      <CellScopeFilters
        filters={filters}
        setFilters={setFilters}
        hierarchyData={hierarchyData}
        onGenerate={() => load()}
        onAutoQuery={load}
        loading={loading}
        darkMode={darkMode}
      >
        <div>
          <FilterLabel>TANGGAL</FilterLabel>
          <div className="flex items-center gap-1.5">
            <input type="date" value={dates.start} onChange={e => setDates({ ...dates, start: e.target.value })} className={dateCls} />
            <span className="text-xs opacity-60">s/d</span>
            <input type="date" value={dates.end} onChange={e => setDates({ ...dates, end: e.target.value })} className={dateCls} />
          </div>
        </div>
        <SimpleSelect label="TOP N" value={String(topN)} options={['5', '10', '20', '50']} onChange={v => setTopN(Number(v))} darkMode={darkMode} />
      </CellScopeFilters>

      {result?.error && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 text-xs ${darkMode ? 'bg-rose-950/40 border-rose-800 text-rose-200' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
          <AlertTriangle className="w-5 h-5 text-rose-500" /> Gagal memuat Worst Cell: {result.error}
        </div>
      )}

      {!result && !loading && (
        <div className={`py-16 text-center border-2 border-dashed rounded-2xl ${darkMode ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
          <MousePointerClick className="w-8 h-8 mx-auto mb-2 opacity-50 text-blue-500" />
          <p className="font-semibold text-sm">Belum ada data</p>
          <p className="text-xs opacity-75 mt-1">Pilih teknologi, scope dan tanggal, lalu klik Generate.</p>
        </div>
      )}

      {result?.kpis?.length > 0 && (
        <>
          <div className={`flex flex-wrap items-center gap-2 text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
            <TrendingDown className="w-4 h-4 text-rose-500" />
            <span className="font-bold">Worst Cell {result.tech.toUpperCase()}</span>
            <span>•</span>
            <span>{scopeLabel(result.filters)}</span>
            <span>•</span>
            <span>{result.start_date === result.end_date ? result.start_date : `${result.start_date} s/d ${result.end_date} (${result.days} hari)`}</span>
            <span className="opacity-60">• klik baris untuk membuka grafik sektor</span>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {result.kpis.map(k => (
              <div key={k.id} className={`rounded-2xl border overflow-hidden ${card}`}>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <div className="text-xs font-bold">
                    {k.title} <span className="text-rose-500">({k.op}{k.threshold}{k.unit === '%' ? '%' : ` ${k.unit}`})</span>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
                    {k.total_breach.toLocaleString('id-ID')} cell melanggar
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-[11px] whitespace-nowrap">
                    <thead>
                      <tr className={head}>
                        {['#', 'Cell Name', 'Branch', 'NOP', 'Kabupaten', k.rank_by === 'fail' ? 'FAIL' : null, k.unit ? `${k.title} (${k.unit})` : k.title, isRange ? 'Hari' : null]
                          .filter(Boolean).map(h => <th key={h} className="px-3 py-1.5 text-left font-bold text-[10px] uppercase tracking-wider">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {k.rows.length === 0 && (
                        <tr><td colSpan={8} className="px-3 py-3 opacity-60">Tidak ada cell yang melanggar threshold.</td></tr>
                      )}
                      {k.rows.map((r, i) => (
                        <tr key={r.cell} onClick={() => onOpenSite(result.tech, r.site)} className={`border-t cursor-pointer ${rowCls}`} title={`Buka grafik sektor ${r.site}`}>
                          <td className="px-3 py-1.5 opacity-60">{i + 1}</td>
                          <td className="px-3 py-1.5 font-semibold max-w-72 truncate">{r.cell}</td>
                          <td className="px-3 py-1.5">{r.branch || '–'}</td>
                          <td className="px-3 py-1.5">{r.nop || '–'}</td>
                          <td className="px-3 py-1.5">{r.kabupaten || '–'}</td>
                          {k.rank_by === 'fail' && <td className="px-3 py-1.5 font-mono">{fmtNum(r.fail)}</td>}
                          <td className="px-3 py-1.5 font-mono font-bold text-rose-500">{fmtNum(r.value)}</td>
                          {isRange && <td className="px-3 py-1.5 font-mono">{r.days_breach}/{r.days}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
