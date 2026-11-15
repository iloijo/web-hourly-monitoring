// Small spherical-earth helpers for the cell map (no extra dependency)
const R = 6371008.8; // mean earth radius in metres
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

// Point reached from (lat, lon) after `distM` metres on bearing `bearingDeg`
export function destination(lat, lon, bearingDeg, distM) {
  const d = distM / R;
  const b = rad(bearingDeg);
  const p1 = rad(lat);
  const l1 = rad(lon);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [deg(p2), ((deg(l2) + 540) % 360) - 180];
}

export function distanceM([lat1, lon1], [lat2, lon2]) {
  const p1 = rad(lat1);
  const p2 = rad(lat2);
  const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function bearingDeg([lat1, lon1], [lat2, lon2]) {
  const p1 = rad(lat1);
  const p2 = rad(lat2);
  const dl = rad(lon2 - lon1);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

// Wedge polygon of a sector (or a circle when the beam is omni)
export function sectorPolygon(lat, lon, azimuth, beamwidth, radiusM) {
  if (beamwidth >= 300) {
    return Array.from({ length: 37 }, (_, i) => destination(lat, lon, i * 10, radiusM));
  }
  const steps = Math.max(6, Math.round(beamwidth / 5));
  const start = azimuth - beamwidth / 2;
  const arc = Array.from({ length: steps + 1 }, (_, i) => destination(lat, lon, start + (beamwidth * i) / steps, radiusM));
  return [[lat, lon], ...arc, [lat, lon]];
}

export const formatDistance = (m) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`);

// Each band gets its own length so co-azimuth cells of different bands do not hide each other
const BAND_LENGTH = {
  L700: 1, L900: 0.92, L1800: 0.8, L2100: 0.7, L2300_1: 0.6, L2300_2: 0.53, L2300_3: 0.46,
  L2600: 0.4, L2600_1: 0.4, L2600_2: 0.36, L2600_3: 0.33, L2600_4: 0.3,
};
export const bandLength = (band) => BAND_LENGTH[band] ?? 0.5;

// Longest sector of a site: 45% of the distance to its nearest neighbour, kept between 120 m and 900 m
export const siteSectorBase = (nearestKm) => {
  if (!nearestKm) return 600;
  return Math.min(900, Math.max(120, nearestKm * 1000 * 0.45));
};
