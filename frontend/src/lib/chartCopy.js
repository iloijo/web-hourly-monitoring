// Turn the data an ECharts instance is showing into a table that pastes into Excel (tab separated).
// Reads the merged option of the live chart, so it works for every chart without per-chart code.

const COPYABLE = new Set(['line', 'bar', 'scatter', 'effectScatter', 'pie']);

const pad = (n) => String(n).padStart(2, '0');
const fmtTime = (v) => {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  const t = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return d.getHours() || d.getMinutes() || d.getSeconds() ? `${t} ${pad(d.getHours())}:${pad(d.getMinutes())}` : t;
};

const unwrap = (v) => (v && typeof v === 'object' && !Array.isArray(v) && 'value' in v ? v.value : v);
const axisList = (a) => (Array.isArray(a) ? a : a ? [a] : []);
const axisLabel = (a) => (typeof a?.name === 'string' && a.name.trim() ? a.name.trim() : '');

function isShown(opt, name) {
  for (const lg of axisList(opt.legend)) {
    if (lg?.selected && name in lg.selected && lg.selected[name] === false) return false;
  }
  return true;
}

function uniqueNames(names) {
  const seen = {};
  return names.map(n => {
    const base = n || 'Series';
    seen[base] = (seen[base] || 0) + 1;
    return seen[base] > 1 ? `${base} (${seen[base]})` : base;
  });
}

/**
 * {header: string[], rows: any[][], series: string[]} of the chart, or null when there is nothing to copy.
 * onlySeries: copy only that series name.
 */
export function chartTable(chart, onlySeries = null) {
  const opt = chart?.getOption?.();
  if (!opt) return null;
  const all = axisList(opt.series).filter(s => COPYABLE.has(s?.type) && Array.isArray(s.data) && s.data.length);
  const list = all.filter(s => (onlySeries ? s.name === onlySeries : isShown(opt, s.name)));
  if (!list.length) return null;

  // pie: one row per slice
  if (list.every(s => s.type === 'pie')) {
    const rows = [];
    list.forEach(s => s.data.forEach(d => rows.push([...(list.length > 1 ? [s.name || ''] : []), d?.name ?? '', unwrap(d)])));
    return { header: [...(list.length > 1 ? ['Series'] : []), 'Name', 'Value'], rows, series: list.map(s => s.name) };
  }

  const xs = axisList(opt.xAxis);
  const ys = axisList(opt.yAxis);
  // the category / time axis of a series: x unless the chart is horizontal (y is the category axis)
  const keyAxis = (s) => {
    const x = xs[s.xAxisIndex || 0];
    const y = ys[s.yAxisIndex || 0];
    if (x && x.type !== 'value') return { axis: x, dim: 0 };
    if (y && (y.type === 'category' || y.type === 'time')) return { axis: y, dim: 1 };
    return { axis: x, dim: 0 };
  };

  const keys = new Map();          // key -> label, in first-seen order
  const columns = list.map(s => {
    const { axis, dim } = keyAxis(s);
    const cats = Array.isArray(axis?.data) ? axis.data.map(unwrap) : null;
    const isTime = axis?.type === 'time';
    const col = new Map();
    s.data.forEach((item, i) => {
      const raw = unwrap(item);
      let k;
      let v;
      if (Array.isArray(raw)) {
        k = raw[dim];
        v = raw[dim === 0 ? 1 : 0];
        if (typeof k === 'number' && cats && !isTime && axis?.type === 'category') k = cats[k] ?? k;
      } else {
        k = cats ? cats[i] : i;
        v = raw;
      }
      if (k === undefined || k === null) return;
      const id = isTime ? new Date(k).getTime() || String(k) : String(k);
      if (!keys.has(id)) keys.set(id, isTime ? fmtTime(k) : k);
      col.set(id, v);
    });
    return { col, axis };
  });

  const firstAxis = columns[0].axis;
  let order = [...keys.keys()];
  const catOrder = Array.isArray(firstAxis?.data) ? firstAxis.data.map(c => String(unwrap(c))) : null;
  if (catOrder) {
    // keep the axis order, keys not on the axis go last
    const pos = new Map(catOrder.map((c, i) => [c, i]));
    order = order.sort((a, b) => (pos.get(a) ?? 1e9) - (pos.get(b) ?? 1e9));
  } else if (order.every(k => typeof k === 'number' || !Number.isNaN(Number(k)))) {
    order = order.sort((a, b) => Number(a) - Number(b));
  }

  const names = uniqueNames(list.map(s => s.name));
  const header = [axisLabel(firstAxis) || (firstAxis?.type === 'time' ? 'Time' : 'Category'), ...names];
  const rows = order.map(k => [keys.get(k), ...columns.map(c => c.col.get(k))]);
  return { header, rows, series: names };
}

const cell = (v, decimalComma) => {
  if (v === null || v === undefined || v === '-' || (typeof v === 'number' && !Number.isFinite(v))) return '';
  if (typeof v === 'number') return decimalComma ? String(v).replace('.', ',') : String(v);
  return String(v).replace(/[\t\r\n]+/g, ' ');
};

export function toTsv(table, { decimalComma = false } = {}) {
  return [table.header, ...table.rows].map(r => r.map(v => cell(v, decimalComma)).join('\t')).join('\r\n');
}

export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall back below */ }
  // http (LAN) pages have no Clipboard API: use a hidden textarea
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

/** PNG of the chart to the clipboard; without clipboard image support the PNG is saved instead. */
export async function copyImage(chart, { background = '#ffffff', fileName = 'chart.png' } = {}) {
  const url = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: background });
  try {
    if (navigator.clipboard?.write && window.isSecureContext && typeof ClipboardItem !== 'undefined') {
      const blob = await (await fetch(url)).blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return 'copied';
    }
  } catch { /* fall back to saving */ }
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  return 'saved';
}
