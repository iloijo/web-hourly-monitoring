import React, { useEffect, useRef, useState } from 'react';
import { LayoutGrid } from 'lucide-react';
import { getJson } from '../../api/client';
import SegmentedToggle from '../../components/filters/SegmentedToggle';
import { Card, Chart, Spinner } from '../cei/ui';
import { STATUS_STRIP, fmtNum, gridTrendOption } from './charts';
import RankHeatmap from './RankHeatmap';
import { OPERATOR_COLORS, weekLabel } from './constants';

const GROUP_OPTIONS = [
  ['onx_overall', 'OS Overall'],
  ['onx_5g', 'OS 5G'],
  ['ookla_all', 'Ookla Overall'],
  ['ookla_5g', 'Ookla 5G'],
  ['ookla_4g', 'Ookla 4G'],
];
const RANGE_OPTIONS = [
  [0, 'YTD'],
  [26, '26 W'],
  [13, '13 W'],
];
const RANK_BADGE = { 1: 'bg-emerald-600', 2: 'bg-amber-500', 3: 'bg-rose-600' };
const OP_NAME = { TSEL: 'Telkomsel', IOH: 'Indosat', XLSMART: 'XL' };
const GRID_KEY = 'netpulse_crowd_grid';

function readStored() {
  try {
    const v = JSON.parse(localStorage.getItem(GRID_KEY) || '{}');
    return {
      group: GROUP_OPTIONS.some(([g]) => g === v.group) ? v.group : 'onx_overall',
      weeks: RANGE_OPTIONS.some(([w]) => w === v.weeks) ? v.weeks : 0,
    };
  } catch {
    return { group: 'onx_overall', weeks: 0 };
  }
}

