import React, { useState } from 'react';
import { Plus, Trash2, X, Target } from 'lucide-react';
import { authHeaders } from '../../api/client';
import { weekLabel } from './constants';

async function send(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export default function CrowdSettings({
  targets = [],
  manual = [],
  onChange,
  onClose,
  darkMode,
}) {
  const [tab, setTab] = useState('targets');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Target form state
  const [tSource, setTSource] = useState('ONX');
  const [tRegion, setTRegion] = useState('SULAWESI');
  const [tStartWeek, setTStartWeek] = useState('');
  const [tTargetWin, setTTargetWin] = useState('');
  const [tShowChart, setTShowChart] = useState(false);

  // Manual KPI form state
  const [mRegion, setMRegion] = useState('SULAWESI');
  const [mWeek, setMWeek] = useState('');
  const [mKpiKey, setMKpiKey] = useState('ook_coverage_all');
  const [mValue, setMValue] = useState('');
  const [mStatus, setMStatus] = useState('WIN');

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      if (onChange) onChange(res);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const field = `border rounded-md px-2.5 py-1 text-xs ${
    darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200'
  }`;
  const btn =
    'px-3 py-1 rounded-md text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 cursor-pointer flex items-center gap-1';
  const row = `flex items-center justify-between gap-2 px-3 py-1.5 border-t text-xs ${
    darkMode ? 'border-slate-800' : 'border-slate-100'
  }`;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-2xl max-h-[85vh] overflow-auto rounded-2xl border p-5 space-y-4 shadow-2xl ${
          darkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
        }`}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b pb-3 border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-emerald-500" />
            <h2 className="font-black text-sm">Crowdsource Settings (SuperAdmin)</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded cursor-pointer opacity-70 hover:opacity-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="text-xs bg-rose-500/10 border border-rose-500/30 text-rose-500 p-2.5 rounded-lg font-bold">
            {error}
          </div>
        )}

        {/* Tab Header */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 gap-4 text-xs font-bold">
          <button
            type="button"
            onClick={() => setTab('targets')}
            className={`pb-2 border-b-2 transition cursor-pointer ${
              tab === 'targets'
                ? 'border-blue-500 text-blue-500'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            WIN Targets ({targets.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('manual')}
            className={`pb-2 border-b-2 transition cursor-pointer ${
              tab === 'manual'
                ? 'border-blue-500 text-blue-500'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Manual KPIs ({manual.length})
          </button>
        </div>

        {/* Tab 1: Targets */}
        {tab === 'targets' && (
          <section className="space-y-3">
            <div className="text-[11px] text-slate-400">
              Target WIN valid starting from the specified week until the next target row.
            </div>
            <div className="border rounded-lg border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
              {targets.map((t) => (
                <div key={`${t.source}_${t.region}_${t.start_week}`} className={row}>
                  <div className="flex items-center gap-3">
                    <span className="font-extrabold text-blue-500 w-16">{t.source}</span>
                    <span className="text-slate-400">{t.region}</span>
                    <span className="font-semibold">{weekLabel(t.start_week)}:</span>
                    <span className="font-black text-emerald-500">{t.target_win} WIN</span>
                    {t.show_on_chart && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold">
                        Chart Line
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        send(
                          'DELETE',
                          `/api/crowdsource/targets/${t.source}/${t.region}/${t.start_week}`
                        )
                      )
                    }
                    className="p-1 text-rose-500 hover:text-rose-600 cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add Target Form */}
            <div className="pt-2">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                Add / Update Target
              </h4>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={tSource}
                  onChange={(e) => setTSource(e.target.value)}
                  className={field}
                >
                  <option value="ONX">ONX (OpenSignal)</option>
                  <option value="OOKLA">OOKLA</option>
                </select>
                <input
                  className={field}
                  placeholder="Region"
                  value={tRegion}
                  onChange={(e) => setTRegion(e.target.value)}
                />
                <input
                  className={field}
                  placeholder="Start week YYYYWW (e.g. 202641)"
                  value={tStartWeek}
                  onChange={(e) => setTStartWeek(e.target.value)}
                />
                <input
                  className={field}
                  placeholder="Target WIN"
                  value={tTargetWin}
                  onChange={(e) => setTTargetWin(e.target.value)}
                />
                <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tShowChart}
                    onChange={(e) => setTShowChart(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-0"
                  />
                  <span>Show line on chart</span>
                </label>
                <button
                  type="button"
                  className={btn}
                  disabled={busy || !tStartWeek || !tTargetWin}
                  onClick={() =>
                    run(async () => {
                      const res = await send('POST', '/api/crowdsource/targets', {
                        source: tSource,
                        region: tRegion,
                        start_week: Number(tStartWeek),
                        target_win: Number(tTargetWin),
                        show_on_chart: tShowChart,
                      });
                      setTStartWeek('');
                      setTTargetWin('');
                      return res;
                    })
                  }
                >
                  <Plus className="w-3.5 h-3.5" />
                  Save Target
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Tab 2: Manual KPI */}
        {tab === 'manual' && (
          <section className="space-y-3">
            <div className="text-[11px] text-slate-400">
              Manual scores for Ookla Coverage and Top Rated. Values carry forward automatically to later weeks until updated.
            </div>
            <div className="border rounded-lg border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
              {manual.map((m) => (
                <div key={`${m.region}_${m.yearweek}_${m.kpi_key}`} className={row}>
                  <div className="flex items-center gap-3">
                    <span className="font-bold">{weekLabel(m.yearweek)}:</span>
                    <span className="font-extrabold text-amber-500">
                      {m.kpi_key === 'ook_coverage_all' ? 'Coverage' : 'Top Rated'}
                    </span>
                    <span className="font-mono">{m.tsel_value ?? '–'}</span>
                    <span
                      className={`text-[10px] font-black px-1.5 py-0.2 rounded ${
                        m.status === 'WIN'
                          ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                          : m.status === 'DRAW'
                          ? 'bg-teal-500/15 text-teal-500 border border-teal-500/30'
                          : 'bg-rose-500/15 text-rose-500 border border-rose-500/30'
                      }`}
                    >
                      {m.status}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        send(
                          'DELETE',
                          `/api/crowdsource/manual/${m.region}/${m.yearweek}/${m.kpi_key}`
                        )
                      )
                    }
                    className="p-1 text-rose-500 hover:text-rose-600 cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add Manual Form */}
            <div className="pt-2">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                Add / Update Manual Score
              </h4>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className={field}
                  placeholder="Region"
                  value={mRegion}
                  onChange={(e) => setMRegion(e.target.value)}
                />
                <input
                  className={field}
                  placeholder="Week YYYYWW (e.g. 202644)"
                  value={mWeek}
                  onChange={(e) => setMWeek(e.target.value)}
                />
                <select
                  value={mKpiKey}
                  onChange={(e) => setMKpiKey(e.target.value)}
                  className={field}
                >
                  <option value="ook_coverage_all">Coverage (ook_coverage_all)</option>
                  <option value="ook_toprated_all">Top Rated (ook_toprated_all)</option>
                </select>
                <input
                  className={field}
                  placeholder="Tsel Score"
                  value={mValue}
                  onChange={(e) => setMValue(e.target.value)}
                />
                <select
                  value={mStatus}
                  onChange={(e) => setMStatus(e.target.value)}
                  className={field}
                >
                  <option value="WIN">WIN</option>
                  <option value="DRAW">DRAW</option>
                  <option value="LOSE">LOSE</option>
                </select>
                <button
                  type="button"
                  className={btn}
                  disabled={busy || !mWeek || !mValue}
                  onClick={() =>
                    run(async () => {
                      const res = await send('POST', '/api/crowdsource/manual', {
                        region: mRegion,
                        yearweek: Number(mWeek),
                        kpi_key: mKpiKey,
                        tsel_value: Number(mValue),
                        status: mStatus,
                      });
                      setMWeek('');
                      setMValue('');
                      return res;
                    })
                  }
                >
                  <Plus className="w-3.5 h-3.5" />
                  Save Manual KPI
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
