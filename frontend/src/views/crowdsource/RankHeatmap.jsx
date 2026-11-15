import React from 'react';
import { STATUS_STRIP } from './charts';
import { weekLabel } from './constants';

// Cell colour: WIN green, DRAW teal, LOSE amber when #2 and red when #3
function cellColor(status, rank, dark) {
  if (status === 'WIN') return STATUS_STRIP.WIN;
  if (status === 'DRAW') return STATUS_STRIP.DRAW;
  if (status === 'LOSE') return rank === 2 ? '#F59E0B' : STATUS_STRIP.LOSE;
  return dark ? '#1e293b' : '#e2e8f0';
}

/**
 * Telkomsel rank per KPI (rows) and week (columns): the whole win / lose history of a KPI group at a glance.
 * Rows are clickable and select the KPI for the detail chart.
 */
export default function RankHeatmap({ charts = [], weeks = [], selectedKey, onSelectKey, darkMode }) {
  if (!charts.length || !weeks.length) return null;
  const step = Math.max(1, Math.ceil(weeks.length / 11));
  const cols = `minmax(150px, 190px) repeat(${weeks.length}, minmax(14px, 1fr)) 64px`;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        {/* Week header */}
        <div className="grid gap-px mb-1 text-[9px] font-semibold text-slate-400" style={{ gridTemplateColumns: cols }}>
          <div />
          {weeks.map((w, i) => (
            <div key={w} className="text-center overflow-visible whitespace-nowrap">
              {i % step === 0 || i === weeks.length - 1 ? `W${String(w).slice(4)}` : ''}
            </div>
          ))}
          <div className="text-right pr-1">Win wks</div>
        </div>

        {charts.map((c) => {
          const hist = c.status_hist || [];
          const won = hist.filter((s) => s === 'WIN' || s === 'DRAW').length;
          const ranked = hist.filter(Boolean).length;
          const active = c.key === selectedKey;
          return (
            <div
              key={c.key}
              role="button"
              tabIndex={0}
              onClick={() => onSelectKey?.(c.key)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSelectKey?.(c.key);
              }}
              className={`grid gap-px items-center py-px rounded cursor-pointer ${
                active ? (darkMode ? 'bg-slate-800' : 'bg-blue-50') : darkMode ? 'hover:bg-slate-800/60' : 'hover:bg-slate-50'
              }`}
              style={{ gridTemplateColumns: cols }}
            >
              <div className={`text-[11px] font-semibold truncate pr-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                {c.label}
                {!c.in_target && <span className="ml-1 text-[9px] font-normal text-slate-400">(non-target)</span>}
              </div>
              {weeks.map((w, i) => {
                const rk = c.rank_hist?.[i];
                const st = hist[i];
                return (
                  <div
                    key={w}
                    title={`${c.label} · ${weekLabel(w)} · ${st || 'no data'}${rk ? ` (#${rk})` : ''}`}
                    className={`h-5 rounded-[3px] flex items-center justify-center text-[9px] font-bold text-white/90 ${
                      i === weeks.length - 1 ? 'ring-2 ring-offset-1 ring-blue-500/70 ' + (darkMode ? 'ring-offset-slate-900' : 'ring-offset-white') : ''
                    }`}
                    style={{ background: cellColor(st, rk, darkMode) }}
                  >
                    {weeks.length <= 26 && rk ? rk : ''}
                  </div>
                );
              })}
              <div className="text-right pr-1 text-[11px] font-bold tabular-nums">
                <span className={won / Math.max(1, ranked) >= 0.5 ? 'text-emerald-500' : 'text-rose-500'}>{won}</span>
                <span className="text-slate-400 font-medium">/{ranked}</span>
              </div>
            </div>
          );
        })}

        <div className="flex flex-wrap items-center gap-3 mt-2 text-[10px] font-semibold text-slate-400">
          {[
            ['WIN (#1)', STATUS_STRIP.WIN],
            ['DRAW (#1 shared)', STATUS_STRIP.DRAW],
            ['LOSE #2', '#F59E0B'],
            ['LOSE #3', STATUS_STRIP.LOSE],
          ].map(([t, c]) => (
            <span key={t} className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-[3px]" style={{ background: c }} />
              {t}
            </span>
          ))}
          <span>· outlined column = selected week · click a row for the detail chart</span>
        </div>
      </div>
    </div>
  );
}
