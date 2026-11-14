import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BarChart3, ChevronDown, LayoutGrid, MousePointerClick, RefreshCw, Table2 } from 'lucide-react';
import DataLoadingOverlay from '../components/DataLoadingOverlay';
import KpiDropdownPopover from '../components/KpiDropdownPopover';
import MultiSelectDropdown from '../components/MultiSelectDropdown';
import SectorPayloadChart, { BAND_COLORS, ENTITY_PALETTE } from '../components/SectorPayloadChart';
import SegmentedToggle from '../components/filters/SegmentedToggle';
import { FilterLabel } from '../components/filters/FilterLabel';
import { fieldClass } from '../components/filters/styles';
import useClickOutside from '../hooks/useClickOutside';
import { authHeaders, getJson, postJson } from '../api/client';
import { DEFAULT_DAILY_KPIS } from '../constants/kpis';
import { loadLatestDates, shiftDate } from '../constants/dates';
import ClusterEditor from './cluster/ClusterEditor';
import ClusterTable, { sortSiteRows } from './cluster/ClusterTable';
import PeriodControl, { periodError } from './cluster/PeriodControl';
import MarkerControl from './kpi/MarkerControl';
import { memberLabel, memberSite } from './cluster/members';

const TECHS = [['2g', '2G'], ['4g', '4G'], ['5g', '5G']];
const DEFAULT_KPIS = {
  '2g': ['payload_total', 'tch_traffic', 'availability', 'sdsr', 'tch_drop_rate', 'hosr'],
  '4g': DEFAULT_DAILY_KPIS,
  '5g': ['payload', 'user_dl_thp', 'dl_prb', 'sn_setup_sr', 'availability', 'retainability'],
};
const PERIOD_COLORS = { before: '#3b82f6', after: '#10b981' };
const PERIOD_KEYS = ['before_start', 'before_end', 'after_start', 'after_end'];
const EMPTY_DRAFT = { name: '', pic: '', description: '', members: [], markers: [], before_start: '', before_end: '', after_start: '', after_end: '' };
const MAX_CHART_DAYS = 180;
const dayCount = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000) + 1;
// Default periods: last 7 days of data vs the 7 days before them (one day gap)
const defaultPeriods = (latest) => (latest ? {
  before_start: shiftDate(latest, -14), before_end: shiftDate(latest, -8),
  after_start: shiftDate(latest, -6), after_end: latest,
} : {});

const gridClass = (perRow) =>
  perRow === 1 ? 'grid-cols-1' : perRow === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';

const toDraft = (c) => ({
  name: c.name, pic: c.pic, description: c.description,
  members: c.members.map(m => (m.sector === null ? m.site_id : `${m.site_id}_${m.sector}`)).sort(),
  markers: c.markers || [],
  ...Object.fromEntries(PERIOD_KEYS.map(k => [k, c[k] || ''])),
});

const toPayload = (d) => ({
  ...d,
  ...Object.fromEntries(PERIOD_KEYS.map(k => [k, d[k] || null])),
  members: d.members.map(m => ({ site_id: memberSite(m), sector: m.includes('_') ? Number(m.split('_')[1]) : null })),
});

// Cluster store calls; the server's error text (e.g. write role not configured) is kept in the thrown Error
async function sendJson(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

// "FILTER KPI" popover with its own per-technology selection
function ClusterKpiFilter({ catalog, selected, setSelected, defaults, darkMode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close);
  return (
    <div className="relative" ref={ref}>
      <FilterLabel>FILTER KPI</FilterLabel>
      <button type="button" onClick={() => setOpen(!open)} className={`flex items-center justify-between gap-2 min-w-36 border rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${fieldClass(darkMode)}`}>
        <span>{selected.length} KPIs selected</span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>
      <KpiDropdownPopover
        isOpen={open}
        onClose={close}
        allKpis={catalog}
        selectedKpiIds={selected}
        onToggleKpi={(id) => setSelected(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])}
        onToggleCategory={(ids, on) => setSelected(on ? Array.from(new Set([...selected, ...ids])) : selected.filter(x => !ids.includes(x)))}
        onSelectAll={() => setSelected(catalog.map(k => k.id))}
        onDeselectAll={() => setSelected([])}
        onSelectDefault={() => setSelected(defaults)}
        darkMode={darkMode}
      />
    </div>
  );
}

// Cluster Monitoring: custom site / site-sector cluster, daily trend and Before vs After on 2G / 4G / 5G
const SITE_CURVE_LIMIT = 20; // keep in sync with queries_cluster.SITE_CURVE_LIMIT

