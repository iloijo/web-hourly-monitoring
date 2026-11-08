import { useCallback, useRef, useState } from 'react';
import { ChevronDown, Flag } from 'lucide-react';
import useClickOutside from '../../hooks/useClickOutside';
import { FilterLabel } from '../../components/filters/FilterLabel';
import { fieldClass } from '../../components/filters/styles';
import { shiftDate } from '../../constants/dates';

const short = (d) => (d ? d.slice(5) : '?');

// Returns an error text when the Before / After ranges are incomplete or overlap, else ''
export function periodError({ before_start: bs, before_end: be, after_start: as, after_end: ae }) {
  if (!bs || !be || !as || !ae) return 'Set both the Before and After periods.';
  if (bs > be || as > ae) return 'Each period must start on or before its end.';
  if (be >= as) return 'The Before period must end before the After period starts.';
  return '';
}

// "BEFORE vs AFTER" dropdown: two date ranges, plus quick fill of N days around an activity marker
export default function PeriodControl({ draft, setDraft, darkMode }) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(7);
  const ref = useRef(null);
  useClickOutside(ref, useCallback(() => setOpen(false), []));

  const field = `border rounded-lg px-2 py-1 text-xs ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`;
  const set = (key) => (e) => setDraft({ ...draft, [key]: e.target.value });
  const around = (date) => {
    const n = Math.max(1, Number(days) || 7);
    setDraft({
      ...draft,
      before_start: shiftDate(date, -n), before_end: shiftDate(date, -1),
      after_start: shiftDate(date, 1), after_end: shiftDate(date, n),
    });
  };
  const error = periodError(draft);

  return (
    <div className="relative" ref={ref}>
      <FilterLabel>BEFORE vs AFTER</FilterLabel>
      <button type="button" onClick={() => setOpen(!open)} className={`flex items-center gap-2 border rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${fieldClass(darkMode)} ${error ? 'border-rose-400' : ''}`}>
        <span className="text-blue-500 font-bold">B</span> {short(draft.before_start)} – {short(draft.before_end)}
        <span className="opacity-40">|</span>
        <span className="text-emerald-500 font-bold">A</span> {short(draft.after_start)} – {short(draft.after_end)}
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>

      {open && (
        <div className={`absolute left-0 top-full mt-1.5 z-50 w-80 p-3 rounded-xl border shadow-2xl space-y-3 text-xs ${
          darkMode ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
        }`}>
          {[['Before', 'before', 'text-blue-500'], ['After', 'after', 'text-emerald-500']].map(([label, key, color]) => (
            <div key={key} className="space-y-1">
              <div className={`font-bold ${color}`}>{label}</div>
              <div className="flex items-center gap-1.5">
                <input type="date" value={draft[`${key}_start`] || ''} onChange={set(`${key}_start`)} className={`${field} flex-1`} />
                <span className="opacity-50">–</span>
                <input type="date" value={draft[`${key}_end`] || ''} onChange={set(`${key}_end`)} className={`${field} flex-1`} />
              </div>
            </div>
          ))}

          <div className={`pt-2 border-t space-y-1.5 ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
            <div className="flex items-center gap-1.5">
              <span className="font-bold">Fill</span>
              <input type="number" min={1} max={90} value={days} onChange={e => setDays(e.target.value)} className={`${field} w-14`} />
              <span>days before / after a marker:</span>
            </div>
            {draft.markers.length === 0 && <div className="text-[11px] opacity-60">Add a marker first (Marker button above the charts).</div>}
            <div className="flex flex-wrap gap-1">
              {draft.markers.map(m => (
                <button key={m.date} type="button" onClick={() => around(m.date)} className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer">
                  <Flag className="w-3 h-3" />{short(m.date)} {m.label}
                </button>
              ))}
            </div>
          </div>
          {error && <div className="text-[11px] font-semibold text-rose-500">{error}</div>}
          <p className="text-[10px] opacity-60">The table compares these two periods; the chart shades them inside its own date range.</p>
        </div>
      )}
    </div>
  );
}
