import { useEffect, useState } from 'react';
import { History, Loader2, Pencil, RotateCcw, Save } from 'lucide-react';
import { getJson, postJson } from '../../../api/client';

// RNO edits of azimuth / M-tilt / E-tilt on top of DESIQA (onedb map_cell_override).
// An edit applies at once and stays until DESIQA carries the same values, or until it is reset.

export const OVERRIDE_COLOR = '#c026d3';
const FIELDS = [
  { id: 'azimuth', label: 'Azimuth', min: 0, max: 360, step: 1 },
  { id: 'mt', label: 'M-Tilt', min: -20, max: 20, step: 0.5 },
  { id: 'et', label: 'E-Tilt', min: -10, max: 20, step: 0.5 },
];
const STATUS_LABEL = {
  active: 'active', replaced: 'replaced', reset: 'reset to DESIQA', synced: 'DESIQA updated',
};
const fmtVal = (v, unit = '°') => (v === null || v === undefined ? '–' : `${v}${unit}`);
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const ref = (c) => ({ site_id: c.site_id, ci: c.ci, cell_name: c.cell_name });

// Edited fields of a cell next to their DESIQA value
export function OverrideInfo({ cell }) {
  const o = cell.override;
  if (!o) return null;
  return (
    <div className="mt-1.5 rounded-md border px-2 py-1" style={{ borderColor: OVERRIDE_COLOR, background: 'rgba(192,38,211,0.07)' }}>
      <div className="font-semibold" style={{ color: OVERRIDE_COLOR }}>
        <Pencil className="w-3 h-3 inline -mt-0.5 mr-1" />
        Edited by {o.edited_by} · {fmtTime(o.edited_at)}
      </div>
      {o.pending.map(f => (
        <div key={f}>
          {FIELDS.find(x => x.id === f)?.label}: <b>{fmtVal(o[f])}</b>
          <span className="opacity-60"> (DESIQA {fmtVal(cell.desiqa?.[f])})</span>
          {o.desiqa_changed.includes(f) && (
            <span className="text-amber-600"> · DESIQA changed from {fmtVal(o[`desiqa_${f}`])} since the edit</span>
          )}
        </div>
      ))}
      {o.note && <div className="italic opacity-80 break-words">“{o.note}”</div>}
      <div className="opacity-60">Applies until DESIQA carries the same value.</div>
    </div>
  );
}

