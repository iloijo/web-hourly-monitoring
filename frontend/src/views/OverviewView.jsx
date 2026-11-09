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
  Maximize2,
  Minimize2,
  Radio,
  RefreshCw,
  TrendingDown,
  Wifi,
  X,
} from 'lucide-react';
import ReactECharts from '../lib/echarts';
import { getJson } from '../api/client';
import { latestDates, loadLatestDates } from '../constants/dates';
import DataLoadingOverlay from '../components/DataLoadingOverlay';
import SegmentedToggle from '../components/filters/SegmentedToggle';

const NOP_OPTIONS = [
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

const MODE_OPTIONS = [
  ['YoY', 'YoY'],
  ['MTD', 'MTD'],
  ['YTD', 'YTD'],
];

const fmtDec = (v, digits = 2) =>
  v === null || v === undefined
    ? '–'
    : Number(v).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

const fmtInt = (v) =>
  v === null || v === undefined ? '–' : Number(v).toLocaleString('en-US');

// Formatter for Payload: auto convert TB -> PB if >= 1000 TB
function formatPayloadUnit(tbVal) {
  if (tbVal === null || tbVal === undefined) return { val: '–', unit: 'TB' };
  const num = Number(tbVal);
  if (Math.abs(num) >= 1000) {
    return { val: fmtDec(num / 1000, 2), unit: 'PB' };
  }
  return { val: fmtDec(num, 2), unit: 'TB' };
}

// Formatter for Traffic: auto convert KErl -> Mio Erl if >= 1000 KErl
function formatTrafficUnit(kerlVal) {
  if (kerlVal === null || kerlVal === undefined) return { val: '–', unit: 'KErl' };
  const num = Number(kerlVal);
  if (Math.abs(num) >= 1000) {
    return { val: fmtDec(num / 1000, 2), unit: 'Mio Erl' };
  }
  return { val: fmtDec(num, 2), unit: 'KErl' };
}

// Delta Badge with mode label
function DeltaBadge({ val, mode = 'YoY' }) {
  if (val === null || val === undefined) {
    return <span className="text-xs text-slate-400 font-medium">–</span>;
  }
  const num = Number(val);
  const isUp = num >= 0;
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
      {isUp ? `+${num.toFixed(2)}%` : `${num.toFixed(2)}%`} {mode}
    </span>
  );
}

// Helper to safely shift year, handling Feb 29
function safeShiftYear(dateStr, deltaYears = -1) {
  const parts = dateStr.split('-');
  const y = Number(parts[0]) + deltaYears;
  const m = parts[1];
  let d = parts[2];
  if (m === '02' && d === '29') {
    d = '28';
  }
  return `${y}-${m}-${d}`;
}

