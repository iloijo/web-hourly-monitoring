import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, X } from 'lucide-react';
import { getJson, postJson } from '../../../api/client';
import { downloadXlsx } from '../../../api/export';

// DESIQA of one site in two versions: Original (raw_desiqa, latest week) and RNO (revised by the team).
// Every field can be revised; site fields hold for all cells of the site. An empty box or the DESIQA value
// takes the field back to DESIQA. Azimuth / tilt are edited in the sector popup (with their own guard).

const GROUPS = [['rf', 'RF'], ['location', 'Location'], ['other', 'Other']];
export const RNO_COLOR = '#d97706';

const fmtWhen = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const keyOf = (ci, field) => `${ci ?? 'site'}|${field}`;

function ValueInput({ cellValue, draft, onChange, disabled, darkMode, width = 'w-28' }) {
  const shown = draft !== undefined ? draft : (cellValue.rno ?? '');
  const revised = cellValue.revision && draft === undefined;
  const changed = draft !== undefined && draft !== (cellValue.rno ?? '');
  const title = [
    `DESIQA: ${cellValue.original ?? '–'}`,
    cellValue.revision && `RNO: ${cellValue.revision.value} · ${cellValue.revision.edited_by} ${fmtWhen(cellValue.revision.edited_at)}`
      + (cellValue.revision.note ? ` · ${cellValue.revision.note}` : ''),
  ].filter(Boolean).join('\n');
  return (
    <input
      value={shown}
      placeholder={cellValue.original ?? ''}
      disabled={disabled}
      title={title}
      onChange={e => onChange(e.target.value)}
      className={`${width} h-6 rounded border px-1 text-[11px] tabular-nums ${
        changed ? 'border-blue-500 ring-1 ring-blue-500/40' : revised ? 'font-semibold' : ''
      } ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} disabled:opacity-70`}
      style={revised ? { color: RNO_COLOR, borderColor: RNO_COLOR } : undefined}
    />
  );
}

export async function exportRevisions() {
  const json = await getJson('/api/desiqa/revisions');
  if (json.error) throw new Error(json.error);
  const fieldRows = (json.rows || []).map(r => [
    r.site_id, r.level === 'site' ? '' : r.ci, r.cell_name, r.label, r.desiqa_value, r.value, r.desiqa_week,
    r.edited_by, r.edited_at?.slice(0, 16).replace('T', ' '), r.note,
  ]);
  const tiltRows = (json.tilt_rows || []).flatMap(r => ['azimuth', 'mt', 'et']
    .filter(f => r[f] !== null)
    .map(f => [r.site_id, r.ci, r.cell_name, { azimuth: 'Azimuth', mt: 'M-Tilt', et: 'E-Tilt' }[f], r[`desiqa_${f}`], r[f],
      r.desiqa_week, r.edited_by, r.edited_at?.slice(0, 16).replace('T', ' '), r.note]));
  const columns = ['Site ID', 'CI', 'Cell name', 'Field', 'DESIQA', 'RNO', 'DESIQA week', 'Edited by', 'Edited at', 'Note'];
  await downloadXlsx({
    filename: `DESIQA_RNO_revisions_${new Date().toISOString().slice(0, 10)}`,
    sheets: [{ name: 'RNO vs DESIQA', columns, rows: [...tiltRows, ...fieldRows] }],
  });
}

