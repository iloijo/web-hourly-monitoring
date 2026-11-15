// ECharts option builders for OKR > Crowdsource
import { STATUS_COLORS, OPERATOR_COLORS, weekLabel } from './constants';

const axisColor = (dark) => (dark ? '#94a3b8' : '#64748b');
const splitColor = (dark) => (dark ? '#1e293b' : '#f1f5f9');

export function base(dark) {
  return {
    backgroundColor: 'transparent',
    textStyle: { fontFamily: 'inherit', color: axisColor(dark) },
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: 'rgba(15, 23, 42, 0.94)',
      borderColor: '#334155',
      textStyle: { color: '#f8fafc', fontSize: 11 },
    },
    legend: {
      top: 0,
      type: 'scroll',
      textStyle: { color: axisColor(dark), fontSize: 10 },
      itemWidth: 12,
      itemHeight: 8,
    },
    grid: { top: 34, right: 16, bottom: 8, left: 8, containLabel: true },
  };
}

export const catAxis = (dark, data, extra = {}) => ({
  type: 'category',
  data,
  axisLabel: { color: axisColor(dark), fontSize: 10 },
  axisLine: { lineStyle: { color: splitColor(dark) } },
  axisTick: { show: false },
  ...extra,
});

export const valAxis = (dark, extra = {}) => ({
  type: 'value',
  axisLabel: { color: axisColor(dark), fontSize: 10 },
  splitLine: { lineStyle: { color: splitColor(dark) } },
  ...extra,
});

// Bar value labels: every bar for short ranges, only the latest week when bars get narrow
const showBarLabel = (idx, n) => n <= 14 || idx === n - 1;

/**
 * Stacked bar for OpenSignal or Ookla WIN / LOSE trend with target line.
 * @param {Array} trend array of summary trend objects
 * @param {'ONX'|'OOKLA'} source
 * @param {boolean} dark
 */
export function winLoseTrendOption(trend = [], source = 'ONX', dark = false) {
  const xs = trend.map((t) => weekLabel(t.week));
  const isOnx = source === 'ONX';
  const wins = trend.map((t) => (isOnx ? t.onx_win : t.ook_win));
  const loses = trend.map((t) => (isOnx ? t.onx_lose : t.ook_lose));
  const targets = trend.map((t) => (isOnx ? t.onx_target_line : t.ook_target_line));
  const validTargets = trend.map((t) => (isOnx ? t.onx_target : t.ook_target));

  return {
    ...base(dark),
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: 'rgba(15, 23, 42, 0.94)',
      borderColor: '#334155',
      textStyle: { color: '#f8fafc', fontSize: 11 },
      formatter: (params) => {
        if (!params || !params.length) return '';
        const idx = params[0].dataIndex;
        const row = trend[idx];
        const yw = row ? weekLabel(row.week) : '';
        const w = isOnx ? row.onx_win : row.ook_win;
        const l = isOnx ? row.onx_lose : row.ook_lose;
        const tgt = validTargets[idx];
        return `
          <div class="font-bold border-b border-slate-700 pb-1 mb-1">${source} · ${yw}</div>
          <div class="flex items-center justify-between gap-4">
            <span class="text-emerald-400 font-semibold">● WIN (inc. DRAW)</span>
            <span class="font-bold">${w}</span>
          </div>
          <div class="flex items-center justify-between gap-4">
            <span class="text-rose-400 font-semibold">● LOSE</span>
            <span class="font-bold">${l}</span>
          </div>
          <div class="flex items-center justify-between gap-4 border-t border-slate-700/60 pt-1 mt-1 text-slate-300">
            <span>Target:</span>
            <span class="font-bold">${tgt ?? '–'}</span>
          </div>
        `;
      },
    },
    xAxis: catAxis(dark, xs),
    yAxis: valAxis(dark, { minInterval: 1 }),
    series: [
      {
        name: 'WIN',
        type: 'bar',
        stack: 'total',
        data: wins,
        itemStyle: { color: STATUS_COLORS.WIN, borderRadius: [0, 0, 0, 0] },
        label: { show: true, position: 'inside', color: '#fff', fontSize: 9, fontWeight: 700, formatter: (p) => (p.value && showBarLabel(p.dataIndex, trend.length) ? p.value : '') },
      },
      {
        name: 'LOSE',
        type: 'bar',
        stack: 'total',
        data: loses,
        itemStyle: { color: STATUS_COLORS.LOSE, borderRadius: [3, 3, 0, 0] },
        label: { show: true, position: 'inside', color: '#fff', fontSize: 9, fontWeight: 700, formatter: (p) => (p.value && showBarLabel(p.dataIndex, trend.length) ? p.value : '') },
      },
      {
        name: 'Target (old)',
        type: 'line',
        step: 'middle',
        connectNulls: false,
        data: targets,
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: {
          color: dark ? '#f8fafc' : '#0f172a',
          width: 2,
          type: 'dashed',
        },
        itemStyle: { color: dark ? '#f8fafc' : '#0f172a' },
      },
    ],
  };
}

