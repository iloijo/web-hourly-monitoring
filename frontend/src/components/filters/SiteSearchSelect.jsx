import { useCallback, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import useClickOutside from '../../hooks/useClickOutside';
import { FilterLabel } from './FilterLabel';
import { fieldClass, menuPanelClass } from './styles';

// Single site picker with search by Site ID or site name
export default function SiteSearchSelect({ label = 'TARGET SITE', sites, siteNamesMap, value, onSelect, darkMode }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);
  useClickOutside(ref, useCallback(() => setOpen(false), []));

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return sites.slice(0, 50);
    return sites
      .filter(s => s.toLowerCase().includes(q) || (siteNamesMap[s] || '').toLowerCase().includes(q))
      .slice(0, 50);
  }, [sites, search, siteNamesMap]);

  return (
    <div className="relative" ref={ref}>
      <FilterLabel>{label}</FilterLabel>
      <div
        onClick={() => setOpen(!open)}
        className={`border rounded-lg px-3 py-1.5 flex items-center justify-between text-xs font-bold cursor-pointer ${fieldClass(darkMode)}`}
      >
        <div className="flex items-center gap-2 truncate">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
          <span className="font-bold truncate">{value}</span>
          {siteNamesMap[value] && (
            <span className={`text-[11px] truncate font-normal ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>• {siteNamesMap[value]}</span>
          )}
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      </div>

      {open && (
        <div className={`absolute top-full left-0 mt-1 w-80 border rounded-xl shadow-2xl z-50 p-2 text-xs space-y-1 ${menuPanelClass(darkMode)}`}>
          <input
            type="text"
            placeholder="Cari Site ID atau Nama Site..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            className={`w-full border rounded-lg px-2.5 py-1 text-xs mb-1 font-medium ${
              darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}
          />
          <div className="max-h-56 overflow-y-auto space-y-0.5">
            {filtered.map(s => (
              <div
                key={s}
                onClick={() => { setOpen(false); setSearch(''); onSelect(s); }}
                className={`px-2.5 py-1.5 rounded-lg cursor-pointer flex items-center justify-between ${
                  s === value ? 'bg-blue-600 text-white font-bold' : darkMode ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-blue-50 text-slate-700'
                }`}
              >
                <div className="flex flex-col min-w-0 pr-2">
                  <span className="font-bold">{s}</span>
                  {siteNamesMap[s] && (
                    <span className={`text-[11px] truncate ${s === value ? 'text-blue-100' : darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      {siteNamesMap[s]}
                    </span>
                  )}
                </div>
                {s === value && <Check className="w-3.5 h-3.5 shrink-0 text-white" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
