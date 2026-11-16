import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import { useMap, useMapEvents } from 'react-leaflet';
import { Loader2, Mountain, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { bearingDeg, destination, distanceM, formatDistance } from './geo';

// Bearing protractor for re-azimuth planning: a floating ring (fixed size on screen, 0 deg = true north)
// with one needle per bearing. Needle length is in real metres, so it keeps its reach while zooming.

export const NEEDLE_COLORS = ['#22d3ee', '#a3e635', '#f472b6', '#facc15', '#fb923c', '#a78bfa', '#34d399', '#f87171'];
const SNAP_PX = 25;
let seq = 0;
const uid = () => `p${++seq}`;
const norm = (a) => ((a % 360) + 360) % 360;
export const deltaDeg = (a, b) => ((norm(a - b) + 540) % 360) - 180; // signed a - b in (-180, 180]
const fmtDelta = (d) => `${d > 0 ? '+' : ''}${Math.round(d)}°`;

// Screen helpers: angle 0 = up (north), clockwise
const polar = (cx, cy, r, deg) => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
};
const wedgePath = (cx, cy, r, from, to) => {
  const [x1, y1] = polar(cx, cy, r, from);
  const [x2, y2] = polar(cx, cy, r, to);
  const large = norm(to - from) > 180 ? 1 : 0;
  return `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z`;
};

/**
 * pr: { center: [lat, lon], siteId, ringPx, snap, bearings: [...], lines: [...], drawingLine }
 * bearing: { id, label, color, az, origAz, beam, lenM, ctx }
 */
