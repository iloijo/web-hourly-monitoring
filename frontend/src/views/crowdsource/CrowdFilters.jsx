import React from 'react';
import { Settings2 } from 'lucide-react';
import SegmentedToggle from '../../components/filters/SegmentedToggle';
import MultiSelectDropdown from '../../components/MultiSelectDropdown';
import {
  SOURCE_OPTIONS,
  TECH_OPTIONS,
  COMPETITOR_OPTIONS,
  TREND_WEEKS_OPTIONS,
  LEVEL_OPTIONS,
  weekLabel,
} from './constants';

export default function CrowdFilters({
  meta,
  filters,
  onChange,
  dataWeek,
  isSuperAdmin,
  onOpenSettings,
  darkMode,
}) {
  const allWeeks = React.useMemo(() => {
    if (!meta?.weeks) return [];
    const set = new Set([...(meta.weeks.ONX || []), ...(meta.weeks.OOKLA || [])]);
    return Array.from(set).sort((a, b) => b - a);
  }, [meta]);

  const regionOptions = meta?.regions || ['SULAWESI'];
  const kabupatenList = meta?.kabupaten?.[filters.region] || [];

  const handleWeekChange = (e) => {
    onChange({ week: Number(e.target.value) });
  };

  const handleRegionChange = (e) => {
    onChange({ region: e.target.value, kabupaten: [] });
  };

  const selectClass = `px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition cursor-pointer ${
    darkMode
      ? 'bg-slate-800 border-slate-700 text-slate-200 focus:border-blue-500'
      : 'bg-white border-slate-200 text-slate-800 focus:border-blue-600'
  }`;

  return (
    <div
      className={`sticky top-0 z-20 p-3 sm:p-4 rounded-xl border mb-4 backdrop-blur-md shadow-sm transition-colors ${
        darkMode ? 'bg-slate-900/95 border-slate-800' : 'bg-white/95 border-slate-200'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Main Filters Row */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Week Selector */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Week
            </label>
            <div className="relative">
              <select
                value={filters.week || meta?.latest_week || ''}
                onChange={handleWeekChange}
                className={selectClass}
              >
                {allWeeks.map((yw) => (
                  <option key={yw} value={yw}>
                    {weekLabel(yw)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Region Selector */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Region
            </label>
            <select
              value={filters.region}
              onChange={handleRegionChange}
              className={selectClass}
            >
              {regionOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* Source Toggle */}
          <SegmentedToggle
            label="Source"
            options={SOURCE_OPTIONS}
            value={filters.source}
            onChange={(val) => onChange({ source: val })}
            darkMode={darkMode}
          />

          {/* Tech Toggle */}
          <SegmentedToggle
            label="Tech"
            options={TECH_OPTIONS}
            value={filters.tech}
            onChange={(val) => onChange({ tech: val })}
            darkMode={darkMode}
          />

          {/* Level Toggle */}
          <SegmentedToggle
            label="Level"
            options={LEVEL_OPTIONS}
            value={filters.level}
            onChange={(val) => onChange({ level: val })}
            darkMode={darkMode}
          />

          {/* Kabupaten Multi-select (when level=kabupaten) */}
          {filters.level === 'kabupaten' && (
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Kabupaten (Max 10)
              </label>
              <MultiSelectDropdown
                options={kabupatenList}
                selectedValues={filters.kabupaten}
                onChange={(vals) => onChange({ kabupaten: vals.slice(0, 10) })}
                isMulti={true}
                placeholder="Pick 1–10 kab..."
                searchable={true}
                darkMode={darkMode}
                minWidth="min-w-48"
              />
            </div>
          )}

          {/* Competitor Filter */}
          <SegmentedToggle
            label="Competitor"
            options={COMPETITOR_OPTIONS}
            value={filters.competitor}
            onChange={(val) => onChange({ competitor: val })}
            darkMode={darkMode}
          />

          {/* Trend Length */}
          <SegmentedToggle
            label="Trend"
            options={TREND_WEEKS_OPTIONS}
            value={filters.trendWeeks}
            onChange={(val) => onChange({ trendWeeks: Number(val) })}
            darkMode={darkMode}
          />
        </div>

        {/* Right Action buttons & status badges */}
        <div className="flex items-center gap-3">
          {/* Data freshness badge */}
          {dataWeek && (
            <div
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-md border ${
                darkMode
                  ? 'bg-slate-800/80 border-slate-700 text-slate-300'
                  : 'bg-slate-100 border-slate-200 text-slate-600'
              }`}
            >
              Data week: ONX{' '}
              <span className="font-bold text-blue-500">
                {weekLabel(dataWeek.ONX).split(' ')[0]}
              </span>{' '}
              · Ookla{' '}
              <span className="font-bold text-amber-500">
                {weekLabel(dataWeek.OOKLA).split(' ')[0]}
              </span>
            </div>
          )}

          {/* SuperAdmin Settings Gear */}
          {isSuperAdmin && (
            <button
              type="button"
              onClick={onOpenSettings}
              className={`p-2 rounded-lg border transition cursor-pointer flex items-center gap-1.5 text-xs font-bold ${
                darkMode
                  ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                  : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700 shadow-sm'
              }`}
              title="Crowdsource Settings (Targets & Manual KPIs)"
            >
              <Settings2 className="w-4 h-4 text-emerald-500" />
              <span>Settings</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
