import { useCallback, useRef, useState } from 'react';
import { Layers, Plus, Trash2, X } from 'lucide-react';
import ReactECharts from '../../lib/echarts';
import useClickOutside from '../../hooks/useClickOutside';
import { filterCarrierKeys, formatAxisDate, getColorForCarrier } from '../../components/SectorPayloadChart';
import { sideTooltipPosition, TOOLTIP_BG } from '../../components/chartTooltip';
import { thresholdTech } from './ThresholdControl';

// Combo charts: 2-3 KPIs of the same scope in one trend chart (e.g. payload + availability).
// One y-axis per unit (left, right, right outer). KPI 1 solid lines, KPI 2 dashed, KPI 3 dotted;
// a cell keeps its colour in every KPI, so the lines of one cell are easy to pair.

const STORAGE_KEY = 'netpulse_combo_charts';
const LINE_TYPES = ['solid', 'dashed', 'dotted'];
const MAX_KPIS = 3;

export function loadCombos() {
  const out = { '2g': [], '4g': [], '5g': [] };
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    for (const t of Object.keys(out)) {
      out[t] = (Array.isArray(parsed[t]) ? parsed[t] : [])
        .filter(c => Array.isArray(c?.kpis) && c.kpis.length >= 2)
        .map(c => ({ id: String(c.id), kpis: c.kpis.slice(0, MAX_KPIS).map(String) }));
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
  const [picked, setPicked] = useState(['', '']);
  const ref = useRef(null);
  useClickOutside(ref, useCallback(() => setOpen(false), []));
  const tech = thresholdTech(activeMenu);
  const list = combos[tech] || [];
  const label = (id) => kpiCatalog.find(k => k.id === id)?.label || id;
  const update = (next) => { const all = { ...combos, [tech]: next }; saveCombos(all); setCombos(all); };
  const chosen = picked.filter(Boolean);
  const add = () => {
    if (chosen.length < 2) return;
    update([...list, { id: `${Date.now()}`, kpis: chosen }]);
    setPicked(['', '']);
  };
  const field = `border rounded-lg px-2 py-1 text-xs ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`;

  return (
    <div className="relative inline-block" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)} title="Combine several KPIs in one chart"
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border cursor-pointer transition-colors ${
          darkMode ? 'bg-slate-800 border-slate-700 text-blue-400 hover:bg-slate-700' : 'bg-white border-slate-200 text-blue-600 hover:bg-blue-50'
        }`}>
        <Layers className="w-3.5 h-3.5" />
        <span>Combo</span>
        {list.length > 0 && <span className="px-1 rounded bg-blue-600 text-white text-[10px]">{list.length}</span>}
      </button>
      {open && (
        <div className={`absolute left-0 top-full mt-1.5 z-50 w-80 p-3 rounded-2xl border shadow-2xl space-y-3 text-xs ${
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
                {c.kpis.map((id, i) => (
                  <div key={id} className="truncate" title={label(id)}><span className="opacity-50">{['─', '- -', '···'][i]}</span> {label(id)}</div>
                ))}
              </div>
              <button type="button" onClick={() => update(list.filter(x => x.id !== c.id))} title="Remove this combo chart"
                className="p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          <div className="pt-2 border-t border-slate-500/20 space-y-1.5">
            {picked.map((v, i) => (
              <select key={i} value={v} onChange={e => setPicked(p => p.map((x, j) => (j === i ? e.target.value : x)))} className={`${field} w-full`}>
                <option value="">{i < 2 ? `KPI ${i + 1}…` : `KPI ${i + 1} (optional)…`}</option>
                {kpiCatalog.filter(k => k.id === v || !picked.includes(k.id)).map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
            ))}
            <div className="flex items-center gap-2">
              {picked.length < MAX_KPIS && (
                <button type="button" onClick={() => setPicked(p => [...p, ''])} className="text-blue-600 font-semibold cursor-pointer hover:underline">+ KPI {picked.length + 1}</button>
              )}
              <button type="button" onClick={add} disabled={chosen.length < 2}
                className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer disabled:opacity-40 disabled:cursor-default">
                <Plus className="w-3.5 h-3.5" />Add chart
              </button>
            </div>
            <div className="text-[10px] text-slate-400">Shown first in the chart grid (sector and area scopes). One axis per unit. Saved in this browser.</div>
          </div>
        </div>
      )}
    </div>
  );
}

// One combo chart: kpis = [{ id, data }] where data is the page's KPI block (carrier_series, total_series, ...)
export default function ComboChart({ kpis, timestamps, timeMode, bandFilter, availableBands, darkMode, onRemove }) {
  const units = [...new Set(kpis.map(k => k.data.unit || ''))];
  const text = darkMode ? '#cbd5e1' : '#64748b';
  const series = [];
  kpis.forEach((k, ki) => {
    const d = k.data;
    const axis = units.indexOf(d.unit || '');
    const bands = d.carrier_bands || {};
    const keys = filterCarrierKeys(Object.keys(d.carrier_series || {}), availableBands, bands, bandFilter);
    keys.forEach((c, ci) => series.push({
      name: `${d.title} · ${bands[c] === 'ENTITY' ? c : `CI ${c}`}`,
      type: 'line', yAxisIndex: axis, showSymbol: false, smooth: true, connectNulls: false,
      data: d.carrier_series[c],
      lineStyle: { type: LINE_TYPES[ki], width: 1.6 },
      itemStyle: { color: getColorForCarrier(c, bands, ci) },
    }));
    if ((d.has_total || d.has_tot) && d.total_series) {
      series.push({
        name: `${d.title} · Total`, type: 'line', yAxisIndex: axis, showSymbol: false, smooth: true,
        data: d.total_series, lineStyle: { type: LINE_TYPES[ki], width: 2.4 }, itemStyle: { color: '#f43f5e' },
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
    grid: { top: 30, left: 50, right: units.length > 2 ? 100 : 55, bottom: 48 },
    xAxis: {
      type: 'category', data: timestamps || [], boundaryGap: false,
      axisLabel: { color: text, fontSize: 10, hideOverlap: true, formatter: (v) => formatAxisDate(v, timeMode) },
      axisLine: { lineStyle: { color: darkMode ? '#475569' : '#cbd5e1' } },
    },
    yAxis: units.map((u, i) => ({
      type: 'value', name: u, scale: true, position: i === 0 ? 'left' : 'right', offset: i === 2 ? 50 : 0,
      // a percentage axis stops at 100 (availability 99.x % otherwise sits mid-chart on a 40-160 % scale)
      ...(u === '%' ? { max: (v) => (v.max <= 100 ? 100 : v.max), min: (v) => Math.max(0, Math.floor(v.min - (100 - v.min) * 0.2)) } : {}),
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
            <span key={k.id}>{i > 0 && <span className="opacity-40"> + </span>}{k.data.title}<span className="font-normal opacity-50"> ({['solid', 'dashed', 'dotted'][i]})</span></span>
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
