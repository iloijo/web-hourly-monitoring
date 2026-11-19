import { useEffect, useMemo, useState } from 'react';
import { Polygon, useMap } from 'react-leaflet';
import { ChevronDown, ChevronUp, Loader2, X } from 'lucide-react';
import { postJson } from '../../../api/client';
import { destination, formatDistance } from './geo';
import { BAND_VBW_DEG } from './profile';

// Beam footprint ("horizon") of one sector: the ground reached by the low / mid / high third of the vertical
// half-power beam, from the DEM. Ground hidden behind nearer terrain is drawn darker by how high it is blocked.
// Current tilt and a proposed tilt are computed together, so switching between them is instant.

export const HORIZON_ZONES = {
  high: { label: 'High (upper beam, far)', color: '#dc2626' },
  mid: { label: 'Mid (main beam)', color: '#2563eb' },
  low: { label: 'Low (lower beam, near)', color: '#16a34a' },
  under: { label: 'Under the beam', color: '#94a3b8' },
};
const SHADE_MIX = [0, 0.3, 0.48, 0.62, 0.75];          // share of black per blocking class
const SHADE_LABEL = ['visible', '0–5 m', '5–20 m', '20–50 m', '> 50 m'];

const mix = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s) => Math.round(((n >> s) & 255) * (1 - k));
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
};
export const horizonColor = (zone, shade) => mix(HORIZON_ZONES[zone].color, SHADE_MIX[shade] || 0);

function wedge(lat, lon, az0, az1, d0, d1) {
  const outer = [destination(lat, lon, az0, d1), destination(lat, lon, (az0 + az1) / 2, d1), destination(lat, lon, az1, d1)];
  if (d0 <= 1) return [[lat, lon], ...outer];
  return [...outer, destination(lat, lon, az1, d0), destination(lat, lon, az0, d0)];
}

