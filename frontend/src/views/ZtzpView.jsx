import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, MousePointerClick, Moon as SleepIcon } from 'lucide-react';
import { getJson } from '../api/client';
import { latestDates, loadLatestDates } from '../constants/dates';
import { FilterLabel } from '../components/filters/FilterLabel';
import CellScopeFilters from './cells/CellScopeFilters';
import { scopeLabel, scopeParams } from './cells/scope';

const TECH_MENU = { '2g': '2g', '4g': '4g-daily', '5g': '5g' };
const PAGE = 500;
const CATEGORY_STYLE = {
  'Sleeping': 'bg-violet-600',
  'Low Payload': 'bg-amber-600',
  'Low Traffic': 'bg-orange-600',
  'Low Payload + Low Traffic': 'bg-rose-600',
  'Availability Issue': 'bg-slate-500',
};

// ZTZP (Zero Traffic Zero Payload): sleeping / low payload cells and availability issues on one date, with aging
export default function ZtzpView({ hierarchyData, darkMode, onOpenSite, onExportData }) {
  const [filters, setFilters] = useState({ tech: '4g', scope: 'regional', nops: [], cities: [], kecamatans: [], kecKab: '' });
  const [date, setDate] = useState(latestDates['4g-daily']);
  const [category, setCategory] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);
  const autoLoaded = useRef(false);

  const params = (f, cat, limit, d = date) => ({ tech: f.tech, date: d, category: cat || undefined, limit, ...scopeParams(f) });

  const load = (f = filters, cat = category, d = date) => {
    const id = ++requestId.current;
    setLoading(true);
    getJson('/api/ztzp', params(f, cat, PAGE, d))
      .then(json => { if (id === requestId.current) setResult({ ...json, filters: f }); })
      .catch(err => { if (id === requestId.current) setResult({ error: String(err) }); })
      .finally(() => { if (id === requestId.current) setLoading(false); });
  };

  // Opening the menu queries once right away with the defaults (4G, Regional, latest date)
  useEffect(() => {
    loadLatestDates().then(d => {
      const day = d[TECH_MENU[filters.tech]];
      setDate(day);
      if (!autoLoaded.current) { autoLoaded.current = true; load(filters, category, day); }
    });
  }, [filters.tech]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickCategory = (cat) => {
    const next = cat === category ? null : cat;
    setCategory(next);
    if (result && !result.error) load(result.filters, next);
  };

  // Export pulls the full list (all rows of the shown category / all categories)
  useEffect(() => {
    if (!result?.rows?.length) { onExportData(null); return undefined; }
    const f = result.filters;
    onExportData(async () => {
      const full = await getJson('/api/ztzp', { ...params(f, result.category, 0), date: result.date });
      const cols = ['Cell Name', 'Site', 'Branch', 'NOP', 'Kabupaten', 'Kecamatan', 'Kategori', 'Availability (%)', 'Payload (MB)'];
      if (full.has_traffic) cols.push('TCH Traffic (Erl)');
      cols.push('Aging (hari)');
      return {
        filename: `ZTZP_${full.tech.toUpperCase()}_${full.date}`,
        sheets: [
          {
            name: 'ZTZP',
            columns: cols,
            rows: full.rows.map(r => [
              r.cell, r.site, r.branch, r.nop, r.kabupaten, r.kecamatan, r.category, r.availability, r.payload_mb,
              ...(full.has_traffic ? [r.traffic_erl] : []), r.aging_capped ? `>=${r.aging_days}` : r.aging_days,
            ]),
          },
          { name: 'Ringkasan', columns: ['Kategori', 'Jumlah Cell'], rows: Object.entries(full.counts) },
        ],
      };
    });
    return () => onExportData(null);
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  const card = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm';
  const head = darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600';
  const rowCls = darkMode ? 'border-slate-800 hover:bg-slate-800/70' : 'border-slate-100 hover:bg-blue-50';
  const dateCls = `border rounded-lg px-2.5 py-1.5 text-xs font-semibold cursor-pointer ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`;
  const hasTraffic = result?.has_traffic;

  return (
    <>
      <CellScopeFilters
        filters={filters}
        setFilters={setFilters}
        hierarchyData={hierarchyData}
        onGenerate={() => load()}
        onAutoQuery={(f) => load(f)}
        loading={loading}
        darkMode={darkMode}
      >
        <div>
          <FilterLabel>TANGGAL</FilterLabel>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={dateCls} />
        </div>
      </CellScopeFilters>

      {result?.error && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 text-xs ${darkMode ? 'bg-rose-950/40 border-rose-800 text-rose-200' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
          <AlertTriangle className="w-5 h-5 text-rose-500" /> Gagal memuat ZTZP: {result.error}
        </div>
      )}

      {!result && !loading && (
        <div className={`py-16 text-center border-2 border-dashed rounded-2xl ${darkMode ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
          <MousePointerClick className="w-8 h-8 mx-auto mb-2 opacity-50 text-blue-500" />
          <p className="font-semibold text-sm">Belum ada data</p>
          <p className="text-xs opacity-75 mt-1">Pilih teknologi, scope dan tanggal, lalu klik Generate.</p>
        </div>
      )}

      {result && !result.error && (
        <div className={`rounded-2xl border ${card}`}>
          <div className="px-4 py-3 space-y-2.5 border-b border-inherit">
            <div className={`flex flex-wrap items-center gap-2 text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
              <SleepIcon className="w-4 h-4 text-violet-500" />
              <span className="font-bold">ZTZP {result.tech.toUpperCase()}</span>
              <span>•</span><span>{scopeLabel(result.filters)}</span>
              <span>•</span><span>{result.date}</span>
              <span className="opacity-60">
                • Availability ≥{result.rules.avail_ok}% & payload &lt;{result.rules.low_limit} MB{hasTraffic ? ` / traffic <${result.rules.low_limit} Erl` : ''};
                Availability Issue &lt;{result.rules.avail_down}%; aging maks. {result.aging_window} hari
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(result.counts).map(([cat, n]) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => pickCategory(cat)}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold text-white cursor-pointer transition ${CATEGORY_STYLE[cat] || 'bg-blue-600'} ${
                    category && category !== cat ? 'opacity-40' : ''
                  }`}
                >
                  {cat}: {n.toLocaleString('id-ID')}
                </button>
              ))}
              {category && (
                <button type="button" onClick={() => pickCategory(category)} className="px-3 py-1 rounded-full text-[11px] font-bold border cursor-pointer">
                  Tampilkan semua
                </button>
              )}
            </div>
          </div>

          <div className="overflow-auto max-h-[65vh]">
            <table className="min-w-full text-[11px] whitespace-nowrap">
              <thead className="sticky top-0">
                <tr className={head}>
                  {['#', 'Cell Name', 'Branch', 'NOP', 'Kabupaten', 'Kecamatan', 'Kategori', 'Avail (%)', 'Payload (MB)', hasTraffic ? 'Traffic (Erl)' : null, 'Aging (hari)']
                    .filter(Boolean).map(h => <th key={h} className="px-3 py-1.5 text-left font-bold text-[10px] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {result.rows.length === 0 && (
                  <tr><td colSpan={11} className="px-3 py-3 opacity-60">Tidak ada cell ZTZP untuk filter ini.</td></tr>
                )}
                {result.rows.map((r, i) => (
                  <tr key={r.cell} onClick={() => onOpenSite(result.tech, r.site)} className={`border-t cursor-pointer ${rowCls}`} title={`Buka grafik sektor ${r.site}`}>
                    <td className="px-3 py-1.5 opacity-60">{i + 1}</td>
                    <td className="px-3 py-1.5 font-semibold max-w-80 truncate">{r.cell}</td>
                    <td className="px-3 py-1.5">{r.branch || '–'}</td>
                    <td className="px-3 py-1.5">{r.nop || '–'}</td>
                    <td className="px-3 py-1.5">{r.kabupaten || '–'}</td>
                    <td className="px-3 py-1.5">{r.kecamatan || '–'}</td>
                    <td className="px-3 py-1.5">
                      <span className={`px-2 py-0.5 rounded-md text-white text-[10px] font-bold ${CATEGORY_STYLE[r.category] || 'bg-blue-600'}`}>{r.category}</span>
                    </td>
                    <td className="px-3 py-1.5 font-mono">{r.availability ?? '–'}</td>
                    <td className="px-3 py-1.5 font-mono">{r.payload_mb}</td>
                    {hasTraffic && <td className="px-3 py-1.5 font-mono">{r.traffic_erl ?? '–'}</td>}
                    <td className={`px-3 py-1.5 font-mono font-bold ${r.aging_days >= 7 ? 'text-rose-500' : ''}`}>
                      {r.aging_capped ? `≥${r.aging_days}` : r.aging_days}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.total > result.returned && (
            <div className="px-4 py-2 text-[11px] opacity-70 border-t border-inherit">
              Menampilkan {result.returned.toLocaleString('id-ID')} dari {result.total.toLocaleString('id-ID')} cell (aging terlama dulu). Export Excel berisi seluruh daftar.
            </div>
          )}
        </div>
      )}
    </>
  );
}