/**
 * Bar chart for Total Wins per week colored by achievement (ACH=green, NOT ACH=red)
 * @param {Array} trend
 * @param {boolean} dark
 */
export function totalWinTrendOption(trend = [], dark = false) {
  const xs = trend.map((t) => weekLabel(t.week));
  const wins = trend.map((t) => ({
    value: t.total_wins,
    itemStyle: {
      color: t.achievement === 'ACH' ? STATUS_COLORS.WIN : STATUS_COLORS.LOSE,
      borderRadius: [3, 3, 0, 0],
    },
  }));
  const targets = trend.map((t) => {
    // Show line only if either onx or ookla target is on chart
    if (t.onx_target_line !== null || t.ook_target_line !== null) {
      return (t.onx_target || 0) + (t.ook_target || 0);
    }
    return null;
  });

  return {
    ...base(dark),
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: 'rgba(15, 23, 42, 0.94)',
      borderColor: '#334155',
      textStyle: { color: '#f8fafc', fontSize: 11 },
      formatter: (params) => {
        if (!params || !params.length) return '';
        const idx = params[0].dataIndex;
        const row = trend[idx];
        if (!row) return '';
        const achColor = row.achievement === 'ACH' ? 'text-emerald-400' : 'text-rose-400';
        return `
          <div class="font-bold border-b border-slate-700 pb-1 mb-1">TOTAL · ${weekLabel(row.week)}</div>
          <div class="flex items-center justify-between gap-4">
            <span class="text-slate-300">Total Wins:</span>
            <span class="font-bold ${achColor}">${row.total_wins} / ${row.total_target}</span>
          </div>
          <div class="flex items-center justify-between gap-4 mt-1">
            <span class="text-slate-400">Status:</span>
            <span class="font-black ${achColor}">${row.achievement}</span>
          </div>
        `;
      },
    },
    xAxis: catAxis(dark, xs),
    yAxis: valAxis(dark, { minInterval: 1 }),
    series: [
      {
        name: 'Total Wins',
        type: 'bar',
        data: wins,
        label: {
          show: true,
          position: 'top',
          fontSize: 9,
          fontWeight: 800,
          color: axisColor(dark),
          formatter: (p) => (showBarLabel(p.dataIndex, trend.length) ? `${p.value}${trend[p.dataIndex]?.achievement === 'ACH' ? ' ✓' : ''}` : ''),
        },
      },
      {
        name: 'Total Target',
        type: 'line',
        step: 'middle',
        connectNulls: false,
        data: targets,
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: {
          color: dark ? '#f8fafc' : '#0f172a',
          width: 2,
          type: 'dashed',
        },
        itemStyle: { color: dark ? '#f8fafc' : '#0f172a' },
      },
    ],
  };
}

/**
 * KPI operator trend chart with confidence bands for ONX and markLine for needed_win
 * @param {Object} trendData result from get_crowd_trend
 * @param {boolean} dark
 */
