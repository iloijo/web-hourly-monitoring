import React, { useCallback, useRef, useState } from 'react';
import { SlidersHorizontal, RotateCcw, X, Check, Plus, Trash2 } from 'lucide-react';
import useClickOutside from '../../hooks/useClickOutside';

export const DEFAULT_THRESHOLDS = {
  showPrb: true,
  prbValue: 90,
  showThp: true,
  thpValue4g: 1.5,
  thpValue5g: 20,
  custom: { '2g': [], '4g': [], '5g': [] },   // own thresholds per technology: [{ id, label, value, on }]
};

// KPIs that already have a fixed threshold above
export const BUILTIN_THRESHOLD_KPIS = ['dl_prb', 'ul_prb', 'user_dl_thp', 'user_ul_thp'];
// 4G Hourly and 4G Daily share one list
export const thresholdTech = (activeMenu) => (activeMenu === '2g' ? '2g' : activeMenu === '5g' ? '5g' : '4g');

const readCustom = (c) => {
  const out = { '2g': [], '4g': [], '5g': [] };
  if (!c || typeof c !== 'object') return out;
  for (const t of Object.keys(out)) {
    out[t] = (Array.isArray(c[t]) ? c[t] : [])
      .filter(x => x && typeof x.id === 'string' && typeof x.value === 'number' && Number.isFinite(x.value))
      .map(x => ({ id: x.id, label: String(x.label || x.id), value: x.value, on: x.on !== false }));
  }
  return out;
};

export const THRESHOLD_STORAGE_KEY = 'netpulse_thresholds';

export function loadThresholdSettings() {
  try {
    const raw = localStorage.getItem(THRESHOLD_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_THRESHOLDS };
    const parsed = JSON.parse(raw);
    return {
      showPrb: typeof parsed.showPrb === 'boolean' ? parsed.showPrb : DEFAULT_THRESHOLDS.showPrb,
      prbValue: (typeof parsed.prbValue === 'number' && parsed.prbValue > 0 && parsed.prbValue <= 100) ? parsed.prbValue : DEFAULT_THRESHOLDS.prbValue,
      showThp: typeof parsed.showThp === 'boolean' ? parsed.showThp : DEFAULT_THRESHOLDS.showThp,
      thpValue4g: (typeof parsed.thpValue4g === 'number' && parsed.thpValue4g > 0) ? parsed.thpValue4g : DEFAULT_THRESHOLDS.thpValue4g,
      thpValue5g: (typeof parsed.thpValue5g === 'number' && parsed.thpValue5g > 0) ? parsed.thpValue5g : DEFAULT_THRESHOLDS.thpValue5g,
      custom: readCustom(parsed.custom),
    };
  } catch {
    return { ...DEFAULT_THRESHOLDS };
  }
}

