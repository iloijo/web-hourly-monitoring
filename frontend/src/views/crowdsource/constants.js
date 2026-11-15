export const STATUS_COLORS = {
  WIN: '#16A34A',
  DRAW: '#0D9488',
  LOSE: '#DC2626',
  NONE: '#94A3B8',
};

export const OPERATOR_COLORS = {
  TSEL: '#E11D48',
  IOH: '#F59E0B',
  XLSMART: '#2563EB',
  '3': '#A1A1AA',
  Smartfren: '#A1A1AA',
};

export const weekLabel = (yw) => {
  if (!yw) return '-';
  const y = Math.floor(yw / 100);
  const w = String(yw % 100).padStart(2, '0');
  return `W${w} ${y}`;
};

export const SOURCE_OPTIONS = [
  ['all', 'All Sources'],
  ['ONX', 'OpenSignal'],
  ['OOKLA', 'Ookla'],
];

export const TECH_OPTIONS = [
  ['all', 'All'],
  ['overall', 'Overall'],
  ['5g', '5G'],
  ['4g', '4G'],
];

export const COMPETITOR_OPTIONS = [
  ['all', 'All OLO'],
  ['IOH', 'IOH'],
  ['XLSMART', 'XLSMART'],
];

export const TREND_WEEKS_OPTIONS = [
  [13, '13 W'],
  [26, '26 W'],
  [52, '52 W'],
];

export const LEVEL_OPTIONS = [
  ['region', 'Region'],
  ['kabupaten', 'Kabupaten'],
];
