// Elevation profile maths for the cell map (no extra dependency).
import { bearingDeg, destination, distanceM } from './geo';

export const MAX_PROFILE_M = 20000;
export const MAX_SAMPLES = 300;
const STEP_M = 30;            // SRTM / GLO-30 resolution
const EARTH_R = 6371008.8;
const K_FACTOR = 4 / 3;       // standard atmosphere refraction

// Centre frequency per LTE band (GHz), for the first Fresnel zone
export const BAND_FREQ_GHZ = {
  L700: 0.75, L900: 0.94, L1800: 1.84, L2100: 2.14,
  L2300_1: 2.35, L2300_2: 2.35, L2300_3: 2.35,
  L2600: 2.65, L2600_1: 2.65, L2600_2: 2.65, L2600_3: 2.65, L2600_4: 2.65,
};

// Vertical half-power beamwidth by band (deg). Not in DESIQA: typical panel antenna values.
export const BAND_VBW_DEG = {
  L700: 11, L900: 10, L1800: 7, L2100: 7,
  L2300_1: 6, L2300_2: 6, L2300_3: 6, L2600: 6, L2600_1: 6, L2600_2: 6, L2600_3: 6, L2600_4: 6,
};

// Points every ~30 m along the polyline (at most MAX_SAMPLES), with their distance from the start
export function samplePath(vertices) {
  const legs = [];
  let total = 0;
  for (let i = 1; i < vertices.length; i += 1) {
    const d = distanceM(vertices[i - 1], vertices[i]);
    legs.push({ from: vertices[i - 1], to: vertices[i], d, start: total, az: bearingDeg(vertices[i - 1], vertices[i]) });
    total += d;
  }
  if (!legs.length || total <= 0) return { points: [], dist: [], total: 0 };
  const n = Math.min(MAX_SAMPLES, Math.max(2, Math.floor(total / STEP_M) + 1));
  const step = total / (n - 1);
  const points = [];
  const dist = [];
  let leg = 0;
  for (let i = 0; i < n; i += 1) {
    const s = Math.min(total, i * step);
    while (leg < legs.length - 1 && s > legs[leg].start + legs[leg].d) leg += 1;
    const L = legs[leg];
    points.push(destination(L.from[0], L.from[1], L.az, Math.max(0, s - L.start)));
    dist.push(s);
  }
  return { points, dist, total };
}

// Straight path from a site along an azimuth
export const azimuthPath = (lat, lon, az, lengthM) => [[lat, lon], destination(lat, lon, az, Math.min(lengthM, MAX_PROFILE_M))];

/**
 * terrain: metres per sample (null allowed), dist: metres from the start.
 * opts: { txHeight, rxHeight, freqGhz, tiltDeg, vbwDeg }
 */
export function analyseProfile(terrain, dist, opts) {
  const n = dist.length;
  const D = dist[n - 1] || 1;
  // fill gaps by carrying the neighbour value so one missing sample does not break the chart
  const h = terrain.map((v, i) => (v ?? terrain.slice(0, i).reverse().find(x => x != null) ?? terrain.find(x => x != null) ?? 0));
  const bulge = dist.map(d => (d * (D - d)) / (2 * K_FACTOR * EARTH_R));
  const eff = h.map((v, i) => v + bulge[i]);                     // terrain raised by earth curvature
  const tx = h[0] + (opts.txHeight ?? 30);
  const rx = h[n - 1] + (opts.rxHeight ?? 1.5);
  const los = dist.map(d => tx + ((rx - tx) * d) / D);
  const lambda = 0.299792458 / (opts.freqGhz || 1.8);           // metres
  const fresnel = dist.map(d => Math.sqrt(Math.max(0, (lambda * d * (D - d)) / D)));

  let firstBlock = null;
  let worst = { ratio: Infinity, index: 0 };
  for (let i = 1; i < n - 1; i += 1) {
    const clear = los[i] - eff[i];
    if (clear < 0 && firstBlock === null) firstBlock = i;
    const r = fresnel[i] > 0 ? clear / fresnel[i] : Infinity;
    if (r < worst.ratio) worst = { ratio: r, index: i };
  }

  // Main beam (tilt) and its -3 dB edges, as rays from the antenna; ground hit = first sample at or below terrain
  let beams = null;
  if (opts.tiltDeg != null) {
    const ray = (deg) => {
      const t = Math.tan((deg * Math.PI) / 180);
      const z = dist.map(d => tx - d * t);
      const hit = z.findIndex((v, i) => i > 0 && v <= eff[i]);
      return { deg, z, hit: hit > 0 ? hit : null };
    };
    const vbw = opts.vbwDeg ?? 7;
    beams = { main: ray(opts.tiltDeg), upper: ray(opts.tiltDeg - vbw / 2), lower: ray(opts.tiltDeg + vbw / 2) };
  }

  const valid = h.filter(v => v != null);
  return {
    terrain: h, eff, los, fresnel, beams, total: D, tx, rx,
    minH: Math.min(...valid), maxH: Math.max(...valid),
    firstBlock,
    clearancePct: Number.isFinite(worst.ratio) ? Math.round(worst.ratio * 100) : null,
    worstIndex: worst.index,
  };
}