export function saveThresholdSettings(settings) {
  try {
    localStorage.setItem(THRESHOLD_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
}

export default function ThresholdControl({
  activeMenu,
  settings,
  onUpdateSettings,
  kpiCatalog = [],
  darkMode
}) {
  const [open, setOpen] = useState(false);
  const [newId, setNewId] = useState('');
  const [newValue, setNewValue] = useState('');
  const ref = useRef(null);
  useClickOutside(ref, useCallback(() => setOpen(false), []));

  const is5G = activeMenu === '5g';
  const is2G = activeMenu === '2g';
  const tech = thresholdTech(activeMenu);
  const customList = settings.custom?.[tech] || [];
  const addable = kpiCatalog.filter(k => !BUILTIN_THRESHOLD_KPIS.includes(k.id) && !customList.some(c => c.id === k.id));
  const thpValue = is5G ? settings.thpValue5g : settings.thpValue4g;

  const update = (patch) => {
    const next = { ...settings, ...patch };
    saveThresholdSettings(next);
    onUpdateSettings(next);
  };

  const handlePrbChange = (valStr) => {
    const num = parseFloat(valStr);
    if (!isNaN(num) && num > 0 && num <= 100) {
      update({ prbValue: num });
    }
  };

  const handleThpChange = (valStr) => {
    const num = parseFloat(valStr);
    if (!isNaN(num) && num > 0) {
      if (is5G) {
        update({ thpValue5g: num });
      } else {
        update({ thpValue4g: num });
      }
    }
  };

  const setCustom = (list) => update({ custom: { ...DEFAULT_THRESHOLDS.custom, ...settings.custom, [tech]: list } });
  const patchCustom = (id, patch) => setCustom(customList.map(c => (c.id === id ? { ...c, ...patch } : c)));
  const addCustom = () => {
    const kpi = kpiCatalog.find(k => k.id === newId);
    const value = parseFloat(newValue);
    if (!kpi || isNaN(value)) return;
    setCustom([...customList, { id: kpi.id, label: kpi.label, value, on: true }]);
    setNewId('');
    setNewValue('');
  };

  const handleReset = () => {
    // own thresholds stay; only the fixed PRB / throughput values go back to their defaults
    const reset = { ...DEFAULT_THRESHOLDS, custom: settings.custom };
    saveThresholdSettings(reset);
    onUpdateSettings(reset);
  };

  const field = `border rounded-lg px-2.5 py-1 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
    darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
  }`;

  const isActive = (!is2G && (settings.showPrb || settings.showThp)) || customList.some(c => c.on);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border cursor-pointer transition-colors shadow-2xs ${
          open
            ? darkMode ? 'bg-slate-700 text-white border-slate-600' : 'bg-slate-200 text-slate-900 border-slate-300'
            : darkMode
              ? 'bg-slate-800 border-slate-700 text-blue-400 hover:bg-slate-700'
              : 'bg-white border-slate-200 text-blue-600 hover:bg-blue-50'
        }`}
        title="Configure chart thresholds"
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        <span>Threshold</span>
        {isActive && (
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        )}
      </button>

      {open && (
        <div
          className={`absolute left-0 top-full mt-1.5 z-50 w-76 p-3.5 rounded-2xl border shadow-2xl space-y-3.5 text-xs ${
            darkMode ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
          }`}
        >
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-blue-500" />
              <span className="font-bold text-xs">Chart Controls & Thresholds</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1 rounded hover:bg-slate-500/15 cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              title="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* PRB Threshold */}
          {!is2G && (<>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer font-semibold text-xs select-none">
                <input
                  type="checkbox"
                  checked={settings.showPrb}
                  onChange={(e) => update({ showPrb: e.target.checked })}
                  className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer w-3.5 h-3.5"
                />
                <span>PRB Threshold</span>
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  disabled={!settings.showPrb}
                  defaultValue={settings.prbValue}
                  key={`prb_${settings.prbValue}`}
                  onBlur={(e) => handlePrbChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handlePrbChange(e.currentTarget.value); }}
                  className={`${field} w-16 text-right font-mono disabled:opacity-40`}
                />
                <span className="font-semibold text-slate-400 text-xs">%</span>
              </div>
            </div>
            <div className="text-[10px] text-slate-400 pl-5.5">
              Applies to DL & UL PRB Utilization (default 90%)
            </div>
          </div>

          {/* User Throughput Threshold */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer font-semibold text-xs select-none">
                <input
                  type="checkbox"
                  checked={settings.showThp}
                  onChange={(e) => update({ showThp: e.target.checked })}
                  className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer w-3.5 h-3.5"
                />
                <span>Throughput ({is5G ? '5G' : '4G'})</span>
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  disabled={!settings.showThp}
                  defaultValue={thpValue}
                  key={`thp_${is5G ? '5g' : '4g'}_${thpValue}`}
                  onBlur={(e) => handleThpChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleThpChange(e.currentTarget.value); }}
                  className={`${field} w-16 text-right font-mono disabled:opacity-40`}
                />
                <span className="font-semibold text-slate-400 text-xs">Mbps</span>
              </div>
            </div>
            <div className="text-[10px] text-slate-400 pl-5.5">
              Applies to User DL & UL Throughput ({is5G ? 'default 20 Mbps' : 'default 1.5 Mbps'})
            </div>
          </div>
          </>)}

          {/* Own thresholds for any other KPI of this technology */}
          <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="font-semibold text-xs">Other KPIs ({tech.toUpperCase()})</div>
            {customList.length === 0 && (
              <div className="text-[10px] text-slate-400">No own threshold yet. Pick a KPI below to add one.</div>
            )}
            {customList.map(c => {
              const unit = kpiCatalog.find(k => k.id === c.id)?.unit;
              return (
                <div key={c.id} className="flex items-center gap-2">
                  <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer select-none" title={c.label}>
                    <input type="checkbox" checked={c.on} onChange={(e) => patchCustom(c.id, { on: e.target.checked })}
                      className="rounded text-blue-600 cursor-pointer w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{c.label}</span>
                  </label>
                  <input type="number" step="any" disabled={!c.on} defaultValue={c.value} key={`${c.id}_${c.value}`}
                    onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) patchCustom(c.id, { value: v }); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    className={`${field} w-16 text-right font-mono disabled:opacity-40`} />
                  {unit && <span className="text-[10px] text-slate-400 w-8 truncate" title={unit}>{unit}</span>}
                  <button type="button" onClick={() => setCustom(customList.filter(x => x.id !== c.id))}
                    className="p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer" title="Remove this threshold">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
            {addable.length > 0 && (
              <div className="flex items-center gap-1.5 pt-1">
                <select value={newId} onChange={(e) => setNewId(e.target.value)} className={`${field} flex-1 min-w-0`}>
                  <option value="">Add KPI…</option>
                  {addable.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
                </select>
                <input type="number" step="any" placeholder="Value" value={newValue} onChange={(e) => setNewValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addCustom(); }}
                  className={`${field} w-20 text-right font-mono`} />
                <button type="button" onClick={addCustom} disabled={!newId || newValue === '' || isNaN(parseFloat(newValue))}
                  className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white cursor-pointer disabled:opacity-40 disabled:cursor-default" title="Add threshold">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <div className="text-[10px] text-slate-400">Drawn as a dashed line on that KPI's charts. Saved in this browser.</div>
          </div>



          {/* Reset Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              title="Reset PRB and throughput to their defaults (own thresholds are kept)"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset defaults</span>
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex items-center gap-1 px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer shadow-xs"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Done</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
