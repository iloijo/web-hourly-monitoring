import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertTriangle, BarChart3, CalendarDays, CheckCircle2, ChevronDown, Gauge, Info, Layers, Loader2, MapPin,
  RefreshCw, Settings2, Target, TrendingDown, TrendingUp, XCircle,
} from 'lucide-react';
import ReactECharts from '../lib/echarts';
import { getJson } from '../api/client';
import SegmentedToggle from '../components/filters/SegmentedToggle';
import useClickOutside from '../hooks/useClickOutside';
import {
  BAD_COLOR, CUR_COLOR, ENTITY_COLORS, KQI_COLORS, PREV_COLOR,
  base, catAxis, donutOption, entityLineOption, eventMarkLine, failAvgOption, fmt, valAxis, weekLabel,
} from './cei/charts';
import { KabupatenTable, NopTable, ThresholdTable } from './cei/CeiTables';
import CeiComparisonTables from './cei/CeiComparisonTables';
import CeiSettings from './cei/CeiSettings';
import CeiScopeFilter from './cei/CeiScopeFilter';
import { EMPTY_FILTERS, scopeLabel, scopeParams } from './cei/scope';

const TABS = [['overview', 'Overview'], ['bad', 'Bad Cells'], ['contrib', 'Contributors'], ['daily', 'Daily KQI']];
const MOST_WEEKS = 9;
const FAIL_WEEKS = 15;
const TOP_KAB = 5;

// Numbers events in date order and places them on the x values that exist in the chart
const placeEvents = (events, xs, toX) => {
  const set = new Set(xs);
  const byX = new Map();
  events.forEach((e, i) => {
    const x = toX(e);
    if (set.has(x)) byX.set(x, [...(byX.get(x) || []), i + 1]);
  });
  return [...byX].map(([x, ns]) => ({ x, n: ns.join(',') }));
};