/** Grid of small operator-trend charts, one per KPI, with Telkomsel's rank badge (PPT trend slides). */
export default function KpiTrendGrid({ region, week, selectedKey, onSelectKey, darkMode }) {
  const [opts, setOpts] = useState(readStored);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const seq = useRef(0);

  const update = (partial) => {
    setOpts((prev) => {
      const next = { ...prev, ...partial };
      try {
        localStorage.setItem(GRID_KEY, JSON.stringify(next));
      } catch {
        // storage unavailable
      }
      return next;
    });
  };

  useEffect(() => {
    if (!region || !week) return;
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    getJson('/api/crowdsource/trend-grid', { group: opts.group, region, week, weeks: opts.weeks })
      .then((d) => {
        if (id !== seq.current) return;
        if (d?.error) setError(d.error);
        setData(d);
      })
      .catch((e) => {
        if (id === seq.current) setError(String(e.message || e));
      })
      .finally(() => {
        if (id === seq.current) setLoading(false);
      });
  }, [region, week, opts.group, opts.weeks]);

  const weeks = data?.weeks || [];
  const range = weeks.length ? `${weekLabel(weeks[0])} – ${weekLabel(weeks[weeks.length - 1])}` : '';

  return (
    <Card
      title={`KPI Trend Achievement — ${data?.label || ''} ${region || ''}`}
      Icon={LayoutGrid}
      iconClass="text-rose-500"
      darkMode={darkMode}
      meta={range}
    >
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div className="flex flex-wrap items-end gap-3">
          <SegmentedToggle label="KPI group" options={GROUP_OPTIONS} value={opts.group} onChange={(g) => update({ group: g })} darkMode={darkMode} />
          <SegmentedToggle label="Range" options={RANGE_OPTIONS} value={opts.weeks} onChange={(w) => update({ weeks: w })} darkMode={darkMode} />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-slate-400">
          {['TSEL', 'IOH', 'XLSMART'].map((op) => (
            <span key={op} className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 rounded" style={{ background: OPERATOR_COLORS[op] }} />
              {OP_NAME[op]}
            </span>
          ))}
          <span className={`flex items-center gap-1.5 pl-2 border-l ${darkMode ? 'border-slate-700' : 'border-slate-300'}`}>
            <span className="w-3 h-2.5 rounded-sm bg-emerald-500/30" />
            ahead
            <span className="w-3 h-2.5 rounded-sm bg-rose-500/25" />
            behind best OLO
          </span>
          <span className="flex items-center gap-1">
            <span className="flex">
              <span className="w-1.5 h-2 bg-emerald-600" />
              <span className="w-1.5 h-2 bg-teal-500" />
              <span className="w-1.5 h-2 bg-rose-600" />
            </span>
            weekly status
          </span>
        </div>
      </div>

      {error && <div className="mb-2 text-xs font-semibold text-rose-500">{error}</div>}

      {loading && !data ? (
        <Spinner text="Loading KPI trends..." />
      ) : (
        <>
        {/* Rank heatmap: whole win / lose history of the group */}
        <div className={`mb-3 p-3 rounded-lg border ${darkMode ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-slate-50/60'} ${loading ? 'opacity-60' : ''}`}>
          <div className={`mb-2 text-[11px] font-bold uppercase tracking-wider ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
            Telkomsel rank heatmap
          </div>
          <RankHeatmap
            charts={data?.charts}
            weeks={weeks}
            selectedKey={selectedKey}
            onSelectKey={onSelectKey}
            darkMode={darkMode}
          />
        </div>
        <div className={`grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3 ${loading ? 'opacity-60' : ''}`}>
          {(data?.charts || []).map((c) => {
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
                className={`p-2.5 rounded-lg border transition cursor-pointer min-w-0 ${
                  active
                    ? 'border-blue-500 ring-1 ring-blue-500/40'
                    : darkMode
                      ? 'border-slate-800 hover:border-slate-600'
                      : 'border-slate-200 hover:border-slate-400'
                }`}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={`w-6 h-6 mt-0.5 shrink-0 rounded-full flex items-center justify-center text-white text-xs font-black ${
                      RANK_BADGE[c.rank] || 'bg-slate-400'
                    }`}
                  >
                    {c.rank ?? '–'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-bold truncate ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                        {c.label}
                      </span>
                      {c.status && (
                        <span
                          className="px-1.5 rounded text-[9px] font-black text-white shrink-0"
                          style={{ background: STATUS_STRIP[c.status] }}
                        >
                          {c.status}
                        </span>
                      )}
                      {!c.in_target && <span className="text-[9px] font-semibold text-slate-400 shrink-0">non-target</span>}
                    </div>
                    <div className="flex flex-wrap items-baseline gap-x-2.5 text-[11px] tabular-nums">
                      <span className={`text-base font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        {fmtNum(c.value)}
                        <span className="ml-0.5 text-[10px] font-semibold text-slate-400">{c.unit}</span>
                      </span>
                      {c.wow !== null && c.wow !== undefined && (
                        <span className={`font-bold ${c.wow > 0 ? 'text-emerald-500' : c.wow < 0 ? 'text-rose-500' : 'text-slate-400'}`}>
                          {c.wow > 0 ? '▲' : c.wow < 0 ? '▼' : '■'} {fmtNum(Math.abs(c.wow))} WoW
                        </span>
                      )}
                      {c.gap !== null && c.gap !== undefined && c.leader && (
                        <span className={`font-semibold ${c.gap >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {c.gap >= 0 ? '+' : '−'}
                          {fmtNum(Math.abs(c.gap))} vs {OP_NAME[c.leader] || c.leader}
                        </span>
                      )}
                      {c.needed_win !== null && c.needed_win !== undefined && (
                        <span className="font-semibold text-rose-500">need {fmtNum(c.needed_win)}</span>
                      )}
                    </div>
                  </div>
                </div>
                <Chart option={gridTrendOption(c, weeks, darkMode)} h={200} />
              </div>
            );
          })}
        </div>
        </>
      )}
    </Card>
  );
}