// Generate the 365 MM-DD calendar labels (excluding 02-29 for alignment)
const CALENDAR_MM_DD = (() => {
  const dates = [];
  const daysInMonths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  for (let m = 1; m <= 12; m++) {
    const mStr = String(m).padStart(2, '0');
    for (let d = 1; d <= daysInMonths[m - 1]; d++) {
      const dStr = String(d).padStart(2, '0');
      dates.push(`${mStr}-${dStr}`);
    }
  }
  return dates;
})();

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function OverviewView({ darkMode, onOpenSite, onExportData }) {
  const [selectedDate, setSelectedDate] = useState(latestDates['overview'] || '2026-11-07');
  const [selectedNop, setSelectedNop] = useState('All');
  const [mode, setMode] = useState('YTD'); // 'YoY' | 'MTD' | 'YTD'
  const [fullscreenChart, setFullscreenChart] = useState(null); // 'payload' | 'traffic' | null

  // Global dataset cache: year -> { year, latest_date, rows }
  const [dataset, setDataset] = useState(null);
  const [inventory, setInventory] = useState(null);
  const [freshnessDates, setFreshnessDates] = useState({});
  const [loadingDataset, setLoadingDataset] = useState(false);
  const [error, setError] = useState(null);

  // Hierarchy drill state: { level: 'nop' | 'kabupaten' | 'kecamatan', parent: null, parentNop: null }
  const [drill, setDrill] = useState({ level: 'nop', parent: null, parentNop: null });
  const [drillRows, setDrillRows] = useState([]);
  const [loadingDrill, setLoadingDrill] = useState(false);

  // Top decline sites state
  const [topDeclineSites, setTopDeclineSites] = useState([]);
  const [loadingDecline, setLoadingDecline] = useState(false);

  // Local caches to prevent re-querying drill/decline
  const drillCacheRef = useRef(new Map());
  const declineCacheRef = useRef(new Map());
  const datasetCacheRef = useRef({});

  const selectedYear = Number(selectedDate.slice(0, 4)) || 2026;
  const lastYear = selectedYear - 1;

  // 1. Initial load of latest dates & inventory
  useEffect(() => {
    loadLatestDates().then((dates) => {
      setFreshnessDates(dates);
      if (dates?.overview) {
        setSelectedDate(dates.overview);
      }
    });

    getJson('/api/overview/inventory')
      .then((inv) => {
        if (inv?.nops) setInventory(inv);
      })
      .catch((err) => loggerWarning('Failed to load inventory', err));
  }, []);

  // 2. Fetch dataset when year changes or on forced reload
  const fetchDataset = (year = selectedYear, forceRefresh = false) => {
    if (!forceRefresh && datasetCacheRef.current[year]) {
      setDataset(datasetCacheRef.current[year]);
      return;
    }

    setLoadingDataset(true);
    setError(null);

    getJson('/api/overview/dataset', { year, refresh: forceRefresh ? 1 : 0 })
      .then((data) => {
        if (data?.error) {
          setError(data.error);
        } else {
          datasetCacheRef.current[year] = data;
          setDataset(data);
        }
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoadingDataset(false));
  };

  useEffect(() => {
    fetchDataset(selectedYear);
  }, [selectedYear]); // eslint-disable-line react-hooks/exhaustive-deps

  // Manual reload button
  const handleReload = () => {
    drillCacheRef.current.clear();
    declineCacheRef.current.clear();
    fetchDataset(selectedYear, true);
    getJson('/api/overview/inventory', { refresh: 1 }).then((inv) => {
      if (inv?.nops) setInventory(inv);
    });
    getJson('/api/latest_dates').then((dates) => {
      if (dates) setFreshnessDates(dates);
    });
  };

  // 3. Client-Side Aggregation for KPI Tiles, Yearly Charts, and NOP Ranking
  const computed = useMemo(() => {
    if (!dataset?.rows?.length) return null;

    const rows = dataset.rows;
    const latestDate = dataset.latest_date || selectedDate;
    const effectiveSelectedDate = selectedDate > latestDate ? latestDate : selectedDate;

    // Determine current period dates and last year period dates
    const selParts = effectiveSelectedDate.split('-');
    const mStr = selParts[1];
    const dStr = selParts[2];

    const curY = selectedYear;
    const prevY = lastYear;

    let curStartDate, curEndDate, yoyStartDate, yoyEndDate;

    if (mode === 'YoY') {
      curStartDate = effectiveSelectedDate;
      curEndDate = effectiveSelectedDate;
      yoyStartDate = safeShiftYear(effectiveSelectedDate, -1);
      yoyEndDate = yoyStartDate;
    } else if (mode === 'MTD') {
      curStartDate = `${curY}-${mStr}-01`;
      curEndDate = effectiveSelectedDate;
      yoyStartDate = `${prevY}-${mStr}-01`;
      yoyEndDate = safeShiftYear(effectiveSelectedDate, -1);
    } else {
      // YTD
      curStartDate = `${curY}-01-01`;
      curEndDate = effectiveSelectedDate;
      yoyStartDate = `${prevY}-01-01`;
      yoyEndDate = safeShiftYear(effectiveSelectedDate, -1);
    }

    // Filter by NOP
    const filterNop = selectedNop !== 'All';

    // 3.1 Compute KPI Tiles Totals
    let totPayloadCur = 0;
    let totPayloadYoy = 0;
    let p4gCur = 0;
    let p4gYoy = 0;
    let p5gCur = 0;
    let p5gYoy = 0;
    let totTrafficCur = 0;
    let totTrafficYoy = 0;

    // Daily sums in current period for Peak Daily Payload
    const dailySumsCur = {};

    // Map for Yearly Trend Chart: (MM-DD) -> { cur: { ptot, p2g, p4g, p5g, ttot, t2g, tvolte }, last: { ... } }
    const yearlyMap = {};
    CALENDAR_MM_DD.forEach((mmdd) => {
      yearlyMap[mmdd] = {
        cur: { ptot: 0, p2g: 0, p4g: 0, p5g: 0, ttot: 0, t2g: 0, tvolte: 0, count: 0 },
        last: { ptot: 0, p2g: 0, p4g: 0, p5g: 0, ttot: 0, t2g: 0, tvolte: 0, count: 0 },
      };
    });

    // Map for NOP Ranking Level 1
    const nopAgg = {};
    NOP_OPTIONS.filter((n) => n !== 'All').forEach((n) => {
      nopAgg[n] = { payloadCur: 0, payloadYoy: 0, trafficCur: 0, trafficYoy: 0 };
    });

    rows.forEach((r) => {
      const d = r.date;
      const rNop = r.nop;
      const isSelectedNop = !filterNop || rNop === selectedNop;

      // Check NOP Ranking accumulation
      if (d >= curStartDate && d <= curEndDate) {
        if (nopAgg[rNop]) {
          nopAgg[rNop].payloadCur += r.ptot;
          nopAgg[rNop].trafficCur += r.ttot;
        }
      }
      if (d >= yoyStartDate && d <= yoyEndDate) {
        if (nopAgg[rNop]) {
          nopAgg[rNop].payloadYoy += r.ptot;
          nopAgg[rNop].trafficYoy += r.ttot;
        }
      }

      // Check KPI Totals accumulation
      if (isSelectedNop) {
        if (d >= curStartDate && d <= curEndDate) {
          totPayloadCur += r.ptot;
          p4gCur += r.p4g;
          p5gCur += r.p5g;
          totTrafficCur += r.ttot;

          dailySumsCur[d] = (dailySumsCur[d] || 0) + r.ptot;
        }
        if (d >= yoyStartDate && d <= yoyEndDate) {
          totPayloadYoy += r.ptot;
          p4gYoy += r.p4g;
          p5gYoy += r.p5g;
          totTrafficYoy += r.ttot;
        }

        // Yearly chart distribution
        const rYear = Number(d.slice(0, 4));
        const mmdd = d.slice(5, 10);
        if (yearlyMap[mmdd]) {
          if (rYear === curY && d <= latestDate) {
            const c = yearlyMap[mmdd].cur;
            c.ptot += r.ptot;
            c.p2g += r.p2g;
            c.p4g += r.p4g;
            c.p5g += r.p5g;
            c.ttot += r.ttot;
            c.t2g += r.t2g;
            c.tvolte += r.tvolte;
            c.count++;
          } else if (rYear === prevY) {
            const l = yearlyMap[mmdd].last;
            l.ptot += r.ptot;
            l.p2g += r.p2g;
            l.p4g += r.p4g;
            l.p5g += r.p5g;
            l.ttot += r.ttot;
            l.t2g += r.t2g;
            l.tvolte += r.tvolte;
            l.count++;
          }
        }
      }
    });

    // Peak Daily Payload calculation
    let peakVal = 0;
    let peakDate = null;
    Object.entries(dailySumsCur).forEach(([day, val]) => {
      if (val > peakVal) {
        peakVal = val;
        peakDate = day;
      }
    });

    // Peak formatted date: e.g. "21 Mar"
    let peakDateFormatted = '–';
    if (peakDate) {
      const pD = peakDate.slice(8, 10);
      const pM = MONTH_NAMES[Number(peakDate.slice(5, 7)) - 1];
      peakDateFormatted = `${pD} ${pM}`;
    }

    // Delta calculation helpers
    const calcDelta = (cur, yoy) => (yoy > 0 ? ((cur - yoy) / yoy) * 100 : null);

    // 3.2 Prepare Yearly Trend Chart Series Arrays
    const latestMmDd = latestDate.slice(5, 10);
    const selectedMmDd = effectiveSelectedDate.slice(5, 10);

    const xLabels = [];
    const payloadSeriesLast = [];
    const payloadSeriesCur = [];
    const trafficSeriesLast = [];
    const trafficSeriesCur = [];
    const deltaSeriesPayload = [];
    const deltaSeriesTraffic = [];

    // Running cumulative trackers for MTD / YTD
    let cumCurPayload = 0;
    let cumLastPayload = 0;
    let cumCurTraffic = 0;
    let cumLastTraffic = 0;

    let curMonthTrack = '';

    CALENDAR_MM_DD.forEach((mmdd, idx) => {
      const mNum = Number(mmdd.slice(0, 2));
      const dNum = Number(mmdd.slice(3, 5));
      const mName = MONTH_NAMES[mNum - 1];
      const label = `${String(dNum).padStart(2, '0')} ${mName}`;
      xLabels.push(label);

      const cell = yearlyMap[mmdd];
      const hasCurData = mmdd <= latestMmDd && cell.cur.count > 0;

      const pCurVal = hasCurData ? cell.cur.ptot : null;
      const pLastVal = cell.last.count > 0 ? cell.last.ptot : null;
      const tCurVal = hasCurData ? cell.cur.ttot : null;
      const tLastVal = cell.last.count > 0 ? cell.last.ttot : null;

      payloadSeriesCur.push(pCurVal !== null ? Number(pCurVal.toFixed(2)) : null);
      payloadSeriesLast.push(pLastVal !== null ? Number(pLastVal.toFixed(2)) : null);
      trafficSeriesCur.push(tCurVal !== null ? Number(tCurVal.toFixed(2)) : null);
      trafficSeriesLast.push(tLastVal !== null ? Number(tLastVal.toFixed(2)) : null);

      // Delta calculation according to mode
      let pDelta = null;
      let tDelta = null;

      if (hasCurData && pLastVal !== null) {
        if (mode === 'YoY') {
          pDelta = calcDelta(pCurVal, pLastVal);
          tDelta = calcDelta(tCurVal, tLastVal);
        } else if (mode === 'MTD') {
          // Reset cumulative on 1st of month
          if (curMonthTrack !== mmdd.slice(0, 2)) {
            curMonthTrack = mmdd.slice(0, 2);
            cumCurPayload = 0;
            cumLastPayload = 0;
            cumCurTraffic = 0;
            cumLastTraffic = 0;
          }
          cumCurPayload += pCurVal;
          cumLastPayload += pLastVal;
          cumCurTraffic += tCurVal;
          cumLastTraffic += tLastVal;
          pDelta = calcDelta(cumCurPayload, cumLastPayload);
          tDelta = calcDelta(cumCurTraffic, cumLastTraffic);
        } else {
          // YTD
          cumCurPayload += pCurVal;
          cumLastPayload += pLastVal;
          cumCurTraffic += tCurVal;
          cumLastTraffic += tLastVal;
          pDelta = calcDelta(cumCurPayload, cumLastPayload);
          tDelta = calcDelta(cumCurTraffic, cumLastTraffic);
        }
      }

      deltaSeriesPayload.push(pDelta !== null ? Number(pDelta.toFixed(2)) : null);
      deltaSeriesTraffic.push(tDelta !== null ? Number(tDelta.toFixed(2)) : null);
    });

    // 3.3 Prepare NOP Ranking Rows (Level 1)
    const nopRows = Object.entries(nopAgg)
      .map(([n, data]) => ({
        name: n,
        payload: data.payloadCur,
        payload_yoy_pct: calcDelta(data.payloadCur, data.payloadYoy),
        traffic: data.trafficCur,
        traffic_yoy_pct: calcDelta(data.trafficCur, data.trafficYoy),
        site_count: inventory?.nops?.[n]?.sites_4g || 0,
      }))
      .sort((a, b) => b.payload - a.payload);

    return {
      kpi: {
        totalPayload: {
          ...formatPayloadUnit(totPayloadCur),
          raw: totPayloadCur,
          yoyRaw: totPayloadYoy,
          yoyFormatted: formatPayloadUnit(totPayloadYoy),
          deltaPct: calcDelta(totPayloadCur, totPayloadYoy),
        },
        payload4g: {
          val: fmtDec(p4gCur),
          raw: p4gCur,
          yoyRaw: p4gYoy,
          yoyVal: fmtDec(p4gYoy),
          deltaPct: calcDelta(p4gCur, p4gYoy),
        },
        payload5g: {
          val: fmtDec(p5gCur),
          raw: p5gCur,
          sharePct: totPayloadCur > 0 ? ((p5gCur / totPayloadCur) * 100).toFixed(2) : '0.00',
          yoyRaw: p5gYoy,
          yoyVal: fmtDec(p5gYoy),
          deltaPct: calcDelta(p5gCur, p5gYoy),
        },
        totalTraffic: {
          ...formatTrafficUnit(totTrafficCur),
          raw: totTrafficCur,
          yoyRaw: totTrafficYoy,
          yoyFormatted: formatTrafficUnit(totTrafficYoy),
          deltaPct: calcDelta(totTrafficCur, totTrafficYoy),
        },
        peakDaily: {
          ...formatPayloadUnit(peakVal),
          raw: peakVal,
          dateFormatted: peakDateFormatted,
        },
      },
      chartData: {
        xLabels,
        latestIndex: CALENDAR_MM_DD.indexOf(latestMmDd),
        selectedIndex: CALENDAR_MM_DD.indexOf(selectedMmDd),
        payloadCur: payloadSeriesCur,
        payloadLast: payloadSeriesLast,
        trafficCur: trafficSeriesCur,
        trafficLast: trafficSeriesLast,
        deltaPayload: deltaSeriesPayload,
        deltaTraffic: deltaSeriesTraffic,
        yearlyMap,
      },
      nopRows,
    };
  }, [dataset, selectedDate, selectedNop, mode, selectedYear, lastYear, inventory]);

  // 4. Fetch Drill-Down Rows when level is 'kabupaten' or 'kecamatan'
  useEffect(() => {
    if (drill.level === 'nop') {
      return;
    }

    const cacheKey = `${drill.level}_${drill.parent}_${mode}_${selectedDate}_${selectedNop}`;
    if (drillCacheRef.current.has(cacheKey)) {
      setDrillRows(drillCacheRef.current.get(cacheKey));
      return;
    }

    setLoadingDrill(true);
    getJson('/api/overview/drill', {
      date: selectedDate,
      mode,
      level: drill.level,
      parent: drill.parent || '',
      nop: selectedNop === 'All' ? '' : selectedNop,
    })
      .then((res) => {
        if (res?.items) {
          drillCacheRef.current.set(cacheKey, res.items);
          setDrillRows(res.items);
        }
      })
      .catch((err) => console.error('Drill query failed', err))
      .finally(() => setLoadingDrill(false));
  }, [drill, mode, selectedDate, selectedNop]);

  // 5. Fetch Top Decline Sites
  useEffect(() => {
    const cacheKey = `${selectedDate}_${mode}_${selectedNop}_10`;
    if (declineCacheRef.current.has(cacheKey)) {
      setTopDeclineSites(declineCacheRef.current.get(cacheKey));
      return;
    }

    setLoadingDecline(true);
    getJson('/api/overview/top_decline', {
      date: selectedDate,
      mode,
      nop: selectedNop === 'All' ? '' : selectedNop,
      top_n: 10,
    })
      .then((res) => {
        if (res?.sites) {
          declineCacheRef.current.set(cacheKey, res.sites);
          setTopDeclineSites(res.sites);
        }
      })
      .catch((err) => console.error('Decline query failed', err))
      .finally(() => setLoadingDecline(false));
  }, [selectedDate, mode, selectedNop]);

  // Table rows to display
  const activeTableRows = drill.level === 'nop' ? computed?.nopRows || [] : drillRows;

  // Handle row click in Ranking Table
  const handleDrillRow = (rowName) => {
    if (drill.level === 'nop') {
      setDrill({
        level: 'kabupaten',
        parent: rowName,
        parentNop: rowName,
      });
    } else if (drill.level === 'kabupaten') {
      setDrill({
        level: 'kecamatan',
        parent: rowName,
        parentNop: drill.parentNop,
      });
    }
  };

  // Breadcrumb navigation
  const handleBreadcrumbClick = (targetLevel) => {
    if (targetLevel === 'nop') {
      setDrill({ level: 'nop', parent: null, parentNop: null });
    } else if (targetLevel === 'kabupaten') {
      setDrill({
        level: 'kabupaten',
        parent: drill.parentNop,
        parentNop: drill.parentNop,
      });
    }
  };

  // 6. Excel Export Registration
  useEffect(() => {
    if (!computed?.kpi) {
      onExportData(null);
      return;
    }

    const { kpi } = computed;
    const inv = inventory?.nops?.[selectedNop] || {};

    onExportData(() => ({
      filename: `netPulse_Overview_${mode}_${selectedDate}_${selectedNop}`,
      sheets: [
        {
          name: 'Summary',
          columns: ['Metric', 'Current Period', 'Unit', 'Last Year Period', 'Delta (%)'],
          rows: [
            ['Total Payload', kpi.totalPayload.val, kpi.totalPayload.unit, kpi.totalPayload.yoyFormatted.val, kpi.totalPayload.deltaPct],
            ['4G Payload', kpi.payload4g.val, 'TB', kpi.payload4g.yoyVal, kpi.payload4g.deltaPct],
            ['5G Payload', kpi.payload5g.val, 'TB', kpi.payload5g.yoyVal, kpi.payload5g.deltaPct],
            ['5G Share', kpi.payload5g.sharePct, '%', '–', '–'],
            ['Total Traffic', kpi.totalTraffic.val, kpi.totalTraffic.unit, kpi.totalTraffic.yoyFormatted.val, kpi.totalTraffic.deltaPct],
            ['Peak Daily Payload', kpi.peakDaily.val, kpi.peakDaily.unit, kpi.peakDaily.dateFormatted, '–'],
            ['2G Sites (Inventory)', inv.sites_2g || 0, 'Sites', '–', '–'],
            ['4G Sites (Inventory)', inv.sites_4g || 0, 'Sites', '–', '–'],
            ['5G Sites (Inventory)', inv.sites_5g || 0, 'Sites', '–', '–'],
          ],
        },
        {
          name: 'Daily Trend',
          columns: [
            'Day',
            `Payload ${lastYear} (TB)`,
            `Payload ${selectedYear} (TB)`,
            `Payload ${mode} Delta (%)`,
            `Traffic ${lastYear} (KErl)`,
            `Traffic ${selectedYear} (KErl)`,
            `Traffic ${mode} Delta (%)`,
          ],
          rows: CALENDAR_MM_DD.map((mmdd, i) => [
            mmdd,
            computed.chartData.payloadLast[i],
            computed.chartData.payloadCur[i],
            computed.chartData.deltaPayload[i],
            computed.chartData.trafficLast[i],
            computed.chartData.trafficCur[i],
            computed.chartData.deltaTraffic[i],
          ]),
        },
        {
          name: 'Ranking',
          columns: ['Name', 'Level', 'Payload (TB)', `${mode} Delta (%)`, 'Traffic (KErl)', `${mode} Delta (%)`, 'Sites'],
          rows: activeTableRows.map((b) => [
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
          columns: ['Site ID', 'Kabupaten', 'NOP', 'Payload Now (TB)', 'Payload Last Year (TB)', 'Delta (TB)', 'Delta (%)'],
          rows: topDeclineSites.map((s) => [
            s.site,
            s.kabupaten,
            s.nop,
            s.payload_cur,
            s.payload_yoy,
            s.diff,
            s.diff_pct,
          ]),
        },
      ],
    }));

    return () => onExportData(null);
  }, [computed, inventory, selectedDate, selectedNop, mode, selectedYear, lastYear, drill.level, activeTableRows, topDeclineSites, onExportData]);

  // Common card styles
  const cardCls = darkMode
    ? 'bg-slate-900 border border-slate-800 shadow-md shadow-black/20'
    : 'bg-white border border-slate-200 shadow-sm';
  const headerCls = darkMode
    ? 'bg-slate-800/60 text-slate-200 border-b border-slate-800'
    : 'bg-slate-50 text-slate-700 border-b border-slate-100';

  // 7. ECharts Options for Yearly Trend Charts
  const payloadChartOption = useMemo(() => {
    if (!computed?.chartData) return {};
    const cd = computed.chartData;

    const textColor = darkMode ? '#94a3b8' : '#64748b';
    const splitLineColor = darkMode ? '#334155' : '#e2e8f0';

    const latestIdx = cd.latestIndex >= 0 ? cd.latestIndex : cd.xLabels.length - 1;
    const latestLabel = cd.xLabels[latestIdx];
    const lastLabel = cd.xLabels[cd.xLabels.length - 1];

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        backgroundColor: darkMode ? '#0f172a' : '#ffffff',
        borderColor: darkMode ? '#334155' : '#cbd5e1',
        textStyle: { color: darkMode ? '#f1f5f9' : '#0f172a', fontSize: 11 },
        formatter: (params) => {
          if (!params || !params.length) return '';
          const idx = params[0].dataIndex;
          const mmdd = CALENDAR_MM_DD[idx];
          const cell = cd.yearlyMap[mmdd];
          const curVal = cd.payloadCur[idx];
          const lastVal = cd.payloadLast[idx];
          const deltaVal = cd.deltaPayload[idx];

          return `
            <div style="font-weight: bold; margin-bottom: 4px;">${cd.xLabels[idx]}</div>
            <div style="display: flex; justify-content: space-between; gap: 14px; color: #94a3b8;">
              <span>● ${lastYear} Total:</span><b>${lastVal !== null ? fmtDec(lastVal) + ' TB' : '–'}</b>
            </div>
            <div style="display: flex; justify-content: space-between; gap: 14px; color: #3b82f6;">
              <span>● ${selectedYear} Total:</span><b>${curVal !== null ? fmtDec(curVal) + ' TB' : '–'}</b>
            </div>
            ${
              hasData(cell.cur)
                ? `
            <div style="padding-left: 10px; font-size: 10px; opacity: 0.85; margin: 2px 0;">
              <div>2G: ${fmtDec(cell.cur.p2g)} TB · 4G: ${fmtDec(cell.cur.p4g)} TB · 5G: ${fmtDec(cell.cur.p5g)} TB</div>
            </div>`
                : ''
            }
            <div style="border-top: 1px dashed ${splitLineColor}; margin: 4px 0; padding-top: 4px; display: flex; justify-content: space-between; gap: 14px; color: #f59e0b;">
              <span>${mode} Δ:</span><b>${deltaVal !== null ? `${deltaVal >= 0 ? '+' : ''}${deltaVal}%` : '–'}</b>
            </div>
          `;
        },
      },
      legend: {
        data: [`${lastYear} (TB)`, `${selectedYear} (TB)`, `${mode} Δ (%)`],
        top: 0,
        textStyle: { color: textColor, fontSize: 11 },
        itemWidth: 10,
        itemHeight: 10,
      },
      grid: {
        top: 36,
        left: 45,
        right: 45,
        bottom: 25,
      },
      xAxis: {
        type: 'category',
        data: cd.xLabels,
        axisLine: { lineStyle: { color: splitLineColor } },
        axisLabel: {
          color: textColor,
          fontSize: 10,
          interval: 34, // ~5 weeks intervals (approx 35 days)
        },
      },
      yAxis: [
        {
          type: 'value',
          name: 'TB/day',
          scale: true, // does not start at 0
          nameTextStyle: { color: textColor, fontSize: 10 },
          splitLine: { lineStyle: { color: splitLineColor, type: 'dashed' } },
          axisLabel: { color: textColor, fontSize: 10 },
        },
        {
          type: 'value',
          name: `${mode} Δ (%)`,
          nameTextStyle: { color: '#f59e0b', fontSize: 10 },
          splitLine: { show: false },
          axisLabel: { color: '#f59e0b', fontSize: 10, formatter: '{value}%' },
        },
      ],
      series: [
        {
          name: `${lastYear} (TB)`,
          type: 'line',
          data: cd.payloadLast,
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 1.5, color: '#94a3b8' },
          areaStyle: { color: 'rgba(148, 163, 184, 0.08)' },
          itemStyle: { color: '#94a3b8' },
        },
        {
          name: `${selectedYear} (TB)`,
          type: 'line',
          data: cd.payloadCur,
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 2, color: '#3b82f6' },
          areaStyle: { color: 'rgba(59, 130, 246, 0.15)' },
          itemStyle: { color: '#3b82f6' },
          markArea: {
            silent: true,
            itemStyle: {
              color: darkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)',
            },
            data: [[{ coord: [latestLabel] }, { coord: [lastLabel] }]],
          },
        },
        {
          name: `${mode} Δ (%)`,
          type: 'line',
          yAxisIndex: 1,
          data: cd.deltaPayload,
          smooth: true,
          symbol: 'none',
          lineStyle: { type: 'dashed', width: 1.5, color: '#f59e0b' },
          itemStyle: { color: '#f59e0b' },
        },
      ],
    };
  }, [computed, darkMode, lastYear, selectedYear, mode]);

  const trafficChartOption = useMemo(() => {
    if (!computed?.chartData) return {};
    const cd = computed.chartData;

    const textColor = darkMode ? '#94a3b8' : '#64748b';
    const splitLineColor = darkMode ? '#334155' : '#e2e8f0';

    const latestIdx = cd.latestIndex >= 0 ? cd.latestIndex : cd.xLabels.length - 1;
    const latestLabel = cd.xLabels[latestIdx];
    const lastLabel = cd.xLabels[cd.xLabels.length - 1];

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        backgroundColor: darkMode ? '#0f172a' : '#ffffff',
        borderColor: darkMode ? '#334155' : '#cbd5e1',
        textStyle: { color: darkMode ? '#f1f5f9' : '#0f172a', fontSize: 11 },
        formatter: (params) => {
          if (!params || !params.length) return '';
          const idx = params[0].dataIndex;
          const mmdd = CALENDAR_MM_DD[idx];
          const cell = cd.yearlyMap[mmdd];
          const curVal = cd.trafficCur[idx];
          const lastVal = cd.trafficLast[idx];
          const deltaVal = cd.deltaTraffic[idx];

          return `
            <div style="font-weight: bold; margin-bottom: 4px;">${cd.xLabels[idx]}</div>
            <div style="display: flex; justify-content: space-between; gap: 14px; color: #94a3b8;">
              <span>● ${lastYear} Traffic:</span><b>${lastVal !== null ? fmtDec(lastVal) + ' KErl' : '–'}</b>
            </div>
            <div style="display: flex; justify-content: space-between; gap: 14px; color: #10b981;">
              <span>● ${selectedYear} Traffic:</span><b>${curVal !== null ? fmtDec(curVal) + ' KErl' : '–'}</b>
            </div>
            ${
              hasData(cell.cur)
                ? `
            <div style="padding-left: 10px; font-size: 10px; opacity: 0.85; margin: 2px 0;">
              <div>2G: ${fmtDec(cell.cur.t2g)} KErl · VoLTE: ${fmtDec(cell.cur.tvolte)} KErl</div>
            </div>`
                : ''
            }
            <div style="border-top: 1px dashed ${splitLineColor}; margin: 4px 0; padding-top: 4px; display: flex; justify-content: space-between; gap: 14px; color: #f59e0b;">
              <span>${mode} Δ:</span><b>${deltaVal !== null ? `${deltaVal >= 0 ? '+' : ''}${deltaVal}%` : '–'}</b>
            </div>
          `;
        },
      },
      legend: {
        data: [`${lastYear} (KErl)`, `${selectedYear} (KErl)`, `${mode} Δ (%)`],
        top: 0,
        textStyle: { color: textColor, fontSize: 11 },
        itemWidth: 10,
        itemHeight: 10,
      },
      grid: {
        top: 36,
        left: 45,
        right: 45,
        bottom: 25,
      },
      xAxis: {
        type: 'category',
        data: cd.xLabels,
        axisLine: { lineStyle: { color: splitLineColor } },
        axisLabel: {
          color: textColor,
          fontSize: 10,
          interval: 34,
        },
      },
      yAxis: [
        {
          type: 'value',
          name: 'KErl',
          scale: true,
          nameTextStyle: { color: textColor, fontSize: 10 },
          splitLine: { lineStyle: { color: splitLineColor, type: 'dashed' } },
          axisLabel: { color: textColor, fontSize: 10 },
        },
        {
          type: 'value',
          name: `${mode} Δ (%)`,
          nameTextStyle: { color: '#f59e0b', fontSize: 10 },
          splitLine: { show: false },
          axisLabel: { color: '#f59e0b', fontSize: 10, formatter: '{value}%' },
        },
      ],
      series: [
        {
          name: `${lastYear} (KErl)`,
          type: 'line',
          data: cd.trafficLast,
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 1.5, color: '#94a3b8' },
          areaStyle: { color: 'rgba(148, 163, 184, 0.08)' },
          itemStyle: { color: '#94a3b8' },
        },
        {
          name: `${selectedYear} (KErl)`,
          type: 'line',
          data: cd.trafficCur,
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 2, color: '#10b981' },
          areaStyle: { color: 'rgba(16, 185, 129, 0.15)' },
          itemStyle: { color: '#10b981' },
          markArea: {
            silent: true,
            itemStyle: {
              color: darkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)',
            },
            data: [[{ coord: [latestLabel] }, { coord: [lastLabel] }]],
          },
        },
        {
          name: `${mode} Δ (%)`,
          type: 'line',
          yAxisIndex: 1,
          data: cd.deltaTraffic,
          smooth: true,
          symbol: 'none',
          lineStyle: { type: 'dashed', width: 1.5, color: '#f59e0b' },
          itemStyle: { color: '#f59e0b' },
        },
      ],
    };
  }, [computed, darkMode, lastYear, selectedYear, mode]);

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

  const kpis = computed?.kpi || {};
  const inv = inventory?.nops?.[selectedNop] || {};

  return (
    <div className="space-y-4 relative">
      {/* Full-screen Loading Overlay ONLY on initial dataset fetch */}
      {loadingDataset && <DataLoadingOverlay />}

      {/* Header Controls Card */}
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
              Full-year network performance with instant multi-mode benchmarks ({mode})
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Segmented Mode Toggle: YoY | MTD | YTD */}
          <SegmentedToggle
            options={MODE_OPTIONS}
            value={mode}
            onChange={setMode}
            darkMode={darkMode}
          />

          {/* NOP Filter */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-500 font-semibold">NOP:</span>
            <select
              value={selectedNop}
              onChange={(e) => {
                setSelectedNop(e.target.value);
                setDrill({ level: 'nop', parent: null, parentNop: null });
              }}
              className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition cursor-pointer outline-none ${
                darkMode
                  ? 'bg-slate-800 border-slate-700 text-slate-200 focus:border-blue-500'
                  : 'bg-white border-slate-300 text-slate-800 focus:border-blue-500 shadow-xs'
              }`}
            >
              {NOP_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
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
            onClick={handleReload}
            className="p-1.5 rounded-lg border text-slate-400 hover:text-blue-500 hover:border-blue-400 transition cursor-pointer"
            title="Force refresh data from database"
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

      {/* 1. Summary KPI Tiles (5 tiles in 1 row on large screen) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Total Payload */}
        <div className={`p-4 rounded-xl ${cardCls}`}>
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="font-bold uppercase tracking-wider">
              Total Payload ({selectedYear})
            </span>
            <BarChart3 className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            {kpis.totalPayload?.val}{' '}
            <span className="text-sm font-semibold text-slate-400">
              {kpis.totalPayload?.unit}
            </span>
          </div>
          <div className="mt-2 flex flex-col gap-0.5">
            <div className="flex items-center justify-between text-xs">
              <DeltaBadge val={kpis.totalPayload?.deltaPct} mode={mode} />
            </div>
            <span className="text-slate-400 text-[11px] truncate">
              Last yr: {kpis.totalPayload?.yoyFormatted?.val} {kpis.totalPayload?.yoyFormatted?.unit}
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
            {kpis.payload4g?.val}{' '}
            <span className="text-sm font-semibold text-slate-400">TB</span>
          </div>
          <div className="mt-2 flex flex-col gap-0.5">
            <div className="flex items-center justify-between text-xs">
              <DeltaBadge val={kpis.payload4g?.deltaPct} mode={mode} />
            </div>
            <span className="text-slate-400 text-[11px] truncate">
              Last yr: {kpis.payload4g?.yoyVal} TB
            </span>
          </div>
        </div>

        {/* 5G Payload */}
        <div className={`p-4 rounded-xl ${cardCls}`}>
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="font-bold uppercase tracking-wider">5G Payload</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
              {kpis.payload5g?.sharePct || 0}% share
            </span>
          </div>
          <div className="text-2xl font-black tracking-tight text-cyan-600 dark:text-cyan-400">
            {kpis.payload5g?.val}{' '}
            <span className="text-sm font-semibold text-slate-400">TB</span>
          </div>
          <div className="mt-2 flex flex-col gap-0.5">
            <div className="flex items-center justify-between text-xs">
              <DeltaBadge val={kpis.payload5g?.deltaPct} mode={mode} />
            </div>
            <span className="text-slate-400 text-[11px] truncate">
              Last yr: {kpis.payload5g?.yoyVal} TB
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
            {kpis.totalTraffic?.val}{' '}
            <span className="text-sm font-semibold text-slate-400">
              {kpis.totalTraffic?.unit}
            </span>
          </div>
          <div className="mt-2 flex flex-col gap-0.5">
            <div className="flex items-center justify-between text-xs">
              <DeltaBadge val={kpis.totalTraffic?.deltaPct} mode={mode} />
            </div>
            <span className="text-slate-400 text-[11px] truncate">
              Last yr: {kpis.totalTraffic?.yoyFormatted?.val} {kpis.totalTraffic?.yoyFormatted?.unit}
            </span>
          </div>
        </div>

        {/* Peak Daily Payload */}
        <div className={`p-4 rounded-xl ${cardCls} col-span-2 lg:col-span-1`}>
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="font-bold uppercase tracking-wider">
              Peak Daily Payload ({selectedYear})
            </span>
            <TrendingDown className="w-4 h-4 text-amber-500 rotate-180" />
          </div>
          <div className="text-2xl font-black tracking-tight text-amber-500">
            {kpis.peakDaily?.val}{' '}
            <span className="text-sm font-semibold text-slate-400">
              {kpis.peakDaily?.unit}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
              Highest Day
            </span>
            <span className="text-amber-500 font-bold text-xs">
              → {kpis.peakDaily?.dateFormatted}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Registered Site Inventory Ubin */}
      <div className={`p-4 rounded-xl ${cardCls}`}>
        <div className="flex items-center justify-between mb-3 border-b pb-2 border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-blue-500" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Registered Site Inventory ({selectedNop})
            </h2>
          </div>
          <span className="text-[11px] font-semibold text-slate-400">
            Week {inventory?.week || '–'}
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

      {/* 3. Yearly Trend Charts (Side-by-side 1 Jan - 31 Dec) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Payload Yearly Trend */}
        <div className={`p-4 rounded-xl ${cardCls} relative`}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-500" />
              <h2 className="text-xs font-bold uppercase tracking-wider">Payload Trend (TB)</h2>
            </div>
            <button
              type="button"
              onClick={() => setFullscreenChart('payload')}
              className="p-1 rounded text-slate-400 hover:text-blue-500 transition cursor-pointer"
              title="Expand full screen"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mb-2">
            1 Jan – 31 Dec · {lastYear} vs {selectedYear} · Dashed: {mode} Δ%
          </p>
          <div className="h-80">
            {computed?.chartData ? (
              <ReactECharts
                option={payloadChartOption}
                style={{ height: '100%', width: '100%' }}
                notMerge
              />
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                Loading yearly payload trend...
              </div>
            )}
          </div>
        </div>

        {/* Traffic Yearly Trend */}
        <div className={`p-4 rounded-xl ${cardCls} relative`}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-500" />
              <h2 className="text-xs font-bold uppercase tracking-wider">Traffic Trend (KErl)</h2>
            </div>
            <button
              type="button"
              onClick={() => setFullscreenChart('traffic')}
              className="p-1 rounded text-slate-400 hover:text-blue-500 transition cursor-pointer"
              title="Expand full screen"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mb-2">
            1 Jan – 31 Dec · {lastYear} vs {selectedYear} · Dashed: {mode} Δ%
          </p>
          <div className="h-80">
            {computed?.chartData ? (
              <ReactECharts
                option={trafficChartOption}
                style={{ height: '100%', width: '100%' }}
                notMerge
              />
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                Loading yearly traffic trend...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4 & 5: Bottom 2-Column Grid (NOP Ranking Drill-down + Top 10 Decline Sites) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 4. Ranking & Hierarchy Drill-down: NOP -> Kabupaten -> Kecamatan */}
        <div className={`p-4 rounded-xl flex flex-col ${cardCls} relative`}>
          {loadingDrill && (
            <div className="absolute top-4 right-4 flex items-center gap-1.5 text-xs text-blue-500">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Loading drill...</span>
            </div>
          )}

          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-500" />
              <h2 className="text-xs font-bold uppercase tracking-wider">
                Ranking &amp; Hierarchy ({mode})
              </h2>
            </div>
            <span className="text-[10px] text-slate-400">
              {drill.level === 'kecamatan' ? 'Leaf level' : 'Click row to drill'}
            </span>
          </div>

          {/* Breadcrumbs */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-3 bg-slate-100 dark:bg-slate-800/60 px-2.5 py-1.5 rounded-lg">
            <button
              type="button"
              onClick={() => handleBreadcrumbClick('nop')}
              className={`font-semibold cursor-pointer ${
                drill.level === 'nop' ? 'text-blue-500 font-bold' : 'hover:text-blue-400'
              }`}
            >
              All NOPs
            </button>
            {drill.parentNop && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                <button
                  type="button"
                  onClick={() => handleBreadcrumbClick('kabupaten')}
                  className={`font-semibold cursor-pointer ${
                    drill.level === 'kabupaten' ? 'text-blue-500 font-bold' : 'hover:text-blue-400'
                  }`}
                >
                  {drill.parentNop}
                </button>
              </>
            )}
            {drill.level === 'kecamatan' && drill.parent && (
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
                    {drill.level === 'nop'
                      ? 'NOP'
                      : drill.level === 'kabupaten'
                      ? 'Kabupaten'
                      : 'Kecamatan'}
                  </th>
                  <th className="p-2.5 font-bold uppercase tracking-wider text-[11px] text-right">
                    Payload (TB)
                  </th>
                  <th className="p-2.5 font-bold uppercase tracking-wider text-[11px] text-right">
                    {mode} Δ
                  </th>
                  <th className="p-2.5 font-bold uppercase tracking-wider text-[11px] text-right">
                    Traffic (KErl)
                  </th>
                  <th className="p-2.5 font-bold uppercase tracking-wider text-[11px] text-right">
                    {mode} Δ
                  </th>
                  <th className="p-2.5 font-bold uppercase tracking-wider text-[11px] text-right">
                    Sites
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {activeTableRows.length > 0 ? (
                  activeTableRows.map((row) => {
                    const isLeaf = drill.level === 'kecamatan';
                    return (
                      <tr
                        key={row.name}
                        onClick={() => !isLeaf && handleDrillRow(row.name)}
                        className={`transition ${
                          isLeaf ? '' : 'cursor-pointer hover:bg-blue-50 dark:hover:bg-slate-800/70'
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
                          <DeltaBadge val={row.payload_yoy_pct} mode={mode} />
                        </td>
                        <td className="p-2.5 text-right font-medium">{fmtDec(row.traffic)}</td>
                        <td className="p-2.5 text-right">
                          <DeltaBadge val={row.traffic_yoy_pct} mode={mode} />
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
                      No ranking data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 5. Top 10 Payload Decline Sites */}
        <div className={`p-4 rounded-xl flex flex-col ${cardCls} relative`}>
          {loadingDecline && (
            <div className="absolute top-4 right-4 flex items-center gap-1.5 text-xs text-rose-500">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Updating...</span>
            </div>
          )}

          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-rose-500" />
              <h2 className="text-xs font-bold uppercase tracking-wider">
                Top 10 Payload Decline Sites ({mode})
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
                  <th className="p-2.5 font-bold uppercase tracking-wider text-[11px]">NOP</th>
                  <th className="p-2.5 font-bold uppercase tracking-wider text-[11px] text-right">
                    Current (TB)
                  </th>
                  <th className="p-2.5 font-bold uppercase tracking-wider text-[11px] text-right">
                    Last Yr (TB)
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
                      <td className="p-2.5 text-slate-600 dark:text-slate-300 truncate max-w-[120px]">
                        {site.kabupaten}
                      </td>
                      <td className="p-2.5 text-slate-500 font-medium">{site.nop}</td>
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
                      No declining sites found for this period
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

      {/* Modal Dialog for Fullscreen Chart */}
      {fullscreenChart && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            className={`w-full max-w-6xl h-[85vh] rounded-2xl flex flex-col p-5 shadow-2xl border ${
              darkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between mb-3 border-b pb-3 border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                {fullscreenChart === 'payload' ? (
                  <BarChart3 className="w-5 h-5 text-blue-500" />
                ) : (
                  <Activity className="w-5 h-5 text-emerald-500" />
                )}
                <h3 className="font-extrabold text-base">
                  {fullscreenChart === 'payload' ? 'Payload Yearly Trend (TB)' : 'Traffic Yearly Trend (KErl)'} — {selectedNop} ({mode})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setFullscreenChart(null)}
                className="p-1.5 rounded-lg border text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grow w-full">
              <ReactECharts
                option={fullscreenChart === 'payload' ? payloadChartOption : trafficChartOption}
                style={{ height: '100%', width: '100%' }}
                notMerge
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function hasData(c) {
  return c && (c.p2g > 0 || c.p4g > 0 || c.p5g > 0 || c.t2g > 0 || c.tvolte > 0);
}
