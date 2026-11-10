// ECharts option builders for OKR > CEI

export const KQI_COLORS = {
  vdl: '#e879f9', vul: '#4ade80', gj: '#1e40af', vsd: '#38bdf8', wrtt: '#a21caf', grtt: '#15803d', wulr: '#f97316',
};
export const ENTITY_COLORS = ['#2563eb', '#f97316', '#16a34a', '#0ea5e9', '#a21caf', '#dc2626', '#ca8a04', '#64748b', '#db2777', '#0d9488'];
export const PREV_COLOR = '#94a3b8';
export const CUR_COLOR = '#2563eb';
export const BAD_COLOR = '#ef4444';
export const GOOD_COLOR = '#22c55e';

export const fmt = (v, d = 0) => (v === null || v === undefined ? '–' : Number(v).toLocaleString('id-ID', { maximumFractionDigits: d, minimumFractionDigits: d }));
export const weekLabel = (w) => `W${String(w).slice(4)}`;

const axisColor = (dark) => (dark ? '#94a3b8' : '#64748b');
const splitColor = (dark) => (dark ? '#1e293b' : '#f1f5f9');

export function base(dark) {
  return {
    backgroundColor: 'transparent',
    textStyle: { fontFamily: 'inherit', color: axisColor(dark) },
    tooltip: {
      trigger: 'axis', confine: true,
      backgroundColor: 'rgba(15, 23, 42, 0.92)', borderColor: '#334155', textStyle: { color: '#f8fafc', fontSize: 11 },
    },
    legend: { top: 0, type: 'scroll', textStyle: { color: axisColor(dark), fontSize: 10 }, itemWidth: 12, itemHeight: 8 },
    grid: { top: 34, right: 16, bottom: 8, left: 8, containLabel: true },
  };
}

export const catAxis = (dark, data, extra = {}) => ({
  type: 'category', data, axisLabel: { color: axisColor(dark), fontSize: 10 },
  axisLine: { lineStyle: { color: splitColor(dark) } }, axisTick: { show: false }, ...extra,
});

export const valAxis = (dark, extra = {}) => ({
  type: 'value', axisLabel: { color: axisColor(dark), fontSize: 10 },
  splitLine: { lineStyle: { color: splitColor(dark) } }, ...extra,
});

// Numbered dashed lines for events; the numbers refer to the remark list under the chart
export function eventMarkLine(events, dark) {
  if (!events?.length) return undefined;
  return {
    silent: true, symbol: 'none', animation: false,
    lineStyle: { type: 'dashed', color: dark ? '#475569' : '#cbd5e1', width: 1 },
    label: { formatter: (p) => p.name, position: 'end', fontSize: 9, color: dark ? '#94a3b8' : '#64748b' },
    data: events.map(e => ({ xAxis: e.x, name: String(e.n) })),
  };
}

// Bar = count of failing cells, line = average KQI value (secondary axis)
export function failAvgOption(dark, dates, kqi, data, events) {
  const o = base(dark);
  return {
    ...o,
    grid: { ...o.grid, right: 8 },
    xAxis: catAxis(dark, dates),
    yAxis: [
      valAxis(dark, { name: 'cells', nameTextStyle: { fontSize: 9 } }),
      valAxis(dark, { name: kqi.unit, nameTextStyle: { fontSize: 9 }, scale: true, splitLine: { show: false } }),
    ],
    series: [
      {
        name: 'Cells Fail', type: 'line', data: data?.fail || [], smooth: true, showSymbol: false,
        lineStyle: { width: 1, color: '#f97316' }, itemStyle: { color: '#f97316' },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(249,115,22,0.45)' }, { offset: 1, color: 'rgba(249,115,22,0.04)' }] } },
        markLine: eventMarkLine(events, dark),
      },
      { name: `Avg ${kqi.label}`, type: 'line', yAxisIndex: 1, data: data?.avg || [], showSymbol: false, smooth: true, lineStyle: { width: 2, color: '#2563eb' }, itemStyle: { color: '#2563eb' } },
    ],
  };
}

// One line per entity (kabupaten), current week shaded
export function entityLineOption(dark, chart, weekRange) {
  const o = base(dark);
  const names = Object.keys(chart.series || {});
  return {
    ...o,
    xAxis: catAxis(dark, chart.dates),
    yAxis: valAxis(dark, { scale: true }),
    series: names.map((n, i) => ({
      name: n, type: 'line', data: chart.series[n] || [], showSymbol: false, smooth: true, connectNulls: false,
      lineStyle: { width: 1.8, color: ENTITY_COLORS[i % ENTITY_COLORS.length] }, itemStyle: { color: ENTITY_COLORS[i % ENTITY_COLORS.length] },
      ...(i === 0 && weekRange ? {
        markArea: { silent: true, itemStyle: { color: dark ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.10)' }, data: [[{ xAxis: weekRange[0] }, { xAxis: weekRange[1] }]] },
      } : {}),
    })),
  };
}

// Donut with the legend on the right carrying count and share; total in the middle
export function donutOption(dark, items, colors, centerLabel) {
  const total = items.reduce((a, it) => a + (it.value || 0), 0);
  const byName = Object.fromEntries(items.map(it => [it.name, it.value]));
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', backgroundColor: 'rgba(15, 23, 42, 0.92)', borderColor: '#334155', textStyle: { color: '#f8fafc', fontSize: 11 }, formatter: p => `${p.marker}${p.name}: <b>${fmt(p.value)}</b> (${fmt(p.percent, 1)}%)` },
    legend: {
      bottom: 0, left: 'center', icon: 'circle', itemWidth: 8, itemHeight: 8, itemGap: 10,
      textStyle: { color: axisColor(dark), fontSize: 10 },
      formatter: n => `${n} ${fmt(byName[n])} (${total ? fmt((100 * byName[n]) / total, 1) : 0}%)`,
    },
    title: {
      text: fmt(total), subtext: centerLabel, left: 'center', top: '30%', itemGap: 2,
      textStyle: { fontSize: 16, fontWeight: 800, color: dark ? '#f8fafc' : '#0f172a' }, subtextStyle: { fontSize: 10, color: axisColor(dark) },
    },
    series: [{
      type: 'pie', radius: ['45%', '68%'], center: ['50%', '38%'], avoidLabelOverlap: true, label: { show: false },
      itemStyle: { borderColor: dark ? '#0f172a' : '#fff', borderWidth: 2 },
      data: items.map((it, i) => ({ ...it, itemStyle: { color: colors[i % colors.length] } })),
    }],
  };
}
