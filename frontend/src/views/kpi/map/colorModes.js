import { BAND_COLORS } from '../../../components/SectorPayloadChart';

export const GOOD = '#16a34a';
export const WARN = '#eab308';
export const BAD = '#dc2626';
export const NO_DATA = '#94a3b8';

export const bandColor = (band) => BAND_COLORS[band] || '#64748b';

const RCI_COLORS = {
  green: GOOD,
  red_current_week: '#b91c1c',
  red_last_week: '#f97316',
  red_thp_1750: '#e11d48',
  red_by_colo: '#a855f7',
};

const unbalanceColor = (s) => {
  if (!s) return NO_DATA;
  if (s === 'balanced') return GOOD;
  if (/V1/i.test(s)) return '#f97316';
  if (/V2/i.test(s)) return BAD;
  if (/V3/i.test(s)) return '#a855f7';
  return WARN;
};

const threshold = (v, goodFn, warnFn) => {
  if (v === null || v === undefined) return NO_DATA;
  if (goodFn(v)) return GOOD;
  return warnFn(v) ? WARN : BAD;
};

// Sector colouring modes. `color(cell, kpi)` gets the DESIQA cell and its /api/map/kpi entry.
export const COLOR_MODES = {
  band: {
    label: 'Band',
    color: (c) => bandColor(c.band),
  },
  dl_prb: {
    label: 'DL PRB',
    color: (_, k) => threshold(k?.dl_prb, v => v < 70, v => v <= 85),
    legend: [[GOOD, '< 70%'], [WARN, '70 – 85%'], [BAD, '> 85%']],
  },
  dl_thp: {
    label: 'User DL Thp',
    color: (_, k) => threshold(k?.dl_thp, v => v > 3, v => v >= 1.5),
    legend: [[GOOD, '> 3 Mbps'], [WARN, '1.5 – 3 Mbps'], [BAD, '< 1.5 Mbps']],
  },
  rci: {
    label: 'RCI',
    color: (_, k) => (k?.rci ? RCI_COLORS[k.rci] || WARN : NO_DATA),
    legend: Object.entries(RCI_COLORS).map(([s, c]) => [c, s]),
    week: 'rci_week',
  },
  cei: {
    label: 'CEI',
    color: (_, k) => (k?.cei === 'Good_cell' ? GOOD : k?.cei === 'Bad_cell' ? BAD : NO_DATA),
    legend: [[GOOD, 'Good_cell'], [BAD, 'Bad_cell']],
    week: 'cei_week',
  },
  unbalance: {
    label: 'Unbalance',
    color: (_, k) => unbalanceColor(k?.unbalance),
    legend: [[GOOD, 'balanced'], ['#f97316', 'V1 – L18L21 >30%'], [BAD, 'V2 – L18L21 (vs L23) >40%'], ['#a855f7', 'V3 – thp L9 >3Mbps']],
    week: 'unbalance_week',
  },
};

export const statusColor = {
  rci: (s) => (s ? RCI_COLORS[s] || WARN : NO_DATA),
  cei: (s) => (s === 'Good_cell' ? GOOD : s === 'Bad_cell' ? BAD : NO_DATA),
  unbalance: unbalanceColor,
};
