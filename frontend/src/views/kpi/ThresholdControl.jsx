import React, { useCallback, useRef, useState } from 'react';
import { SlidersHorizontal, RotateCcw, X, Check } from 'lucide-react';
import useClickOutside from '../../hooks/useClickOutside';

export const DEFAULT_THRESHOLDS = {
  showPrb: true,
  prbValue: 90,
  showThp: true,
  thpValue4g: 1.5,
  thpValue5g: 20,
  tooltipOrder: 'desc', // 'desc' (High -> Low) or 'asc' (Low -> High)
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
      tooltipOrder: parsed.tooltipOrder === 'asc' ? 'asc' : 'desc',
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
  darkMode
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, useCallback(() => setOpen(false), []));

  const is5G = activeMenu === '5g';
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

  const handleReset = () => {
    const reset = { ...DEFAULT_THRESHOLDS };
    saveThresholdSettings(reset);
    onUpdateSettings(reset);
  };

  const field = `border rounded-lg px-2.5 py-1 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
    darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
  }`;

  const isActive = settings.showPrb || settings.showThp;

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
        title="Configure chart thresholds and tooltip display"
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

          {/* Tooltip Order Toggle */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs">Tooltip Order:</span>
              <div className={`inline-flex rounded-lg p-0.5 border text-[11px] font-bold ${
                darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'
              }`}>
                <button
                  type="button"
                  onClick={() => update({ tooltipOrder: 'desc' })}
                  className={`px-2 py-0.5 rounded-md cursor-pointer transition ${
                    settings.tooltipOrder === 'desc'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  High → Low
                </button>
                <button
                  type="button"
                  onClick={() => update({ tooltipOrder: 'asc' })}
                  className={`px-2 py-0.5 rounded-md cursor-pointer transition ${
                    settings.tooltipOrder === 'asc'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  Low → High
                </button>
              </div>
            </div>
            <div className="text-[10px] text-slate-400">
              Total Payload is always kept at the bottom of the tooltip.
            </div>
          </div>

          {/* Reset Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              title="Reset all thresholds and tooltip order to defaults"
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
