import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X, Check, CheckSquare, Square, RotateCcw, SlidersHorizontal, Sparkles } from 'lucide-react';

const ORDERED_CATEGORIES = [
  "Productivity",
  "Traffic & Payload",
  "Accessibility",
  "Retainability",
  "Capacity & Utilization",
  "Throughput & Speed",
  "User Concurrency",
  "Quality & Latency",
  "Quality & Interference",
  "Mobility",
  "Equipment & System",
  "Equipment & Capacity"
];

export default function KpiDropdownPopover({
  isOpen = false,
  onClose,
  allKpis = [],
  selectedKpiIds = [],
  onToggleKpi,
  onSelectAll,
  onDeselectAll,
  onSelectDefault,
  darkMode = false
}) {
  const popoverRef = useRef(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        onClose();
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Group KPIs by category
  const groupedKpis = useMemo(() => {
    const map = {};
    for (const ord of ORDERED_CATEGORIES) {
      map[ord] = [];
    }

    allKpis.forEach(k => {
      const cat = k.category || "Productivity";
      if (!map[cat]) map[cat] = [];
      map[cat].push(k);
    });

    // Filter by search
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const filtered = {};
      for (const cat in map) {
        const matches = map[cat].filter(k => 
          (k.label || k.title || k.id).toLowerCase().includes(q) ||
          (k.category || "").toLowerCase().includes(q)
        );
        if (matches.length > 0) filtered[cat] = matches;
      }
      return filtered;
    }

    return map;
  }, [allKpis, searchTerm]);

  if (!isOpen) return null;

  return (
    <div
      ref={popoverRef}
      className={`absolute top-full right-0 mt-1.5 w-84 sm:w-96 rounded-xl border shadow-2xl z-50 p-3 space-y-2.5 transition-all text-xs ${
        darkMode 
          ? 'bg-slate-900 border-slate-700 text-slate-200' 
          : 'bg-white border-slate-200 text-slate-800'
      }`}
      style={{ minWidth: '320px', maxWidth: '95vw' }}
    >
      {/* Popover Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-1.5">
          <SlidersHorizontal className="w-3.5 h-3.5 text-blue-500" />
          <span className="font-bold text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Select KPIs ({selectedKpiIds.length}/{allKpis.length})
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <button
            type="button"
            onClick={onSelectAll}
            className="text-blue-500 hover:text-blue-600 font-bold cursor-pointer hover:underline"
          >
            All
          </button>
          <span className="opacity-40">|</span>
          <button
            type="button"
            onClick={onDeselectAll}
            className="text-rose-500 hover:text-rose-600 font-bold cursor-pointer hover:underline"
          >
            Deselect All
          </button>
          <span className="opacity-40">|</span>
          <button
            type="button"
            onClick={onSelectDefault}
            className="text-blue-500 hover:text-blue-600 font-bold cursor-pointer hover:underline"
          >
            Default
          </button>
          <span className="opacity-40">|</span>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-0.5"
            title="Tutup"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Cari KPI (misal: PRB, Throughput, CQI)..."
          className={`w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
            darkMode ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
          }`}
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => setSearchTerm("")}
            className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Categorized KPI List with Checkboxes */}
      <div className="max-h-72 overflow-y-auto space-y-3 pr-1 divide-y divide-slate-100 dark:divide-slate-800/60">
        {Object.entries(groupedKpis).map(([category, kpis]) => {
          if (!kpis || kpis.length === 0) return null;
          const allCatSelected = kpis.every(k => selectedKpiIds.includes(k.id));

          return (
            <div key={category} className="pt-2 first:pt-0 space-y-1">
              {/* Category Group Header */}
              <div className="flex items-center justify-between px-1 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                <span>{category}</span>
                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                  {kpis.filter(k => selectedKpiIds.includes(k.id)).length}/{kpis.length}
                </span>
              </div>

              {/* KPI items in this category */}
              <div className="space-y-0.5">
                {kpis.map(kpi => {
                  const isChecked = selectedKpiIds.includes(kpi.id);
                  const isBdbh = kpi.is_bdbh || kpi.source === 'measBdbh4g' || (kpi.id && ['dl_prb', 'ul_prb', 'user_dl_thp', 'user_ul_thp', 'spectrum_efficiency'].includes(kpi.id));

                  return (
                    <div
                      key={kpi.id}
                      onClick={() => onToggleKpi(kpi.id)}
                      className={`flex items-center justify-between px-2 py-1 rounded-md cursor-pointer transition select-none ${
                        isChecked
                          ? darkMode 
                            ? 'bg-blue-900/30 text-white font-semibold' 
                            : 'bg-blue-50/80 text-blue-950 font-semibold'
                          : darkMode 
                            ? 'hover:bg-slate-800 text-slate-300' 
                            : 'hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition ${
                          isChecked 
                            ? 'bg-blue-600 border-blue-600 text-white' 
                            : darkMode ? 'border-slate-600 bg-slate-800' : 'border-slate-300 bg-white'
                        }`}>
                          {isChecked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                        </div>
                        <span className="truncate text-xs">{kpi.label || kpi.title}</span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {kpi.unit && (
                          <span className="text-[10px] font-mono opacity-60">
                            {kpi.unit}
                          </span>
                        )}
                        {isBdbh && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                            darkMode ? 'bg-amber-950/80 text-amber-400 border border-amber-800/80' : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}>
                            BDBH
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer hint */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
        <span>Klik untuk memilih/membatalkan chart</span>
        <button
          type="button"
          onClick={onClose}
          className="px-2 py-0.5 rounded bg-blue-600 text-white font-bold text-[10px] cursor-pointer hover:bg-blue-700 transition"
        >
          Selesai
        </button>
      </div>
    </div>
  );
}
