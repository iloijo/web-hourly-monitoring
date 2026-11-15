import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Award,
  Edit3,
  Table as TableIcon,
} from 'lucide-react';
import { Card } from '../cei/ui';
import { weekLabel } from './constants';

export default function AchievementTable({
  achievementData,
  selectedKey,
  onSelectKey,
  darkMode,
}) {
  const [loseOnly, setLoseOnly] = useState(false);
  const [showOther, setShowOther] = useState(false);

  if (!achievementData || !achievementData.rows) {
    return null;
  }

  const { weeks = [], week_summary = [], rows = [] } = achievementData;

  // Filter rows
  const filteredRows = rows.filter((r) => {
    if (!showOther && !r.in_target) return false;
    if (loseOnly && r.status !== 'LOSE') return false;
    return true;
  });

  // Group rows by Source and Tech
  const groups = [
    {
      id: 'onx_overall',
      title: 'OpenSignal · Overall',
      source: 'ONX',
      tech: 'overall',
      rows: filteredRows.filter((r) => r.source === 'ONX' && r.tech === 'overall' && r.in_target),
    },
    {
      id: 'onx_5g',
      title: 'OpenSignal · 5G',
      source: 'ONX',
      tech: '5g',
      rows: filteredRows.filter((r) => r.source === 'ONX' && r.tech === '5g' && r.in_target),
    },
    {
      id: 'ook_all',
      title: 'Ookla · Overall',
      source: 'OOKLA',
      tech: 'ALL',
      rows: filteredRows.filter((r) => r.source === 'OOKLA' && r.tech === 'ALL' && r.in_target),
    },
    {
      id: 'ook_5g',
      title: 'Ookla · 5G',
      source: 'OOKLA',
      tech: '5G',
      rows: filteredRows.filter((r) => r.source === 'OOKLA' && r.tech === '5G' && r.in_target),
    },
    {
      id: 'other_kpi',
      title: 'Other KPI (Non-Target)',
      source: 'OTHER',
      tech: 'other',
      rows: filteredRows.filter((r) => !r.in_target),
    },
  ].filter((g) => g.rows.length > 0);

  // Status Chip component
  const StatusChip = ({ status, rank }) => {
    if (!status) return <span className="text-slate-400">–</span>;
    let bg = 'bg-slate-500/15 text-slate-400 border-slate-500/30';
    let text = status;
    if (status === 'WIN') {
      bg = 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
      text = 'W';
    } else if (status === 'DRAW') {
      bg = 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/30';
      text = 'D';
    } else if (status === 'LOSE') {
      bg = 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30';
      text = 'L';
    }

    return (
      <span
        className={`inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[10px] font-black border ${bg}`}
      >
        <span>{text}</span>
        {rank ? <span className="text-[9px] opacity-75 font-normal">#{rank}</span> : null}
      </span>
    );
  };

  return (
    <Card
      title="Achievement & Target Week-to-Week"
      Icon={TableIcon}
      iconClass="text-blue-500"
      darkMode={darkMode}
      meta={
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={loseOnly}
              onChange={(e) => setLoseOnly(e.target.checked)}
              className="rounded text-blue-600 focus:ring-0 cursor-pointer"
            />
            <span>Lose only</span>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showOther}
              onChange={(e) => setShowOther(e.target.checked)}
              className="rounded text-blue-600 focus:ring-0 cursor-pointer"
            />
            <span>Show other KPI</span>
          </label>
        </div>
      }
    >
      <div className="overflow-x-auto relative max-h-[600px] border rounded-lg border-slate-200 dark:border-slate-800">
        <table className="w-full text-xs text-left border-collapse">
          {/* Table Header */}
          <thead
            className={`sticky top-0 z-20 text-[11px] font-bold uppercase tracking-wider ${
              darkMode ? 'bg-slate-950 text-slate-300' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {/* Top row: Column definitions */}
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="p-2.5 sticky left-0 z-30 min-w-56 bg-inherit">KPI</th>
              <th className="p-2.5 min-w-16">Unit</th>
              {weeks.map((yw) => (
                <th key={yw} className="p-2.5 text-center min-w-24">
                  {weekLabel(yw)}
                </th>
              ))}
              <th className="p-2.5 text-center min-w-20">Δ WoW</th>
              <th className="p-2.5 min-w-20">Leader</th>
              <th className="p-2.5 text-right min-w-20">Leader Val</th>
              <th className="p-2.5 text-right min-w-16">Gap</th>
              <th className="p-2.5 text-right min-w-16">Gap %</th>
              <th className="p-2.5 text-right min-w-20">Need WIN</th>
              <th className="p-2.5 text-right min-w-20">Need DRAW</th>
              <th className="p-2.5 min-w-24">Margin / Risk</th>
            </tr>

            {/* Wins vs Target Summary Rows */}
            {/* ONX Summary */}
            <tr
              className={`text-[11px] border-b border-slate-200/80 dark:border-slate-800/80 ${
                darkMode ? 'bg-slate-900/90' : 'bg-slate-50/90'
              }`}
            >
              <td className="p-2 pl-3 font-extrabold sticky left-0 z-30 bg-inherit text-blue-500">
                OpenSignal Wins / Target
              </td>
              <td className="p-2">–</td>
              {weeks.map((yw) => {
                const s = week_summary.find((ws) => ws.week === yw && ws.source === 'ONX');
                if (!s) return <td key={yw} className="p-2 text-center">–</td>;
                const pass = s.wins >= s.target;
                return (
                  <td
                    key={yw}
                    className={`p-2 text-center font-bold ${
                      pass ? 'text-emerald-500' : 'text-rose-500'
                    }`}
                  >
                    {s.wins} / {s.target}
                  </td>
                );
              })}
              <td colSpan={7} className="p-2"></td>
            </tr>

            {/* Ookla Summary */}
            <tr
              className={`text-[11px] border-b border-slate-200/80 dark:border-slate-800/80 ${
                darkMode ? 'bg-slate-900/90' : 'bg-slate-50/90'
              }`}
            >
              <td className="p-2 pl-3 font-extrabold sticky left-0 z-30 bg-inherit text-amber-500">
                Ookla Wins / Target
              </td>
              <td className="p-2">–</td>
              {weeks.map((yw) => {
                const s = week_summary.find((ws) => ws.week === yw && ws.source === 'OOKLA');
                if (!s) return <td key={yw} className="p-2 text-center">–</td>;
                const pass = s.wins >= s.target;
                return (
                  <td
                    key={yw}
                    className={`p-2 text-center font-bold ${
                      pass ? 'text-emerald-500' : 'text-rose-500'
                    }`}
                  >
                    {s.wins} / {s.target}
                  </td>
                );
              })}
              <td colSpan={7} className="p-2"></td>
            </tr>

            {/* TOTAL Summary (Official Status) */}
            <tr
              className={`text-[11px] border-b-2 border-slate-300 dark:border-slate-700 font-black ${
                darkMode ? 'bg-slate-900' : 'bg-blue-50/50'
              }`}
            >
              <td className="p-2 pl-3 sticky left-0 z-30 bg-inherit flex items-center gap-1.5 text-slate-800 dark:text-slate-100">
                <Award className="w-3.5 h-3.5 text-emerald-500" />
                <span>TOTAL Portofolio Status</span>
              </td>
              <td className="p-2">–</td>
              {weeks.map((yw) => {
                const s = week_summary.find((ws) => ws.week === yw && ws.source === 'TOTAL');
                if (!s) return <td key={yw} className="p-2 text-center">–</td>;
                const isAch = s.achievement === 'ACH';
                return (
                  <td key={yw} className="p-2 text-center">
                    <div className="font-extrabold">
                      {s.wins} / {s.target}
                    </div>
                    <span
                      className={`inline-block px-1.5 py-0.2 mt-0.5 rounded text-[9px] font-black ${
                        isAch
                          ? 'bg-emerald-500 text-white'
                          : 'bg-rose-500 text-white'
                      }`}
                    >
                      {s.achievement}
                    </span>
                  </td>
                );
              })}
              <td colSpan={7} className="p-2 text-slate-400 font-normal italic text-[10px]">
                Official Region Sulawesi OKR
              </td>
            </tr>
          </thead>

          {/* Table Body grouped by category */}
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
            {groups.map((group) => (
              <React.Fragment key={group.id}>
                {/* Group Divider */}
                <tr
                  className={`font-black text-xs uppercase tracking-wider ${
                    darkMode ? 'bg-slate-800/80 text-blue-400' : 'bg-slate-200/70 text-blue-900'
                  }`}
                >
                  <td colSpan={weeks.length + 9} className="py-1.5 px-3">
                    {group.title} ({group.rows.length} KPIs)
                  </td>
                </tr>

                {/* Group Rows */}
                {group.rows.map((row) => {
                  const isSelected = selectedKey === row.key;
                  const rowBg = isSelected
                    ? darkMode
                      ? 'bg-blue-950/60 ring-1 ring-blue-500/50'
                      : 'bg-blue-50/80 ring-1 ring-blue-400/50'
                    : darkMode
                    ? 'hover:bg-slate-800/40'
                    : 'hover:bg-slate-50';

                  return (
                    <tr
                      key={`${row.kabupaten || ''}_${row.key}`}
                      onClick={() => onSelectKey && onSelectKey(row.key)}
                      className={`transition-colors cursor-pointer ${rowBg}`}
                    >
                      {/* KPI Label Column (Sticky) */}
                      <td
                        className={`p-2.5 pl-3 sticky left-0 z-10 bg-inherit font-bold flex items-center justify-between gap-2 ${
                          isSelected ? (darkMode ? 'text-blue-300' : 'text-blue-700') : ''
                        }`}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          {row.manual && (
                            <Edit3
                              className="w-3 h-3 text-amber-500 shrink-0"
                              title="Manual input KPI"
                            />
                          )}
                          <span className="truncate">{row.label}</span>
                        </div>
                        <span className="text-[10px] px-1 py-0.2 rounded font-semibold bg-slate-500/10 text-slate-400 uppercase">
                          {row.tech}
                        </span>
                      </td>

                      {/* Unit */}
                      <td className="p-2.5 text-slate-400 text-[11px]">{row.unit}</td>

                      {/* Week Cells */}
                      {row.cells.map((c) => (
                        <td key={c.week} className="p-2 text-center whitespace-nowrap">
                          {c.tsel !== null && c.tsel !== undefined ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="font-mono font-bold">{c.tsel}</span>
                              <StatusChip status={c.status} rank={c.rank} />
                            </div>
                          ) : (
                            <span className="text-slate-400">–</span>
                          )}
                        </td>
                      ))}

                      {/* WoW */}
                      <td className="p-2 text-center whitespace-nowrap">
                        {row.wow !== null && row.wow !== undefined ? (
                          <span
                            className={`inline-flex items-center gap-0.5 font-bold font-mono ${
                              row.wow > 0
                                ? 'text-emerald-500'
                                : row.wow < 0
                                ? 'text-rose-500'
                                : 'text-slate-400'
                            }`}
                          >
                            {row.wow > 0 ? (
                              <ArrowUp className="w-3 h-3" />
                            ) : row.wow < 0 ? (
                              <ArrowDown className="w-3 h-3" />
                            ) : null}
                            {row.wow > 0 ? `+${row.wow}` : row.wow}
                          </span>
                        ) : (
                          <span className="text-slate-400">–</span>
                        )}
                      </td>

                      {/* Leader */}
                      <td className="p-2 font-bold text-slate-700 dark:text-slate-300">
                        {row.leader || '–'}
                      </td>

                      {/* Leader Val */}
                      <td className="p-2 text-right font-mono">
                        {row.leader_value !== null ? row.leader_value : '–'}
                      </td>

                      {/* Gap */}
                      <td
                        className={`p-2 text-right font-mono font-bold ${
                          row.gap !== null ? 'text-rose-500' : 'text-slate-400'
                        }`}
                      >
                        {row.gap !== null ? row.gap : '–'}
                      </td>

                      {/* Gap % */}
                      <td
                        className={`p-2 text-right font-mono ${
                          row.gap_pct !== null ? 'text-rose-500' : 'text-slate-400'
                        }`}
                      >
                        {row.gap_pct !== null ? `${row.gap_pct}%` : '–'}
                      </td>

                      {/* Needed WIN */}
                      <td className="p-2 text-right font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                        {row.needed_win !== null ? row.needed_win : '–'}
                      </td>

                      {/* Needed DRAW */}
                      <td className="p-2 text-right font-mono text-teal-600 dark:text-teal-400">
                        {row.needed_draw !== null ? row.needed_draw : '–'}
                      </td>

                      {/* Margin / Risk */}
                      <td className="p-2">
                        {row.status in { WIN: 1, DRAW: 1 } ? (
                          <div className="flex items-center gap-1.5">
                            {row.margin !== null && (
                              <span className="font-mono font-semibold text-emerald-500">
                                +{row.margin}
                              </span>
                            )}
                            {row.at_risk && (
                              <span
                                className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[10px] font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30"
                                title="At risk: CI overlap or margin < 1%"
                              >
                                <AlertTriangle className="w-2.5 h-2.5" />
                                Risk
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">–</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