export default function ClusterMonitoringView({ refData, chartsPerRow, darkMode, onExportData, authUser }) {
  const { hierarchyData, allSites, sites2g, sites5g, siteNamesMap, dailyKpisList, kpis2gList, kpis5gList } = refData;
  const catalogs = { '2g': kpis2gList, '4g': dailyKpisList, '5g': kpis5gList };

  const [clusters, setClusters] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [storeError, setStoreError] = useState('');
  const [storeInfo, setStoreInfo] = useState('');
  const [siteSectors, setSiteSectors] = useState({});

  const [setFilter, setSetFilter] = useState({ nops: [], cities: [], kecamatans: [] });
  const [tech, setTech] = useState('4g');
  const [viewMode, setViewMode] = useState('combine');
  const [range, setRange] = useState({ start: '', end: '' }); // chart date range (not saved)
  const [latest, setLatest] = useState('');
  const [chartMode, setChartMode] = useState('cluster');
  const [kpiSel, setKpiSel] = useState(DEFAULT_KPIS);
  const [request, setRequest] = useState(null); // last generated request (without tech)
  const [results, setResults] = useState({}); // tech -> { key, data | error }
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  const loadClusters = useCallback(() => sendJson('GET', '/api/clusters')
    .then(json => { setClusters(json.clusters || []); setStoreError(''); })
    .catch(err => setStoreError(`Cannot load the cluster list: ${err.message}`)), []);

  useEffect(() => {
    loadClusters();
    getJson('/api/cluster/site_sectors').then(json => setSiteSectors(json.site_sectors || {})).catch(() => {});
    loadLatestDates().then(d => {
      const last = d['4g-daily'];
      setLatest(last);
      setRange(prev => (prev.end ? prev : { start: shiftDate(last, -29), end: last }));
      setDraft(prev => (prev.after_end ? prev : { ...prev, ...defaultPeriods(last) }));
    });
  }, [loadClusters]);

  const knownSites = useMemo(
    () => new Set([...(hierarchyData?.sites || []), ...allSites, ...sites2g, ...sites5g, ...Object.keys(siteSectors)]),
    [hierarchyData, allSites, sites2g, sites5g, siteSectors]
  );

  // ---- saved clusters ----
  const selectCluster = (id) => {
    setSelectedId(id);
    setStoreInfo('');
    const c = clusters.find(x => x.id === id);
    setDraft(c ? toDraft(c) : { ...EMPTY_DRAFT, ...defaultPeriods(latest) });
    setSetFilter({ nops: [], cities: [], kecamatans: [] });
  };

  const saveCluster = async (asNew) => {
    setSaving(true); setStoreError(''); setStoreInfo('');
    try {
      const saved = selectedId && !asNew
        ? await sendJson('PUT', `/api/clusters/${selectedId}`, toPayload(draft))
        : await sendJson('POST', '/api/clusters', toPayload(draft));
      await loadClusters();
      setSelectedId(saved.id);
      setStoreInfo(`Cluster "${saved.name}" saved.`);
    } catch (err) {
      setStoreError(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const deleteCluster = async () => {
    const c = clusters.find(x => x.id === selectedId);
    if (!c || !window.confirm(`Delete cluster "${c.name}"? It is removed for every user and cannot be restored.`)) return;
    setSaving(true); setStoreError('');
    try {
      await sendJson('DELETE', `/api/clusters/${selectedId}`);
      await loadClusters();
      setSelectedId(null);
      setDraft({ ...EMPTY_DRAFT, ...defaultPeriods(latest) });
      setStoreInfo(`Cluster "${c.name}" deleted.`);
    } catch (err) {
      setStoreError(`Delete failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // ---- set filter: NOP / Kabupaten / Kecamatan narrowed to the cluster, applied as intersection ----
  const siteMap = hierarchyData?.site_map || {};
  const memberMeta = useMemo(() => draft.members.map(m => ({ m, meta: siteMap[memberSite(m)] || {} })), [draft.members, siteMap]);
  const uniq = (list) => [...new Set(list.filter(Boolean))].sort();
  const nopOptions = uniq(memberMeta.map(x => x.meta.nop));
  const cityOptions = uniq(memberMeta.filter(x => !setFilter.nops.length || setFilter.nops.includes(x.meta.nop)).map(x => x.meta.kabupaten));
  const kecOptions = uniq(memberMeta
    .filter(x => (!setFilter.nops.length || setFilter.nops.includes(x.meta.nop)) && (!setFilter.cities.length || setFilter.cities.includes(x.meta.kabupaten)))
    .map(x => x.meta.kecamatan));
  const effectiveMembers = memberMeta.filter(({ meta }) =>
    (!setFilter.nops.length || setFilter.nops.includes(meta.nop))
    && (!setFilter.cities.length || setFilter.cities.includes(meta.kabupaten))
    && (!setFilter.kecamatans.length || setFilter.kecamatans.includes(meta.kecamatan))).map(x => x.m);

  // ---- ownership: the creator and SuperAdmin may edit / delete a saved cluster ----
  const selectedCluster = clusters.find(c => c.id === selectedId) || null;
  const canManage = !selectedCluster || !!authUser?.is_super
    || (!!selectedCluster.created_by && selectedCluster.created_by === authUser?.username);

  // ---- By Site curve: only offered when the cluster has fewer than SITE_CURVE_LIMIT sites ----
  const curveSiteCount = useMemo(() => new Set(effectiveMembers.map(memberSite)).size, [effectiveMembers]);
  const siteCurveOffered = curveSiteCount < SITE_CURVE_LIMIT;
  const curveMode = chartMode === 'site' && !siteCurveOffered ? 'cluster' : chartMode;
  const curveOptions = [['cluster', 'Cluster'], ['band', 'Per Band'], ...(siteCurveOffered ? [['site', 'Per Site']] : [])];

  // ---- data ----
  const fetchTech = useCallback((t, req) => {
    const key = JSON.stringify(req);
    const id = ++reqId.current;
    setLoading(true);
    postJson('/api/cluster/compare', { tech: t, ...req })
      .then(data => setResults(prev => ({ ...prev, [t]: { key, data } })))
      .catch(err => setResults(prev => ({ ...prev, [t]: { key, error: err.message } })))
      .finally(() => { if (id === reqId.current) setLoading(false); });
  }, []);

  const rangeError = !range.start || !range.end ? 'Set the chart date range.'
    : range.start > range.end ? 'Start date must be on or before the end date.'
      : dayCount(range.start, range.end) > MAX_CHART_DAYS ? `Chart range is limited to ${MAX_CHART_DAYS} days.` : '';
  const inputError = rangeError || periodError(draft);

  const generate = () => {
    if (!effectiveMembers.length || inputError) return;
    const req = {
      members: effectiveMembers,
      start_date: range.start,
      end_date: range.end,
      ...Object.fromEntries(PERIOD_KEYS.map(k => [k, draft[k]])),
    };
    setRequest(req);
    setResults({});
    fetchTech(tech, req);
  };

  // A generated request also loads the other technology tabs when they are opened
  useEffect(() => {
    if (request && results[tech]?.key !== JSON.stringify(request)) fetchTech(tech, request);
  }, [tech]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = results[tech];
  const result = current?.data;
  const selectedKpis = kpiSel[tech];
  const currentCatalog = catalogs[tech] || [];
  const totalCatalogKpis = currentCatalog.length || (result?.kpis ? Object.keys(result.kpis).length : 0);
  const isAllKpis = totalCatalogKpis > 0 && (selectedKpis || []).length >= totalCatalogKpis;

  // ---- export ----
  useEffect(() => {
    if (!result) { onExportData(null); return undefined; }
    onExportData(async () => {
      const ids = Object.keys(result.kpis);
      const t = result.tech.toUpperCase();
      const clusterTitle = `Cluster ${draft.name || 'Custom'} – ${t}`;
      const periodBanner = `Before: ${result.before.start}..${result.before.end}   After: ${result.after.start}..${result.after.end}   Members: ${request?.members?.length || 0}   Exported: ${new Date().toISOString().replace('T', ' ').slice(0, 19)}`;

      // 1. Summary sheet
      const summarySheet = {
        name: `Summary ${t}`,
        style: 'cluster',
        title: clusterTitle,
        period_banner: periodBanner,
        columns: ['KPI', 'Unit', 'Polarity', `Before (${result.before.start}..${result.before.end})`, `After (${result.after.start}..${result.after.end})`, 'Delta', 'Growth (%)', 'Remark'],
        rows: ids.map(id => {
          const k = result.kpis[id];
          return [
            k.title,
            k.unit + (k.per_day ? ' /day' : ''),
            k.polarity,
            k.before,
            k.after,
            k.delta,
            k.growth !== null && k.growth !== undefined ? k.growth / 100 : null,
            k.remark
          ];
        }),
        number_formats: {
          [`Before (${result.before.start}..${result.before.end})`]: '#,##0.00',
          [`After (${result.after.start}..${result.after.end})`]: '#,##0.00',
          'Delta': '#,##0.00',
          'Growth (%)': '0.00%'
        },
        remark_column: 'Remark',
        polarity_column: 'Polarity',
        delta_column: 'Delta'
      };

      // 2. Per Site sheet: grouped per KPI, sorted worst first using sortSiteRows
      const perSiteGroups = ids.map(id => {
        const k = result.kpis[id];
        const rawRows = result.site_rows[id] || [];
        const sorted = sortSiteRows(rawRows, k.polarity);
        return {
          title: `${k.title} (${k.unit + (k.per_day ? ' /day' : '')})`,
          rows: sorted.map(r => [
            r.site,
            siteNamesMap[r.site] || '',
            r.before,
            r.after,
            r.delta,
            r.growth !== null && r.growth !== undefined ? r.growth / 100 : null,
            r.remark
          ])
        };
      });

      const perSiteSheet = {
        name: `Per Site ${t}`,
        style: 'cluster_grouped',
        columns: ['Site', 'Site Name', 'Before', 'After', 'Delta', 'Growth (%)', 'Remark'],
        groups: perSiteGroups,
        number_formats: {
          'Before': '#,##0.00',
          'After': '#,##0.00',
          'Delta': '#,##0.00',
          'Growth (%)': '0.00%'
        },
        remark_column: 'Remark',
        delta_column: 'Delta'
      };

      // 3. Charts sheet
      const clusterCharts = [];
      if (result.timestamps && result.timestamps.length > 0) {
        const byBand = curveMode === 'band';
        ids.forEach(id => {
          const k = result.kpis[id];
          if (!k) return;
          if (curveMode === 'site' && k.site_series) {
            clusterCharts.push({
              title: `${k.title} (${k.unit})`,
              unit: k.unit,
              categories: result.timestamps,
              series: Object.entries(k.site_series).map(([site, vals], idx) => ({
                name: site,
                band: 'ENTITY',
                color: ENTITY_PALETTE[idx % ENTITY_PALETTE.length],
                values: vals
              }))
            });
          } else if (byBand && k.band_series) {
            const bEntries = Object.entries(k.band_series);
            clusterCharts.push({
              title: `${k.title} (${k.unit})`,
              unit: k.unit,
              categories: result.timestamps,
              series: bEntries.map(([band, vals]) => ({
                name: band,
                band: band,
                color: BAND_COLORS[band] || '#4e79a7',
                values: vals
              })),
              total: k.has_total && k.cluster_series ? {
                name: `Total ${k.title}`,
                values: k.cluster_series
              } : undefined
            });
          } else if (k.cluster_series) {
            clusterCharts.push({
              title: `${k.title} (${k.unit})`,
              unit: k.unit,
              categories: result.timestamps,
              series: [{
                name: 'Cluster',
                band: 'ENTITY',
                color: '#3b82f6',
                values: k.cluster_series
              }]
            });
          }
        });
      }

      // 4. Members sheet
      const memberList = request?.members || [];
      const membersSheet = {
        name: 'Members',
        columns: ['Member', 'Site', 'NOP', 'Kabupaten', 'Kecamatan', 'Has data'],
        rows: memberList.map(m => {
          const meta = siteMap[memberSite(m)] || {};
          return [
            memberLabel(m),
            memberSite(m),
            meta.nop || '',
            meta.kabupaten || '',
            meta.kecamatan || '',
            result.sites_with_data.includes(memberSite(m)) ? 'Yes' : 'No'
          ];
        })
      };

      const sheets = [summarySheet, perSiteSheet];
      if (clusterCharts.length > 0) {
        sheets.push({ name: 'Charts', charts: clusterCharts });
      }
      sheets.push(membersSheet);

      return {
        filename: `Cluster_${(draft.name || 'Custom').replace(/\s+/g, '_')}_${t}_${result.after.start}`,
        sheets
      };
    });
    return () => onExportData(null);
  }, [result, curveMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const card = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm';
  const field = `border rounded-lg px-2.5 py-1.5 text-xs font-semibold cursor-pointer ${fieldClass(darkMode)}`;
  const periods = result ? [
    { start: result.before.start, end: result.before.end, label: 'Before', color: PERIOD_COLORS.before },
    { start: result.after.start, end: result.after.end, label: 'After', color: PERIOD_COLORS.after },
  ] : [];

  const renderCharts = () => {
    if (!result) return null;
    return (
      <div className={`grid gap-4 ${gridClass(chartsPerRow)}`}>
        {selectedKpis.map(id => {
          const k = result.kpis[id];
          if (!k) return null;
          const byBand = curveMode === 'band';
          const siteSeries = curveMode === 'site' ? k.site_series : null;
          return (
            <SectorPayloadChart
              key={`cluster_${tech}_${curveMode}_${id}`}
              title={k.title}
              unit={k.unit}
              timestamps={result.timestamps}
              carrierSeries={siteSeries || (byBand ? k.band_series : { Cluster: k.cluster_series })}
              carrierBands={siteSeries
                ? Object.fromEntries(Object.keys(siteSeries).map(s => [s, 'ENTITY']))
                : byBand ? Object.fromEntries(result.bands.map(b => [b, b])) : { Cluster: 'ENTITY' }}
              availableBands={byBand ? result.bands : null}
              hasTotal={byBand && k.has_total}
              minY={k.min_y}
              maxY={k.max_y}
              timeMode="daily"
              darkMode={darkMode}
              chartsPerRow={chartsPerRow}
              markers={draft.markers}
              periods={periods}
            />
          );
        })}
      </div>
    );
  };

  return (
    <>
      <ClusterEditor
        clusters={clusters}
        selectedId={selectedId}
        onSelect={selectCluster}
        onNew={() => selectCluster(null)}
        onSave={saveCluster}
        onDelete={deleteCluster}
        saving={saving}
        storeError={storeError}
        storeInfo={storeInfo}
        draft={draft}
        setDraft={setDraft}
        hierarchyData={hierarchyData}
        knownSites={knownSites}
        siteSectors={siteSectors}
        darkMode={darkMode}
        canManage={canManage}
        owner={selectedCluster?.created_by || ''}
        currentPic={authUser?.full_name || authUser?.username || ''}
      />

      <div className={`rounded-xl border p-4 shadow-2xs ${darkMode ? 'bg-slate-800/80 border-slate-700/80' : 'bg-white border-slate-200/90'}`}>
        <div className="flex flex-wrap items-end gap-4">
          <MultiSelectDropdown label="NOP (set)" options={nopOptions} selectedValues={setFilter.nops} isMulti
            onChange={(nops) => setSetFilter({ nops, cities: [], kecamatans: [] })} placeholder="All NOP" darkMode={darkMode} minWidth="min-w-36" />
          <MultiSelectDropdown label="KABUPATEN (set)" options={cityOptions} selectedValues={setFilter.cities} isMulti
            onChange={(cities) => setSetFilter({ ...setFilter, cities, kecamatans: [] })} placeholder="All Kabupaten" darkMode={darkMode} minWidth="min-w-44" />
          <MultiSelectDropdown label="KECAMATAN (set)" options={kecOptions} selectedValues={setFilter.kecamatans} isMulti
            onChange={(kecamatans) => setSetFilter({ ...setFilter, kecamatans })} placeholder="All Kecamatan" darkMode={darkMode} minWidth="min-w-44" />
          <div>
            <FilterLabel>START DATE</FilterLabel>
            <input type="date" value={range.start} max={range.end || undefined} onChange={e => setRange({ ...range, start: e.target.value })} className={field} />
          </div>
          <div>
            <FilterLabel>END DATE</FilterLabel>
            <input type="date" value={range.end} min={range.start || undefined} max={latest || undefined} onChange={e => setRange({ ...range, end: e.target.value })} className={field} />
          </div>
          <PeriodControl draft={draft} setDraft={setDraft} darkMode={darkMode} />
          <div>
            <FilterLabel>&nbsp;</FilterLabel>
            <button type="button" onClick={generate} disabled={loading || !effectiveMembers.length || !!inputError} title={inputError || undefined}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Loading...' : 'Generate'}</span>
            </button>
          </div>
        </div>
        <div className={`mt-2 text-[11px] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
          {effectiveMembers.length} of {draft.members.length} members match the set filter. The chart shows Start – End
          (max {MAX_CHART_DAYS} days); the table compares the Before and After periods.
          {inputError && <span className="ml-1 font-semibold text-rose-500">{inputError}</span>}
        </div>
      </div>

      <div className={`p-5 rounded-2xl border ${card}`}>
        <div className="flex flex-wrap items-end justify-between gap-3 pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-end gap-3">
            <SegmentedToggle label="TECHNOLOGY" options={TECHS} value={tech} onChange={setTech} darkMode={darkMode} />
            <SegmentedToggle label="VIEW" options={[['combine', 'Combine'], ['chart', 'Chart'], ['table', 'Table']]} value={viewMode} onChange={setViewMode} darkMode={darkMode} />
            {(viewMode === 'chart' || viewMode === 'combine') && (
              <SegmentedToggle label="CURVE" options={curveOptions} value={curveMode} onChange={setChartMode} darkMode={darkMode} />
            )}
            <ClusterKpiFilter
              catalog={catalogs[tech]}
              selected={kpiSel[tech]}
              setSelected={(ids) => setKpiSel({ ...kpiSel, [tech]: ids })}
              defaults={DEFAULT_KPIS[tech]}
              darkMode={darkMode}
            />
            <div>
              <FilterLabel>MARKER</FilterLabel>
              <MarkerControl markers={draft.markers} setMarkers={(markers) => setDraft(d => ({ ...d, markers }))}
                defaultDate={draft.after_start || latest} darkMode={darkMode} hint="Saved with the cluster." />
            </div>
          </div>
          {result && (
            <div className={`text-[11px] font-semibold text-right ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
              <div className="flex items-center gap-1.5 justify-end">
                {viewMode === 'chart' ? (
                  <BarChart3 className="w-3.5 h-3.5 text-blue-500" />
                ) : viewMode === 'table' ? (
                  <Table2 className="w-3.5 h-3.5 text-blue-500" />
                ) : (
                  <LayoutGrid className="w-3.5 h-3.5 text-blue-500" />
                )}
                {draft.name || 'Custom cluster'} • {result.tech.toUpperCase()} • {result.start_date} – {result.end_date}
              </div>
              <div className="opacity-70">
                Before {result.before.start} – {result.before.end} ({result.before.days_with_data} days with data) •
                After {result.after.start} – {result.after.end} ({result.after.days_with_data} days with data) •
                {' '}{result.sites_with_data.length}/{result.member_sites.length} sites with data
              </div>
            </div>
          )}
        </div>

        {current?.error && (
          <div className={`p-4 rounded-xl border flex items-center gap-3 text-xs ${darkMode ? 'bg-rose-950/40 border-rose-800 text-rose-200' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
            <AlertTriangle className="w-5 h-5 text-rose-500" /> Failed to load cluster data: {current.error}
          </div>
        )}

        {result?.sites_without_data?.length > 0 && (
          <div className={`mb-3 p-2.5 rounded-lg border text-[11px] ${darkMode ? 'bg-amber-950/40 border-amber-800 text-amber-200' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
            {result.sites_without_data.length} sites without {result.tech.toUpperCase()} data in this range: {result.sites_without_data.slice(0, 30).join(', ')}{result.sites_without_data.length > 30 ? ' …' : ''}
          </div>
        )}

        {!current && !loading && (
          <div className={`py-16 text-center border-2 border-dashed rounded-2xl ${darkMode ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
            <MousePointerClick className="w-8 h-8 mx-auto mb-2 opacity-50 text-blue-500" />
            <p className="font-semibold text-sm">No data yet</p>
            <p className="text-xs opacity-75 mt-1">Add cluster members, set the date range and the Before / After periods, then click Generate.</p>
          </div>
        )}

        {result && viewMode === 'table' && (
          <ClusterTable result={result} kpiIds={selectedKpis} siteNamesMap={siteNamesMap} darkMode={darkMode} fullHeight={isAllKpis} />
        )}

        {result && viewMode === 'chart' && renderCharts()}

        {result && viewMode === 'combine' && (
          <div className="flex flex-col lg:flex-row gap-4 items-start">
            <div className="w-full lg:w-[calc(65%-8px)] min-w-0">
              {renderCharts()}
            </div>
            <div className={`w-full lg:w-[calc(35%-8px)] min-w-0 ${isAllKpis ? '' : 'lg:sticky lg:top-4'}`}>
              <ClusterTable result={result} kpiIds={selectedKpis} siteNamesMap={siteNamesMap} darkMode={darkMode} compact fullHeight={isAllKpis} />
            </div>
          </div>
        )}

        {loading && <DataLoadingOverlay message="Calculating cluster before vs after..." />}
      </div>
    </>
  );
}
