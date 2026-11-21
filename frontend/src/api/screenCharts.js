// Charts currently on screen, read from their ECharts instances, in the export format the backend turns into
// native Excel line charts ({ title, unit, categories, series: [{ name, color, values }], total }).
// Used by the header Export Excel for pages that do not build their own Charts sheet.
import { getInstanceByDom } from 'echarts/core';

const MAX_CHARTS = 60;

const num = (v) => {
  const x = v && typeof v === 'object' && !Array.isArray(v) ? v.value : v;
  const y = Array.isArray(x) ? x[1] : x;
  return y === null || y === undefined || y === '' || Number.isNaN(Number(y)) ? null : Number(y);
};

const colorOf = (s) => {
  const c = s.itemStyle?.color || s.lineStyle?.color || s.color;
  return typeof c === 'string' && c.startsWith('#') ? c : undefined;
};

// Heading of the card around the chart, when the chart has no title of its own
const cardTitle = (el) => {
  let node = el;
  for (let i = 0; i < 4 && node; i += 1) {
    node = node.parentElement;
    const h = node?.querySelector('h2, h3, h4, [data-chart-title]');
    if (h?.textContent?.trim()) return h.textContent.trim();
  }
  return '';
};

export function collectScreenCharts(root = document) {
  const charts = [];
  root.querySelectorAll('[_echarts_instance_]').forEach((el) => {
    if (charts.length >= MAX_CHARTS || !el.offsetParent) return;   // hidden charts are not exported
    const inst = getInstanceByDom(el);
    if (!inst) return;
    const opt = inst.getOption();
    const x = (opt.xAxis || [])[0];
    if (!x || x.type !== 'category' || !Array.isArray(x.data) || !x.data.length) return;
    const categories = x.data.map(c => (c && typeof c === 'object' ? c.value : c));
    const lines = (opt.series || []).filter(s => (s.type === 'line' || s.type === 'bar')
      && Array.isArray(s.data) && s.data.length && !String(s.name || '').startsWith('__'));
    if (!lines.length) return;
    // a single series on a second axis (e.g. Total payload) goes to the chart's secondary axis
    const second = lines.filter(s => (s.yAxisIndex || 0) > 0);
    const total = second.length === 1 ? second[0] : null;
    const title = [].concat(opt.title || []).map(t => t?.text).filter(Boolean).join(' ') || cardTitle(el) || `Chart ${charts.length + 1}`;
    charts.push({
      title: title.slice(0, 120),
      unit: (opt.yAxis || [])[0]?.name || '',
      categories,
      series: lines.filter(s => s !== total).map((s, i) => ({ name: s.name || `Series ${i + 1}`, color: colorOf(s), values: s.data.map(num) })),
      total: total ? { name: total.name || 'Total', values: total.data.map(num) } : undefined,
    });
  });
  return charts;
}