export default function ProtractorLayer({ pr, onChange, sites, placing, onPlace }) {
  const map = useMap();
  const [, setTick] = useState(0);
  const overlayRef = useRef(null);
  const drag = useRef(null);

  // Repaint while the map moves or zooms (the overlay lives in screen space)
  useMapEvents({
    move: () => setTick(t => t + 1),
    zoom: () => setTick(t => t + 1),
    resize: () => setTick(t => t + 1),
    click(e) {
      const p = [e.latlng.lat, e.latlng.lng];
      if (pr?.drawingLine) {
        onChange({ ...pr, drawingLine: false, lines: [...pr.lines, { id: uid(), to: p }] });
      } else if (placing && !pr) {
        onPlace(p, snapSite(map.latLngToContainerPoint(e.latlng)));
      }
    },
  });

  // Clicks and drags on the overlay must not reach Leaflet (no map drag / zoom underneath)
  useEffect(() => {
    if (overlayRef.current) {
      L.DomEvent.disableClickPropagation(overlayRef.current);
      L.DomEvent.disableScrollPropagation(overlayRef.current);
    }
  });

  // Keyboard: S snap, R reset needles to their original azimuth, Esc stops drawing a line
  useEffect(() => {
    if (!pr) return undefined;
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return;
      if (e.key === 'Escape' && pr.drawingLine) onChange({ ...pr, drawingLine: false });
      else if (e.key === 's' || e.key === 'S') onChange({ ...pr, snap: !pr.snap });
      else if (e.key === 'r' || e.key === 'R') {
        onChange({ ...pr, bearings: pr.bearings.map(b => (b.origAz != null ? { ...b, az: b.origAz } : b)) });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pr, onChange]);

  function snapSite(pt) {
    let best = null;
    (sites || []).forEach(s => {
      const sp = map.latLngToContainerPoint([s.lat, s.lon]);
      const d = Math.hypot(sp.x - pt.x, sp.y - pt.y);
      if (d <= SNAP_PX && (!best || d < best.d)) best = { d, site: s };
    });
    return best?.site || null;
  }

  if (!pr) return null;
  const size = map.getSize();
  const c = map.latLngToContainerPoint(pr.center);
  const R = pr.ringPx;

  const toLatLng = (ev) => {
    const rect = map.getContainer().getBoundingClientRect();
    const ll = map.containerPointToLatLng([ev.clientX - rect.left, ev.clientY - rect.top]);
    return [ll.lat, ll.lng];
  };

  const startDrag = (ev, kind, id) => {
    ev.preventDefault();
    ev.stopPropagation();
    map.dragging.disable();
    drag.current = { kind, id };
    const onMove = (e) => {
      const p = toLatLng(e);
      const cur = drag.current;
      if (!cur) return;
      if (cur.kind === 'center') {
        onChange(prev => ({ ...prev, center: p }));
      } else {
        onChange(prev => {
          let az = bearingDeg(prev.center, p);
          if (prev.snap) az = Math.round(az / 5) * 5;
          az = norm(az);
          const lenM = Math.max(50, Math.round(distanceM(prev.center, p)));
          return {
            ...prev,
            bearings: prev.bearings.map(b => (b.id === cur.id ? { ...b, az, ...(cur.kind === 'tip' ? { lenM } : {}) } : b)),
          };
        });
      }
    };
    const onUp = (e) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      map.dragging.enable();
      if (drag.current?.kind === 'center' && !e.shiftKey) {
        // drop near a site: stick to its exact position (hold Shift to place freely)
        const rect = map.getContainer().getBoundingClientRect();
        const s = snapSite({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        if (s) onChange(prev => ({ ...prev, center: [s.lat, s.lon], siteId: s.site_id }));
        else onChange(prev => ({ ...prev, siteId: null }));
      } else if (drag.current?.kind === 'center') {
        onChange(prev => ({ ...prev, siteId: null }));
      }
      drag.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const onWheel = (e) => {
    onChange(prev => ({ ...prev, ringPx: Math.max(60, Math.min(400, prev.ringPx + (e.deltaY < 0 ? 10 : -10))) }));
  };

  const ticks = [];
  for (let d = 0; d < 360; d += 2) {
    const major = d % 10 === 0;
    const [x1, y1] = polar(c.x, c.y, R, d);
    const [x2, y2] = polar(c.x, c.y, R - (major ? 10 : 5), d);
    ticks.push(<line key={d} x1={x1} y1={y1} x2={x2} y2={y2} stroke={d === 0 ? '#ef4444' : '#facc15'} strokeWidth={major ? 2 : 1} />);
    if (major && (R >= 110 || d % 30 === 0)) {
      const [tx, ty] = polar(c.x, c.y, R - 19, d);
      ticks.push(
        <text key={`t${d}`} x={tx} y={ty} transform={`rotate(${d} ${tx} ${ty})`} className="netpulse-protractor-text"
          textAnchor="middle" dominantBaseline="middle" fontSize={d % 30 === 0 ? 10 : 8}>{d}</text>,
      );
    }
  }

  return createPortal(
    <div ref={overlayRef} className="absolute inset-0 z-[620] pointer-events-none select-none">
      <svg width={size.x} height={size.y} className="absolute inset-0 overflow-visible">
        {/* manual lines from the centre */}
        {pr.lines.map(l => {
          const e = map.latLngToContainerPoint(l.to);
          const az = norm(bearingDeg(pr.center, l.to));
          return (
            <g key={l.id}>
              <line x1={c.x} y1={c.y} x2={e.x} y2={e.y} stroke="#ef4444" strokeWidth={2} strokeDasharray="7 5" />
              <circle cx={e.x} cy={e.y} r={3.5} fill="#ef4444" />
              <text x={e.x + 8} y={e.y - 6} className="netpulse-protractor-text" fontSize={10} fill="#fecaca">
                {az.toFixed(1)}° · {formatDistance(distanceM(pr.center, l.to))}
              </text>
            </g>
          );
        })}

        {/* needles with their beam wedge */}
        {pr.bearings.map(b => {
          const tipLL = destination(pr.center[0], pr.center[1], b.az, b.lenM);
          const tip = map.latLngToContainerPoint(tipLL);
          const len = Math.max(12, Math.hypot(tip.x - c.x, tip.y - c.y));
          const moved = b.origAz != null && Math.abs(deltaDeg(b.az, b.origAz)) >= 0.5;
          const [ox, oy] = moved ? polar(c.x, c.y, len, b.origAz) : [0, 0];
          const [ax, ay] = polar(tip.x, tip.y, 11, b.az + 150);
          const [bx, by] = polar(tip.x, tip.y, 11, b.az - 150);
          const [lx, ly] = polar(c.x, c.y, len + 16, b.az);
          return (
            <g key={b.id}>
              {b.beam > 0 && b.beam < 360 && (
                <path d={wedgePath(c.x, c.y, len, b.az - b.beam / 2, b.az + b.beam / 2)} fill={b.color} fillOpacity={0.16} stroke="none" />
              )}
              {moved && <line x1={c.x} y1={c.y} x2={ox} y2={oy} stroke={b.color} strokeWidth={1.5} strokeDasharray="4 4" opacity={0.7} />}
              <line x1={c.x} y1={c.y} x2={tip.x} y2={tip.y} stroke="#111827" strokeWidth={5} opacity={0.45} />
              <line x1={c.x} y1={c.y} x2={tip.x} y2={tip.y} stroke={b.color} strokeWidth={3} />
              <polygon points={`${tip.x},${tip.y} ${ax},${ay} ${bx},${by}`} fill={b.color} stroke="#111827" strokeWidth={0.8} />
              {/* rotate: grab anywhere on the needle; tip: rotate and change the length */}
              <line x1={c.x} y1={c.y} x2={tip.x} y2={tip.y} stroke="transparent" strokeWidth={14}
                style={{ pointerEvents: 'stroke', cursor: 'grab' }} onPointerDown={(e) => startDrag(e, 'rotate', b.id)} />
              <circle cx={tip.x} cy={tip.y} r={8} fill="transparent" style={{ pointerEvents: 'all', cursor: 'nwse-resize' }}
                onPointerDown={(e) => startDrag(e, 'tip', b.id)} />
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="netpulse-protractor-text" fontSize={11} fill={b.color}>
                {b.label} {Math.round(b.az)}°{moved ? ` (${fmtDelta(deltaDeg(b.az, b.origAz))})` : ''}
              </text>
            </g>
          );
        })}

        {/* ring, ticks and labels; double-click inside draws a line, wheel resizes */}
        <circle cx={c.x} cy={c.y} r={R} fill="rgba(0,0,0,0.001)" stroke="#111827" strokeWidth={4} opacity={0.5}
          style={{ pointerEvents: 'all' }} onWheel={onWheel}
          onDoubleClick={(e) => { e.stopPropagation(); onChange(prev => ({ ...prev, drawingLine: true })); }} />
        <circle cx={c.x} cy={c.y} r={R} fill="none" stroke="#facc15" strokeWidth={2} />
        {ticks}

        {/* centre: drag to move (sticks to a site on release, Shift = free) */}
        <line x1={c.x - 15} y1={c.y} x2={c.x + 15} y2={c.y} stroke="#facc15" strokeWidth={2} />
        <line x1={c.x} y1={c.y - 15} x2={c.x} y2={c.y + 15} stroke="#facc15" strokeWidth={2} />
        <circle cx={c.x} cy={c.y} r={9} fill={pr.siteId ? '#16a34a' : '#facc15'} fillOpacity={0.55} stroke="#111827" strokeWidth={1.5}
          style={{ pointerEvents: 'all', cursor: 'move' }} onPointerDown={(e) => startDrag(e, 'center')} />
      </svg>
      {pr.drawingLine && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 rounded-md bg-rose-600 text-white text-[11px] px-2 py-1 shadow">
          Click the map to draw a line from the centre · Esc to cancel
        </div>
      )}
    </div>,
    map.getContainer(),
  );
}

// Sites (main + tier) inside a needle's beam and reach
export function sitesToward(pr, b, sites) {
  return (sites || [])
    .filter(s => s.site_id !== pr.siteId)
    .map(s => ({ s, d: distanceM(pr.center, [s.lat, s.lon]), az: bearingDeg(pr.center, [s.lat, s.lon]) }))
    .filter(x => x.d > 30 && x.d <= b.lenM && Math.abs(deltaDeg(x.az, b.az)) <= Math.max(5, (b.beam || 65) / 2))
    .sort((x, y) => x.d - y.d);
}

// Number field that keeps what is typed: a value is applied as soon as it is inside [min, max]
// (so the spinner and "450" typed digit by digit both work) and clamped only when leaving the field.
// Clamping on every keystroke turned "450" into "50450".
function NumInput({ value, onCommit, min = -Infinity, max = Infinity, step, className }) {
  const [draft, setDraft] = useState(null);
  const clamp = (n) => Math.max(min, Math.min(max, n));
  const finish = () => {
    if (draft !== null) {
      const n = Number(draft);
      if (draft.trim() !== '' && Number.isFinite(n)) onCommit(clamp(n));
    }
    setDraft(null);
  };
  return (
    <input
      type="number"
      step={step}
      min={Number.isFinite(min) ? min : undefined}
      max={Number.isFinite(max) ? max : undefined}
      className={className}
      value={draft ?? value}
      onChange={(e) => {
        const v = e.target.value;
        setDraft(v);
        const n = Number(v);
        if (v.trim() !== '' && Number.isFinite(n) && n >= min && n <= max) onCommit(n);
      }}
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') { setDraft(null); e.currentTarget.blur(); }
      }}
    />
  );
}

// Side panel: needles table, lines and actions
export function ProtractorPanel({ pr, onChange, onClose, onProfile, onLoadSectors, onSaveAzimuth, sites, darkMode }) {
  const [count, setCount] = useState(3);
  const [saving, setSaving] = useState({});   // needle id -> 'busy' | error text
  const saveNeedle = async (b) => {
    setSaving(p => ({ ...p, [b.id]: 'busy' }));
    try {
      await onSaveAzimuth(b);
      setSaving(p => ({ ...p, [b.id]: null }));
    } catch (e) {
      setSaving(p => ({ ...p, [b.id]: e.message || String(e) }));
    }
  };
  if (!pr) return null;
  const shell = darkMode ? 'bg-slate-900/95 border-slate-700 text-slate-200' : 'bg-white/95 border-slate-200 text-slate-700';
  const input = `rounded border px-1 py-0.5 tabular-nums ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`;
  const setB = (id, patch) => onChange(prev => ({ ...prev, bearings: prev.bearings.map(b => (b.id === id ? { ...b, ...patch } : b)) }));
  const nextColor = NEEDLE_COLORS[pr.bearings.length % NEEDLE_COLORS.length];
  const btn = 'flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-500/30 hover:bg-slate-500/15 cursor-pointer';
  return (
    <div className={`absolute top-2 right-12 z-[640] w-80 max-h-[60%] overflow-auto rounded-lg border shadow-lg text-[11px] ${shell}`}>
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-slate-500/20">
        <span className="font-bold uppercase tracking-wider">Protractor</span>
        <span className="opacity-70">{pr.siteId || `${pr.center[0].toFixed(5)}, ${pr.center[1].toFixed(5)}`}</span>
        <button type="button" onClick={onClose} className="ml-auto p-0.5 rounded hover:bg-slate-500/15 cursor-pointer" title="Remove protractor"><X className="w-3.5 h-3.5" /></button>
      </div>
      <table className="w-full">
        <thead className="opacity-60">
          <tr><th className="text-left pl-2.5 font-semibold">Needle</th><th className="font-semibold">Az</th><th className="font-semibold">Δ</th><th className="font-semibold">Len m</th><th className="font-semibold">BW</th><th /></tr>
        </thead>
        <tbody>
          {pr.bearings.map(b => {
            const d = b.origAz != null ? deltaDeg(b.az, b.origAz) : null;
            const toward = sitesToward(pr, b, sites);
            return (
              <tr key={b.id} className="align-top">
                <td className="pl-2.5 py-0.5">
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: b.color }} />
                    <input className={`${input} w-12`} value={b.label} onChange={e => setB(b.id, { label: e.target.value })} />
                  </div>
                  {b.origAz != null && <div className="opacity-60">was {Math.round(b.origAz)}°</div>}
                  {saving[b.id] && saving[b.id] !== 'busy' && <div className="text-rose-500">{saving[b.id]}</div>}
                  {toward.length > 0 && (
                    <div className="text-amber-600" title="Sites inside this needle's beam and reach">
                      → {toward.slice(0, 3).map(x => `${x.s.site_id} ${formatDistance(x.d)}`).join(', ')}
                    </div>
                  )}
                </td>
                <td><NumInput className={`${input} w-12`} value={Math.round(b.az)} min={0} max={360} onCommit={v => setB(b.id, { az: norm(v) })} /></td>
                <td className={`text-center ${d ? 'font-semibold text-orange-500' : 'opacity-50'}`}>{d == null ? '–' : fmtDelta(d)}</td>
                <td><NumInput className={`${input} w-14`} value={b.lenM} step={50} min={50} max={20000} onCommit={v => setB(b.id, { lenM: Math.round(v) })} /></td>
                <td><NumInput className={`${input} w-10`} value={b.beam} min={0} max={360} onCommit={v => setB(b.id, { beam: v })} /></td>
                <td className="pr-1.5">
                  <div className="flex gap-0.5">
                    <button type="button" className="p-0.5 rounded hover:bg-slate-500/15 cursor-pointer" title={d ? 'Profile: new azimuth vs original' : 'Elevation profile along this needle'}
                      onClick={() => onProfile({ kind: 'needle', bearing: b })}><Mountain className="w-3.5 h-3.5 text-amber-600" /></button>
                    {onSaveAzimuth && b.sector != null && d ? (
                      <button type="button" className="p-0.5 rounded hover:bg-slate-500/15 cursor-pointer disabled:opacity-40"
                        disabled={saving[b.id] === 'busy'}
                        title={`Save ${Math.round(b.az)}° as the azimuth of every macro cell of sector ${b.sector} (edit, until DESIQA matches)`}
                        onClick={() => saveNeedle(b)}>
                        {saving[b.id] === 'busy' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 text-fuchsia-600" />}
                      </button>
                    ) : null}
                    <button type="button" className="p-0.5 rounded hover:bg-slate-500/15 cursor-pointer" title="Delete needle"
                      onClick={() => onChange(prev => ({ ...prev, bearings: prev.bearings.filter(x => x.id !== b.id) }))}><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {pr.lines.length > 0 && (
        <div className="px-2.5 py-1 border-t border-slate-500/20 space-y-0.5">
          {pr.lines.map((l, i) => (
            <div key={l.id} className="flex items-center gap-1.5">
              <span className="w-2 h-0.5 bg-rose-500" />
              <span>Line {i + 1}: {norm(bearingDeg(pr.center, l.to)).toFixed(1)}° · {formatDistance(distanceM(pr.center, l.to))}</span>
              <button type="button" className="ml-auto p-0.5 rounded hover:bg-slate-500/15 cursor-pointer" title="Elevation profile along this line"
                onClick={() => onProfile({ kind: 'line', line: l })}><Mountain className="w-3.5 h-3.5 text-amber-600" /></button>
              <button type="button" className="p-0.5 rounded hover:bg-slate-500/15 cursor-pointer" title="Delete line"
                onClick={() => onChange(prev => ({ ...prev, lines: prev.lines.filter(x => x.id !== l.id) }))}><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1 px-2.5 py-1.5 border-t border-slate-500/20">
        <button type="button" className={btn} onClick={() => onChange(prev => ({
          ...prev, bearings: [...prev.bearings, { id: uid(), label: `B${prev.bearings.length + 1}`, color: nextColor, az: 0, origAz: null, beam: 65, lenM: 1000 }],
        }))}><Plus className="w-3 h-3" /> Needle</button>
        <span className="flex items-center gap-1">
          <NumInput min={1} max={12} className={`${input} w-9`} value={count} onCommit={v => setCount(Math.round(v))} />
          <button type="button" className={btn} title="Replace the needles with N evenly spaced ones" onClick={() => onChange(prev => ({
            ...prev,
            bearings: Array.from({ length: count }, (_, i) => ({
              id: uid(), label: `B${i + 1}`, color: NEEDLE_COLORS[i % NEEDLE_COLORS.length], az: (360 / count) * i, origAz: null, beam: 65, lenM: 1000,
            })),
          }))}>Set N</button>
        </span>
        <button type="button" className={`${btn} ${pr.snap ? 'bg-blue-600 text-white border-blue-600' : ''}`} onClick={() => onChange(prev => ({ ...prev, snap: !prev.snap }))} title="Snap needles to 5° (S)">Snap 5°</button>
        <button type="button" className={btn} title="Back to the original azimuths (R)" onClick={() => onChange(prev => ({
          ...prev, bearings: prev.bearings.map(b => (b.origAz != null ? { ...b, az: b.origAz } : b)),
        }))}><RotateCcw className="w-3 h-3" /> Reset</button>
        {pr.siteId && <button type="button" className={btn} onClick={() => onLoadSectors(pr.siteId)} title="Replace the needles with this site's sectors">Load {pr.siteId} sectors</button>}
      </div>
      <div className="px-2.5 pb-1.5 opacity-60 leading-snug">
        Drag the centre to move (sticks to a site, Shift = free) · drag a needle to rotate, its tip to change the length ·
        wheel on the ring to resize · double-click inside the ring to draw a line.
      </div>
    </div>
  );
}
