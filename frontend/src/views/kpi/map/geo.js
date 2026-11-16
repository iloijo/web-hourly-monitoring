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

// --- Geohash (base32, e.g. "qxhbtbs") -------------------------------------------------------------------------
const GH = '0123456789bcdefghjkmnpqrstuvwxyz';

/** {lat, lon, box: [[south, west], [north, east]]} of a geohash, or null when it is not one. */
export function geohashDecode(hash) {
  const g = String(hash || '').trim().toLowerCase();
  if (!/^[0-9b-hjkmnp-z]{1,12}$/.test(g)) return null;
  const lat = [-90, 90];
  const lon = [-180, 180];
  let even = true;
  for (const ch of g) {
    const v = GH.indexOf(ch);
    for (let m = 16; m >= 1; m >>= 1) {
      const r = even ? lon : lat;
      const mid = (r[0] + r[1]) / 2;
      if (v & m) r[0] = mid; else r[1] = mid;
      even = !even;
    }
  }
  return { lat: (lat[0] + lat[1]) / 2, lon: (lon[0] + lon[1]) / 2, box: [[lat[0], lon[0]], [lat[1], lon[1]]] };
}

export function geohashEncode(latIn, lonIn, precision = 7) {
  const lat = [-90, 90];
  const lon = [-180, 180];
  let even = true;
  let out = '';
  let bits = 0;
  let v = 0;
  while (out.length < precision) {
    const r = even ? lon : lat;
    const x = even ? lonIn : latIn;
    const mid = (r[0] + r[1]) / 2;
    v <<= 1;
    if (x >= mid) { v |= 1; r[0] = mid; } else r[1] = mid;
    even = !even;
    if (++bits === 5) { out += GH[v]; bits = 0; v = 0; }
  }
  return out;
}

// --- Free-text coordinate --------------------------------------------------------------------------------------
const NUM = '-?\\d+(?:\\.\\d+)?';
const okLat = (v) => Number.isFinite(v) && Math.abs(v) <= 90;
const okLon = (v) => Number.isFinite(v) && Math.abs(v) <= 180;

// "5°06'07.8"S" / "S 5 6 7.8" / "119° 35.67' E" -> signed degrees
function dmsPart(deg0, min, sec, hemi) {
  const v = Number(deg0) + (Number(min) || 0) / 60 + (Number(sec) || 0) / 3600;
  return /[SW]/i.test(hemi) ? -v : v;
}

function parseDms(t) {
  // Hemisphere letter before the numbers ("S 5° 6.13'") or after them ("5°06'07.8"S"), never both, so the
  // letter of the second value is not taken as the suffix of the first.
  const prefix = /^\s*[NSEW]\s*\d/i.test(t);
  const body = '(\\d+(?:[.,]\\d+)?)\\s*[°º˚d]\\s*(?:(\\d+(?:[.,]\\d+)?)\\s*[\'′’m]\\s*)?(?:(\\d+(?:[.,]\\d+)?)\\s*(?:["″”]|\'\'|s)?\\s*)?';
  const re = new RegExp(prefix ? `([NSEW])\\s*${body}()` : `()${body}([NSEW])`, 'gi');
  const parts = [];
  let m;
  while ((m = re.exec(t)) && parts.length < 2) {
    const hemi = m[1] || m[5];
    if (!hemi) continue;
    const n = (x) => (x === undefined ? undefined : x.replace(',', '.'));
    parts.push({ hemi: hemi.toUpperCase(), v: dmsPart(n(m[2]), n(m[3]), n(m[4]), hemi) });
  }
  if (parts.length !== 2) return null;
  const lat = parts.find(p => p.hemi === 'N' || p.hemi === 'S');
  const lon = parts.find(p => p.hemi === 'E' || p.hemi === 'W');
  return lat && lon ? [lat.v, lon.v] : null;
}

