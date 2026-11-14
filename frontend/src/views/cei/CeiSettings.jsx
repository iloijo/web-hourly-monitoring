import { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { authHeaders } from '../../api/client';
import { weekLabel } from './charts';

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

// Modal to edit the Good Cell targets and the event remarks shown on the CEI charts (stored in onedb)
export default function CeiSettings({ targets, events, onChange, onClose, darkMode }) {
  const [tWeek, setTWeek] = useState('');
  const [tPct, setTPct] = useState('');
  const [eDate, setEDate] = useState('');
  const [eKind, setEKind] = useState('daily');
  const [eLabel, setELabel] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setBusy(true); setError(null);
    try { onChange(await fn()); } catch (e) { setError(String(e.message || e)); } finally { setBusy(false); }
  };
  const field = `border rounded-md px-2 py-1 text-xs ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200'}`;
  const btn = 'px-3 py-1 rounded-md text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 cursor-pointer';
  const row = `flex items-center justify-between gap-2 px-2 py-1 border-t text-[11px] ${darkMode ? 'border-slate-800' : 'border-slate-100'}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className={`w-full max-w-3xl max-h-[85vh] overflow-auto rounded-2xl border p-4 space-y-4 ${darkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200'}`}>
        <div className="flex items-center justify-between">
          <h2 className="font-black text-sm">CEI Targets &amp; Events</h2>
          <button type="button" onClick={onClose} className="p-1 rounded cursor-pointer opacity-70 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
        {error && <div className="text-xs text-rose-500 font-semibold">{error}</div>}

        <section>
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-blue-500 mb-1">Good Cell target (valid from week until the next change)</h3>
          {targets.map(t => (
            <div key={t.start_week} className={row}>
              <span>From {weekLabel(t.start_week)} {String(t.start_week).slice(0, 4)}: <b>{t.target_pct}%</b></span>
              <button type="button" disabled={busy} onClick={() => run(() => send('DELETE', `/api/cei/targets/${t.start_week}`))} className="text-rose-500 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 mt-2">
            <input className={field} placeholder="Start week YYYYWW" value={tWeek} onChange={e => setTWeek(e.target.value)} />
            <input className={field} placeholder="Target %" value={tPct} onChange={e => setTPct(e.target.value)} />
            <button type="button" className={btn} disabled={busy || !tWeek || !tPct}
              onClick={() => run(async () => { const r = await send('POST', '/api/cei/targets', { start_week: Number(tWeek), target_pct: Number(tPct) }); setTWeek(''); setTPct(''); return r; })}>
              Save target
            </button>
          </div>
        </section>

        <section>
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-blue-500 mb-1">Events (weekly = achievement trend, daily = KQI trend)</h3>
          <div className="flex flex-wrap gap-2 mb-2">
            <input type="date" className={field} value={eDate} onChange={e => setEDate(e.target.value)} />
            <select className={field} value={eKind} onChange={e => setEKind(e.target.value)}>
              <option value="daily">daily</option>
              <option value="weekly">weekly</option>
            </select>
            <input className={`${field} grow min-w-60`} placeholder="Remark" value={eLabel} onChange={e => setELabel(e.target.value)} />
            <button type="button" className={btn} disabled={busy || !eDate || !eLabel.trim()}
              onClick={() => run(async () => { const r = await send('POST', '/api/cei/events', { date: eDate, kind: eKind, label: eLabel }); setELabel(''); return r; })}>
              Add event
            </button>
          </div>
          {[...events].reverse().map(e => (
            <div key={e.id} className={row}>
              <span className="truncate"><b>{e.date}</b> <span className="opacity-60">({weekLabel(e.week)}, {e.kind})</span> {e.label}</span>
              <button type="button" disabled={busy} onClick={() => run(() => send('DELETE', `/api/cei/events/${e.id}`))} className="text-rose-500 cursor-pointer shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
