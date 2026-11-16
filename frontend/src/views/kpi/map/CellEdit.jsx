import { useEffect, useState } from 'react';
import { AlertTriangle, History, Loader2, Pencil, RotateCcw, Save, Trash2, Undo2 } from 'lucide-react';
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
  active: 'active', replaced: 'replaced', reset: 'reset to DESIQA', synced: 'DESIQA updated', rolledback: 'rolled back',
};
// "Restore of X – Restore of Y – reason" → "reason": a restore keeps only the original note
const baseNote = (n) => (n || '').replace(/^(Restore of [^–]*–\s*)+/, '').replace(/^Restore of [^–]*$/, '').trim();
const fmtVal = (v, unit = '°') => (v === null || v === undefined ? '–' : `${v}${unit}`);
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const ref = (c) => ({ site_id: c.site_id, ci: c.ci, cell_name: c.cell_name });

// A change bigger than this (vs DESIQA or vs the value on the map) needs a second click to save
export const WARN_DELTA = { azimuth: 30, mt: 4, et: 4 };
// signed difference a - b; azimuth wraps around 360
export const fieldDelta = (f, a, b) => {
  if (a === null || a === undefined || a === '' || b === null || b === undefined || b === '') return null;
  const d = Number(a) - Number(b);
  return f === 'azimuth' ? ((d % 360) + 540) % 360 - 180 : d;
};
export const fmtDelta = (d) => (d === null ? '' : `${d > 0 ? '+' : ''}${Math.round(d * 10) / 10}°`);
const isBig = (f, d) => d !== null && Math.abs(d) > WARN_DELTA[f];
const parseNum = (raw) => {
  const t = String(raw ?? '').trim();
  return t === '' ? null : Number(t.replace(',', '.'));
};

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

