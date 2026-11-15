// Covmo grid settings and the RSRP / RSRQ colour bins (legend values given by RNO)

export const COVMO_MIN_ZOOM = 13;
export const Z = 20;
export const N = 2 ** Z;
export const MAX_AREA = 0.03; // deg², same limit as the backend
export const GRID = 0.01;     // requested bounds snap to this grid so the backend cache can be reused

export const COVMO_METRICS = {
  rsrp: {
    label: 'RSRP',
    unit: 'dBm',
    bins: [
      [-110, '#dc2626', '-150 to -110'],
      [-105, '#facc15', '-110 to -105'],
      [-100, '#22c55e', '-105 to -100'],
      [-95, '#15803d', '-100 to -95'],
      [Infinity, '#2563eb', '-95 to -40'],
    ],
  },
  rsrq: {
    label: 'RSRQ',
    unit: 'dB',
    bins: [
      [-14, '#dc2626', '-20 to -14'],
      [-12, '#facc15', '-14 to -12'],
      [-9, '#22c55e', '-12 to -9'],
      [Infinity, '#2563eb', '-9 to 0'],
    ],
  },
};

export const covmoColor = (metric, v) => {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  const bin = COVMO_METRICS[metric].bins.find(([upper]) => v < upper);
  return bin ? bin[1] : null;
};