export function kpiTrendOption(trendData, dark = false) {
  if (!trendData || !trendData.series) {
    return base(dark);
  }

  const { unit, source, series = [], needed_win } = trendData;
  const isOnx = source === 'ONX';

  // Gather unique sorted weeks across all series
  const allWeeks = Array.from(
    new Set(series.flatMap((s) => (s.data || []).map((d) => d.week)))
  ).sort((a, b) => a - b);

  const xs = allWeeks.map((yw) => weekLabel(yw));
  const weekIndexMap = new Map(allWeeks.map((yw, i) => [yw, i]));

  const chartSeries = [];

  series.forEach((s) => {
    const op = s.name;
    const color = OPERATOR_COLORS[op] || '#94a3b8';
    const isMuted = !!s.muted;

    const values = new Array(allWeeks.length).fill(null);
    const lcis = new Array(allWeeks.length).fill(null);
    const diffs = new Array(allWeeks.length).fill(null);

    (s.data || []).forEach((d) => {
      const idx = weekIndexMap.get(d.week);
      if (idx !== undefined) {
        values[idx] = d.value;
        if (isOnx && d.lci !== null && d.uci !== null && d.lci !== undefined && d.uci !== undefined) {
          lcis[idx] = d.lci;
          diffs[idx] = Math.max(0, d.uci - d.lci);
        }
      }
    });

    // Add confidence band area for TSEL if ONX
    if (isOnx && op === 'TSEL') {
      // Invisible lower bound line
      chartSeries.push({
        name: `${op} LCI`,
        type: 'line',
        data: lcis,
        lineStyle: { opacity: 0 },
        stack: `ci_${op}`,
        symbol: 'none',
        tooltip: { show: false },
        silent: true,
      });

      // Area band from LCI to UCI
      chartSeries.push({
        name: `${op} CI Band`,
        type: 'line',
        data: diffs,
        lineStyle: { opacity: 0 },
        areaStyle: {
          color: color,
          opacity: 0.14,
        },
        stack: `ci_${op}`,
        symbol: 'none',
        tooltip: { show: false },
        silent: true,
      });
    }

    // Main line series
    const markLine =
      op === 'TSEL' && needed_win !== null && needed_win !== undefined
        ? {
            silent: false,
            symbol: 'none',
            lineStyle: { color: '#ef4444', type: 'dashed', width: 1.5 },
            label: {
              formatter: `Needed to win ${needed_win}`,
              position: 'insideEndTop',
              color: '#ef4444',
              fontSize: 10,
              fontWeight: 'bold',
            },
            data: [{ yAxis: needed_win }],
          }
        : undefined;

    chartSeries.push({
      name: op,
      type: 'line',
      data: values,
      smooth: 0.2,
      symbol: 'circle',
      symbolSize: (val, params) => (params.dataIndex === allWeeks.length - 1 ? 6 : 4),
      lineStyle: {
        color: color,
        width: isMuted ? 1.2 : op === 'TSEL' ? 2.8 : 2,
        type: isMuted ? 'dotted' : 'solid',
      },
      itemStyle: { color },
      markLine,
    });
  });

  return {
    ...base(dark),
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: 'rgba(15, 23, 42, 0.94)',
      borderColor: '#334155',
      textStyle: { color: '#f8fafc', fontSize: 11 },
      formatter: (params) => {
        if (!params || !params.length) return '';
        const idx = params[0].dataIndex;
        const yw = allWeeks[idx];
        const rowsHtml = series
          .map((s) => {
            const pt = (s.data || []).find((d) => d.week === yw);
            if (!pt || pt.value === null || pt.value === undefined) return '';
            const c = OPERATOR_COLORS[s.name] || '#94a3b8';
            const rankStr = pt.rank ? ` <span class="text-slate-400 text-[10px]">(#${pt.rank})</span>` : '';
            const ciStr =
              isOnx && pt.lci !== undefined && pt.uci !== undefined
                ? ` <span class="text-slate-400 text-[10px]">[${pt.lci} – ${pt.uci}]</span>`
                : '';
            return `
              <div class="flex items-center justify-between gap-4 text-xs py-0.5">
                <span class="flex items-center gap-1.5 font-bold" style="color: ${c}">
                  <span>●</span> ${s.name}
                </span>
                <span class="font-mono font-bold">${pt.value} ${unit || ''}${rankStr}${ciStr}</span>
              </div>
            `;
          })
          .filter(Boolean)
          .join('');

        return `
          <div class="font-bold border-b border-slate-700 pb-1 mb-1 text-slate-200">${weekLabel(yw)}</div>
          ${rowsHtml}
        `;
      },
    },
    xAxis: catAxis(dark, xs),
    yAxis: valAxis(dark, {
      scale: true,
      axisLabel: { formatter: `{value} ${unit || ''}` },
    }),
    series: chartSeries,
  };
}

