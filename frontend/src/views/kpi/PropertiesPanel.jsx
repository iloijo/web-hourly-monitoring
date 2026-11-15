import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, Map as MapIcon, Table2, X } from 'lucide-react';

const fmt = (v) => (v === null || v === undefined || v === '' ? '–' : v);

export function compareValues(a, b, dir = 'asc') {
  const emptyA = a === null || a === undefined || a === '';
  const emptyB = b === null || b === undefined || b === '';
  if (emptyA && emptyB) return 0;
  if (emptyA) return 1;  // Empty values always at bottom
  if (emptyB) return -1; // Empty values always at bottom

  let cmp = 0;
  if (typeof a === 'number' && typeof b === 'number') {
    cmp = a - b;
  } else {
    const numA = Number(a);
    const numB = Number(b);
    if (!isNaN(numA) && !isNaN(numB) && typeof a !== 'boolean' && typeof b !== 'boolean') {
      cmp = numA - numB;
    } else {
      cmp = String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
    }
  }
  return dir === 'desc' ? -cmp : cmp;
}

// Bottom-right capsule that opens the 4G Properties sheet (left half) and the cell map drawer (right half).
// It stays left of the open map drawer.
export function PanelCapsule({ propsOpen, onToggleProps, mapOpen, onToggleMap, rightOffset = 0 }) {
  const half = 'flex items-center gap-2 py-2 text-xs font-bold text-white transition-colors duration-200 cursor-pointer';
  return (
    <div
      style={{ right: rightOffset + 20 }}
      className="fixed bottom-5 z-40 flex items-stretch rounded-full overflow-hidden shadow-lg shadow-slate-900/25 ring-1 ring-black/10 transition-[right] duration-300"
    >
      <button
        type="button"
        onClick={onToggleProps}
        className={`${half} pl-4 pr-3 ${propsOpen ? 'bg-slate-700' : 'bg-amber-600 hover:bg-amber-700'}`}
        title="Show 4G Properties (CompilePowerRet)"
      >
        <Table2 className="w-4 h-4" />
        <span>4G Properties</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${propsOpen ? '' : 'rotate-180'}`} />
      </button>
      <span className="w-px bg-white/60" aria-hidden />
      <button
        type="button"
        onClick={onToggleMap}
        className={`${half} pl-3 pr-4 ${mapOpen ? 'bg-slate-700' : 'bg-blue-600 hover:bg-blue-700'}`}
        title={mapOpen ? 'Hide cell map' : 'Show cell map (DESIQA)'}
      >
        <MapIcon className="w-4 h-4" />
        <span>Map</span>
      </button>
    </div>
  );
}

// 4G Daily, sector scope: bottom sheet with the site's cell properties (CompilePowerRet + lte_cell_config).
// `rows` are already limited to the page's sector filter and sorted by `sortConfig` (owned by the parent,
// which also uses the sorted rows for the Excel export).
export default function PropertiesPanel({
  props: p,
  rows = [],
  sectors = [],
  open,
  onOpenChange,
  darkMode,
  sidebarOpen,
  sortConfig,
  onSort,
  rightOffset = 0, // width of the open map drawer: the sheet stays left of it
}) {

  const panel = darkMode ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800';
  const headCell = darkMode ? 'bg-slate-800 text-slate-300 hover:bg-slate-700/80' : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80';
  const rowClass = darkMode ? 'border-slate-800 hover:bg-slate-800/60' : 'border-slate-100 hover:bg-blue-50/60';

  return (
    <>
      <div
        style={{ right: rightOffset }}
        className={`fixed bottom-0 z-30 h-[46vh] border-t flex flex-col transition-all duration-300 ease-out ${panel} ${
          // the shadow only while open: a closed sheet sits below the screen and its shadow showed as a grey band
          open ? 'translate-y-0 shadow-[0_-12px_32px_rgba(0,0,0,0.18)]' : 'translate-y-full pointer-events-none invisible'
        } ${sidebarOpen ? 'left-64' : 'left-0'}`}
        aria-hidden={!open}
      >
        <div className={`flex items-center justify-between px-5 py-2.5 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
          <div className="flex items-center gap-2 text-xs">
            <Table2 className="w-4 h-4 text-amber-500" />
            <span className="font-bold uppercase tracking-wider">4G Properties</span>
            <span className="opacity-60">•</span>
            <span className="font-semibold">{p.site}</span>
            <span className={`px-2 py-0.5 rounded-md font-semibold ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
              Sector {sectors.join(', ')}
            </span>
            <span className="opacity-60">{rows.length} cell{rows.length === 1 ? '' : 's'}</span>
          </div>
          <button type="button" onClick={() => onOpenChange(false)} className="p-1 rounded hover:bg-slate-500/15 cursor-pointer" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {p.loading && <div className="p-6 text-xs opacity-70">Loading properties...</div>}
          {!p.loading && p.error && <div className="p-6 text-xs text-rose-500">Failed to load: {p.error}</div>}
          {!p.loading && !p.error && p.loaded && rows.length === 0 && (
            <div className="p-6 text-xs opacity-70">No properties data for this sector.</div>
          )}
          {!p.loading && rows.length > 0 && (
            <table className="min-w-full text-[11px] whitespace-nowrap">
              <thead className="sticky top-0 z-10 select-none">
                <tr>
                  {p.columns.map(c => {
                    const isActive = sortConfig.key === c.key;
                    return (
                      <th
                        key={c.key}
                        onClick={() => onSort(c.key)}
                        className={`px-3 py-2 text-left font-bold uppercase tracking-wider text-[10px] cursor-pointer transition-colors group ${headCell}`}
                        title={`Click to sort by ${c.label}`}
                      >
                        <div className="flex items-center gap-1">
                          <span>{c.label}</span>
                          {isActive ? (
                            sortConfig.direction === 'asc' ? (
                              <ArrowUp className="w-3 h-3 text-amber-500 shrink-0" />
                            ) : (
                              <ArrowDown className="w-3 h-3 text-amber-500 shrink-0" />
                            )
                          ) : (
                            <ArrowUpDown className="w-2.5 h-2.5 opacity-0 group-hover:opacity-40 shrink-0 transition-opacity" />
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.siteid_ci || r.cell_name} className={`border-b ${rowClass}`}>
                    {p.columns.map(c => (
                      <td key={c.key} className={`px-3 py-1.5 ${c.key === 'siteid_ci' || c.key === 'cell_name' ? 'font-semibold' : ''}`}>
                        {fmt(r[c.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