// Edits of one cell. `version` changes after every save / undo / reset: the list then reloads in place
// (the old rows stay while loading, so the popup keeps its height and scroll position).
function HistoryList({ cell, canEdit, me, onRestore, busy, version }) {
  const [state, setState] = useState({ loading: true, rows: null, error: null });
  const [showDeleted, setShowDeleted] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const [rowBusy, setRowBusy] = useState(null);
  const [rowError, setRowError] = useState(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setState(s => ({ ...s, loading: true }));
    getJson('/api/map/overrides/history', { site_id: cell.site_id, ...(showDeleted ? { include_deleted: true } : {}) })
      .then(j => {
        if (cancelled) return;
        const name = (cell.cell_name || '').toUpperCase();
        setState({ loading: false, error: j.error || null, rows: (j.rows || []).filter(r => r.ci === cell.ci && (r.cell_name || '').toUpperCase() === name) });
      })
      .catch(e => { if (!cancelled) setState(s => ({ loading: false, rows: s.rows || [], error: String(e) })); });
    return () => { cancelled = true; };
  }, [cell.site_id, cell.ci, cell.cell_name, version, showDeleted, reload]);

  const canDelete = (r) => canEdit && r.status !== 'active' && !r.deleted_at
    && (me?.isSuper || (me?.username && (r.edited_by || '').toLowerCase() === me.username.toLowerCase()));
  const remove = async (r) => {
    setRowBusy(r.id);
    setRowError(null);
    try {
      await postJson('/api/map/overrides/delete', { id: r.id });
      setConfirmId(null);
      setReload(x => x + 1);
    } catch (e) {
      setRowError({ id: r.id, text: e.message || String(e) });
    } finally {
      setRowBusy(null);
    }
  };

  if (state.rows === null) return <div className="opacity-60 py-1"><Loader2 className="w-3 h-3 inline animate-spin" /> Loading history…</div>;
  const mini = 'shrink-0 flex items-center gap-0.5 px-1 rounded border cursor-pointer disabled:opacity-40';
  return (
    <div className="mt-1">
      <div className="flex items-center gap-2 opacity-70">
        <span className="font-semibold">History</span>
        {state.loading && <Loader2 className="w-3 h-3 animate-spin" />}
        {me?.isSuper && (
          <label className="ml-auto flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={showDeleted} onChange={e => setShowDeleted(e.target.checked)} /> Show deleted
          </label>
        )}
      </div>
      {state.error && <div className="text-rose-500 py-1">{state.error}</div>}
      {!state.rows.length && !state.error && <div className="opacity-60 py-1">No edits yet for this cell.</div>}
      <div className="max-h-48 overflow-auto space-y-1">
        {state.rows.map(r => (
          <div key={r.id} className={`border-l-2 pl-1.5 ${r.deleted_at ? 'opacity-50' : ''}`}
            style={{ borderColor: r.status === 'active' ? OVERRIDE_COLOR : '#94a3b8' }}>
            <div className="flex items-center gap-1">
              <span className="flex-1 min-w-0">
                <b>{r.edited_by}</b> <span className="opacity-60">{fmtTime(r.edited_at)}</span>
                <span className="ml-1 px-1 rounded bg-slate-500/15">{r.deleted_at ? 'deleted' : (STATUS_LABEL[r.status] || r.status)}</span>
              </span>
              {canEdit && !r.deleted_at && confirmId !== r.id && (r.status === 'replaced' || r.status === 'reset' || r.status === 'rolledback') && (
                <button type="button" disabled={busy || rowBusy !== null} onClick={() => onRestore(r)}
                  className={`${mini} border-slate-300 hover:bg-slate-100`}
                  title="Apply these values again (fields this edit did not touch follow DESIQA)">
                  <Undo2 className="w-3 h-3" /> Restore
                </button>
              )}
              {canDelete(r) && confirmId !== r.id && (
                <button type="button" disabled={busy || rowBusy !== null} onClick={() => { setConfirmId(r.id); setRowError(null); }}
                  className={`${mini} border-rose-300 text-rose-600 hover:bg-rose-50`}
                  title="Hide this edit from History (kept in the database for the audit)">
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
              {confirmId === r.id && (
                <>
                  <span className="text-rose-600 font-semibold">Delete?</span>
                  <button type="button" disabled={rowBusy !== null} onClick={() => remove(r)}
                    className={`${mini} border-rose-500 bg-rose-600 text-white hover:bg-rose-700`}>
                    {rowBusy === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Yes'}
                  </button>
                  <button type="button" disabled={rowBusy !== null} onClick={() => setConfirmId(null)}
                    className={`${mini} border-slate-300 hover:bg-slate-100`}>No</button>
                </>
              )}
            </div>
            <div className="opacity-80">
              {FIELDS.filter(f => r[f.id] !== null).map(f => `${f.label} ${fmtVal(r[`desiqa_${f.id}`])} → ${fmtVal(r[f.id])}`).join(' · ') || '–'}
            </div>
            {r.note && <div className="italic opacity-70 break-words">“{r.note}”</div>}
            {r.closed_at && r.status !== 'active' && (
              <div className="opacity-50">closed {fmtTime(r.closed_at)}{r.closed_by ? ` by ${r.closed_by}` : ''}{r.closed_week ? ` (W${r.closed_week})` : ''}</div>
            )}
            {r.deleted_at && <div className="opacity-60">deleted {fmtTime(r.deleted_at)} by {r.deleted_by}</div>}
            {rowError?.id === r.id && <div className="text-rose-500">{rowError.text}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Edit / reset / history for one cell inside its popup.
 * sectorCells: the other macro cells of the same site and sector (azimuth can be applied to all of them).
 *
 * Guards against a wrong edit: each field shows its DESIQA value with a one-click fallback, the change is
 * summarised before saving, a big change (WARN_DELTA) needs a second click, a sector can be reset at once,
 * an older edit can be restored from History, and Undo steps back one change (of this cell, or of the
 * whole save when it covered several cells). History rows can be soft deleted.
 * me: {username, isSuper} of the viewer; batchCells: cells whose active edit came from this cell's save.
 */
export function CellEditSection({ cell, sectorCells, canEdit, me, batchCells = [], onSaved }) {
  const [editing, setEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [form, setForm] = useState(null);
  const [allSector, setAllSector] = useState(false);
  const [confirm, setConfirm] = useState(null);   // warnings waiting for the second click
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const changed = () => { setHistoryVersion(v => v + 1); onSaved(); };

  // cells of this sector that carry an edit (Reset sector)
  const editedSector = [cell, ...sectorCells].filter(c => c.override);

  const start = () => {
    setForm({ azimuth: cell.azimuth ?? '', mt: cell.mt ?? '', et: cell.et ?? '', note: cell.override?.note || '' });
    // copy the azimuth to the sector by default only when the sector cells already share this cell's azimuth
    setAllSector(sectorCells.length > 0 && sectorCells.every(c => Math.abs(fieldDelta('azimuth', c.azimuth, cell.azimuth) ?? 99) < 1));
    setConfirm(null);
    setError(null);
    setEditing(true);
  };
  const setField = (id, v) => { setForm(p => ({ ...p, [id]: v })); setConfirm(null); };

  // fields that change, with their delta vs the map value and vs DESIQA
  const changes = () => {
    const list = [];
    for (const f of FIELDS) {
      const n = parseNum(form[f.id]);
      if (n === null) continue;
      if (!Number.isFinite(n) || n < f.min || n > f.max) return { list, error: `${f.label} must be ${f.min} – ${f.max}.` };
      if (n === Number(cell[f.id])) continue;
      list.push({ f, value: n, dNow: fieldDelta(f.id, n, cell[f.id]), dDesiqa: fieldDelta(f.id, n, cell.desiqa?.[f.id]) });
    }
    return { list };
  };

  const warnings = (list, sectorOthers) => {
    const w = [];
    for (const c of list) {
      if (isBig(c.f.id, c.dDesiqa)) {
        w.push(`${c.f.label} ${fmtDelta(c.dDesiqa)} from DESIQA (${fmtVal(cell.desiqa?.[c.f.id])} → ${fmtVal(c.value)})`);
      } else if (isBig(c.f.id, c.dNow)) {
        w.push(`${c.f.label} ${fmtDelta(c.dNow)} from the current value (${fmtVal(cell[c.f.id])} → ${fmtVal(c.value)})`);
      }
    }
    const az = list.find(c => c.f.id === 'azimuth');
    if (az && sectorOthers.length) {
      const far = sectorOthers.filter(c => isBig('azimuth', fieldDelta('azimuth', az.value, c.desiqa?.azimuth ?? c.azimuth)));
      if (far.length) w.push(`Also moves ${far.map(c => c.cell_name).join(', ')} more than ${WARN_DELTA.azimuth}° from their DESIQA azimuth`);
    }
    return w;
  };

  const post = (cells, values, note, batchId) =>
    postJson('/api/map/overrides', { cells: cells.map(ref), values, note, ...(batchId ? { batch_id: batchId } : {}) });

  const save = async (e) => {
    e?.preventDefault();
    const { list, error: err } = changes();
    if (err) { setError(err); return; }
    const note = form.note.trim();
    if (!list.length && note === (cell.override?.note || '')) { setEditing(false); return; }
    const values = Object.fromEntries(list.map(c => [c.f.id, c.value]));
    const others = allSector && 'azimuth' in values ? sectorCells.filter(c => Number(c.azimuth) !== values.azimuth) : [];
    if (!confirm) {
      const w = warnings(list, others);
      if (w.length) { setConfirm(w); return; }
    }
    if (!list.length) values.azimuth = Number(cell.azimuth); // note only: keep the current values
    setBusy(true);
    setError(null);
    try {
      // one batch: Undo save rolls back this cell and the rest of the sector together
      const first = await post([cell], values, note);
      if (others.length) await post(others, { azimuth: values.azimuth }, note, first?.batch_id);
      setEditing(false);
      setConfirm(null);
      changed();
    } catch (er) {
      setError(er.message || String(er));
    } finally {
      setBusy(false);
    }
  };

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      changed();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };
  const reset = (cells) => run(() => postJson('/api/map/overrides/reset', { cells: cells.map(ref) }));
  // restore an older edit: its edited fields come back, the fields it did not touch follow DESIQA
  const restore = (r) => run(() => {
    const values = {};
    for (const f of FIELDS) {
      const v = r[f.id] ?? cell.desiqa?.[f.id];
      if (v !== null && v !== undefined) values[f.id] = v;
    }
    const orig = baseNote(r.note);
    const note = `Restore of ${r.edited_by} ${fmtTime(r.edited_at)}${orig ? ` – ${orig}` : ''}`.slice(0, 300);
    return post([cell], values, note);
  });
  // undo the latest change of this cell, or of every cell of its last save
  const undo = (batchId) => run(() => postJson('/api/map/overrides/rollback',
    batchId ? { batch_id: batchId } : { cells: [ref(cell)] }));
  const batchId = cell.override?.batch_id;

  const input = 'w-full rounded border border-slate-300 px-1 py-0.5 tabular-nums bg-white text-slate-800';
  const pending = editing ? changes() : null;
  const btn = 'flex flex-1 items-center justify-center gap-1 rounded-md border font-semibold py-1 px-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap';
  return (
    <div>
      <OverrideInfo cell={cell} />
      {editing ? (
        <form onSubmit={save} className="mt-1.5 pt-1.5 border-t border-slate-200 space-y-1">
          <div className="font-semibold" style={{ color: OVERRIDE_COLOR }}>Edit (applies immediately)</div>
          <div className="grid grid-cols-3 gap-1">
            {FIELDS.map(f => {
              const n = parseNum(form[f.id]);
              const dq = cell.desiqa?.[f.id];
              const d = Number.isFinite(n) ? fieldDelta(f.id, n, dq) : null;
              const atDesiqa = d !== null && Math.abs(d) < 0.05;
              return (
                <div key={f.id}>
                  <label className="block">
                    <span className="opacity-60">{f.label}</span>
                    <input
                      type="number" step={f.step} min={f.min} max={f.max} className={input} value={form[f.id]}
                      style={isBig(f.id, d) ? { borderColor: '#d97706', background: '#fffbeb' } : undefined}
                      onChange={ev => setField(f.id, ev.target.value)}
                    />
                  </label>
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="opacity-50">DESIQA {fmtVal(dq)}</span>
                    {!atDesiqa && d !== null && (
                      <span className={isBig(f.id, d) ? 'text-amber-600 font-semibold' : 'opacity-60'}>{fmtDelta(d)}</span>
                    )}
                    {!atDesiqa && dq !== null && dq !== undefined && (
                      <button type="button" onClick={() => setField(f.id, dq)}
                        className="px-0.5 rounded border border-slate-300 hover:bg-slate-100 cursor-pointer leading-none"
                        title={`Back to the DESIQA value (${fmtVal(dq)})`}>
                        <Undo2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {sectorCells.length > 0 && (
            <label className="flex items-start gap-1 cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={allSector} onChange={ev => { setAllSector(ev.target.checked); setConfirm(null); }} />
              <span>
                Azimuth also for the other {sectorCells.length} cell{sectorCells.length > 1 ? 's' : ''} of sector {cell.sector}
                <span className="opacity-50"> ({sectorCells.map(c => `${c.band} ${fmtVal(c.azimuth)}`).join(', ')})</span>
              </span>
            </label>
          )}
          <input
            className={input} placeholder="Note (reason, MOP, ticket …)" maxLength={300} value={form.note}
            onChange={ev => setForm(p => ({ ...p, note: ev.target.value }))}
          />
          {pending?.list.length > 0 && (
            <div className="rounded bg-slate-500/10 px-1.5 py-0.5 tabular-nums">
              {pending.list.map(c => `${c.f.label} ${fmtVal(cell[c.f.id])} → ${fmtVal(c.value)} (${fmtDelta(c.dNow)})`).join(' · ')}
            </div>
          )}
          {confirm && (
            <div className="rounded border border-amber-400 bg-amber-50 text-amber-800 px-1.5 py-1">
              <div className="font-semibold"><AlertTriangle className="w-3 h-3 inline -mt-0.5 mr-1" />Big change, please check:</div>
              {confirm.map(w => <div key={w}>• {w}</div>)}
            </div>
          )}
          {error && <div className="text-rose-500">{error}</div>}
          <div className="grid grid-cols-2 gap-1">
            <button type="submit" disabled={busy}
              className="flex items-center justify-center gap-1 rounded-md text-white font-semibold py-1 cursor-pointer disabled:opacity-50"
              style={{ background: confirm ? '#d97706' : OVERRIDE_COLOR }}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} {confirm ? 'Yes, save' : 'Save'}
            </button>
            <button type="button" onClick={() => { setEditing(false); setConfirm(null); }} className="rounded-md border border-slate-300 hover:bg-slate-50 font-semibold py-1 cursor-pointer">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {canEdit && (
            <button type="button" onClick={start} disabled={busy} className={`${btn} hover:bg-fuchsia-50`}
              style={{ borderColor: OVERRIDE_COLOR, color: OVERRIDE_COLOR }} title="Edit azimuth / M-tilt / E-tilt of this cell">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
          )}
          {canEdit && cell.override && (
            <button type="button" onClick={() => reset([cell])} disabled={busy}
              className={`${btn} border-slate-400 text-slate-600 hover:bg-slate-50`}
              title="Drop the edit of this cell and follow DESIQA again">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Reset
            </button>
          )}
          {canEdit && cell.override && (
            <button type="button" onClick={() => undo(null)} disabled={busy}
              className={`${btn} border-slate-400 text-slate-600 hover:bg-slate-50`}
              title="Undo the last change of this cell: back to the edit before it, or to DESIQA">
              <Undo2 className="w-3.5 h-3.5" /> Undo
            </button>
          )}
          {canEdit && batchId && batchCells.length > 1 && (
            <button type="button" onClick={() => undo(batchId)} disabled={busy}
              className={`${btn} border-slate-400 text-slate-600 hover:bg-slate-50`}
              title={`Undo the whole save: ${batchCells.map(c => c.cell_name).join(', ')}`}>
              <Undo2 className="w-3.5 h-3.5" /> Undo save ({batchCells.length})
            </button>
          )}
          {canEdit && editedSector.length > 1 && (
            <button type="button" onClick={() => reset(editedSector)} disabled={busy}
              className={`${btn} border-slate-400 text-slate-600 hover:bg-slate-50`}
              title={`Drop the edits of ${editedSector.map(c => c.cell_name).join(', ')} and follow DESIQA again`}>
              <RotateCcw className="w-3.5 h-3.5" /> Reset sector ({editedSector.length})
            </button>
          )}
          <button type="button" onClick={() => setShowHistory(v => !v)}
            className={`${btn} border-slate-300 text-slate-600 ${showHistory ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
            title="Edits of this cell">
            <History className="w-3.5 h-3.5" /> History
          </button>
          {error && <div className="w-full text-rose-500">{error}</div>}
        </div>
      )}
      {showHistory && !editing && (
        <HistoryList cell={cell} canEdit={canEdit} me={me} onRestore={restore} busy={busy}
          version={`${cell.override?.id ?? 'none'}|${historyVersion}`} />
      )}
    </div>
  );
}
