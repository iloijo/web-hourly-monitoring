// Per cell: TA70 of the selected period against the directional ISD (nearest 4G site ahead of the azimuth),
// with the remark of the TA_ISD_TA70 method. Rows come from /api/timing_advance/4g (cell_isd).
const REMARK_COLORS = {
  Undershooting: '#0ea5e9',
  Normal: '#16a34a',
  Overlap: '#f59e0b',
  Overshooting: '#dc2626',
  'Cover Open Area / End Cell': '#64748b',
};

const m = (v) => (v === null || v === undefined ? '–' : v >= 1000 ? `${(v / 1000).toFixed(2)} km` : `${Math.round(v)} m`);

// Sheet rows for the Excel export
export const taIsdSheetRows = (rows) => rows.map(r => ({
  Sector: r.sector, Band: r.band, CI: r.ci, 'Cell name': r.cell_name, Azimuth: r.azimuth, Samples: r.samples,
  'TA70 (m)': r.ta70_m, 'ISD (m)': r.isd_m, 'ISD target': r.target, Window: r.window, 'TA70 / ISD': r.ratio, Remark: r.remark,
}));

export default function TaIsdTable({ rows, sectorFilter = 'all', bandFilter = 'all', fromDate, toDate, darkMode }) {
  const shown = rows.filter(r => (sectorFilter === 'all' || String(r.sector) === String(sectorFilter).replace(/^S/, ''))
    && (bandFilter === 'all' || r.band === bandFilter));
  const counts = shown.reduce((acc, r) => ({ ...acc, [r.remark]: (acc[r.remark] || 0) + 1 }), {});
  const head = darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700';
  return (
    <div className={`rounded-2xl border overflow-hidden shadow-xs ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
      <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-x-4 gap-y-1">
        <div>
          <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500">TA70 vs ISD per cell</h3>
          <p className="text-[11px] text-slate-400">
            TA70 of {fromDate} – {toDate}. ISD = nearest 4G site ahead of the azimuth (±60°, then ±90°; sites &lt; 50 m, indoor, Combat and micro skipped).
            Ratio &lt; 0.3 Undershooting · 0.3 – 1.0 Normal · 1.0 – 1.3 Overlap · &gt; 1.3 Overshooting.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 ml-auto">
          {Object.entries(counts).map(([remark, n]) => (
            <span key={remark} className="px-2 py-0.5 rounded-md text-white text-[10px] font-bold" style={{ background: REMARK_COLORS[remark] || '#94a3b8' }}>
              {remark} {n}
            </span>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse whitespace-nowrap">
          <thead className={`font-bold uppercase tracking-wider text-[10px] ${head}`}>
            <tr>
              {['Sector', 'Band', 'Cell', 'Azimuth', 'TA70', 'ISD', 'ISD target', 'TA70 / ISD', 'Remark'].map(h => (
                <th key={h} className={`px-3 py-2 ${['Azimuth', 'TA70', 'ISD', 'TA70 / ISD'].includes(h) ? 'text-right' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {shown.map(r => (
              <tr key={`${r.sector}_${r.ci}_${r.cell_name}`} className={darkMode ? 'hover:bg-slate-800/60' : 'hover:bg-slate-50'}>
                <td className="px-3 py-1.5">S{r.sector}</td>
                <td className="px-3 py-1.5">{r.band}</td>
                <td className="px-3 py-1.5 font-semibold">{r.cell_name}</td>
                <td className="px-3 py-1.5 text-right font-mono">{r.azimuth ?? '–'}{r.azimuth != null ? '°' : ''}</td>
                <td className="px-3 py-1.5 text-right font-mono">{m(r.ta70_m)}</td>
                <td className="px-3 py-1.5 text-right font-mono">{m(r.isd_m)}</td>
                <td className="px-3 py-1.5">{r.target || '–'} {r.window && <span className="opacity-50">({r.window})</span>}</td>
                <td className="px-3 py-1.5 text-right font-mono font-bold">{r.ratio ?? '–'}</td>
                <td className="px-3 py-1.5">
                  <span className="px-2 py-0.5 rounded-md text-white text-[10px] font-bold" style={{ background: REMARK_COLORS[r.remark] || '#94a3b8' }}>{r.remark}</span>
                </td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={9} className="text-center py-6 text-slate-400">No cell for this filter.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