function Card({ title, Icon = BarChart3, iconClass = 'text-blue-500', meta, darkMode, className = '', children }) {
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

function Tile({ label, Icon, iconClass, value, valueClass, children, darkMode }) {
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

const Chart = ({ option, h = 260 }) => <ReactECharts option={option} notMerge lazyUpdate style={{ height: h, width: '100%' }} />;

const Spinner = ({ text }) => (
  <div className="h-48 flex items-center justify-center gap-2 text-xs text-slate-400"><Loader2 className="w-4 h-4 animate-spin" />{text}</div>
);

function Remarks({ events, darkMode }) {
  if (!events.length) return null;
  return (
    <details className="mt-2 group">
      <summary className="text-[11px] font-semibold text-slate-400 cursor-pointer select-none list-none flex items-center gap-1">
        <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />Remarks ({events.length}) — numbers on the chart
      </summary>
      <ol className={`mt-1.5 text-[11px] leading-snug grid sm:grid-cols-2 gap-x-6 gap-y-0.5 list-decimal pl-5 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
        {events.map(e => <li key={e.id}><span className="font-semibold">{e.kind === 'weekly' ? weekLabel(e.week) : e.date}</span> · {e.label}</li>)}
      </ol>
    </details>
  );
}

function MethodologyButton({ kqis, darkMode, btn }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false));
  return (
    <div className="relative" ref={ref}>
      <button type="button" className={btn} onClick={() => setOpen(o => !o)}><Info className="w-3.5 h-3.5" />Methodology</button>
      {open && (
        <div className={`absolute right-0 mt-2 z-30 w-[26rem] max-w-[90vw] rounded-xl border p-3 space-y-3 shadow-xl ${darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
          <p className="text-[11px] text-slate-400">Thresholds come from a pareto of complaint data; KQIs were picked by their correlation with KPIs.</p>
          {kqis && <ThresholdTable kqis={kqis} darkMode={darkMode} />}
          <div className="grid grid-cols-2 gap-3 text-[11px] leading-relaxed">
            <div><b>Rule 1</b> (busy hour): ≥2 KQI over threshold, ≥3 days a week, ≥3 consecutive weeks.</div>
            <div><b>Rule 2</b> (busy hour): ≥2 KQI over threshold on the same day, ≥3 days.</div>
          </div>
        </div>
      )}
    </div>
  );
}

// OKR > CEI: weekly CEI of Region Sulawesi with bad cell analysis, contributor trends and daily KQI
export default function CeiView({ darkMode, onExportData }) {
  const [tab, setTab] = useState('overview');
  const [weeks, setWeeks] = useState([]);
  const [week, setWeek] = useState(null);
  const [weekly, setWeekly] = useState(null);
  const [thp, setThp] = useState(null);
  const [contrib, setContrib] = useState(null);
  const [daily, setDaily] = useState(null);
  const [range, setRange] = useState({ start: '', end: '' });
  const [loading, setLoading] = useState({});
  const [error, setError] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hierarchy, setHierarchy] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState({ scope: 'all', values: [] });
  const req = useRef({});
  const loadedFor = useRef({}); // week each lazy panel was loaded for
  const scopeRef = useRef({ scope: 'all', values: [] }); // scope of the data on screen

  const fetchPanel = (name, path, params, setter) => {
    const id = (req.current[name] || 0) + 1;
    req.current[name] = id;
    setLoading(l => ({ ...l, [name]: true }));
    return getJson(path, { ...params, ...scopeRef.current })
      .then(json => {
        if (req.current[name] !== id) return;
        if (json.error) throw new Error(json.error);
        setter(json);
      })
      .catch(err => { if (req.current[name] === id) { setter(null); setError(`${name}: ${err.message || err}`); } })
      .finally(() => { if (req.current[name] === id) setLoading(l => ({ ...l, [name]: false })); });
  };

  // Throughput and contributors are slow, so they load only when their tab is opened
  const loadLazy = (t, w) => {
    if (!w) return;
    if (t === 'bad' && !loadedFor.current.throughput) {
      loadedFor.current.throughput = w;
      fetchPanel('throughput', '/api/cei/throughput', { week: w }, setThp);
    }
    if (t === 'contrib' && !loadedFor.current.contributors) {
      loadedFor.current.contributors = w;
      fetchPanel('contributors', '/api/cei/contributors', { week: w, top_n: TOP_KAB }, setContrib);
    }
  };
  const loadWeek = (w, t = tab) => {
    setError(null);
    loadedFor.current = {};
    setThp(null); setContrib(null);
    fetchPanel('weekly', '/api/cei/weekly', { week: w }, setWeekly);
    loadLazy(t, w);
  };
  const loadDaily = (r = range) => fetchPanel('daily', '/api/cei/daily', { start_date: r.start, end_date: r.end }, (d) => {
    setDaily(d);
    if (d) setRange({ start: d.start_date, end: d.end_date });
  });

  useEffect(() => {
    getJson('/api/cei/weeks')
      .then(d => {
        if (d.error) throw new Error(d.error);
        setWeeks([...d.weeks].reverse());
        setWeek(d.latest);
        loadWeek(d.latest);
      })
      .catch(err => setError(`weeks: ${err.message || err}`));
    loadDaily({ start: '', end: '' });
    getJson('/api/cei/hierarchy').then(h => { if (!h.error) setHierarchy(h); }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pickTab = (t) => { setTab(t); loadLazy(t, week); };
  const pickWeek = (w) => { setWeek(w); loadWeek(w); };

  // A scope change reloads every panel once the scope has values (All needs none)
  const applyFilters = (next) => {
    setFilters(next);
    const sp = scopeParams(next);
    if (!sp) return;
    const same = sp.scope === scopeRef.current.scope && sp.values.join() === scopeRef.current.values.join();
    if (same) return;
    scopeRef.current = sp;
    setApplied(sp);
    if (week) loadWeek(week);
    loadDaily();
  };
  const scopeText = scopeLabel(applied);

  const d = darkMode;
  const v = useMemo(() => {
    if (!weekly?.trend?.length) return null;
    const trend = weekly.trend;
    const cur = trend[trend.length - 1];
    const prev = trend.length > 1 ? trend[trend.length - 2] : null;
    const kqis = weekly.kqis;
    const label = Object.fromEntries(kqis.map(k => [k.key, k.label]));
    const xs = trend.map(t => weekLabel(t.week));
    const target = cur.target_pct;

    const o = base(d);
    const achievement = {
      ...o,
      tooltip: { ...o.tooltip, valueFormatter: val => fmt(val, 2) },
      xAxis: catAxis(d, xs),
      yAxis: [valAxis(d, { name: '%', scale: true }), valAxis(d, { name: '#Cells', scale: true, splitLine: { show: false } })],
      series: [
        {
          name: 'Good Cell (%)', type: 'line', data: trend.map(t => t.good_pct), smooth: true, symbolSize: 5,
          lineStyle: { width: 2.5, color: '#10b981' }, itemStyle: { color: '#10b981' },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(16,185,129,0.25)' }, { offset: 1, color: 'rgba(16,185,129,0)' }] } },
          markLine: eventMarkLine(placeEvents(weekly.events, xs, e => weekLabel(e.week)), d),
        },
        { name: 'Target (%)', type: 'line', step: 'end', data: trend.map(t => t.target_pct), showSymbol: false, lineStyle: { type: 'dashed', width: 1.5, color: '#f59e0b' }, itemStyle: { color: '#f59e0b' } },
        { name: '#Cells', type: 'line', yAxisIndex: 1, data: trend.map(t => t.total), smooth: true, showSymbol: false, lineStyle: { width: 1, color: '#94a3b8' }, itemStyle: { color: '#94a3b8' } },
      ],
    };

    const mostWeeks = trend.slice(-MOST_WEEKS);
    const mostOption = {
      ...o,
      tooltip: { ...o.tooltip, formatter: ps => `<b>${ps[0].axisValue}</b><br/>${ps.map(p => `${p.marker}${p.seriesName}: ${fmt(p.data.count)} (${fmt(p.value, 1)}%)`).join('<br/>')}` },
      xAxis: catAxis(d, mostWeeks.map(t => weekLabel(t.week))),
      yAxis: valAxis(d, { max: 100, axisLabel: { formatter: '{value}%', fontSize: 10 } }),
      series: weekly.most_kqi_order.map(k => ({
        name: label[k], type: 'bar', stack: 'most', barMaxWidth: 34, itemStyle: { color: KQI_COLORS[k] },
        data: mostWeeks.map(t => ({ value: t.bad ? (100 * t.most_kqi[k]) / t.bad : 0, count: t.most_kqi[k] })),
      })),
    };

    const failWeeks = trend.slice(-FAIL_WEEKS);
    const failTrend = {
      ...o,
      xAxis: catAxis(d, failWeeks.map(t => weekLabel(t.week))),
      yAxis: valAxis(d),
      series: kqis.map(k => ({
        name: k.label, type: 'line', data: failWeeks.map(t => t.kqi_fail[k.key]), smooth: true, symbolSize: 4,
        lineStyle: { width: 2, color: KQI_COLORS[k.key] }, itemStyle: { color: KQI_COLORS[k.key] },
      })),
    };

    let wow = null;
    if (prev) {
      const sorted = [...kqis].sort((a, b) => cur.kqi_fail[a.key] - cur.kqi_fail[b.key]);
      const growth = k => (prev.kqi_fail[k] ? (100 * (cur.kqi_fail[k] - prev.kqi_fail[k])) / prev.kqi_fail[k] : null);
      wow = {
        ...o,
        tooltip: { ...o.tooltip, axisPointer: { type: 'shadow' } },
        grid: { ...o.grid, right: 70 },
        xAxis: valAxis(d, { splitNumber: 3 }),
        yAxis: catAxis(d, sorted.map(k => k.label)),
        series: [
          { name: weekLabel(prev.week), type: 'bar', barGap: '10%', data: sorted.map(k => prev.kqi_fail[k.key]), itemStyle: { color: PREV_COLOR, borderRadius: [0, 3, 3, 0] } },
          {
            name: weekLabel(cur.week), type: 'bar', data: sorted.map(k => cur.kqi_fail[k.key]), itemStyle: { color: CUR_COLOR, borderRadius: [0, 3, 3, 0] },
            label: {
              show: true, position: 'right', fontSize: 10, fontWeight: 'bold',
              formatter: p => { const g = growth(sorted[p.dataIndex].key); return g === null ? '' : `${g > 0 ? '▲' : '▼'} ${fmt(Math.abs(g), 1)}%`; },
              color: d ? '#e2e8f0' : '#334155',
            },
          },
        ],
      };
    }

    const demarc = weekly.demarcation;
    const demarcOption = {
      ...o,
      tooltip: { ...o.tooltip, axisPointer: { type: 'shadow' } },
      grid: { ...o.grid, right: 40 },
      xAxis: valAxis(d),
      yAxis: catAxis(d, demarc.map(r => r.label), { inverse: true }),
      series: [
        { name: weekLabel(weekly.prev_week), type: 'bar', barGap: '10%', data: demarc.map(r => r.prev), itemStyle: { color: PREV_COLOR, borderRadius: [0, 3, 3, 0] } },
        { name: weekLabel(weekly.week), type: 'bar', data: demarc.map(r => r.cur), itemStyle: { color: CUR_COLOR, borderRadius: [0, 3, 3, 0] }, label: { show: true, position: 'right', fontSize: 10 } },
      ],
    };

    const c = weekly.cohort;
    const cohortOption = {
      ...o,
      xAxis: catAxis(d, c.weeks.map(weekLabel)),
      yAxis: valAxis(d),
      series: c.series.map((s, i) => ({
        name: s.start === 0 ? `<${weekLabel(s.label.slice(1))}` : weekLabel(s.label), type: 'bar', stack: 'cohort', barMaxWidth: 34,
        data: s.values.map(x => x || null), itemStyle: { color: s.start === 0 ? '#334155' : ENTITY_COLORS[i % ENTITY_COLORS.length] },
      })),
    };

    return {
      cur, prev, target, label, achievement, mostOption, failTrend, wow, demarcOption, cohortOption,
      gapPp: target === null ? null : cur.good_pct - target,
      gapCells: target === null ? null : cur.good - Math.ceil((cur.total * target) / 100),
      profDonut: donutOption(d, weekly.profiling.map(p => ({ name: `${p.kqi_count} KQI`, value: p.cells })), ['#c7d2fe', '#a5b4fc', '#818cf8', '#6366f1', '#4f46e5', '#3730a3', '#1e1b4b'], 'bad cells'),
      statusDonut: donutOption(d, weekly.status.items.map(s => ({ name: s.status, value: s.cells })), ['#10b981', '#ef4444', '#f97316', '#38bdf8', '#a855f7'], 'cells'),
    };
  }, [weekly, d]);

  const thpOption = useMemo(() => {
    if (!thp) return null;
    const o = base(d);
    const pct = (arr) => { const s = arr.reduce((a, x) => a + x, 0); return arr.map(x => (s ? (100 * x) / s : 0)); };
    const bad = pct(thp.bad); const good = pct(thp.good);
    return {
      ...o,
      tooltip: { ...o.tooltip, axisPointer: { type: 'shadow' }, formatter: ps => `<b>${ps[0].axisValue} Mbps</b><br/>${ps.map(p => `${p.marker}${p.seriesName}: ${fmt(p.seriesIndex ? thp.good[p.dataIndex] : thp.bad[p.dataIndex])} cells (${fmt(p.value, 1)}%)`).join('<br/>')}` },
      xAxis: catAxis(d, thp.bins, { name: 'Mbps', nameLocation: 'middle', nameGap: 24, nameTextStyle: { fontSize: 10 } }),
      yAxis: valAxis(d, { axisLabel: { formatter: '{value}%', fontSize: 10 } }),
      series: [
        { name: 'Bad Cell', type: 'bar', data: bad, itemStyle: { color: BAD_COLOR, borderRadius: [3, 3, 0, 0] } },
        { name: 'Good Cell', type: 'bar', data: good, itemStyle: { color: '#60a5fa', borderRadius: [3, 3, 0, 0] } },
      ],
    };
  }, [thp, d]);

  const dailyEvents = useMemo(() => (daily ? placeEvents(daily.events, daily.dates, e => e.date) : []), [daily]);


  // Excel export of the selected week and the daily KQI range
  useEffect(() => {
    if (!weekly?.trend?.length) { onExportData(null); return undefined; }
    onExportData(async () => {
      const kqis = weekly.kqis;
      const sheets = [
        {
          name: 'Achievement Trend',
          columns: ['Week', '#Cells', 'Bad Cells', 'Good Cells', 'Good Cell (%)', 'Target (%)', ...kqis.map(k => `Fail ${k.label}`), ...weekly.most_kqi_order.map(k => `Most ${v.label[k]}`)],
          rows: weekly.trend.map(t => [t.week, t.total, t.bad, t.good, t.good_pct, t.target_pct, ...kqis.map(k => t.kqi_fail[k.key]), ...weekly.most_kqi_order.map(k => t.most_kqi[k])]),
        },
        { name: 'NOP', columns: ['NOP', 'Bad Cell', 'Good Cell', 'Total Cell', '% Bad Cell'], rows: weekly.nop.map(r => [r.nop, r.bad, r.good, r.total, r.bad_pct]) },
        {
          name: 'Kabupaten',
          columns: ['Kabupaten', `Bad Cell ${weekLabel(weekly.prev_week)}`, `Bad Cell ${weekLabel(weekly.week)}`, 'Delta', 'Growth (%)', 'Most KQI Issue', 'Top Demarcation'],
          rows: weekly.kabupaten.map(r => [r.kabupaten, r.bad_prev, r.bad, r.delta, r.growth_pct, r.most_kqi, r.top_demarcation]),
        },
        { name: 'Demarcation', columns: ['Team', 'Demarcation', weekLabel(weekly.prev_week), weekLabel(weekly.week)], rows: weekly.demarcation.map(r => [r.team, r.label, r.prev, r.cur]) },
        { name: 'Cell Status', columns: ['Status', 'Cells', '%'], rows: weekly.status.items.map(s => [s.status, s.cells, s.pct]) },
      ];
      if (thp) sheets.push({ name: 'Throughput Dist', columns: ['DL Thp (Mbps)', 'Bad Cell', 'Good Cell'], rows: thp.bins.map((b, i) => [b, thp.bad[i], thp.good[i]]) });
      if (daily) {
        sheets.push({
          name: 'Daily KQI',
          columns: ['Date', ...daily.kqis.flatMap(k => [`Fail ${k.label}`, `Avg ${k.label}`])],
          rows: daily.dates.map((dt, i) => [dt, ...daily.kqis.flatMap(k => [daily.series[k.key]?.fail[i], daily.series[k.key]?.avg[i]])]),
        });
      }
      return { filename: `CEI_${weekly.week}_${scopeText.replace(/[^A-Za-z0-9]+/g, '_')}`, sheets };
    });
    return () => onExportData(null);
  }, [weekly, thp, daily]); // eslint-disable-line react-hooks/exhaustive-deps

  const field = `border rounded-lg px-2.5 py-1.5 text-xs font-semibold cursor-pointer ${d ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`;
  const btn = `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer border ${d ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`;
  const grid = 'grid grid-cols-1 xl:grid-cols-3 gap-4';
  const progress = v && v.target ? Math.min(100, (100 * v.cur.good_pct) / v.target) : 0;

  return (
    <>
      <div className={`p-3 rounded-xl space-y-3 ${d ? 'bg-slate-900 border border-slate-800' : 'bg-white border border-slate-200 shadow-sm'}`}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-blue-500" />
          <select className={field} value={week || ''} onChange={e => pickWeek(Number(e.target.value))}>
            {weeks.map(w => <option key={w} value={w}>{weekLabel(w)} {String(w).slice(0, 4)}</option>)}
          </select>
          {weekly && <span className="text-[11px] text-slate-400 hidden md:inline">{weekly.week_start} → {weekly.week_end}</span>}
        </div>
        <SegmentedToggle options={TABS} value={tab} onChange={pickTab} darkMode={d} />
        <div className="grow" />
        <MethodologyButton kqis={weekly?.kqis} darkMode={d} btn={btn} />
        <button type="button" className={btn} onClick={() => setSettingsOpen(true)}><Settings2 className="w-3.5 h-3.5" />Targets &amp; Events</button>
        <button type="button" className={btn} title="Reload" onClick={() => { loadWeek(week); loadDaily(); }}><RefreshCw className={`w-3.5 h-3.5 ${loading.weekly ? 'animate-spin' : ''}`} /></button>
      </div>
      <div className={`flex flex-wrap items-center gap-3 pt-3 border-t ${d ? 'border-slate-800' : 'border-slate-100'}`}>
        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500"><MapPin className="w-3.5 h-3.5 text-blue-500" />Area</span>
        <CeiScopeFilter filters={filters} onChange={applyFilters} hierarchy={hierarchy} darkMode={d} />
        <span className="text-[11px] text-slate-400">Showing <b className={d ? 'text-slate-200' : 'text-slate-700'}>{scopeText}</b>{applied.scope !== 'all' ? ' · target stays the regional target' : ''}</span>
      </div>
      </div>

      {error && (
        <div className={`p-3 rounded-xl border flex items-center gap-2 text-xs ${d ? 'bg-rose-950/40 border-rose-800 text-rose-200' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
          <AlertTriangle className="w-4 h-4 text-rose-500" /> Failed to load {error}
        </div>
      )}

      {v ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile label="Good Cell" Icon={CheckCircle2} iconClass="text-emerald-500" value={`${fmt(v.cur.good_pct, 2)}%`} valueClass="text-emerald-600 dark:text-emerald-400" darkMode={d}>
            <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden mb-1"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${progress}%` }} /></div>
            {fmt(v.cur.good)} of {fmt(v.cur.total)} cells · target {v.target === null ? '–' : `${fmt(v.target, 2)}%`}
          </Tile>
          <Tile label="Gap to Target" Icon={Target} iconClass="text-amber-500" value={v.gapPp === null ? '–' : `${v.gapPp > 0 ? '+' : ''}${fmt(v.gapPp, 2)} pp`} valueClass={v.gapPp < 0 ? 'text-rose-500' : 'text-emerald-500'} darkMode={d}>
            {v.gapCells === null ? '' : v.gapCells < 0 ? `${fmt(-v.gapCells)} more good cells needed` : `${fmt(v.gapCells)} good cells above target`}
          </Tile>
          <Tile label="Bad Cell" Icon={XCircle} iconClass="text-rose-500" value={fmt(v.cur.bad)} valueClass="text-slate-900 dark:text-white" darkMode={d}>
            {fmt(100 - v.cur.good_pct, 2)}% of cells{v.prev ? <> · <span className={v.cur.bad > v.prev.bad ? 'text-rose-500 font-bold' : 'text-emerald-500 font-bold'}>{v.cur.bad > v.prev.bad ? '+' : ''}{fmt(v.cur.bad - v.prev.bad)}</span> vs {weekLabel(v.prev.week)}</> : ''}
          </Tile>
          <Tile label="Week on Week" Icon={v.prev && v.cur.good_pct < v.prev.good_pct ? TrendingDown : TrendingUp} iconClass="text-blue-500" value={v.prev ? `${v.cur.good_pct >= v.prev.good_pct ? '+' : ''}${fmt(v.cur.good_pct - v.prev.good_pct, 2)} pp` : '–'} valueClass={v.prev && v.cur.good_pct < v.prev.good_pct ? 'text-rose-500' : 'text-emerald-500'} darkMode={d}>
            {v.prev ? `${weekLabel(v.prev.week)} ${fmt(v.prev.good_pct, 2)}% → ${weekLabel(v.cur.week)} ${fmt(v.cur.good_pct, 2)}%` : ''}
          </Tile>
        </div>
      ) : loading.weekly && <Spinner text="Computing weekly CEI..." />}

      {v && tab === 'overview' && (
        <>
          <div className={grid}>
            <Card title="Achievement Trend" Icon={Activity} iconClass="text-emerald-500" meta={`${weekLabel(weekly.trend[0].week)}–${weekLabel(weekly.week)}`} darkMode={d} className="xl:col-span-2">
              <Chart option={v.achievement} h={300} />
              <Remarks events={weekly.events} darkMode={d} />
            </Card>
            <Card title="Bad Cell by NOP" Icon={MapPin} meta={weekLabel(weekly.week)} darkMode={d}>
              <NopTable rows={weekly.nop} darkMode={d} />
            </Card>
          </div>
          <div className={grid}>
            <Card title="Most KQI Failure" Icon={Layers} iconClass="text-violet-500" meta="each bad cell on its top KQI" darkMode={d} className="xl:col-span-2">
              <Chart option={v.mostOption} h={270} />
            </Card>
            <Card title="KQI Fail per Bad Cell" Icon={Gauge} iconClass="text-indigo-500" meta={weekLabel(weekly.week)} darkMode={d}>
              <Chart option={v.profDonut} h={270} />
            </Card>
          </div>
        </>
      )}

      {v && tab === 'bad' && (
        <>
          <div className={grid}>
            <Card title="Weekly KQI Fail" Icon={Activity} meta="bad cells with a hit" darkMode={d} className="xl:col-span-2">
              <Chart option={v.failTrend} h={290} />
            </Card>
            <Card title="KQI Fail Week on Week" Icon={BarChart3} meta={v.prev ? `${weekLabel(v.prev.week)} vs ${weekLabel(v.cur.week)}` : ''} darkMode={d}>
              {v.wow ? <Chart option={v.wow} h={290} /> : <div className="text-xs text-slate-400">No previous week.</div>}
            </Card>
          </div>
          <Card title="Bad Cell Change by Kabupaten" Icon={MapPin} iconClass="text-rose-500" meta={`sorted by increase · ${weekly.kabupaten.length} kabupaten`} darkMode={d}>
            <div className="max-h-[22rem] overflow-auto">
              <KabupatenTable rows={weekly.kabupaten} week={weekly.week} prevWeek={weekly.prev_week} darkMode={d} />
            </div>
          </Card>
          <div className={grid}>
            <Card title="Fail Demarcation" Icon={Layers} iconClass="text-amber-500" meta={`${weekLabel(weekly.prev_week)} vs ${weekLabel(weekly.week)}`} darkMode={d} className="xl:col-span-2">
              <Chart option={v.demarcOption} h={300} />
            </Card>
            <Card title="Cell Status" Icon={Gauge} iconClass="text-emerald-500" meta={`${weekLabel(weekly.status.weeks[0])}–${weekLabel(weekly.week)}`} darkMode={d}>
              <Chart option={v.statusDonut} h={270} />
              <p className="text-[10px] text-slate-400 leading-snug">{weekly.status.rules}</p>
            </Card>
          </div>
          <div className={grid}>
            <Card title="Bad Cell by Start Week" Icon={BarChart3} meta="current bad run started in" darkMode={d} className="xl:col-span-2">
              <Chart option={v.cohortOption} h={290} />
            </Card>
            <Card title="DL Throughput on BDBH" Icon={Activity} iconClass="text-sky-500" meta="share of cells" darkMode={d}>
              {loading.throughput || !thpOption ? <Spinner text="Reading busy-hour throughput..." /> : <Chart option={thpOption} h={290} />}
            </Card>
          </div>
        </>
      )}

      {v && tab === 'contrib' && (
        loading.contributors || !contrib ? (
          <Spinner text="Loading WoW comparison tables..." />
        ) : (
          <CeiComparisonTables data={contrib} darkMode={d} />
        )
      )}

      {tab === 'daily' && (
        <>
          <div className={`p-3 rounded-xl flex flex-wrap items-center gap-3 text-xs ${d ? 'bg-slate-900 border border-slate-800' : 'bg-white border border-slate-200 shadow-sm'}`}>
            <span className="font-bold text-slate-500 uppercase tracking-wider text-[11px]">Range</span>
            <input type="date" className={field} value={range.start} onChange={e => setRange(r => ({ ...r, start: e.target.value }))} />
            <span className="text-slate-400">→</span>
            <input type="date" className={field} value={range.end} max={daily?.latest} onChange={e => setRange(r => ({ ...r, end: e.target.value }))} />
            <button type="button" className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 cursor-pointer" onClick={() => loadDaily()}>Apply</button>
            <span className="text-[11px] text-slate-400">{scopeText}, busy hour · area = cells failing, line = average · latest {daily?.latest || '–'}</span>
          </div>
          {loading.daily && !daily ? <Spinner text="Loading daily KQI..." /> : daily && (
            <div className={grid}>
              {daily.kqis.map(k => (
                <Card key={k.key} title={k.label} Icon={Gauge} iconClass="text-orange-500" meta={`fail ${k.direction === 'below' ? '<' : '>'} ${k.threshold}${k.unit ? ` ${k.unit}` : ''}`} darkMode={d}>
                  <Chart option={{ ...failAvgOption(d, daily.dates, k, daily.series[k.key], dailyEvents), legend: { show: false } }} h={230} />
                </Card>
              ))}
              <Card
                title={`Remarks (${daily.events.length})`}
                Icon={Info}
                iconClass="text-amber-500"
                meta="numbers on the chart"
                darkMode={d}
                className="xl:col-span-2"
              >
                {daily.events.length > 0 ? (
                  <div className="h-[230px] overflow-y-auto pr-2">
                    <ol className={`text-[11px] leading-relaxed grid sm:grid-cols-2 gap-x-6 gap-y-1.5 list-decimal pl-5 ${d ? 'text-slate-300' : 'text-slate-600'}`}>
                      {daily.events.map(e => (
                        <li key={e.id}>
                          <span className="font-semibold text-slate-900 dark:text-white">{e.date}</span> · {e.label}
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : (
                  <div className="h-[230px] flex items-center justify-center text-xs text-slate-400">
                    No remarks recorded for this period.
                  </div>
                )}
              </Card>
            </div>
          )}
        </>
      )}

      {settingsOpen && <SettingsLoader darkMode={d} onClose={() => setSettingsOpen(false)} onChange={() => { loadWeek(week); loadDaily(); }} />}
    </>
  );
}

function SettingsLoader({ darkMode, onClose, onChange }) {
  const [s, setS] = useState(null);
  useEffect(() => { getJson('/api/cei/settings').then(setS).catch(e => setS({ error: String(e) })); }, []);
  if (!s) return null;
  return (
    <CeiSettings
      targets={s.targets || []} events={s.events || []} darkMode={darkMode} onClose={onClose}
      onChange={(r) => { setS(prev => ({ ...prev, ...r })); onChange(); }}
    />
  );
}
