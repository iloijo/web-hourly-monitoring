import React from 'react';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  Radio,
  Signal,
  Target,
  XCircle,
} from 'lucide-react';
import { Tile } from '../cei/ui';

export default function SummaryTiles({ tiles, darkMode }) {
  if (!tiles) return null;

  const total = tiles.TOTAL || {};
  const onx = tiles.ONX || {};
  const ook = tiles.OOKLA || {};

  const isAch = total.achievement === 'ACH';
  const onxPass = onx.wins >= onx.target;
  const ookPass = ook.wins >= ook.target;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5 mb-4">
      {/* 1. TOTAL WIN (Official Status) */}
      <Tile
        label="Total Win"
        Icon={Award}
        iconClass={isAch ? 'text-emerald-500' : 'text-rose-500'}
        value={`${total.wins ?? 0} / ${total.target ?? 0}`}
        valueClass={isAch ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}
        darkMode={darkMode}
      >
        <div className="flex items-center justify-between mt-1">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-black text-xs ${
              isAch
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
            }`}
          >
            {isAch ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
            {total.achievement || 'NOT ACH'}
          </span>
          <span className="text-slate-400 text-[10px]">
            {total.total ?? 26} KPI portofolio
          </span>
        </div>
      </Tile>

      {/* 2. OpenSignal */}
      <Tile
        label="OpenSignal"
        Icon={Signal}
        iconClass={onxPass ? 'text-emerald-500' : 'text-rose-500'}
        value={`${onx.wins ?? 0} WIN`}
        valueClass={onxPass ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}
        darkMode={darkMode}
      >
        <div className="flex items-center justify-between mt-1 text-slate-400">
          <span>Target {onx.target ?? 8}</span>
          <span className="text-[10px]">
            ({onx.win ?? 0} win · {onx.draw ?? 0} draw)
          </span>
        </div>
      </Tile>

      {/* 3. Ookla */}
      <Tile
        label="Ookla"
        Icon={Radio}
        iconClass={ookPass ? 'text-emerald-500' : 'text-rose-500'}
        value={`${ook.wins ?? 0} WIN`}
        valueClass={ookPass ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}
        darkMode={darkMode}
      >
        <div className="flex items-center justify-between mt-1 text-slate-400">
          <span>Target {ook.target ?? 4}</span>
          {ook.manual ? (
            <span
              className="text-[10px] text-amber-500 font-semibold"
              title="Coverage & Top Rated from manual input"
            >
              ({ook.manual} ✎ manual)
            </span>
          ) : null}
        </div>
      </Tile>

      {/* 4. Wins Needed */}
      <Tile
        label="Wins Needed"
        Icon={Target}
        iconClass="text-blue-500"
        value={total.wins_needed ?? 0}
        valueClass={total.wins_needed === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500'}
        darkMode={darkMode}
      >
        <div className="mt-1 text-slate-400">
          {total.wins_needed === 0 ? (
            <span className="text-emerald-500 font-semibold">Target Achieved 🎉</span>
          ) : (
            <span>Need {total.wins_needed} more WIN to pass</span>
          )}
        </div>
      </Tile>

      {/* 5. WoW & At Risk */}
      <Tile
        label="WoW / At Risk"
        Icon={AlertTriangle}
        iconClass="text-amber-500"
        value={
          <div className="flex items-center gap-2">
            <span className="text-lg">
              ONX {onx.wow_wins >= 0 ? `+${onx.wow_wins}` : onx.wow_wins}
            </span>
            <span className="text-slate-400 text-sm">·</span>
            <span className="text-lg">
              Ookla {ook.wow_wins >= 0 ? `+${ook.wow_wins}` : ook.wow_wins}
            </span>
          </div>
        }
        valueClass="text-slate-800 dark:text-slate-200"
        darkMode={darkMode}
      >
        <div className="flex items-center justify-between mt-1 text-slate-400">
          <span className="text-amber-500 font-bold flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {(onx.at_risk || 0) + (ook.at_risk || 0)} WIN at risk
          </span>
          <span className="text-[10px]">
            (ONX {onx.at_risk || 0} · Ook {ook.at_risk || 0})
          </span>
        </div>
      </Tile>
    </div>
  );
}
