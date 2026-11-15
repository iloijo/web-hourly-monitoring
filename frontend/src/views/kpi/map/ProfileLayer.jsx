import { useEffect, useState } from 'react';
import { CircleMarker, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { distanceM, formatDistance } from './geo';
import { MAX_PROFILE_M } from './profile';

// Profile tool: click points, double-click to finish (2+ points), Esc to cancel
export function ProfileDrawLayer({ active, onFinish, onCancel }) {
  const map = useMap();
  const [pts, setPts] = useState([]);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const el = map.getContainer();
    if (active) {
      map.doubleClickZoom.disable();
      el.style.cursor = 'crosshair';
    }
    return () => { map.doubleClickZoom.enable(); el.style.cursor = ''; };
  }, [active, map]);

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { setPts([]); onCancel(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onCancel]);

  const length = pts.reduce((t, p, i) => (i ? t + distanceM(pts[i - 1], p) : 0), 0);
  useMapEvents({
    click(e) {
      if (!active) return;
      const p = [e.latlng.lat, e.latlng.lng];
      const extra = pts.length ? distanceM(pts[pts.length - 1], p) : 0;
      if (length + extra > MAX_PROFILE_M) return; // 20 km limit
      setPts([...pts, p]);
    },
    dblclick() {
      if (!active || pts.length < 2) return;
      onFinish(pts);
      setPts([]);
    },
    mousemove(e) { if (active && pts.length) setHover([e.latlng.lat, e.latlng.lng]); },
  });

  if (!active || !pts.length) return null;
  const live = hover ? length + distanceM(pts[pts.length - 1], hover) : length;
  return (
    <>
      <Polyline positions={pts} pathOptions={{ color: '#d97706', weight: 3 }} interactive={false} />
      {hover && (
        <Polyline positions={[pts[pts.length - 1], hover]} pathOptions={{ color: '#d97706', weight: 2, dashArray: '5 4' }} interactive={false}>
          <Tooltip permanent direction="right" offset={[10, 0]} className="netpulse-measure-label">
            {formatDistance(live)}{live > MAX_PROFILE_M ? ' (max 20 km)' : ''}
          </Tooltip>
        </Polyline>
      )}
      {pts.map((p, i) => (
        <CircleMarker key={`${p[0]},${p[1]},${i}`} center={p} radius={4} interactive={false}
          pathOptions={{ color: '#111827', weight: 1.5, fillColor: '#f59e0b', fillOpacity: 1 }} />
      ))}
    </>
  );
}

// The profiled paths and the point under the chart cursor
export function ProfileShapes({ profiles, hover }) {
  return (
    <>
      {profiles.map(p => (
        <Polyline key={p.key} positions={p.vertices} interactive={false}
          pathOptions={{ color: p.color || '#d97706', weight: 3, opacity: 0.9, dashArray: p.dashed ? '6 5' : null }} />
      ))}
      {hover && (
        <CircleMarker center={hover} radius={6} interactive={false}
          pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#d97706', fillOpacity: 1 }} />
      )}
    </>
  );
}
