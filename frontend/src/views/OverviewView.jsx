import { useEffect, useRef, useState, useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Database,
  ExternalLink,
  Layers,
  MapPin,
  Radio,
  RefreshCw,
  TrendingDown,
  Wifi,
} from 'lucide-react';
import ReactECharts from '../lib/echarts';
import { getJson } from '../api/client';
import { latestDates, loadLatestDates } from '../constants/dates';
import DataLoadingOverlay from '../components/DataLoadingOverlay';

const BRANCH_OPTIONS = [
  'All',
  'BONE',
  'KENDARI',
  'MAKASSAR',
  'MANADO',
  'PALU',
  'PARE-PARE',
  'TERNATE',
  'Unmapped',
];

const fmtDec = (v) =>
  v === null || v === undefined
    ? '–'
    : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtInt = (v) =>
  v === null || v === undefined ? '–' : Number(v).toLocaleString('en-US');

function DeltaBadge({ val, label = 'YoY' }) {
  if (val === null || val === undefined) {
    return <span className="text-xs text-slate-400 font-medium">–</span>;
  }
  const isUp = val >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded ${
        isUp
          ? 'text-emerald-500 bg-emerald-500/10 dark:bg-emerald-500/20'
          : 'text-rose-500 bg-rose-500/10 dark:bg-rose-500/20'
      }`}
    >
      {isUp ? (
        <ArrowUpRight className="w-3.5 h-3.5" />
      ) : (
        <ArrowDownRight className="w-3.5 h-3.5" />
      )}
      {isUp ? `+${val.toFixed(2)}%` : `${val.toFixed(2)}%`} {label}
    </span>
  );
}

export default function OverviewView({ darkMode, onOpenSite, onExportData }) {
  const [selectedDate, setSelectedDate] = useState(latestDates['overview'] || '2026-11-07');
  const [selectedBranch, setSelectedBranch] = useState('All');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Data states
  const [summaryData, setSummaryData] = useState(null);
  const [trendData, setTrendData] = useState([]);
  const [branchRows, setBranchRows] = useState([]);
  const [topDeclineSites, setTopDeclineSites] = useState([]);
  const [freshnessDates, setFreshnessDates] = useState({});

  // Drill hierarchy state: { level: 'branch' | 'sales_cluster' | 'rtpo', parent: string | null, parentBranch: string | null }
  const [drill, setDrill] = useState({
    level: 'branch',
    parent: null,
    parentBranch: null,
  });

  const requestId = useRef(0);

  // Initial load of latest dates
  useEffect(() => {
    loadLatestDates().then((dates) => {
      setFreshnessDates(dates);
      if (dates?.overview) {
        setSelectedDate(dates.overview);
      }
    });
  }, []);

  // Fetch overview data
  const fetchData = (targetDate = selectedDate, targetBranch = selectedBranch, targetDrill = drill) => {
    const curId = ++requestId.current;
    setLoading(true);
    setError(null);

    const bParam = targetBranch === 'All' ? '' : targetBranch;

    Promise.all([
      getJson('/api/overview/summary', { date: targetDate, branch: bParam }),
      getJson('/api/overview/trend', { end_date: targetDate, days: 30, branch: bParam }),
      getJson('/api/overview/branches', {
        date: targetDate,
        level: targetDrill.level,
        parent: targetDrill.parent || '',
      }),
      getJson('/api/overview/top_decline', { date: targetDate, branch: bParam, top_n: 10 }),
      getJson('/api/latest_dates'),
    ])
      .then(([summary, trend, branches, decline, latest]) => {
        if (curId !== requestId.current) return;
        if (summary?.error) {
          setError(summary.error);
        } else {
          setSummaryData(summary);
        }
        if (trend?.trend) setTrendData(trend.trend);
        if (branches?.items) setBranchRows(branches.items);
        if (decline?.sites) setTopDeclineSites(decline.sites);
        if (latest) setFreshnessDates(latest);
      })
      .catch((err) => {
        if (curId !== requestId.current) return;
        setError(String(err));
      })
      .finally(() => {
        if (curId === requestId.current) setLoading(false);
      });
  };

  // Reload when date or branch changes
  useEffect(() => {
    // Reset drill-down when branch filter changes
    setDrill({ level: 'branch', parent: null, parentBranch: null });
    fetchData(selectedDate, selectedBranch, { level: 'branch', parent: null, parentBranch: null });
  }, [selectedDate, selectedBranch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle Drill Down click in Branch Ranking table
  const handleDrillRow = (rowName) => {
    if (drill.level === 'branch') {
      const nextDrill = {
        level: 'sales_cluster',
        parent: rowName,
        parentBranch: rowName,
      };
      setDrill(nextDrill);
      getJson('/api/overview/branches', {
        date: selectedDate,
        level: 'sales_cluster',
        parent: rowName,
      }).then((res) => {
        if (res?.items) setBranchRows(res.items);
      });
    } else if (drill.level === 'sales_cluster') {
      const nextDrill = {
        level: 'rtpo',
        parent: rowName,
        parentBranch: drill.parentBranch,
      };
      setDrill(nextDrill);
      getJson('/api/overview/branches', {
        date: selectedDate,
        level: 'rtpo',
        parent: rowName,
      }).then((res) => {
        if (res?.items) setBranchRows(res.items);
      });
    }
  };

  // Handle Breadcrumb navigation
  const handleBreadcrumbClick = (targetLevel) => {
    if (targetLevel === 'branch') {
      const nextDrill = { level: 'branch', parent: null, parentBranch: null };
      setDrill(nextDrill);
      getJson('/api/overview/branches', { date: selectedDate, level: 'branch' }).then((res) => {
        if (res?.items) setBranchRows(res.items);
      });
    } else if (targetLevel === 'sales_cluster') {
      const nextDrill = {
        level: 'sales_cluster',
        parent: drill.parentBranch,
        parentBranch: drill.parentBranch,
      };
      setDrill(nextDrill);
      getJson('/api/overview/branches', {
        date: selectedDate,
        level: 'sales_cluster',
        parent: drill.parentBranch,
      }).then((res) => {
        if (res?.items) setBranchRows(res.items);
      });
    }
  };

  // Excel Export Registration
  useEffect(() => {
    if (!summaryData?.kpi) {
      onExportData(null);
      return;
    }

    onExportData(() => ({
      filename: `netPulse_Overview_${selectedDate}_${selectedBranch}`,
      sheets: [
        {
          name: 'Summary KPI',
          columns: ['Metric', 'Current Value', 'Unit', 'YoY Value', 'YoY (%)'],
          rows: [
            ['Total Payload', summaryData.kpi.total_payload.value, 'TB', summaryData.kpi.total_payload.yoy_val, summaryData.kpi.total_payload.yoy_pct],
            ['4G Payload', summaryData.kpi.payload_4g.value, 'TB', summaryData.kpi.payload_4g.yoy_val, summaryData.kpi.payload_4g.yoy_pct],
            ['5G Payload', summaryData.kpi.payload_5g.value, 'TB', summaryData.kpi.payload_5g.yoy_val, summaryData.kpi.payload_5g.yoy_pct],
            ['Total Traffic', summaryData.kpi.total_traffic.value, 'KErl', summaryData.kpi.total_traffic.yoy_val, summaryData.kpi.total_traffic.yoy_pct],
            ['2G Sites (Inventory)', summaryData.inventory.sites_2g, 'Sites', '-', '-'],
            ['4G Sites (Inventory)', summaryData.inventory.sites_4g, 'Sites', '-', '-'],
            ['5G Sites (Inventory)', summaryData.inventory.sites_5g, 'Sites', '-', '-'],
          ],
        },
        {
          name: 'Branch Ranking',
          columns: ['Name', 'Level', 'Payload (TB)', 'YoY (%)', 'Traffic (KErl)', 'YoY (%)', 'Sites'],
          rows: branchRows.map((b) => [
            b.name,
            drill.level,
            b.payload,
            b.payload_yoy_pct,
            b.traffic,
            b.traffic_yoy_pct,
            b.site_count,
          ]),
        },
        {
          name: 'Top Decline Sites',
          columns: ['Site ID', 'Kabupaten', 'Branch', 'Payload Now (TB)', 'Payload Last Year (TB)', 'Delta (TB)', 'Delta (%)'],
          rows: topDeclineSites.map((s) => [
            s.site,
            s.kabupaten,
            s.branch,
            s.payload_cur,
            s.payload_yoy,
            s.diff,
            s.diff_pct,
          ]),
        },
        {
          name: '30-Day Trend',
          columns: [
            'Date',
            '2G Payload (TB)',
            '4G Payload (TB)',
            '5G Payload (TB)',
            'Total Payload (TB)',
            'YoY Total Payload (TB)',
            '2G Traffic (KErl)',
            'VoLTE Traffic (KErl)',
            'Total Traffic (KErl)',
            'YoY Total Traffic (KErl)',
          ],
          rows: trendData.map((t) => [
            t.date,
            t.payload_2g,
            t.payload_4g,
            t.payload_5g,
            t.total_payload,
            t.total_payload_yoy,
            t.traffic_2g,
            t.traffic_volte,
            t.total_traffic,
            t.total_traffic_yoy,
          ]),
        },
      ],
    }));

    return () => onExportData(null);
  }, [summaryData, branchRows, topDeclineSites, trendData, selectedDate, selectedBranch, drill.level, onExportData]);

  // Common card styles
  const cardCls = darkMode
    ? 'bg-slate-900 border border-slate-800 shadow-md shadow-black/20'
    : 'bg-white border border-slate-200 shadow-sm';
  const headerCls = darkMode
    ? 'bg-slate-800/60 text-slate-200 border-b border-slate-800'
    : 'bg-slate-50 text-slate-700 border-b border-slate-100';

  // 30-Day Productivity Trend Chart Options
  const payloadChartOption = useMemo(() => {
    if (!trendData.length) return {};
    const dates = trendData.map((d) => d.date_label || d.date);
    const p2g = trendData.map((d) => d.payload_2g);
    const p4g = trendData.map((d) => d.payload_4g);
    const p5g = trendData.map((d) => d.payload_5g);
    const pYoy = trendData.map((d) => d.total_payload_yoy);

    const textColor = darkMode ? '#94a3b8' : '#64748b';
    const splitLineColor = darkMode ? '#334155' : '#e2e8f0';

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: darkMode ? '#0f172a' : '#ffffff',
        borderColor: darkMode ? '#334155' : '#cbd5e1',
        textStyle: { color: darkMode ? '#f1f5f9' : '#0f172a', fontSize: 11 },
        formatter: (params) => {
          if (!params || !params.length) return '';
          const idx = params[0].dataIndex;
          const item = trendData[idx];
          const yoyDiff =
            item.total_payload_yoy > 0
              ? (((item.total_payload - item.total_payload_yoy) / item.total_payload_yoy) * 100).toFixed(2)
              : null;
          return `
            <div style="font-weight: bold; margin-bottom: 4px;">${item.date} (${item.date_label})</div>
            <div style="display: flex; justify-content: space-between; gap: 12px;"><span style="color: #2dd4bf;">● 2G:</span><b>${fmtDec(item.payload_2g)} TB</b></div>
            <div style="display: flex; justify-content: space-between; gap: 12px;"><span style="color: #60a5fa;">● 4G:</span><b>${fmtDec(item.payload_4g)} TB</b></div>
            <div style="display: flex; justify-content: space-between; gap: 12px;"><span style="color: #818cf8;">● 5G:</span><b>${fmtDec(item.payload_5g)} TB</b></div>
            <div style="border-top: 1px dashed ${splitLineColor}; margin: 4px 0; padding-top: 4px; display: flex; justify-content: space-between; gap: 12px;">
              <b>Total:</b> <b>${fmtDec(item.total_payload)} TB</b>
            </div>
            <div style="display: flex; justify-content: space-between; gap: 12px; color: #f59e0b;">
              <span>YoY Baseline:</span> <b>${item.total_payload_yoy !== null ? fmtDec(item.total_payload_yoy) + ' TB' : '–'}</b>
            </div>
            ${yoyDiff !== null ? `<div style="text-align: right; font-size: 10px; color: ${Number(yoyDiff) >= 0 ? '#10b981' : '#f43f5e'}; font-weight: bold;">(${Number(yoyDiff) >= 0 ? '+' : ''}${yoyDiff}% YoY)</div>` : ''}
          `;
        },
      },
      legend: {
        data: ['2G', '4G', '5G', 'Last Year (YoY)'],
        top: 0,
        textStyle: { color: textColor, fontSize: 11 },
        itemWidth: 10,
        itemHeight: 10,
        icon: 'circle',
      },
      grid: {
        top: 36,
        left: 45,
        right: 15,
        bottom: 30,
      },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: splitLineColor } },
        axisLabel: { color: textColor, fontSize: 10, interval: 2 },
      },
      yAxis: {
        type: 'value',
        name: 'TB/day',
        nameTextStyle: { color: textColor, fontSize: 10 },
        splitLine: { lineStyle: { color: splitLineColor, type: 'dashed' } },
        axisLabel: { color: textColor, fontSize: 10 },
      },
      series: [
        {
          name: '2G',
          type: 'bar',
          stack: 'payload',
          data: p2g,
          itemStyle: { color: darkMode ? '#14b8a6' : '#0d9488' },
        },
        {
          name: '4G',
          type: 'bar',
          stack: 'payload',
          data: p4g,
          itemStyle: { color: darkMode ? '#3b82f6' : '#2563eb' },
        },
        {
          name: '5G',
          type: 'bar',
          stack: 'payload',
          data: p5g,
          itemStyle: { color: darkMode ? '#1e3a8a' : '#1e40af' },
        },
        {
          name: 'Last Year (YoY)',
          type: 'line',
          data: pYoy,
          smooth: false,
          symbol: 'none',
          lineStyle: { type: 'dashed', width: 2, color: '#f59e0b' },
          itemStyle: { color: '#f59e0b' },
        },
      ],
    };
  }, [trendData, darkMode]);

  const trafficChartOption = useMemo(() => {
    if (!trendData.length) return {};
    const dates = trendData.map((d) => d.date_label || d.date);
    const t2g = trendData.map((d) => d.traffic_2g);
    const tVolte = trendData.map((d) => d.traffic_volte);
    const tYoy = trendData.map((d) => d.total_traffic_yoy);

    const textColor = darkMode ? '#94a3b8' : '#64748b';
    const splitLineColor = darkMode ? '#334155' : '#e2e8f0';

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: darkMode ? '#0f172a' : '#ffffff',
        borderColor: darkMode ? '#334155' : '#cbd5e1',
        textStyle: { color: darkMode ? '#f1f5f9' : '#0f172a', fontSize: 11 },
        formatter: (params) => {
          if (!params || !params.length) return '';
          const idx = params[0].dataIndex;
          const item = trendData[idx];
          const yoyDiff =
            item.total_traffic_yoy > 0
              ? (((item.total_traffic - item.total_traffic_yoy) / item.total_traffic_yoy) * 100).toFixed(2)
              : null;
          return `
            <div style="font-weight: bold; margin-bottom: 4px;">${item.date} (${item.date_label})</div>
            <div style="display: flex; justify-content: space-between; gap: 12px;"><span style="color: #2dd4bf;">● 2G Traffic:</span><b>${fmtDec(item.traffic_2g)} KErl</b></div>
            <div style="display: flex; justify-content: space-between; gap: 12px;"><span style="color: #60a5fa;">● VoLTE Traffic:</span><b>${fmtDec(item.traffic_volte)} KErl</b></div>
            <div style="border-top: 1px dashed ${splitLineColor}; margin: 4px 0; padding-top: 4px; display: flex; justify-content: space-between; gap: 12px;">
              <b>Total Traffic:</b> <b>${fmtDec(item.total_traffic)} KErl</b>
            </div>
            <div style="display: flex; justify-content: space-between; gap: 12px; color: #f59e0b;">
              <span>YoY Baseline:</span> <b>${item.total_traffic_yoy !== null ? fmtDec(item.total_traffic_yoy) + ' KErl' : '–'}</b>
            </div>
            ${yoyDiff !== null ? `<div style="text-align: right; font-size: 10px; color: ${Number(yoyDiff) >= 0 ? '#10b981' : '#f43f5e'}; font-weight: bold;">(${Number(yoyDiff) >= 0 ? '+' : ''}${yoyDiff}% YoY)</div>` : ''}
          `;
        },
      },
      legend: {
        data: ['2G', 'VoLTE', 'Last Year (YoY)'],
        top: 0,
        textStyle: { color: textColor, fontSize: 11 },
        itemWidth: 10,
        itemHeight: 10,
        icon: 'circle',
      },
      grid: {
        top: 36,
        left: 45,
        right: 15,
        bottom: 30,
      },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: splitLineColor } },
        axisLabel: { color: textColor, fontSize: 10, interval: 2 },
      },
      yAxis: {
        type: 'value',
        name: 'KErl',
        nameTextStyle: { color: textColor, fontSize: 10 },
        splitLine: { lineStyle: { color: splitLineColor, type: 'dashed' } },
        axisLabel: { color: textColor, fontSize: 10 },
      },
      series: [
        {
          name: '2G',
          type: 'bar',
          stack: 'traffic',
          data: t2g,
          itemStyle: { color: darkMode ? '#14b8a6' : '#0d9488' },
        },
        {
          name: 'VoLTE',
          type: 'bar',
          stack: 'traffic',
          data: tVolte,
          itemStyle: { color: darkMode ? '#3b82f6' : '#2563eb' },
        },
        {
          name: 'Last Year (YoY)',
          type: 'line',
          data: tYoy,
          smooth: false,
          symbol: 'none',
          lineStyle: { type: 'dashed', width: 2, color: '#f59e0b' },
          itemStyle: { color: '#f59e0b' },
        },
      ],
    };
  }, [trendData, darkMode]);

  // Helper to determine if a data source date is lagging > 2 days
  const checkFreshnessLag = (isoDate) => {
    if (!isoDate) return { isLag: true, days: null };
    try {
      const today = new Date();
      const dt = new Date(isoDate);
      const diffMs = today.setHours(0, 0, 0, 0) - dt.setHours(0, 0, 0, 0);
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      return { isLag: diffDays > 2, days: diffDays };
    } catch {
      return { isLag: false, days: 0 };
    }
  };

  const kpis = summaryData?.kpi || {};
  const inv = summaryData?.inventory || {};

  return (
    <div className="space-y-4 relative">
      {loading && <DataLoadingOverlay />}

      {/* Header Controls */}
      <div
        className={`p-3.5 rounded-xl flex flex-wrap items-center justify-between gap-3 ${cardCls}`}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-blue-500/10 dark:bg-blue-500/20 text-blue-500 flex items-center justify-center font-bold">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-extrabold tracking-tight">Network Overview</h1>
            <p className="text-xs text-slate-500">
              Daily payload &amp; traffic performance across 2G, 4G, and 5G with YoY benchmarks
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Branch Filter */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-500 font-semibold">Branch:</span>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition cursor-pointer outline-none ${
                darkMode
                  ? 'bg-slate-800 border-slate-700 text-slate-200 focus:border-blue-500'
                  : 'bg-white border-slate-300 text-slate-800 focus:border-blue-500 shadow-xs'
              }`}
            >
              {BRANCH_OPTIONS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* Date Picker */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-500 font-semibold">Date:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition outline-none ${
                darkMode
                  ? 'bg-slate-800 border-slate-700 text-slate-200 focus:border-blue-500'
                  : 'bg-white border-slate-300 text-slate-800 focus:border-blue-500 shadow-xs'
              }`}
            />
          </div>

          <button
            type="button"
            onClick={() => fetchData()}
            className="p-1.5 rounded-lg border text-slate-400 hover:text-blue-500 hover:border-blue-400 transition cursor-pointer"
            title="Reload overview"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-500 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Error loading overview data: {error}</span>
        </div>
      )}

      {/* 1. Summary KPI Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total Payload */}
        <div className={`p-4 rounded-xl ${cardCls}`}>
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="font-bold uppercase tracking-wider">Total Payload</span>
            <BarChart3 className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            {fmtDec(kpis.total_payload?.value)}{' '}
            <span className="text-sm font-semibold text-slate-400">TB</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <DeltaBadge val={kpis.total_payload?.yoy_pct} />
            <span className="text-slate-400 text-[11px]">
              Last yr: {fmtDec(kpis.total_payload?.yoy_val)} TB
            </span>
          </div>
        </div>

        {/* 4G Payload */}
        <div className={`p-4 rounded-xl ${cardCls}`}>
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="font-bold uppercase tracking-wider">4G Payload</span>
            <BarChart3 className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-black tracking-tight text-blue-600 dark:text-blue-400">
            {fmtDec(kpis.payload_4g?.value)}{' '}
            <span className="text-sm font-semibold text-slate-400">TB</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <DeltaBadge val={kpis.payload_4g?.yoy_pct} />
            <span className="text-slate-400 text-[11px]">
              Last yr: {fmtDec(kpis.payload_4g?.yoy_val)} TB
            </span>
          </div>
        </div>

        {/* 5G Payload */}
        <div className={`p-4 rounded-xl ${cardCls}`}>
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="font-bold uppercase tracking-wider">5G Payload</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
              {kpis.payload_5g?.share_pct || 0}% share
            </span>
          </div>
          <div className="text-2xl font-black tracking-tight text-cyan-600 dark:text-cyan-400">
            {fmtDec(kpis.payload_5g?.value)}{' '}
            <span className="text-sm font-semibold text-slate-400">TB</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <DeltaBadge val={kpis.payload_5g?.yoy_pct} />
            <span className="text-slate-400 text-[11px]">
              Last yr: {fmtDec(kpis.payload_5g?.yoy_val)} TB
            </span>
          </div>
        </div>

        {/* Total Traffic */}
        <div className={`p-4 rounded-xl ${cardCls}`}>
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="font-bold uppercase tracking-wider">Total Traffic</span>
            <Activity className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black tracking-tight text-emerald-600 dark:text-emerald-400">
            {fmtDec(kpis.total_traffic?.value)}{' '}
            <span className="text-sm font-semibold text-slate-400">KErl</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <DeltaBadge val={kpis.total_traffic?.yoy_pct} />
            <span className="text-slate-400 text-[11px]">
              Last yr: {fmtDec(kpis.total_traffic?.yoy_val)} KErl
            </span>
          </div>
        </div>
      </div>

      {/* 2. Inventory Site Count Tiles */}
      <div className={`p-4 rounded-xl ${cardCls}`}>
        <div className="flex items-center justify-between mb-3 border-b pb-2 border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-blue-500" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Registered Site Inventory
            </h2>
          </div>
          <span className="text-[11px] font-semibold text-slate-400">
            Master Data · Week {inv.week || '–'}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-400 block uppercase">2G Sites</span>
              <span className="text-xl font-extrabold text-slate-900 dark:text-white">
                {fmtInt(inv.sites_2g)}
              </span>
            </div>
            <span className="text-[10px] font-medium text-slate-400">CellList2G</span>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-400 block uppercase">4G Sites</span>
              <span className="text-xl font-extrabold text-blue-600 dark:text-blue-400">
                {fmtInt(inv.sites_4g)}
              </span>
            </div>
            <span className="text-[10px] font-medium text-slate-400">CellList4G</span>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-400 block uppercase">5G Sites</span>
              <span className="text-xl font-extrabold text-cyan-600 dark:text-cyan-400">
                {fmtInt(inv.sites_5g)}
              </span>
            </div>
            <span className="text-[10px] font-medium text-slate-400">ref_cell_5g</span>
          </div>
        </div>
      </div>

      {/* 3. Two 30-Day Productivity Trend Charts (Reference Image) */}
      <div className={`p-4 rounded-xl ${cardCls}`}>
        <div className="flex items-center gap-2 mb-3">
          <TrendingDown className="w-4 h-4 text-blue-500 rotate-180" />
          <h2 className="text-sm font-bold tracking-tight">30-Day Productivity Trend</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Payload Trend Chart */}
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-500" />
                <h3 className="text-xs font-bold">Payload Trend</h3>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mb-2">
              Stacked per Technology (TB/day) — last 30 days
            </p>
            <div className="h-64">
              {trendData.length > 0 ? (
                <ReactECharts
                  option={payloadChartOption}
                  style={{ height: '100%', width: '100%' }}
                  notMerge
                />
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  No trend data available
                </div>
              )}
            </div>
          </div>

          {/* Traffic Trend Chart */}
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-500" />
                <h3 className="text-xs font-bold">Traffic Trend</h3>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mb-2">
              Stacked per Technology (KErl) — last 30 days
            </p>
            <div className="h-64">
              {trendData.length > 0 ? (
                <ReactECharts
                  option={trafficChartOption}
                  style={{ height: '100%', width: '100%' }}
                  notMerge
                />
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  No trend data available
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4 & 5: Bottom 2-Column Grid (Branch Ranking Drill-down + Top 10 Decline Sites) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 4. Branch Ranking with Drill-Down */}
        <div className={`p-4 rounded-xl flex flex-col ${cardCls}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-500" />
              <h2 className="text-xs font-bold uppercase tracking-wider">
                Ranking &amp; Hierarchy Drill-down
              </h2>
            </div>
            <span className="text-[10px] text-slate-400">Click row to drill</span>
          </div>

          {/* Breadcrumbs */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-3 bg-slate-100 dark:bg-slate-800/60 px-2.5 py-1.5 rounded-lg">
            <button
              type="button"
              onClick={() => handleBreadcrumbClick('branch')}
              className={`font-semibold cursor-pointer ${
                drill.level === 'branch'
                  ? 'text-blue-500 font-bold'
                  : 'hover:text-blue-400'
              }`}
            >
              All Branches
            </button>
            {drill.parentBranch && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                <button
                  type="button"
                  onClick={() => handleBreadcrumbClick('sales_cluster')}
                  className={`font-semibold cursor-pointer ${
                    drill.level === 'sales_cluster'
                      ? 'text-blue-500 font-bold'
                      : 'hover:text-blue-400'
                  }`}
                >
                  {drill.parentBranch}
                </button>
              </>
            )}
            {drill.level === 'rtpo' && drill.parent && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-bold text-blue-500">{drill.parent}</span>
              </>
            )}
          </div>

          {/* Table */}
          <div className="grow overflow-x-auto rounded-lg border border-slate-100 dark:border-slate-800">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className={headerCls}>
                  <th className="p-2.5 font-bold uppercase tracking-wider text-[11px]">
                    {drill.level === 'branch'
                      ? 'Branch'
                      : drill.level === 'sales_cluster'
                      ? 'Sales Cluster'
                      : 'RTPO'}
                  </th>
                  <th className="p-2.5 font-bold uppercase tracking-wider text-[11px] text-right">
                    Payload (TB)
                  </th>
                  <th className="p-2.5 font-bold uppercase tracking-wider text-[11px] text-right">
                    YoY
                  </th>
                  <th className="p-2.5 font-bold uppercase tracking-wider text-[11px] text-right">
                    Traffic (KErl)
                  </th>
                  <th className="p-2.5 font-bold uppercase tracking-wider text-[11px] text-right">
                    YoY
                  </th>
                  <th className="p-2.5 font-bold uppercase tracking-wider text-[11px] text-right">
                    Sites
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {branchRows.length > 0 ? (
                  branchRows.map((row) => {
                    const isLeaf = drill.level === 'rtpo';
                    return (
                      <tr
                        key={row.name}
                        onClick={() => !isLeaf && handleDrillRow(row.name)}
                        className={`transition ${
                          isLeaf
                            ? ''
                            : 'cursor-pointer hover:bg-blue-50 dark:hover:bg-slate-800/70'
                        }`}
                      >
                        <td className="p-2.5 font-bold text-slate-900 dark:text-slate-100 flex items-center justify-between">
                          <span>{row.name}</span>
                          {!isLeaf && (
                            <ChevronRight className="w-3.5 h-3.5 text-slate-400 opacity-60" />
                          )}
                        </td>
                        <td className="p-2.5 text-right font-medium">{fmtDec(row.payload)}</td>
                        <td className="p-2.5 text-right">
                          <DeltaBadge val={row.payload_yoy_pct} />
                        </td>
                        <td className="p-2.5 text-right font-medium">{fmtDec(row.traffic)}</td>
                        <td className="p-2.5 text-right">
                          <DeltaBadge val={row.traffic_yoy_pct} />
                        </td>
                        <td className="p-2.5 text-right font-mono text-slate-500">
                          {fmtInt(row.site_count)}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="6" className="p-4 text-center text-slate-400 text-xs">
                      No hierarchy data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 5. Top 10 Payload Decline Sites */}
        <div className={`p-4 rounded-xl flex flex-col ${cardCls}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-rose-500" />
              <h2 className="text-xs font-bold uppercase tracking-wider">
                Top 10 Payload Decline Sites (vs YoY)
              </h2>
            </div>
            <span className="text-[10px] text-slate-400">Click site to open 4G Daily</span>
          </div>

          <div className="grow overflow-x-auto rounded-lg border border-slate-100 dark:border-slate-800">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className={headerCls}>
                  <th className="p-2.5 font-bold uppercase tracking-wider text-[11px]">Site</th>
                  <th className="p-2.5 font-bold uppercase tracking-wider text-[11px]">Kabupaten</th>
                  <th className="p-2.5 font-bold uppercase tracking-wider text-[11px]">Branch</th>
                  <th className="p-2.5 font-bold uppercase tracking-wider text-[11px] text-right">
                    Current (TB)
                  </th>
                  <th className="p-2.5 font-bold uppercase tracking-wider text-[11px] text-right">
                    YoY (TB)
                  </th>
                  <th className="p-2.5 font-bold uppercase tracking-wider text-[11px] text-right">
                    Δ (TB)
                  </th>
                  <th className="p-2.5 font-bold uppercase tracking-wider text-[11px] text-right">
                    Δ (%)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {topDeclineSites.length > 0 ? (
                  topDeclineSites.map((site, i) => (
                    <tr
                      key={site.site + i}
                      onClick={() => onOpenSite && onOpenSite('4g', site.site)}
                      className="cursor-pointer hover:bg-rose-50/50 dark:hover:bg-rose-950/20 transition group"
                      title="Click to view 4G Daily sector trends"
                    >
                      <td className="p-2.5 font-bold text-blue-600 dark:text-blue-400 group-hover:underline flex items-center gap-1">
                        {site.site}
                        <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition" />
                      </td>
                      <td className="p-2.5 text-slate-600 dark:text-slate-300">
                        {site.kabupaten}
                      </td>
                      <td className="p-2.5 text-slate-500 font-medium">{site.branch}</td>
                      <td className="p-2.5 text-right font-medium">{fmtDec(site.payload_cur)}</td>
                      <td className="p-2.5 text-right text-slate-500 font-medium">
                        {fmtDec(site.payload_yoy)}
                      </td>
                      <td className="p-2.5 text-right font-bold text-rose-500">
                        {fmtDec(site.diff)}
                      </td>
                      <td className="p-2.5 text-right font-bold text-rose-500">
                        {site.diff_pct !== null ? `${site.diff_pct.toFixed(1)}%` : '–'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" className="p-4 text-center text-slate-400 text-xs">
                      No declining sites found for this date
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 6. Data Freshness Status Card */}
      <div className={`p-4 rounded-xl ${cardCls}`}>
        <div className="flex items-center justify-between mb-3 border-b pb-2 border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-500" />
            <h2 className="text-xs font-bold uppercase tracking-wider">
              Data Freshness by Source
            </h2>
          </div>
          <span className="text-[11px] text-slate-400">
            Yellow badge indicates lag &gt; 2 days from today
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {[
            { key: 'overview', label: 'Overview (measDaily)', table: 'measDailyTrafficPayload' },
            { key: '4g_hourly', label: '4G Hourly', table: 'measHy4g' },
            { key: '4g_daily', label: '4G Daily', table: 'measDy4g' },
            { key: '5g', label: '5G Daily', table: 'measDy5g' },
            { key: '2g', label: '2G Daily', table: 'measDy2g' },
            { key: 'ta_4g', label: 'Timing Advance 4G', table: 'measTa4g' },
            { key: 'packet_loss', label: 'TWAMP Loss', table: 'measTwamp4g' },
          ].map((src) => {
            const dateStr = freshnessDates?.[src.key] || latestDates[src.key] || '–';
            const { isLag, days } = checkFreshnessLag(dateStr);
            return (
              <div
                key={src.key}
                className={`p-2.5 rounded-lg border text-xs flex flex-col justify-between ${
                  isLag
                    ? 'border-amber-500/40 bg-amber-500/5 dark:bg-amber-500/10'
                    : 'border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40'
                }`}
              >
                <div>
                  <span className="font-bold block text-slate-800 dark:text-slate-200 truncate">
                    {src.label}
                  </span>
                  <span className="text-[10px] text-slate-400 block font-mono truncate">
                    {src.table}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold">{dateStr}</span>
                  {isLag ? (
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500 text-white"
                      title={`${days} days behind`}
                    >
                      Lag
                    </span>
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-emerald-500" title="Up to date"></span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