export default function DesiqaEditor({ siteId, canEdit, darkMode, onClose, onSaved }) {
  const [rec, setRec] = useState(null);
  const [error, setError] = useState(null);
  const [group, setGroup] = useState('rf');
  const [draft, setDraft] = useState({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    getJson('/api/desiqa/record', { site_id: siteId })
      .then(j => { if (cancelled) return; if (j.error) setError(j.error); else setRec(j); })
      .catch(e => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  }, [siteId, reload]);

  const fields = useMemo(() => (rec?.fields || []).filter(f => f.group === group), [rec, group]);
  const siteFields = fields.filter(f => f.level === 'site');
  const cellFields = fields.filter(f => f.level === 'cell');
  const revisedCount = useMemo(() => {
    if (!rec) return 0;
    return Object.values(rec.site).filter(v => v.revision).length
      + rec.cells.reduce((n, c) => n + Object.values(c.fields).filter(v => v.revision).length, 0);
  }, [rec]);

  const changes = useMemo(() => {
    if (!rec) return [];
    return Object.entries(draft).flatMap(([k, value]) => {
      const [ci, field] = k.split('|');
      const cell = ci === 'site' ? null : rec.cells.find(c => String(c.ci) === ci);
      const cur = ci === 'site' ? rec.site[field] : cell?.fields[field];
      if (!cur || value === (cur.rno ?? '')) return [];
      return [{ ci: cell ? cell.ci : null, cell_name: cell?.cell_name || '', field, value }];
    });
  }, [draft, rec]);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await postJson('/api/desiqa/revisions', { site_id: siteId, changes, note });
      if (r.error) throw new Error(r.error);
      setMsg(`${r.saved} saved${r.cleared ? `, ${r.cleared} back to DESIQA` : ''}`);
      setDraft({});
      setNote('');
      setReload(v => v + 1);
      onSaved?.();
    } catch (e) {
      setMsg(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const shell = darkMode ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-700';
  const th = `px-2 py-1 font-semibold text-left whitespace-nowrap ${darkMode ? 'bg-slate-800' : 'bg-slate-50'}`;
  const set = (ci, field) => (v) => setDraft(d => ({ ...d, [keyOf(ci, field)]: v }));

  return (
    <div className="absolute inset-0 z-[900] bg-black/30 flex items-start justify-center p-3" onPointerDown={e => e.target === e.currentTarget && onClose()}>
      <div className={`w-full max-w-5xl max-h-full flex flex-col rounded-lg border shadow-2xl text-[11px] ${shell}`}>
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-500/20">
          <div className="font-bold text-xs">DESIQA {siteId}</div>
          {rec && <div className="opacity-60">Original = W{rec.week} · RNO = Original + {revisedCount} revised field{revisedCount === 1 ? '' : 's'}</div>}
          <div className="ml-auto flex items-center gap-1">
            {GROUPS.map(([id, label]) => (
              <button key={id} type="button" onClick={() => setGroup(id)}
                className={`px-2 h-6 rounded font-semibold cursor-pointer ${group === id ? 'bg-blue-600 text-white' : darkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}>
                {label}
              </button>
            ))}
            <button type="button" title="Every active RNO revision of all sites (fields and azimuth / tilt), RNO next to DESIQA"
              onClick={() => exportRevisions().catch(e => setMsg(String(e.message || e)))}
              className={`ml-2 flex items-center gap-1 px-2 h-6 rounded border font-semibold cursor-pointer ${darkMode ? 'border-slate-700 hover:bg-slate-800' : 'border-slate-200 hover:bg-slate-100'}`}>
              <Download className="w-3.5 h-3.5" /> Export all revisions
            </button>
            <button type="button" onClick={onClose} className="p-1 rounded hover:bg-slate-500/15 cursor-pointer" title="Close"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3 space-y-3">
          {error && <div className="text-rose-500">{error}</div>}
          {!rec && !error && <div className="flex items-center gap-2 opacity-70"><Loader2 className="w-4 h-4 animate-spin" /> Loading DESIQA…</div>}
          {rec && siteFields.length > 0 && (
            <div>
              <div className="font-semibold mb-1">Site (all cells)</div>
              <div className="grid gap-x-4 gap-y-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
                {siteFields.map(f => (
                  <label key={f.id} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 opacity-70 truncate" title={f.label}>{f.label}</span>
                    <ValueInput cellValue={rec.site[f.id]} draft={draft[keyOf(null, f.id)]} onChange={set(null, f.id)}
                      disabled={!canEdit} darkMode={darkMode} width="flex-1 min-w-0" />
                  </label>
                ))}
              </div>
            </div>
          )}
          {rec && cellFields.length > 0 && (
            <div>
              <div className="font-semibold mb-1">Cells</div>
              <div className="overflow-x-auto">
                <table className="border-collapse">
                  <thead>
                    <tr>
                      <th className={`${th} sticky left-0 z-10`}>Cell</th>
                      {cellFields.map(f => <th key={f.id} className={th}>{f.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rec.cells.map(c => (
                      <tr key={`${c.ci}|${c.cell_name}`} className="border-t border-slate-500/10">
                        <td className={`px-2 py-0.5 whitespace-nowrap sticky left-0 ${darkMode ? 'bg-slate-900' : 'bg-white'}`}>
                          <span className="font-semibold">{c.ci}</span> <span className="opacity-60">{c.cell_name}</span>
                        </td>
                        {cellFields.map(f => (
                          <td key={f.id} className="px-1 py-0.5">
                            <ValueInput cellValue={c.fields[f.id]} draft={draft[keyOf(c.ci, f.id)]} onChange={set(c.ci, f.id)}
                              disabled={!canEdit} darkMode={darkMode} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <div className="opacity-60 leading-snug">
            Grey hint = DESIQA value. <span style={{ color: RNO_COLOR }} className="font-semibold">Orange</span> = RNO revision (hover for who and when).
            Clear a box or type the DESIQA value to go back to DESIQA. A revision closes by itself once DESIQA carries the same value.
            Azimuth and tilt are edited in the sector popup.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-t border-slate-500/20">
          {canEdit ? (
            <>
              <input value={note} onChange={e => setNote(e.target.value)} maxLength={300} placeholder="Note (source of the correction, e.g. site survey 18 Nov)"
                className={`flex-1 min-w-[200px] h-7 rounded border px-2 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`} />
              {changes.length > 0 && (
                <button type="button" onClick={() => setDraft({})} className="px-2 h-7 rounded hover:bg-slate-500/15 cursor-pointer">Discard</button>
              )}
              <button type="button" disabled={!changes.length || busy} onClick={save}
                className="px-3 h-7 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-default">
                {busy ? 'Saving…' : `Save ${changes.length || ''} change${changes.length === 1 ? '' : 's'}`}
              </button>
            </>
          ) : <div className="opacity-60">Your role can view but not revise DESIQA.</div>}
          {msg && <div className="w-full opacity-80">{msg}</div>}
        </div>
      </div>
    </div>
  );
}
