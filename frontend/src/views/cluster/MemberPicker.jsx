import { useCallback, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ClipboardPaste, Minus, Search, X } from 'lucide-react';
import useClickOutside from '../../hooks/useClickOutside';

const LIST_LIMIT = 300;

// One multi-select dropdown for sites or site sectors. Pasting a list (Excel column, comma, space…) into the
// search box checks every recognised id at once; options toggle cluster members directly.
export default function MemberPicker({ mode, options, isChecked, isPartial, onToggle, onPaste, pasteResult, darkMode }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);
  useClickOutside(ref, useCallback(() => setOpen(false), []));

  const q = search.trim().toUpperCase();
  const shown = useMemo(() => (q ? options.filter(o => o.includes(q)) : options).slice(0, LIST_LIMIT), [options, q]);
  const checkedCount = useMemo(() => options.filter(isChecked).length, [options, isChecked]);

  // A paste or Enter with several ids (or one full id) adds them; a single partial term just filters
  const tryPaste = (text) => {
    const multi = /[\s,;|/\\]/.test(text.trim()) || /^[A-Z0-9]{6}([_.-]\d{1,3})?$/i.test(text.trim());
    if (!multi) return false;
    onPaste(text);
    setSearch('');
    return true;
  };

  const noun = mode === 'site' ? 'site' : 'site sector';
  const btn = darkMode ? 'bg-slate-800 border-slate-700 text-white hover:border-slate-600' : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300';

  return (
    <div className="relative w-full" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)} className={`w-full flex items-center justify-between border rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer shadow-2xs ${btn}`}>
        <span className="truncate pr-1 flex items-center gap-1.5">
          <ClipboardPaste className="w-3.5 h-3.5 text-slate-400" />
          {checkedCount ? `${checkedCount} ${noun}${checkedCount > 1 ? 's' : ''} selected` : `Select or paste ${noun}s…`}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      </button>

      {open && (
        <div className={`absolute top-full left-0 mt-1.5 w-full min-w-64 border rounded-xl shadow-2xl z-50 p-2.5 space-y-2 text-xs ${
          darkMode ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
        }`}>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              onPaste={e => { if (tryPaste(e.clipboardData.getData('text'))) e.preventDefault(); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); tryPaste(search); } }}
              placeholder={mode === 'site' ? 'Search, or paste UPD001, UPD002 …' : 'Search, or paste UPD001_1, UPD001.2 … (site only = all sectors)'}
              className={`w-full pl-8 pr-7 py-1 text-xs rounded-lg border font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
                darkMode ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
              }`}
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="max-h-64 overflow-y-auto space-y-0.5 pr-0.5 font-mono text-[11px]">
            {shown.length === 0 && <div className="text-center py-3 text-slate-400 italic font-sans">No match</div>}
            {shown.map(o => {
              const checked = isChecked(o);
              const partial = !checked && isPartial?.(o);
              return (
                <div key={o} onClick={() => onToggle(o)} className={`flex items-center gap-2 px-2.5 py-1 rounded-lg cursor-pointer select-none ${
                  checked ? (darkMode ? 'bg-blue-900/30 text-blue-300 font-bold' : 'bg-blue-50 text-blue-900 font-bold')
                    : (darkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-50')
                }`}>
                  <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                    checked || partial ? 'bg-blue-600 border-blue-600 text-white' : darkMode ? 'border-slate-600 bg-slate-800' : 'border-slate-300 bg-white'
                  }`}>
                    {checked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    {partial && <Minus className="w-2.5 h-2.5 stroke-[3]" />}
                  </span>
                  {o}
                </div>
              );
            })}
            {shown.length >= LIST_LIMIT && (
              <div className="text-[10px] text-center py-1 text-slate-400 italic font-sans">Showing the first {LIST_LIMIT}; type to narrow down.</div>
            )}
          </div>
        </div>
      )}

      {pasteResult && (
        <div className="text-[11px] mt-1 space-y-0.5">
          <div className="text-emerald-600 font-semibold">{pasteResult.members.length} ID{pasteResult.members.length === 1 ? '' : 's'} checked.</div>
          {pasteResult.unknown.length > 0 && (
            <div className="text-rose-500 font-semibold break-all">
              {pasteResult.unknown.length} not found: {pasteResult.unknown.slice(0, 40).join(', ')}{pasteResult.unknown.length > 40 ? ' …' : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