function HistoryList({ cell }) {
  const [state, setState] = useState({ loading: true, rows: null, error: null });
  useEffect(() => {
    let cancelled = false;
    getJson('/api/map/overrides/history', { site_id: cell.site_id })
      .then(j => {
        if (cancelled) return;
        const name = (cell.cell_name || '').toUpperCase();
        setState({ loading: false, error: j.error || null, rows: (j.rows || []).filter(r => r.ci === cell.ci && (r.cell_name || '').toUpperCase() === name) });
      })
      .catch(e => { if (!cancelled) setState({ loading: false, rows: [], error: String(e) }); });
    return () => { cancelled = true; };
  }, [cell.site_id, cell.ci, cell.cell_name]);
  if (state.loading) return <div className="opacity-60 py-1"><Loader2 className="w-3 h-3 inline animate-spin" /> Loading history…</div>;
  if (state.error) return <div className="text-rose-500 py-1">{state.error}</div>;
  if (!state.rows.length) return <div className="opacity-60 py-1">No edits yet for this cell.</div>;
  return (
    <div className="max-h-36 overflow-auto mt-1 space-y-1">
      {state.rows.map(r => (
        <div key={r.id} className="border-l-2 pl-1.5" style={{ borderColor: r.status === 'active' ? OVERRIDE_COLOR : '#94a3b8' }}>
          <div>
            <b>{r.edited_by}</b> <span className="opacity-60">{fmtTime(r.edited_at)}</span>
            <span className="ml-1 px-1 rounded bg-slate-500/15">{STATUS_LABEL[r.status] || r.status}</span>
          </div>
          <div className="opacity-80">
            {FIELDS.filter(f => r[f.id] !== null).map(f => `${f.label} ${fmtVal(r[`desiqa_${f.id}`])} → ${fmtVal(r[f.id])}`).join(' · ') || '–'}
          </div>
          {r.note && <div className="italic opacity-70 break-words">“{r.note}”</div>}
          {r.closed_at && r.status !== 'active' && (
            <div className="opacity-50">closed {fmtTime(r.closed_at)}{r.closed_by ? ` by ${r.closed_by}` : ''}{r.closed_week ? ` (W${r.closed_week})` : ''}</div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Edit / reset / history for one cell inside its popup.
 * sectorCells: the other macro cells of the same site and sector (azimuth can be applied to all of them).
 */
export function CellEditSection({ cell, sectorCells, canEdit, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [form, setForm] = useState(null);
  const [allSector, setAllSector] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const start = () => {
    setForm({ azimuth: cell.azimuth ?? '', mt: cell.mt ?? '', et: cell.et ?? '', note: cell.override?.note || '' });
    setError(null);
    setEditing(true);
  };

  const save = async (e) => {
    e.preventDefault();
    const values = {};
    for (const f of FIELDS) {
      const raw = String(form[f.id]).trim();
      if (raw === '') continue;
      const n = Number(raw.replace(',', '.'));
      if (!Number.isFinite(n) || n < f.min || n > f.max) { setError(`${f.label} must be ${f.min} – ${f.max}.`); return; }
      if (n !== Number(cell[f.id])) values[f.id] = n;
    }
    const note = form.note.trim();
    if (!Object.keys(values).length && note === (cell.override?.note || '')) { setEditing(false); return; }
    if (!Object.keys(values).length) values.azimuth = Number(cell.azimuth); // note only: keep the current values
    setBusy(true);
    setError(null);
    try {
      await postJson('/api/map/overrides', { cells: [ref(cell)], values, note });
      const others = allSector && 'azimuth' in values ? sectorCells.filter(c => Number(c.azimuth) !== values.azimuth) : [];
      if (others.length) await postJson('/api/map/overrides', { cells: others.map(ref), values: { azimuth: values.azimuth }, note });
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    setError(null);
    try {
      await postJson('/api/map/overrides/reset', { cells: [ref(cell)] });
      onSaved();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const input = 'w-full rounded border border-slate-300 px-1 py-0.5 tabular-nums bg-white text-slate-800';
  return (
    <div>
      <OverrideInfo cell={cell} />
      {editing ? (
        <form onSubmit={save} className="mt-1.5 pt-1.5 border-t border-slate-200 space-y-1">
          <div className="font-semibold" style={{ color: OVERRIDE_COLOR }}>Edit (applies immediately)</div>
          <div className="grid grid-cols-3 gap-1">
            {FIELDS.map(f => (
              <label key={f.id} className="block">
                <span className="opacity-60">{f.label}</span>
                <input
                  type="number" step={f.step} min={f.min} max={f.max} className={input} value={form[f.id]}
                  onChange={ev => setForm(p => ({ ...p, [f.id]: ev.target.value }))}
                />
                <span className="opacity-50">DESIQA {fmtVal(cell.desiqa?.[f.id])}</span>
              </label>
            ))}
          </div>
          {sectorCells.length > 0 && (
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={allSector} onChange={ev => setAllSector(ev.target.checked)} />
              Azimuth also for the other {sectorCells.length} cell{sectorCells.length > 1 ? 's' : ''} of sector {cell.sector}
            </label>
          )}
          <input
            className={input} placeholder="Note (reason, MOP, ticket …)" maxLength={300} value={form.note}
            onChange={ev => setForm(p => ({ ...p, note: ev.target.value }))}
          />
          {error && <div className="text-rose-500">{error}</div>}
          <div className="grid grid-cols-2 gap-1">
            <button type="submit" disabled={busy}
              className="flex items-center justify-center gap-1 rounded-md text-white font-semibold py-1 cursor-pointer disabled:opacity-50"
              style={{ background: OVERRIDE_COLOR }}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
            </button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-md border border-slate-300 hover:bg-slate-50 font-semibold py-1 cursor-pointer">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className={`mt-1.5 grid gap-1 ${canEdit && cell.override ? 'grid-cols-3' : canEdit ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {canEdit && (
            <button type="button" onClick={start} disabled={busy}
              className="flex items-center justify-center gap-1 rounded-md border font-semibold py-1 cursor-pointer hover:bg-fuchsia-50"
              style={{ borderColor: OVERRIDE_COLOR, color: OVERRIDE_COLOR }} title="Edit azimuth / M-tilt / E-tilt of this cell">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
          )}
          {canEdit && cell.override && (
            <button type="button" onClick={reset} disabled={busy}
              className="flex items-center justify-center gap-1 rounded-md border border-slate-400 text-slate-600 hover:bg-slate-50 font-semibold py-1 cursor-pointer disabled:opacity-50"
              title="Drop the edit and follow DESIQA again">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Reset
            </button>
          )}
          <button type="button" onClick={() => setShowHistory(v => !v)}
            className={`flex items-center justify-center gap-1 rounded-md border border-slate-300 font-semibold py-1 cursor-pointer ${showHistory ? 'bg-slate-100' : 'hover:bg-slate-50'} text-slate-600`}
            title="Edits of this cell">
            <History className="w-3.5 h-3.5" /> History
          </button>
          {error && <div className="col-span-full text-rose-500">{error}</div>}
        </div>
      )}
      {showHistory && !editing && <HistoryList key={cell.override?.id ?? 'none'} cell={cell} />}
    </div>
  );
}
