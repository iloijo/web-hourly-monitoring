// TA70 / ISD remark of a map cell (same rule as the backend, queries_isd.py): ISD comes with the cell from
// /api/map/cells, TA70 with the cell's /api/map/kpi entry (last TA day).
export const ISD_REMARK_COLORS = {
  Undershooting: '#0ea5e9',
  Normal: '#16a34a',
  Overlap: '#f59e0b',
  Overshooting: '#dc2626',
  'Cover Open Area / End Cell': '#64748b',
};
const LIMITS = [[0.3, 'Undershooting'], [1.0, 'Normal'], [1.3, 'Overlap']];

export function taIsdRemark(cell, kpi) {
  if (cell?.indoor) return { remark: 'Indoor (excluded)', ratio: null };
  const isd = cell?.isd;
  if (!isd) return { remark: 'No ISD', ratio: null };
  const ta70 = kpi?.ta70;
  const ratio = ta70 && isd.isd_m ? Math.round((ta70 / isd.isd_m) * 100) / 100 : null;
  if (isd.window === 'any') return { remark: 'Cover Open Area / End Cell', ratio };
  if (ratio === null) return { remark: 'No TA sample', ratio: null };
  return { remark: (LIMITS.find(([lim]) => ratio < lim) || [0, 'Overshooting'])[1], ratio };
}
