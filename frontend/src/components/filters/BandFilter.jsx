import { useCallback, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import useClickOutside from '../../hooks/useClickOutside';
import { FilterLabel } from './FilterLabel';
import { fieldClass, menuPanelClass } from './styles';

// Band multi-select. The 'sector' variant adds "select all" and marks bands present on the site.
export default function BandFilter({
  options, selected, allIds, onToggle, onToggleAll, activeBands = [], variant = 'scope', darkMode, className = '',
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, useCallback(() => setOpen(false), []));
  const allSelected = selected.length === allIds.length;
  const isSector = variant === 'sector';

  const itemClass = (checked) => checked
    ? darkMode ? 'bg-blue-900/30 text-blue-300 font-bold' : 'bg-blue-50 text-blue-900 font-bold'
    : darkMode ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-50 text-slate-700';

  return (
    <div className={`relative ${className}`} ref={ref}>
      <FilterLabel>FILTER BAND</FilterLabel>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between border rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer ${fieldClass(darkMode)}`}
      >
        <span>{allSelected ? 'All Bands' : `${selected.length} ${isSector ? 'selected' : 'Bands'}`}</span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>

      {open && (
        <div className={`absolute top-full left-0 mt-1 ${isSector ? 'w-64' : 'w-56'} border rounded-xl shadow-2xl z-50 p-2 text-xs space-y-1 ${menuPanelClass(darkMode)}`}>
          {isSector && (
            <>
              <div
                onClick={onToggleAll}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer font-bold transition ${
                  allSelected ? 'bg-blue-600 text-white' : darkMode ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-100 text-slate-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={allSelected} onChange={() => {}} className="w-3.5 h-3.5 rounded text-blue-600 pointer-events-none" />
                  <span>Select All Bands</span>
                </div>
                {allSelected && <Check className="w-3.5 h-3.5" />}
              </div>
              <div className="border-t border-slate-100 dark:border-slate-800 my-1"></div>
            </>
          )}

          {options.map(b => {
            const checked = selected.includes(b.id);
            return (
              <div
                key={b.id}
                onClick={() => onToggle(b.id)}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition select-none ${itemClass(checked)}`}
              >
                {isSector ? (
                  <>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={checked} onChange={() => {}} className="w-3.5 h-3.5 rounded text-blue-600 pointer-events-none" />
                      <span>{b.label}</span>
                    </div>
                    {activeBands.includes(b.id) && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Active</span>
                    )}
                  </>
                ) : (
                  <>
                    <span>{b.label}</span>
                    {checked && <Check className="w-3.5 h-3.5" />}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
