import { ChevronDown, Table2, X } from 'lucide-react';

const fmt = (v) => (v === null || v === undefined || v === '' ? '–' : v);

// 4G Daily, sector scope: bottom sheet with the site's cell properties (CompilePowerRet + lte_cell_config).
// `rows` are already limited to the page's sector filter.
export default function PropertiesPanel({ props: p, rows, sectors, open, onOpenChange, darkMode, sidebarOpen }) {
  const panel = darkMode ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800';
  const headCell = darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600';
  const rowClass = darkMode ? 'border-slate-800 hover:bg-slate-800/60' : 'border-slate-100 hover:bg-blue-50/60';

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className={`fixed bottom-5 right-5 z-40 flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold shadow-lg transition cursor-pointer ${
          open ? 'bg-slate-700 text-white' : 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-500/30'
        }`}
        title="Tampilkan 4G Properties (CompilePowerRet)"
      >
        <Table2 className="w-4 h-4" />
        <span>4G Properties</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${open ? '' : 'rotate-180'}`} />
      </button>

      <div
        className={`fixed bottom-0 right-0 z-30 h-[46vh] border-t shadow-[0_-12px_32px_rgba(0,0,0,0.18)] flex flex-col transition-transform duration-300 ease-out ${panel} ${
          open ? 'translate-y-0' : 'translate-y-full pointer-events-none'
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
            <span className="opacity-60">{rows.length} cell</span>
          </div>
          <button type="button" onClick={() => onOpenChange(false)} className="p-1 rounded hover:bg-slate-500/15 cursor-pointer" title="Tutup">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {p.loading && <div className="p-6 text-xs opacity-70">Memuat properties...</div>}
          {!p.loading && p.error && <div className="p-6 text-xs text-rose-500">Gagal memuat: {p.error}</div>}
          {!p.loading && !p.error && p.loaded && rows.length === 0 && (
            <div className="p-6 text-xs opacity-70">Tidak ada data properties untuk sektor ini.</div>
          )}
          {!p.loading && rows.length > 0 && (
            <table className="min-w-full text-[11px] whitespace-nowrap">
              <thead className="sticky top-0 z-10">
                <tr>
                  {p.columns.map(c => (
                    <th key={c.key} className={`px-3 py-2 text-left font-bold uppercase tracking-wider text-[10px] ${headCell}`}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.cell_name} className={`border-b ${rowClass}`}>
                    {p.columns.map(c => (
                      <td key={c.key} className={`px-3 py-1.5 ${c.key === 'cell_name' ? 'font-semibold' : ''}`}>{fmt(r[c.key])}</td>
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
