import { useCallback, useRef, useState } from 'react';
import { ChartArea, ChartColumn, ChartLine, Layers, Plus, Trash2, X } from 'lucide-react';
import ReactECharts from '../../lib/echarts';
import useClickOutside from '../../hooks/useClickOutside';
import { filterCarrierKeys, formatAxisDate, getColorForCarrier } from '../../components/SectorPayloadChart';
import { sideTooltipPosition, TOOLTIP_BG } from '../../components/chartTooltip';
import { thresholdTech } from './ThresholdControl';

// Combo charts: 2-5 KPIs of the same scope in one trend chart (e.g. payload area + availability line + PRB bar).
// Each KPI has its own chart type (line, area, bar) and sits on the primary (left) or secondary (right) axis.
// Lines of KPI 1-5 differ by dash; a cell keeps its colour in every KPI, so the series of one cell are easy to pair.

const STORAGE_KEY = 'netpulse_combo_charts';
const LINE_DASH = ['solid', 'dashed', 'dotted', [10, 4, 2, 4], [14, 5]];
const DASH_LABEL = ['solid', 'dashed', 'dotted', 'dash-dot', 'long dash'];
const MAX_KPIS = 5;
const CHART_TYPES = [['line', 'Line', ChartLine], ['area', 'Area', ChartArea], ['bar', 'Bar', ChartColumn]];
const Z = { bar: 1, area: 2, line: 3 };   // bars behind areas behind lines

// Saved entry of one KPI: { id, type, axis }; older entries were plain KPI ids (all lines, KPI 1 on the left)
const normKpi = (k, i) => (typeof k === 'object' && k
  ? { id: String(k.id), type: CHART_TYPES.some(t => t[0] === k.type) ? k.type : 'line', axis: k.axis === 'right' ? 'right' : 'left' }
  : { id: String(k), type: 'line', axis: i === 0 ? 'left' : 'right' });
const blankKpi = (axis) => ({ id: '', type: 'line', axis });

export function loadCombos() {
  const out = { '2g': [], '4g': [], '5g': [] };
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    for (const t of Object.keys(out)) {
      out[t] = (Array.isArray(parsed[t]) ? parsed[t] : [])
        .filter(c => Array.isArray(c?.kpis) && c.kpis.length >= 2)
        .map(c => ({ id: String(c.id), kpis: c.kpis.slice(0, MAX_KPIS).map(normKpi) }));
    }
  } catch { /* storage unavailable or corrupt: start empty */ }
  return out;
}

const saveCombos = (combos) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(combos)); } catch { /* storage unavailable */ }
};

