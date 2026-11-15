import React from 'react';
import { AlertTriangle, Award, Crosshair } from 'lucide-react';
import { Card } from '../cei/ui';

export default function PathToTarget({
  pathToTarget = [],
  achievementData,
  summaryTiles,
  selectedKey,
  onSelectKey,
  darkMode,
}) {
  const winsNeeded = summaryTiles?.TOTAL?.wins_needed ?? 0;
  const isAch = winsNeeded === 0;

  // If ACH: list at risk KPIs from achievementData rows
  const atRiskRows = React.useMemo(() => {
    if (!achievementData?.rows) return [];
    return achievementData.rows.filter((r) => r.in_target && r.at_risk);
  }, [achievementData]);

  if (isAch) {
    return (
      <Card
        title="ACH — Keep These WIN (At Risk)"
        Icon={Award}
        iconClass="text-emerald-500"
        meta={`${atRiskRows.length} KPIs at risk`}
        darkMode={darkMode}
      >
        <div className="text-xs text-slate-400 mb-2">
          Target achieved 🎉 Protect these vulnerable WIN/DRAW KPIs from competitor flips:
        </div>
        <div className="overflow-x-auto border rounded-lg border-slate-200 dark:border-slate-800">
          <table className="w-full text-xs text-left">
            <thead
              className={`text-[10px] font-bold uppercase tracking-wider ${
                darkMode ? 'bg-slate-950 text-slate-400' : 'bg-slate-100 text-slate-600'
              }`}
            >
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="p-2">#</th>
                <th className="p-2">KPI</th>
                <th className="p-2 text-right">Tsel Val</th>
                <th className="p-2">Runner-Up</th>
                <th className="p-2 text-right">Margin</th>
                <th className="p-2">Risk Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
              {atRiskRows.map((r, idx) => {
                const isSel = selectedKey === r.key;
                let reason = 'Margin < 1%';
                if (r.status === 'DRAW') {
                  reason = `Draw with ${r.leader || 'OLO'}`;
                } else if (r.source === 'ONX') {
                  reason = 'CI overlap';
                }

                return (
                  <tr
                    key={r.key}
                    onClick={() => onSelectKey && onSelectKey(r.key)}
                    className={`transition-colors cursor-pointer ${
                      isSel
                        ? darkMode
                          ? 'bg-amber-950/40 text-amber-300'
                          : 'bg-amber-50 text-amber-800'
                        : darkMode
                        ? 'hover:bg-slate-800/50'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="p-2 text-slate-400 font-mono">{idx + 1}</td>
                    <td className="p-2 font-bold flex items-center gap-1.5">
                      <span className="truncate">{r.label}</span>
                      <span className="text-[9px] px-1 py-0.2 rounded font-semibold bg-slate-500/10 text-slate-400 uppercase">
                        {r.tech}
                      </span>
                    </td>
                    <td className="p-2 text-right font-mono font-bold">{r.tsel}</td>
                    <td className="p-2 text-slate-500">{r.leader || '–'}</td>
                    <td className="p-2 text-right font-mono text-emerald-500 font-bold">
                      {r.margin !== null ? `+${r.margin}` : '0.00'}
                    </td>
                    <td className="p-2">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30">
                        <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                        {reason}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    );
  }

  // If NOT ACH: show path to target
  return (
    <Card
      title={`Path to Target — ${winsNeeded} More WIN Needed`}
      Icon={Crosshair}
      iconClass="text-rose-500"
      meta="Ranked by Gap %"
      darkMode={darkMode}
    >
      <div className="text-xs text-slate-400 mb-2">
        KPIs closest to turning from LOSE to WIN. Focus on the top {winsNeeded} to hit target:
      </div>
      <div className="overflow-x-auto border rounded-lg border-slate-200 dark:border-slate-800">
        <table className="w-full text-xs text-left">
          <thead
            className={`text-[10px] font-bold uppercase tracking-wider ${
              darkMode ? 'bg-slate-950 text-slate-400' : 'bg-slate-100 text-slate-600'
            }`}
          >
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="p-2">#</th>
              <th className="p-2">KPI</th>
              <th className="p-2 text-right">Tsel</th>
              <th className="p-2">Leader</th>
              <th className="p-2 text-right">Gap</th>
              <th className="p-2 text-right">Gap %</th>
              <th className="p-2 text-right">Need WIN</th>
              <th className="p-2 text-center">Focus</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
            {pathToTarget.map((item, idx) => {
              const isSel = selectedKey === item.key;
              return (
                <tr
                  key={item.key}
                  onClick={() => onSelectKey && onSelectKey(item.key)}
                  className={`transition-colors cursor-pointer ${
                    isSel
                      ? darkMode
                        ? 'bg-blue-950/50 text-blue-300'
                        : 'bg-blue-50 text-blue-800'
                      : darkMode
                      ? 'hover:bg-slate-800/50'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <td className="p-2 text-slate-400 font-mono">{idx + 1}</td>
                  <td className="p-2 font-bold flex items-center gap-1.5">
                    <span className="truncate">{item.label}</span>
                    <span className="text-[9px] px-1 py-0.2 rounded font-semibold bg-slate-500/10 text-slate-400 uppercase">
                      {item.tech}
                    </span>
                  </td>
                  <td className="p-2 text-right font-mono">{item.tsel}</td>
                  <td className="p-2 font-semibold text-slate-600 dark:text-slate-300">
                    {item.leader} ({item.leader_value})
                  </td>
                  <td className="p-2 text-right font-mono font-bold text-rose-500">
                    {item.gap}
                  </td>
                  <td className="p-2 text-right font-mono text-rose-500">
                    {item.gap_pct}%
                  </td>
                  <td className="p-2 text-right font-mono font-bold text-emerald-500">
                    {item.needed_win}
                  </td>
                  <td className="p-2 text-center">
                    {item.focus && (
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-black bg-blue-500 text-white animate-pulse">
                        Focus
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
