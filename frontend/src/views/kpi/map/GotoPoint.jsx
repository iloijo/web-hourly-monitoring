import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, Popup, Rectangle, Tooltip, useMap } from 'react-leaflet';
import { Check, Copy, MapPin, Mountain, X } from 'lucide-react';
import { getJson } from '../../../api/client';
import { copyText } from '../../../lib/chartCopy';
import { bandColor } from './colorModes';
import { bearingDeg, distanceM, formatDistance, geohashEncode, parseCoordinate } from './geo';
import { setupCellPopup } from './popupSetup';

// "Go to coordinate": a pin from a typed / pasted lat-long, DMS, Google Maps link or geohash, with what
// serves that spot (sectors whose beam covers it, nearest sites) and a terrain profile to it.

export const PIN_COLOR = '#e11d48';
const FACING_MAX_M = 10000;     // sectors farther than this are not listed as serving the pin
const FACING_MAX_ROWS = 8;
const KIND_LABEL = { decimal: 'lat, long', dms: 'DMS', link: 'Google Maps link', geohash: 'geohash' };

const angleDiff = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};
const fmtCoord = (p) => `${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`;

// Toolbar input. Enter or a paste goes straight to the point.
export function GotoInput({ point, onGo, onClear, darkMode }) {
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const go = (raw) => {
    const r = parseCoordinate(raw);
    if (!r) { setError(null); return; }
    if (r.error) { setError(r.error); return; }
    setError(null);
    onGo({ ...r, input: raw.trim(), key: Date.now() });
  };
  const clear = () => { setText(''); setError(null); onClear(); };
  const base = darkMode ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-700';
  return (
    <form
      onSubmit={e => { e.preventDefault(); go(text); }}
      className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 ${base}`}
      style={error ? { borderColor: '#f43f5e' } : point ? { borderColor: PIN_COLOR } : undefined}
      title={error || 'Go to a coordinate: "-5.102156, 119.59453", comma decimals, DMS, a Google Maps link or a geohash (qxhbtbs). Enter or paste.'}
    >
      <MapPin className="w-3.5 h-3.5 shrink-0" style={{ color: point ? PIN_COLOR : undefined, opacity: point ? 1 : 0.6 }} />
      <input
        value={text}
        onChange={e => { setText(e.target.value); setError(null); }}
        onPaste={e => {
          const t = e.clipboardData.getData('text');
          e.preventDefault();
          setText(t.trim());
          go(t);
        }}
        onKeyDown={e => { if (e.key === 'Escape') clear(); }}
        placeholder="lat, long / geohash"
        className="w-40 bg-transparent outline-none text-[11px] font-semibold placeholder:font-normal placeholder:opacity-60"
        aria-label="Go to coordinate"
      />
      {(point || text) && (
        <button type="button" onClick={clear} className="opacity-60 hover:opacity-100 cursor-pointer" title="Remove the pin">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </form>
  );
}

function CopyButton({ text, label }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => { if (await copyText(text)) { setDone(true); setTimeout(() => setDone(false), 1200); } }}
      className="inline-flex items-center gap-0.5 px-1 rounded border border-slate-300 hover:bg-slate-100 cursor-pointer"
      title={`Copy ${label}`}
    >
      {done ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

// Nearest 4G sites to the pin (all sites, not only the ones on the map)
function useNearestSites(point) {
  const [state, setState] = useState({ key: null, sites: [] });
  useEffect(() => {
    if (!point) return undefined;
    let cancelled = false;
    const load = async () => {
      for (const pad of [0.05, 0.25]) {
        const j = await getJson('/api/map/sites', { south: point.lat - pad, west: point.lon - pad, north: point.lat + pad, east: point.lon + pad });
        const sites = (j.sites || []).map(s => ({
          ...s,
          distance: distanceM([s.lat, s.lon], [point.lat, point.lon]),
          bearing: bearingDeg([s.lat, s.lon], [point.lat, point.lon]),
        })).sort((a, b) => a.distance - b.distance);
        if (sites.length >= 3 || pad === 0.25) return sites.slice(0, 3);
      }
      return [];
    };
    load()
      .then(sites => { if (!cancelled) setState({ key: point.key, sites }); })
      .catch(() => { if (!cancelled) setState({ key: point.key, sites: [] }); });
    return () => { cancelled = true; };
  }, [point]);
  return state.key === point?.key ? state.sites : null;
}

function PinInfo({ point, data, onProfile }) {
  const nearest = useNearestSites(point);
  const shownSites = useMemo(() => new Set((data?.sites || []).map(s => s.site_id)), [data]);
  const here = [point.lat, point.lon];
  const gh = point.geohash || geohashEncode(point.lat, point.lon, 7);

  // Macro cells on the map whose beam (azimuth +- beamwidth/2) covers the pin
  const facing = useMemo(() => (data?.cells || [])
    .filter(c => !c.indoor && c.azimuth !== null && c.lat !== null && c.lon !== null)
    .map(c => {
      const dist = distanceM([c.lat, c.lon], here);
      const brg = bearingDeg([c.lat, c.lon], here);
      const off = angleDiff(Number(c.azimuth), brg);
      return { c, dist, brg, off, half: (c.beamwidth || 65) / 2 };
    })
    .filter(x => x.dist <= FACING_MAX_M && x.off <= x.half)
    .sort((a, b) => a.dist - b.dist || a.off - b.off)
    .slice(0, FACING_MAX_ROWS), [data, point]); // eslint-disable-line react-hooks/exhaustive-deps

  const main = data?.center ? [data.center.lat, data.center.lon] : null;
  return (
    <div className="text-[11px] w-[300px]">
      <div className="font-bold text-xs mb-1 flex items-center gap-1" style={{ color: PIN_COLOR }}>
        <MapPin className="w-3.5 h-3.5" /> Pin
        <span className="font-normal opacity-60 text-[10px]">from {KIND_LABEL[point.kind] || point.kind}{point.swapped ? ' (long/lat swapped)' : ''}</span>
      </div>
      <table className="w-full">
        <tbody>
          <tr>
            <td className="pr-2 py-px opacity-60 whitespace-nowrap">Lat / Long</td>
            <td className="py-px font-semibold tabular-nums">{fmtCoord(point)} <CopyButton text={fmtCoord(point)} label="lat, long" /></td>
          </tr>
          <tr>
            <td className="pr-2 py-px opacity-60 whitespace-nowrap">Geohash</td>
            <td className="py-px font-semibold">
              {gh} <CopyButton text={gh} label="geohash" />
              {point.box && <span className="opacity-60 font-normal"> ±{formatDistance(distanceM(point.box[0], point.box[1]) / 2)}</span>}
            </td>
          </tr>
          {main && (
            <tr>
              <td className="pr-2 py-px opacity-60 whitespace-nowrap">From {data.site_id}</td>
              <td className="py-px font-semibold">{formatDistance(distanceM(main, here))} @ {Math.round(bearingDeg(main, here))}°</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="mt-1.5 pt-1.5 border-t border-slate-200">
        <div className="opacity-60 mb-0.5">Sectors pointing at the pin (on the map)</div>
        {facing.length ? facing.map(({ c, dist, off }) => (
          <div key={`${c.siteid_ci}|${c.cell_name}`} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: bandColor(c.band) }} />
            <span className="truncate flex-1 min-w-0" title={c.cell_name}>{c.cell_name}</span>
            <span className="opacity-70 whitespace-nowrap tabular-nums" title={`Azimuth ${c.azimuth}°, the pin is ${Math.round(off)}° off the boresight`}>
              {c.azimuth}° ±{Math.round(off)}° · {formatDistance(dist)}
            </span>
            <button type="button" onClick={() => onProfile({ from: [c.lat, c.lon], to: here, label: `${c.cell_name} → pin`, cell: c })}
              className="shrink-0 p-0.5 rounded hover:bg-amber-50 cursor-pointer" title="Terrain profile from this cell to the pin">
              <Mountain className="w-3.5 h-3.5 text-amber-600" />
            </button>
          </div>
        )) : (
          <div className="opacity-60">No sector on the map points here. Show the 1st tier, or open the map on a nearer site.</div>
        )}
      </div>

      <div className="mt-1.5 pt-1.5 border-t border-slate-200">
        <div className="opacity-60 mb-0.5">Nearest 4G sites</div>
        {nearest === null ? <div className="opacity-60">Loading…</div> : nearest.length ? nearest.map(s => (
          <div key={s.site_id} className="flex items-center gap-1.5">
            <span className="font-semibold">{s.site_id}</span>
            {!shownSites.has(s.site_id) && <span className="text-[10px] px-1 rounded bg-slate-500/15 opacity-80" title="Not loaded on this map">not on map</span>}
            <span className="opacity-70 ml-auto whitespace-nowrap tabular-nums">{formatDistance(s.distance)} @ {Math.round(s.bearing)}°</span>
            <button type="button" onClick={() => onProfile({ from: [s.lat, s.lon], to: here, label: `${s.site_id} → pin` })}
              className="shrink-0 p-0.5 rounded hover:bg-amber-50 cursor-pointer" title="Terrain profile from this site to the pin">
              <Mountain className="w-3.5 h-3.5 text-amber-600" />
            </button>
          </div>
        )) : <div className="opacity-60">No 4G site within 25 km.</div>}
      </div>
    </div>
  );
}

// Pin (and the geohash cell) on the map; the view moves to it and its popup opens on every new pin
export function GotoLayer({ point, data, onProfile }) {
  const map = useMap();
  const markerRef = useRef(null);
  useEffect(() => {
    if (!point) return undefined;
    map.setView([point.lat, point.lon], Math.max(map.getZoom(), 16));
    const t = setTimeout(() => markerRef.current?.openPopup(), 50);
    return () => clearTimeout(t);
  }, [point, map]);
  if (!point) return null;
  return (
    <>
      {point.box && (
        <Rectangle bounds={point.box} interactive={false}
          pathOptions={{ color: PIN_COLOR, weight: 1.5, dashArray: '4 3', fillColor: PIN_COLOR, fillOpacity: 0.08 }} />
      )}
      <CircleMarker
        ref={markerRef}
        center={[point.lat, point.lon]}
        radius={7}
        pathOptions={{ color: '#ffffff', weight: 2.5, fillColor: PIN_COLOR, fillOpacity: 1 }}
      >
        <Tooltip direction="top" offset={[0, -8]}>{fmtCoord(point)}</Tooltip>
        <Popup ref={setupCellPopup} maxWidth={340} autoPanPaddingTopLeft={[48, 10]}>
          <PinInfo point={point} data={data} onProfile={onProfile} />
        </Popup>
      </CircleMarker>
    </>
  );
}