function parseDecimalPair(t) {
  let m;
  // Google Maps links: ".../@-5.10,119.59,17z", "?q=-5.10,119.59", "!3d-5.10!4d119.59"
  if ((m = t.match(new RegExp(`!3d(${NUM})!4d(${NUM})`)))) return { pair: [Number(m[1]), Number(m[2])], kind: 'link' };
  if ((m = t.match(new RegExp(`@(${NUM}),(${NUM})`)))) return { pair: [Number(m[1]), Number(m[2])], kind: 'link' };
  if ((m = t.match(new RegExp(`[?&](?:q|query|ll|center|destination)=(${NUM})(?:,|%2C)\\s*(${NUM})`, 'i')))) {
    return { pair: [Number(m[1]), Number(m[2])], kind: 'link' };
  }
  const s = t.replace(/^[([{]|[)\]}]$/g, '').trim();
  // "-5,102156; 119,59453" or tab separated (Excel): comma may be the decimal mark
  if (/[;\t]/.test(s)) {
    const p = s.split(/\s*[;\t]\s*/).filter(Boolean);
    if (p.length === 2) return { pair: p.map(x => Number(x.replace(',', '.'))), kind: 'decimal' };
  }
  // "-5.102156, 119.59453" / "-5.102156 119.59453"
  if ((m = s.match(new RegExp(`^(${NUM})\\s*[,\\s]\\s*(${NUM})$`)))) return { pair: [Number(m[1]), Number(m[2])], kind: 'decimal' };
  // "-5,102156 119,59453" / "-5,102156, 119,59453" (comma decimals)
  if ((m = s.match(/^(-?\d+),(\d+)\s*[,\s]\s*(-?\d+),(\d+)$/))) {
    return { pair: [Number(`${m[1]}.${m[2]}`), Number(`${m[3]}.${m[4]}`)], kind: 'decimal' };
  }
  return null;
}

/**
 * Coordinate typed or pasted by the user: "lat, lon" (dot or comma decimals, any separator), DMS, a Google
 * Maps link or a geohash. Returns {lat, lon, kind, swapped, box?} or {error}. A pair given as "lon, lat" is
 * swapped when only that order is valid (or when it is the Indonesian order: lat -15..10, lon 90..145).
 */
export function parseCoordinate(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  if (/^[0-9b-hjkmnp-z]{4,12}$/i.test(t) && /[a-z]/i.test(t)) {
    const g = geohashDecode(t);
    // Site IDs such as UPD876 are valid geohash text too: only a geohash inside Indonesia is taken
    if (g && g.lat >= -15 && g.lat <= 10 && g.lon >= 90 && g.lon <= 145) {
      return { lat: g.lat, lon: g.lon, kind: 'geohash', geohash: t.toLowerCase(), box: g.box, swapped: false };
    }
    if (g && /^[a-z]{3}\d{3}$/i.test(t)) return { error: `${t.toUpperCase()} looks like a site ID, not a coordinate.` };
  }
  let pair = null;
  let kind = 'decimal';
  if (/[°º˚'′"″]|\d\s*[NSEW]\b|\b[NSEW]\s*\d/i.test(t)) {
    pair = parseDms(t);
    kind = 'dms';
  }
  if (!pair) {
    const d = parseDecimalPair(t);
    if (d) ({ pair, kind } = d);
  }
  if (!pair) return { error: 'Not a coordinate. Use "-5.102156, 119.59453", DMS, a Google Maps link or a geohash.' };
  let [a, b] = pair;
  let swapped = false;
  const indoLat = (v) => v >= -15 && v <= 10;
  const indoLon = (v) => v >= 90 && v <= 145;
  if ((!okLat(a) && okLat(b) && okLon(a)) || (indoLon(a) && indoLat(b) && !(indoLat(a) && indoLon(b)))) {
    [a, b] = [b, a];
    swapped = true;
  }
  if (!okLat(a) || !okLon(b)) return { error: 'Latitude must be -90 – 90 and longitude -180 – 180.' };
  return { lat: a, lon: b, kind, swapped };
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
