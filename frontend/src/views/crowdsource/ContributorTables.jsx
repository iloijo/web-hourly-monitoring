import React from 'react';
import {
  MapPin,
  TrendingDown,
} from 'lucide-react';
import { Card } from '../cei/ui';
import { weekLabel } from './constants';

export default function ContributorTables({
  contributorsData,
  onSelectKpi,
  onSelectKabupaten,
  darkMode,
  stacked = false,
}) {
  if (!contributorsData) return null;

  const {
    week,
    prev_week,
    kpi_degrade = [],
    selected_key,
    kabupaten = [],
  } = contributorsData;

  const selectedKpiObj = kpi_degrade.find((k) => k.key === selected_key) || kpi_degrade[0];

  return (
    <div className="space-y-4 mb-4">
      <div className={`grid grid-cols-1 gap-4 ${stacked ? '' : 'lg:grid-cols-2'}`}>
        {/* Left: KPI Degradation in Region */}
        <Card
          title={`KPI Degradation — Region (${weekLabel(week)})`}
          Icon={TrendingDown}
          iconClass="text-rose-500"
          meta={`${kpi_degrade.length} degraded`}
          darkMode={darkMode}
        >
          <div className="text-[11px] text-slate-400 mb-2">
            Click row to view kabupaten breakdown on the right:
          </div>
          <div className="overflow-x-auto border rounded-lg border-slate-200 dark:border-slate-800 max-h-96">
            <table className="w-full text-xs text-left">
              <thead
                className={`sticky top-0 z-10 text-[10px] font-bold uppercase tracking-wider ${
                  darkMode ? 'bg-slate-950 text-slate-400' : 'bg-slate-100 text-slate-600'
                }`}
              >
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="p-2">KPI</th>
                  <th className="p-2 text-right">{weekLabel(prev_week).split(' ')[0]}</th>
                  <th className="p-2 text-right">{weekLabel(week).split(' ')[0]}</th>
                  <th className="p-2 text-right">Δ WoW</th>
                  <th className="p-2 text-center">Status</th>
                  <th className="p-2 text-center">Rank</th>
                  <th className="p-2">Leader</th>
                  <th className="p-2 text-right">Gap</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {kpi_degrade.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-4 text-center text-slate-400">
                      No KPIs degraded this week!
                    </td>
                  </tr>
                ) : (
                  kpi_degrade.map((item) => {
                    const isSelected = selected_key === item.key;
                    return (
                      <tr
                        key={item.key}
                        onClick={() => onSelectKpi && onSelectKpi(item.key)}
                        className={`transition-colors cursor-pointer ${
                          isSelected
                            ? darkMode
                              ? 'bg-blue-950/60 ring-1 ring-blue-500 text-blue-200'
                              : 'bg-blue-50 ring-1 ring-blue-400 text-blue-900'
                            : item.flip
                            ? darkMode
                              ? 'bg-rose-950/20 hover:bg-rose-950/30'
                              : 'bg-rose-50/60 hover:bg-rose-50'
                            : darkMode
                            ? 'hover:bg-slate-800/40'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="p-2 font-bold">
                          <div className="flex items-center gap-1.5 truncate max-w-44">
                            <span className="truncate">{item.label}</span>
                            {item.flip && (
                              <span className="px-1 py-0.2 rounded text-[9px] font-black bg-rose-500 text-white shrink-0">
                                Flip
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-2 text-right font-mono text-slate-400">{item.prev}</td>
                        <td className="p-2 text-right font-mono font-bold">{item.cur}</td>
                        <td className="p-2 text-right font-mono font-bold text-rose-500 whitespace-nowrap">
                          {item.delta} ({item.delta_pct}%)
                        </td>
                        <td className="p-2 text-center whitespace-nowrap">
                          <span className="text-[10px] font-bold text-slate-400">
                            {item.status_prev} →{' '}
                            <span
                              className={
                                item.status_cur === 'LOSE'
                                  ? 'text-rose-500'
                                  : item.status_cur === 'DRAW'
                                  ? 'text-teal-500'
                                  : 'text-emerald-500'
                              }
                            >
                              {item.status_cur}
                            </span>
                          </span>
                        </td>
                        <td className="p-2 text-center font-mono">
                          #{item.rank_cur || '–'}
                        </td>
                        <td className="p-2 font-semibold text-slate-600 dark:text-slate-300">
                          {item.leader || '–'}
                        </td>
                        <td className="p-2 text-right font-mono text-rose-500">
                          {item.gap !== null ? item.gap : '–'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Right: Kabupaten Contributors for Selected KPI */}
        <Card
          title={`Kabupaten Contributors — ${selectedKpiObj?.label || ''}`}
          Icon={MapPin}
          iconClass="text-amber-500"
          meta={`${kabupaten.length} kabupaten`}
          darkMode={darkMode}
        >
          <div className="text-[11px] text-slate-400 mb-2">
            Click a kabupaten to center and zoom the map below:
          </div>
          <div className="overflow-x-auto border rounded-lg border-slate-200 dark:border-slate-800 max-h-96">
            <table className="w-full text-xs text-left">
              <thead
                className={`sticky top-0 z-10 text-[10px] font-bold uppercase tracking-wider ${
                  darkMode ? 'bg-slate-950 text-slate-400' : 'bg-slate-100 text-slate-600'
                }`}
              >
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="p-2">Kabupaten</th>
                  <th className="p-2 text-right">{weekLabel(prev_week).split(' ')[0]}</th>
                  <th className="p-2 text-right">{weekLabel(week).split(' ')[0]}</th>
                  <th className="p-2 text-right">Δ WoW</th>
                  <th className="p-2 text-center">Status</th>
                  <th className="p-2">Leader</th>
                  <th className="p-2 text-right">Leader Val</th>
                  <th className="p-2 text-right">Gap</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {kabupaten.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-4 text-center text-slate-400">
                      No kabupaten degradation for this KPI.
                    </td>
                  </tr>
                ) : (
                  kabupaten.map((item) => (
                    <tr
                      key={item.kabupaten}
                      onClick={() => onSelectKabupaten && onSelectKabupaten(item.kabupaten)}
                      className={`transition-colors cursor-pointer ${
                        item.flip
                          ? darkMode
                            ? 'bg-rose-950/20 hover:bg-rose-950/30'
                            : 'bg-rose-50/60 hover:bg-rose-50'
                          : darkMode
                          ? 'hover:bg-slate-800/40'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="p-2 font-bold flex items-center gap-1.5">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate max-w-40">{item.kabupaten}</span>
                        {item.flip && (
                          <span className="px-1 py-0.2 rounded text-[9px] font-black bg-rose-500 text-white shrink-0">
                            Flip
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-right font-mono text-slate-400">{item.prev}</td>
                      <td className="p-2 text-right font-mono font-bold">{item.cur}</td>
                      <td className="p-2 text-right font-mono font-bold text-rose-500 whitespace-nowrap">
                        {item.delta} ({item.delta_pct}%)
                      </td>
                      <td className="p-2 text-center whitespace-nowrap">
                        <span className="text-[10px] font-bold text-slate-400">
                          {item.status_prev} →{' '}
                          <span
                            className={
                              item.status_cur === 'LOSE'
                                ? 'text-rose-500'
                                : item.status_cur === 'DRAW'
                                ? 'text-teal-500'
                                : 'text-emerald-500'
                            }
                          >
                            {item.status_cur}
                          </span>
                        </span>
                      </td>
                      <td className="p-2 font-semibold text-slate-600 dark:text-slate-300">
                        {item.leader || '–'}
                      </td>
                      <td className="p-2 text-right font-mono">
                        {item.leader_value !== null ? item.leader_value : '–'}
                      </td>
                      <td className="p-2 text-right font-mono text-rose-500">
                        {item.gap !== null ? item.gap : '–'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="text-[11px] text-slate-400 italic text-right">
        Ranked by WoW change and status flip; sample counts are not available in the source tables.
      </div>
    </div>
  );
}