// Map layer: one polygon per run (same zone and blocking class along a ray)
export function HorizonShapes({ horizon, opacity = 0.5 }) {
  const map = useMap();
  if (!map.getPane('horizon')) {
    // Wedges are drawn opaque and the pane carries the transparency, so neighbouring wedges merge into one
    // colour field without seams; a light blur gives the footprint and the colour changes a soft edge.
    const pane = map.createPane('horizon');
    pane.style.zIndex = 395;                  // under the sectors, over the borders
    pane.style.pointerEvents = 'none';
    pane.style.filter = 'blur(3px)';
  }
  map.getPane('horizon').style.opacity = String(opacity);
  const res = horizon?.data?.results?.[horizon.view === 'prop' && horizon.data.results.length > 1 ? 1 : 0];
  const shapes = useMemo(() => {
    if (!res) return [];
    const { lat, lon } = horizon.cell;
    return res.runs.map(([az0, az1, d0, d1, zone, shade], i) => ({
      key: i, color: horizonColor(zone, shade), positions: wedge(lat, lon, az0, az1, d0, d1),
    }));
  }, [res, horizon]);
  // A new computation zooms the map out to the whole footprint (switching now / proposed does not)
  const data = horizon?.data;
  useEffect(() => {
    if (!data) return;
    const { lat, lon, azimuth } = horizon.cell;
    const half = (horizon.cell.beamwidth || 65) / 2;
    const pts = [[lat, lon], ...[-half, 0, half].map(a => destination(lat, lon, azimuth + a, data.radius_m))];
    // leave room for the panel on the left when the map is wide enough
    const left = map.getSize().x > 620 ? 310 : 20;
    map.fitBounds(pts, { paddingTopLeft: [left, 30], paddingBottomRight: [50, 30], maxZoom: 16 });
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  return shapes.map(s => (
    <Polygon key={s.key} positions={s.positions} interactive={false} pane="horizon"
      pathOptions={{ stroke: true, weight: 1, color: s.color, opacity: 1, fillColor: s.color, fillOpacity: 1 }} />
  ));
}

// Default inputs from a cell (DESIQA / RNO values, typical vertical beamwidth of the band)
export const horizonFor = (cell, ctx) => ({
  cell,
  height: ctx.txHeight ?? 30,
  tiltNow: ctx.tiltDeg ?? 4,
  tiltProp: ctx.tiltDeg ?? 4,
  vbw: BAND_VBW_DEG[cell.band] ?? 7,
  view: 'now',
  data: null,
});

const Num = ({ label, value, onChange, step = 0.5, darkMode, title }) => (
  <label className="flex flex-col gap-0.5" title={title}>
    <span className="opacity-60">{label}</span>
    <input type="number" step={step} value={value} onChange={e => onChange(e.target.value)}
      className={`w-16 h-6 rounded border px-1 tabular-nums ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`} />
  </label>
);

export function HorizonPanel({ horizon, setHorizon, darkMode, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { cell } = horizon;
  const params = `${horizon.height}|${horizon.tiltNow}|${horizon.tiltProp}|${horizon.vbw}`;
  const [computed, setComputed] = useState(null);
  const [folded, setFolded] = useState(false);

  const compute = async () => {
    setBusy(true);
    setError(null);
    const tilts = [Number(horizon.tiltNow)];
    if (Number(horizon.tiltProp) !== Number(horizon.tiltNow)) tilts.push(Number(horizon.tiltProp));
    try {
      const r = await postJson('/api/map/beam-footprint', {
        lat: cell.lat, lon: cell.lon, azimuth: cell.azimuth, beamwidth: cell.beamwidth || 65,
        tx_height: Number(horizon.height), tilts, vbw: Number(horizon.vbw),
      });
      if (r.error) throw new Error(r.error);
      setHorizon(h => ({ ...h, data: r, view: tilts.length > 1 ? h.view : 'now' }));
      setComputed(params);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };
  // first open: compute straight away
  useEffect(() => { compute(); }, [cell.siteid_ci]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (v) => setHorizon(h => ({ ...h, [k]: v }));
  const results = horizon.data?.results || [];
  const shell = darkMode ? 'bg-slate-900/95 border-slate-700 text-slate-200' : 'bg-white/95 border-slate-200 text-slate-700';
  const stale = computed && computed !== params;

  return (
    <div className={`absolute top-12 left-2 z-[640] w-[290px] rounded-lg border shadow-lg p-2.5 text-[11px] space-y-2 ${shell}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0">
          <div className="font-bold">Beam horizon</div>
          <div className="opacity-60 truncate">{cell.cell_name} · {cell.band} · {cell.azimuth}° · BW {cell.beamwidth || 65}°</div>
        </div>
        <button type="button" onClick={() => setFolded(f => !f)} className="ml-auto p-0.5 rounded hover:bg-slate-500/15 cursor-pointer"
          title={folded ? 'Show the panel' : 'Fold the panel to see the map'}>
          {folded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
        <button type="button" onClick={onClose} className="p-0.5 rounded hover:bg-slate-500/15 cursor-pointer" title="Close"><X className="w-4 h-4" /></button>
      </div>
      {!folded && (<>
      <div className="flex flex-wrap gap-2 items-end">
        <Num label="Height m" value={horizon.height} step={1} onChange={set('height')} darkMode={darkMode} title="Antenna height above ground" />
        <Num label="Tilt now" value={horizon.tiltNow} onChange={set('tiltNow')} darkMode={darkMode} title="Total tilt now (E + M)" />
        <Num label="Proposed" value={horizon.tiltProp} onChange={set('tiltProp')} darkMode={darkMode} title="Total tilt to compare" />
        <Num label="V-BW" value={horizon.vbw} onChange={set('vbw')} darkMode={darkMode} title="Vertical half-power beamwidth (typical for the band)" />
        <button type="button" onClick={compute} disabled={busy}
          className={`h-6 px-2 rounded font-semibold text-white cursor-pointer disabled:opacity-50 ${stale ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : stale ? 'Update' : 'Compute'}
        </button>
      </div>
      {busy && !results.length && <div className="opacity-70">Reading terrain (first time for a sector can take ~15 s)…</div>}
      {error && <div className="text-rose-500">{error}</div>}
      {results.length > 0 && (
        <>
          {results.length > 1 && (
            <div className={`flex h-6 rounded border overflow-hidden ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
              {[['now', `Now ${results[0].tilt}°`], ['prop', `Proposed ${results[1].tilt}°`]].map(([id, label]) => (
                <button key={id} type="button" onClick={() => set('view')(id)}
                  className={`flex-1 font-semibold cursor-pointer ${horizon.view === id ? 'bg-blue-600 text-white' : ''}`}>{label}</button>
              ))}
            </div>
          )}
          <table className="w-full tabular-nums">
            <thead>
              <tr className="opacity-60">
                <td>Zone</td>
                {results.map(r => <td key={r.tilt} className="text-right">{r.tilt}° km² · blocked</td>)}
              </tr>
            </thead>
            <tbody>
              {['high', 'mid', 'low', 'under'].map(z => (
                <tr key={z}>
                  <td className="py-px">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-middle" style={{ background: HORIZON_ZONES[z].color }} />
                    {HORIZON_ZONES[z].label}
                  </td>
                  {results.map(r => (
                    <td key={r.tilt} className="text-right">
                      {r.area_km2[z] != null ? `${r.area_km2[z]} · ${r.blocked_pct[z] ?? 0}%` : '–'}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className="py-px opacity-60">Main beam lands at</td>
                {results.map(r => <td key={r.tilt} className="text-right font-semibold">{r.landing_m ? formatDistance(r.landing_m) : 'beyond'}</td>)}
              </tr>
            </tbody>
          </table>
          <div className="flex items-center gap-1 flex-wrap">
            <span className="opacity-60 mr-1">Blocked by</span>
            {SHADE_LABEL.map((l, i) => (
              <span key={l} className="flex items-center gap-0.5">
                <span className="inline-block w-3 h-2.5 rounded-sm" style={{ background: horizonColor('mid', i) }} />{l}
              </span>
            ))}
          </div>
          <div className="opacity-50 leading-snug">
            Terrain GLO-30 (onedb), {horizon.data.rays} rays, step {horizon.data.step_m} m, up to {formatDistance(horizon.data.radius_m)}.
            Earth curvature k = 4/3. Darker = the ground is behind higher terrain.
          </div>
        </>
      )}
      </>)}
    </div>
  );
}