// "Combo" button: the saved combo charts of this technology, and a form to add one
export function ComboControl({ activeMenu, combos, setCombos, kpiCatalog, darkMode }) {
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const [picked, setPicked] = useState([blankKpi('left'), blankKpi('right')]);
  const ref = useRef(null);
  useClickOutside(ref, useCallback(() => setOpen(false), []));
  const tech = thresholdTech(activeMenu);
  const list = combos[tech] || [];
  const label = (id) => kpiCatalog.find(k => k.id === id)?.label || id;
  const update = (next) => { const all = { ...combos, [tech]: next }; saveCombos(all); setCombos(all); };
  const unitOf = (id) => kpiCatalog.find(k => k.id === id)?.unit || '';
  const chosen = picked.filter(p => p.id);
  const pickedIds = picked.map(p => p.id);
  const add = () => {
    if (chosen.length < 2) return;
    update([...list, { id: `${Date.now()}`, kpis: chosen }]);
    setPicked([blankKpi('left'), blankKpi('right')]);
  };
  const setRow = (i, patch) => setPicked(rows => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  // a new KPI goes to the left axis when it has the unit of KPI 1, else to the right (can be switched)
  const pickKpi = (i, id) => setRow(i, {
    id, ...(i > 0 && id ? { axis: unitOf(id) === unitOf(picked[0].id) ? 'left' : 'right' } : {}),
  });
  const typeIcon = (t) => (CHART_TYPES.find(x => x[0] === t) || CHART_TYPES[0])[2];
  const field = `border rounded-lg px-2 py-1 text-xs ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`;

  return (
    <div className="relative inline-block" ref={ref}>
      <button type="button" title="Combine several KPIs in one chart"
        onClick={() => {
          // open towards the left when the panel (320 px) would run past the right edge of the window
          const r = ref.current?.getBoundingClientRect();
          setAlignRight(!!r && r.left + 336 > window.innerWidth);
          setOpen(!open);
        }}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border cursor-pointer transition-colors ${
          darkMode ? 'bg-slate-800 border-slate-700 text-blue-400 hover:bg-slate-700' : 'bg-white border-slate-200 text-blue-600 hover:bg-blue-50'
        }`}>
        <Layers className="w-3.5 h-3.5" />
        <span>Combo</span>
        {list.length > 0 && <span className="px-1 rounded bg-blue-600 text-white text-[10px]">{list.length}</span>}
      </button>
      {open && (
        <div className={`absolute ${alignRight ? 'right-0' : 'left-0'} top-full mt-1.5 z-50 w-80 max-w-[calc(100vw-2rem)] p-3 rounded-2xl border shadow-2xl space-y-3 text-xs ${
          darkMode ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
        }`}>
          <div className="flex items-center justify-between">
            <span className="font-bold">Combo charts ({tech.toUpperCase()})</span>
            <button type="button" onClick={() => setOpen(false)} className="p-1 rounded hover:bg-slate-500/15 cursor-pointer" title="Close"><X className="w-3.5 h-3.5" /></button>
          </div>
          {list.length === 0 && <div className="text-[11px] text-slate-400">No combo chart yet.</div>}
          {list.map(c => (
            <div key={c.id} className="flex items-start gap-2">
              <div className="flex-1 min-w-0 space-y-0.5">
                {c.kpis.map((k) => {
                  const Icon = typeIcon(k.type);
                  return (
                    <div key={k.id} className="flex items-center gap-1.5 min-w-0" title={`${label(k.id)} · ${k.axis === 'right' ? 'right' : 'left'} axis`}>
                      <Icon className="w-3.5 h-3.5 shrink-0 text-blue-500" />
                      <span className="truncate">{label(k.id)}</span>
                      <span className={`shrink-0 text-[10px] font-bold ${k.axis === 'right' ? 'text-amber-500' : 'text-blue-500'}`}>{k.axis === 'right' ? 'R' : 'L'}</span>
                    </div>
                  );
                })}
              </div>
              <button type="button" onClick={() => update(list.filter(x => x.id !== c.id))} title="Remove this combo chart"
                className="p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          <div className="pt-2 border-t border-slate-500/20 space-y-1.5">
            {picked.map((v, i) => (
              <div key={i} className="flex items-center gap-1">
                <select value={v.id} onChange={e => pickKpi(i, e.target.value)} className={`${field} flex-1 min-w-0`}>
                  <option value="">{i < 2 ? `KPI ${i + 1}…` : `KPI ${i + 1} (optional)…`}</option>
                  {kpiCatalog.filter(k => k.id === v.id || !pickedIds.includes(k.id)).map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
                </select>
                <div className={`flex shrink-0 rounded-lg border overflow-hidden ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                  {CHART_TYPES.map(([t, l, Icon]) => (
                    <button key={t} type="button" onClick={() => setRow(i, { type: t })} title={`${l} chart`}
                      className={`p-1 cursor-pointer ${v.type === t ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-blue-500'}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => setRow(i, { axis: v.axis === 'right' ? 'left' : 'right' })}
                  title={v.axis === 'right' ? 'Secondary (right) axis: click for the primary axis' : 'Primary (left) axis: click for the secondary axis'}
                  className={`${field} shrink-0 w-7 px-0 font-bold cursor-pointer ${v.axis === 'right' ? 'text-amber-500' : 'text-blue-500'}`}>
                  {v.axis === 'right' ? 'R' : 'L'}
                </button>
                {i >= 2 && (
                  <button type="button" onClick={() => setPicked(rows => rows.filter((_, j) => j !== i))} title="Remove this KPI"
                    className="p-0.5 rounded text-slate-400 hover:text-rose-500 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
                )}
              </div>
            ))}
            <div className="flex items-center gap-2">
              {picked.length < MAX_KPIS && (
                <button type="button" onClick={() => setPicked(p => [...p, blankKpi('right')])} className="text-blue-600 font-semibold cursor-pointer hover:underline">+ KPI {picked.length + 1}</button>
              )}
              <button type="button" onClick={add} disabled={chosen.length < 2}
                className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer disabled:opacity-40 disabled:cursor-default">
                <Plus className="w-3.5 h-3.5" />Add chart
              </button>
            </div>
            <div className="text-[10px] text-slate-400">Icons: line, area or bar chart per KPI. L / R: primary (left) or secondary (right) axis. Shown first in the chart grid (sector and area scopes). Saved in this browser.</div>
          </div>
        </div>
      )}
    </div>
  );
}

// One combo chart: kpis = [{ id, type, axis, data }] where data is the page's KPI block (carrier_series, total_series, ...)
export default function ComboChart({ kpis, timestamps, timeMode, bandFilter, availableBands, darkMode, onRemove }) {
  const sides = kpis.some(k => k.axis === 'right') ? ['left', 'right'] : ['left'];
  const unitsOn = (side) => [...new Set(kpis.filter(k => (k.axis === 'right' ? 'right' : 'left') === side).map(k => k.data.unit || ''))];
  const hasBar = kpis.some(k => k.type === 'bar');
  const text = darkMode ? '#cbd5e1' : '#64748b';
  const series = [];
  const style = (type, ki, width) => ({
    type: type === 'bar' ? 'bar' : 'line', z: Z[type] || 3,
    ...(type === 'bar' ? { barMaxWidth: 14, itemStyle: { opacity: 0.8 } } : { lineStyle: { type: LINE_DASH[ki], width } }),
    ...(type === 'area' ? { areaStyle: { opacity: 0.18 } } : {}),
  });
  kpis.forEach((k, ki) => {
    const d = k.data;
    const axis = k.axis === 'right' ? 1 : 0;
    const bands = d.carrier_bands || {};
    const keys = filterCarrierKeys(Object.keys(d.carrier_series || {}), availableBands, bands, bandFilter);
    keys.forEach((c, ci) => {
      const s = style(k.type, ki, 1.6);
      series.push({
        ...s, name: `${d.title} · ${bands[c] === 'ENTITY' ? c : `CI ${c}`}`,
        yAxisIndex: axis, showSymbol: false, smooth: true, connectNulls: false,
        data: d.carrier_series[c],
        itemStyle: { ...s.itemStyle, color: getColorForCarrier(c, bands, ci) },
      });
    });
    if ((d.has_total || d.has_tot) && d.total_series) {
      const s = style(k.type, ki, 2.4);
      series.push({
        ...s, name: `${d.title} · Total`, yAxisIndex: axis, showSymbol: false, smooth: true,
        data: d.total_series, itemStyle: { ...s.itemStyle, color: '#f43f5e' },
      });
    }
  });

  const option = {
    animation: false,
    tooltip: {
      trigger: 'axis', confine: true, position: sideTooltipPosition, backgroundColor: TOOLTIP_BG, borderWidth: 0,
      textStyle: { color: '#fff', fontSize: 11 },
      valueFormatter: (v) => (v == null || Number.isNaN(v) ? '–' : Number(v).toLocaleString('id-ID', { maximumFractionDigits: 2 })),
    },
    legend: { type: 'scroll', bottom: 0, textStyle: { color: text, fontSize: 10 }, itemWidth: 18, itemHeight: 8 },
    grid: { top: 30, left: 50, right: 55, bottom: 48 },
    xAxis: {
      type: 'category', data: timestamps || [], boundaryGap: hasBar,
      axisLabel: { color: text, fontSize: 10, hideOverlap: true, formatter: (v) => formatAxisDate(v, timeMode) },
      axisLine: { lineStyle: { color: darkMode ? '#475569' : '#cbd5e1' } },
    },
    yAxis: sides.map((side, i) => ({
      type: 'value', name: unitsOn(side).filter(Boolean).join(' / '), scale: !hasBar, position: side,
      // a percentage axis stops at 100 (availability 99.x % otherwise sits mid-chart on a 40-160 % scale)
      ...(unitsOn(side).join() === '%' ? { max: (v) => (v.max <= 100 ? 100 : v.max), min: (v) => Math.max(0, Math.floor(v.min - (100 - v.min) * 0.2)) } : {}),
      nameTextStyle: { color: text, fontSize: 10, fontWeight: 600 }, axisLabel: { color: text, fontSize: 9 },
      axisLine: { show: true, lineStyle: { color: darkMode ? '#475569' : '#cbd5e1' } },
      splitLine: { show: i === 0, lineStyle: { color: darkMode ? 'rgba(148,163,184,0.15)' : '#f1f5f9' } },
    })),
    series,
  };

  return (
    <div className={`rounded-2xl border shadow-xs p-2 ${darkMode ? 'bg-slate-800/90 border-slate-700/80' : 'bg-white border-slate-200/90'}`}>
      <div className="flex items-start gap-2 px-2 pt-1">
        <div className={`text-xs font-bold ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
          {kpis.map((k, i) => (
            <span key={k.id}>{i > 0 && <span className="opacity-40"> + </span>}{k.data.title}
              <span className="font-normal opacity-50"> ({k.type === 'bar' ? 'bar' : `${DASH_LABEL[i]} ${k.type}`}, {k.axis === 'right' ? 'right' : 'left'})</span>
            </span>
          ))}
        </div>
        {onRemove && (
          <button type="button" onClick={onRemove} title="Remove this combo chart" className="ml-auto p-1 rounded text-slate-400 hover:text-rose-500 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
        )}
      </div>
      <ReactECharts option={option} style={{ height: 320, width: '100%' }} notMerge />
    </div>
  );
}