// WIN / DRAW / LOSE colours for the weekly status strip and the rank heatmap
export const STATUS_STRIP = { WIN: '#16A34A', DRAW: '#14B8A6', LOSE: '#DC2626' };
const OP_SHORT = { TSEL: 'Telkomsel', IOH: 'Indosat', XLSMART: 'XL' };
export const fmtNum = (v) =>
  v === null || v === undefined ? '–' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });

/**
 * Small-multiple operator trend for one KPI (PPT "TREND ACHIEVEMENT" grid), with:
 * - shaded gap between Telkomsel and the best competitor (green ahead, red behind)
 * - value labels at the end of each line
 * - "needed to win" line when Telkomsel loses the latest week
 * - a strip under the chart with Telkomsel's WIN / DRAW / LOSE per week
 * @param {Object} chart one entry of /api/crowdsource/trend-grid charts
 * @param {number[]} weeks yearweeks on the x axis
 * @param {boolean} dark
 */
export function gridTrendOption(chart, weeks = [], dark = false) {
  const xs = weeks.map((yw) => String(yw));
  const unit = chart?.unit || '';
  const series = chart?.series || [];
  const tsel = series.find((s) => s.name === 'TSEL')?.data || [];
  const rivals = series.filter((s) => s.name !== 'TSEL');
  const best = xs.map((_, i) => {
    const vals = rivals.map((s) => s.data[i]).filter((v) => v !== null && v !== undefined);
    return vals.length ? Math.max(...vals) : null;
  });
  const has = (i) => tsel[i] !== null && tsel[i] !== undefined && best[i] !== null;
  const ahead = (i) => has(i) && tsel[i] >= best[i];
  const behind = (i) => has(i) && tsel[i] < best[i];
  const aheadBase = xs.map((_, i) => (ahead(i) ? best[i] : null));
  const aheadDiff = xs.map((_, i) => (ahead(i) ? +(tsel[i] - best[i]).toFixed(3) : null));
  const behindBase = xs.map((_, i) => (behind(i) ? tsel[i] : null));
  const behindDiff = xs.map((_, i) => (behind(i) ? +(best[i] - tsel[i]).toFixed(3) : null));
  const band = (name, data, stack, color) => ({
    name,
    type: 'line',
    data,
    stack,
    symbol: 'none',
    silent: true,
    smooth: 0.3,
    lineStyle: { opacity: 0 },
    tooltip: { show: false },
    z: 1,
    ...(color ? { areaStyle: { color, opacity: 1 } } : {}),
  });
  const step = Math.max(1, Math.ceil(xs.length / 8));
  const statusHist = chart?.status_hist || [];
  const rankHist = chart?.rank_hist || [];
  const L = 46;
  const R = 50;

  return {
    ...base(dark),
    animation: false,
    legend: { show: false },
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    grid: [
      { left: L, right: R, top: 12, bottom: 34 },
      { left: L, right: R, height: 8, bottom: 19 },
    ],
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: 'rgba(15, 23, 42, 0.94)',
      borderColor: '#334155',
      textStyle: { color: '#f8fafc', fontSize: 11 },
      formatter: (params) => {
        const idx = params?.[0]?.dataIndex;
        if (idx === undefined) return '';
        const st = statusHist[idx];
        const rows = series
          .map((s) => ({ name: s.name, v: s.data[idx] }))
          .filter((r) => r.v !== null && r.v !== undefined)
          .sort((a, b) => b.v - a.v)
          .map(
            (r) => `<div style="display:flex;justify-content:space-between;gap:14px">
              <span style="color:${OPERATOR_COLORS[r.name]};font-weight:700">● ${OP_SHORT[r.name] || r.name}</span>
              <span style="font-weight:700">${fmtNum(r.v)} ${unit}</span></div>`
          )
          .join('');
        const stTxt = st
          ? `<span style="color:${STATUS_STRIP[st]};font-weight:800">${st}</span> · TSEL rank #${rankHist[idx] ?? '–'}`
          : 'No rank';
        return `<div style="font-weight:700;border-bottom:1px solid #334155;padding-bottom:3px;margin-bottom:3px">${weekLabel(weeks[idx])} · ${stTxt}</div>${rows}`;
      },
    },
    xAxis: [
      catAxis(dark, xs, { gridIndex: 0, boundaryGap: false, axisLabel: { show: false }, axisLine: { show: false } }),
      catAxis(dark, xs, {
        gridIndex: 1,
        axisLine: { show: false },
        axisPointer: { show: false },
        axisLabel: {
          color: axisColor(dark),
          fontSize: 9,
          interval: (i) => i % step === 0 || i === xs.length - 1,
          formatter: (v) => `W${String(v).slice(4)}`,
          margin: 4,
        },
      }),
    ],
    yAxis: [
      valAxis(dark, {
        gridIndex: 0,
        scale: true,
        splitNumber: 3,
        axisLabel: { color: axisColor(dark), fontSize: 9, formatter: (v) => fmtNum(v) },
      }),
      { gridIndex: 1, type: 'value', min: 0, max: 1, show: false },
    ],
    series: [
      band('ahead-base', aheadBase, 'ahead'),
      band('ahead', aheadDiff, 'ahead', dark ? 'rgba(34,197,94,0.22)' : 'rgba(22,163,74,0.16)'),
      band('behind-base', behindBase, 'behind'),
      band('behind', behindDiff, 'behind', dark ? 'rgba(248,113,113,0.22)' : 'rgba(220,38,38,0.13)'),
      ...series.map((s) => {
        const isT = s.name === 'TSEL';
        const color = OPERATOR_COLORS[s.name] || '#94a3b8';
        return {
          name: s.name,
          type: 'line',
          data: s.data,
          smooth: 0.3,
          showSymbol: false,
          connectNulls: true,
          z: isT ? 4 : 3,
          lineStyle: { color, width: isT ? 2.8 : 1.6, opacity: isT ? 1 : 0.8 },
          itemStyle: { color },
          endLabel: {
            show: true,
            formatter: (p) => fmtNum(p.value),
            color,
            fontSize: 9,
            fontWeight: isT ? 800 : 600,
            distance: 4,
          },
          labelLayout: { moveOverlap: 'shiftY' },
          markLine:
            isT && chart?.needed_win !== null && chart?.needed_win !== undefined
              ? {
                  silent: true,
                  symbol: 'none',
                  lineStyle: { color: '#DC2626', type: 'dashed', width: 1.2 },
                  label: {
                    formatter: `Need ${fmtNum(chart.needed_win)}`,
                    position: 'insideStartTop',
                    color: '#DC2626',
                    fontSize: 9,
                    fontWeight: 700,
                  },
                  data: [{ yAxis: chart.needed_win }],
                }
              : undefined,
        };
      }),
      {
        name: 'status',
        type: 'bar',
        xAxisIndex: 1,
        yAxisIndex: 1,
        barCategoryGap: '12%',
        silent: true,
        tooltip: { show: false },
        data: xs.map((_, i) => ({
          value: 1,
          itemStyle: { color: STATUS_STRIP[statusHist[i]] || (dark ? '#334155' : '#e2e8f0'), borderRadius: 1 },
        })),
      },
    ],
  };
}
