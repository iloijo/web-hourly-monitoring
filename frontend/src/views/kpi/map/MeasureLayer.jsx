import { useEffect, useState } from 'react';
import { CircleMarker, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { distanceM, formatDistance } from './geo';

// Ruler: click to add points, double-click or Esc to finish. Points stay on the map until cleared.
export default function MeasureLayer({ active, points, onPointsChange, onFinish }) {
  const map = useMap();
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const el = map.getContainer();
    if (active) {
      map.doubleClickZoom.disable();
      el.style.cursor = 'crosshair';
    }
    return () => {
      map.doubleClickZoom.enable();
      el.style.cursor = '';
    };
  }, [active, map]);

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onFinish(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onFinish]);

  useMapEvents({
    click(e) {
      if (!active) return;
      onPointsChange([...points, [e.latlng.lat, e.latlng.lng]]);
    },
    dblclick() {
      if (active) onFinish();
    },
    mousemove(e) {
      if (active && points.length) setHover([e.latlng.lat, e.latlng.lng]);
    },
    mouseout() {
      setHover(null);
    },
  });

  if (!points.length) return null;
  const cumulative = points.reduce((acc, p, i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] + distanceM(points[i - 1], p));
    return acc;
  }, []);
  const total = cumulative[cumulative.length - 1];
  const live = active && hover ? total + distanceM(points[points.length - 1], hover) : null;

  return (
    <>
      <Polyline positions={points} pathOptions={{ color: '#facc15', weight: 3, dashArray: '6 4' }} interactive={false} />
      {live !== null && (
        <Polyline positions={[points[points.length - 1], hover]} pathOptions={{ color: '#facc15', weight: 2, opacity: 0.7 }} interactive={false}>
          <Tooltip permanent direction="right" offset={[10, 0]} className="netpulse-measure-label">
            {formatDistance(live)}
          </Tooltip>
        </Polyline>
      )}
      {points.map((p, i) => (
        <CircleMarker
          key={`${p[0]},${p[1]},${i}`}
          center={p}
          radius={4}
          pathOptions={{ color: '#111827', weight: 1.5, fillColor: '#facc15', fillOpacity: 1 }}
          interactive={false}
        >
          {i > 0 && (
            <Tooltip permanent direction="top" offset={[0, -6]} className="netpulse-measure-label">
              {formatDistance(cumulative[i])}
            </Tooltip>
          )}
        </CircleMarker>
      ))}
    </>
  );
}
