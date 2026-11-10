import DataLoadingOverlay from '../components/DataLoadingOverlay';
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, MousePointerClick, Search, TrendingDown, X } from 'lucide-react';
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
  const [siteSearchInput, setSiteSearchInput] = useState('');
  const [activeSiteFilter, setActiveSiteFilter] = useState('');
  const [tableQuickFilter, setTableQuickFilter] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);
  const autoLoaded = useRef(false);

  const load = (f = filters, ds = dates, siteOverride = activeSiteFilter) => {
    const id = ++requestId.current;
    setLoading(true);
    const params = {
      tech: f.tech,
      start_date: ds.start,
      end_date: ds.end,
      top_n: topN,
      ...scopeParams(f),
    };
    if (siteOverride) {
      params.sites = siteOverride;
    }
    getJson('/api/worstcell', params)
      .then(json => { if (id === requestId.current) setResult({ ...json, filters: f }); })
      .catch(err => { if (id === requestId.current) setResult({ error: String(err) }); })
      .finally(() => { if (id === requestId.current) setLoading(false); });
  };

  const handleSearchSite = () => {
    const s = siteSearchInput.trim().toUpperCase();
    if (!s) return;
    setActiveSiteFilter(s);
    load(filters, dates, s);
  };

  const handleClearSite = () => {
    setSiteSearchInput('');
    setActiveSiteFilter('');
    load(filters, dates, '');
  };

  // Default: the latest day of the chosen technology (1 day, like the WPC report).
  // Opening the menu queries once right away with the defaults (4G, Regional).
  useEffect(() => {
    loadLatestDates().then(d => {
      const day = d[TECH_MENU[filters.tech]];
      setDates({ start: day, end: day });
      if (!autoLoaded.current) { autoLoaded.current = true; load(filters, { start: day, end: day }); }
    });
  }, [filters.tech]); // eslint-disable-line react-hooks/exhaustive-deps

  // Excel export of what is on screen: one sheet per KPI + Filters sheet
  useEffect(() => {
    if (!result?.kpis?.length) { onExportData(null); return undefined; }
    onExportData(() => {
      const sheets = result.kpis.map(k => ({
        name: `${k.title} (${k.op}${k.threshold})`,
        columns: ['Rank', 'Cell Name', 'Site', 'Branch', 'NOP', 'Kabupaten', 'Kecamatan', 'FAIL', `${k.title} (${k.unit})`, 'Days Failing', 'Days With Data'],
        rows: k.rows.map((r, i) => [i + 1, r.cell, r.site, r.branch, r.nop, r.kabupaten, r.kecamatan, r.fail, r.value, r.days_breach, r.days]),
        number_formats: { 'FAIL': '#,##0', [`${k.title} (${k.unit})`]: '0.00' }
      }));

      // Sheet Filters
      const filterRows = [
        ['Technology', result.tech.toUpperCase()],
        ['Scope', result.scope],
        ['Date Start', result.start_date],
        ['Date End', result.end_date],
        ['Top N', result.top_n]
      ];
      if (activeSiteFilter || result.sites) {
        filterRows.push(['Sites', activeSiteFilter || (result.sites || []).join(', ')]);
      }
      filterRows.push(['Exported at', new Date().toISOString().replace('T', ' ').slice(0, 19)]);

      sheets.push({
        name: 'Filters',
        columns: ['Filter', 'Value'],
        rows: filterRows
      });

      return {
        filename: `WorstCell_${result.tech.toUpperCase()}_${activeSiteFilter ? `${activeSiteFilter}_` : ''}${result.start_date}_${result.end_date}`,
        sheets,
      };
    });
    return () => onExportData(null);
  }, [result, activeSiteFilter, onExportData]);

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
        onAutoQuery={(f) => load(f)}
        loading={loading}
        darkMode={darkMode}
      >
        <div>
          <FilterLabel>SITE ID</FilterLabel>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              placeholder="e.g. SDR027"
              value={siteSearchInput}
              onChange={e => setSiteSearchInput(e.target.value.toUpperCase())}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSearchSite();
              }}
              className={`${dateCls} w-28 uppercase placeholder:normal-case`}
            />
            <button
              type="button"
              onClick={handleSearchSite}
              disabled={loading || !siteSearchInput.trim()}
              title="Search by Site ID"
              className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 flex items-center justify-center transition cursor-pointer disabled:opacity-50"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
            {activeSiteFilter && (
              <button
                type="button"
                onClick={handleClearSite}
                title="Clear Site filter"
                className={`p-1.5 rounded-lg border transition cursor-pointer ${darkMode ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-600'}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div>
          <FilterLabel>DATE</FilterLabel>
          <div className="flex items-center gap-1.5">
            <input type="date" value={dates.start} onChange={e => setDates({ ...dates, start: e.target.value })} className={dateCls} />
            <span className="text-xs opacity-60">to</span>
            <input type="date" value={dates.end} onChange={e => setDates({ ...dates, end: e.target.value })} className={dateCls} />
          </div>
        </div>
        <SimpleSelect label="TOP N" value={String(topN)} options={['5', '10', '20', '50']} onChange={v => setTopN(Number(v))} darkMode={darkMode} />
      </CellScopeFilters>

      {result?.error && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 text-xs ${darkMode ? 'bg-rose-950/40 border-rose-800 text-rose-200' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
          <AlertTriangle className="w-5 h-5 text-rose-500" /> Failed to load Worst Cell: {result.error}
        </div>
      )}

      {!result && !loading && (
        <div className={`py-16 text-center border-2 border-dashed rounded-2xl ${darkMode ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
          <MousePointerClick className="w-8 h-8 mx-auto mb-2 opacity-50 text-blue-500" />
          <p className="font-semibold text-sm">No data yet</p>
          <p className="text-xs opacity-75 mt-1">Choose technology, scope and date, then click Generate.</p>
        </div>
      )}

      {result?.kpis?.length > 0 && (
        <>
          <div className={`flex flex-wrap items-center gap-2 text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
            <TrendingDown className="w-4 h-4 text-rose-500" />
            <span className="font-bold">Worst Cell {result.tech.toUpperCase()}</span>
            <span>•</span>
            {activeSiteFilter || result.scope === 'site' ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                Site: {activeSiteFilter || (result.sites || []).join(', ')}
                <button type="button" onClick={handleClearSite} className="hover:text-rose-500 cursor-pointer ml-0.5" title="Clear Site filter">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ) : (
              <span>{scopeLabel(result.filters)}</span>
            )}
            <span>•</span>
            <span>{result.start_date === result.end_date ? result.start_date : `${result.start_date} to ${result.end_date} (${result.days} days)`}</span>
            <span className="opacity-60">• click a row to open the sector charts</span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="relative w-64">
              <input
                type="text"
                placeholder="Filter table..."
                value={tableQuickFilter}
                onChange={e => setTableQuickFilter(e.target.value)}
                className={`w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border font-medium ${darkMode ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500' : 'bg-white border-slate-200 text-slate-800 placeholder-slate-400'}`}
              />
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 opacity-50 pointer-events-none" />
              {tableQuickFilter && (
                <button
                  type="button"
                  onClick={() => setTableQuickFilter('')}
                  className="absolute right-2 top-2 opacity-60 hover:opacity-100 cursor-pointer"
                  title="Clear quick filter"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {tableQuickFilter && (
              <span className="text-[11px] opacity-70">
                Filtering by &quot;{tableQuickFilter}&quot;
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {result.kpis.map(k => {
              const q = tableQuickFilter.trim().toLowerCase();
              const displayRows = q
                ? k.rows.filter(r =>
                    (r.cell && r.cell.toLowerCase().includes(q)) ||
                    (r.site && r.site.toLowerCase().includes(q)) ||
                    (r.kabupaten && r.kabupaten.toLowerCase().includes(q))
                  )
                : k.rows;

              return (
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
                          {['#', 'Cell Name', 'Branch', 'NOP', 'Kabupaten', k.rank_by === 'fail' ? 'FAIL' : null, k.unit ? `${k.title} (${k.unit})` : k.title, isRange ? 'Days' : null]
                            .filter(Boolean).map(h => <th key={h} className="px-3 py-1.5 text-left font-bold text-[10px] uppercase tracking-wider">{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {displayRows.length === 0 && (
                          <tr>
                            <td colSpan={8} className="px-3 py-3 opacity-60">
                              {q
                                ? `No cells match "${tableQuickFilter}".`
                                : activeSiteFilter
                                  ? `No worst cells found for ${activeSiteFilter} on ${result.start_date === result.end_date ? result.start_date : `${result.start_date} to ${result.end_date}`}.`
                                  : 'No cell breaches the threshold.'}
                            </td>
                          </tr>
                        )}
                        {displayRows.map((r, i) => (
                          <tr key={r.cell} onClick={() => onOpenSite(result.tech, r.site)} className={`border-t cursor-pointer ${rowCls}`} title={`Open sector charts for ${r.site}`}>
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
              );
            })}
            {loading && <DataLoadingOverlay message="Loading Worst Cell data..." />}
          </div>
        </>
      )}
    </>
  );
}
