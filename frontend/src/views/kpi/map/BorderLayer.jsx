import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { useMap, useMapEvents } from 'react-leaflet';
import { getJson } from '../../../api/client';

// Kabupaten / kecamatan / NOP borders (onedb geo_* tables, Sulawesi) drawn as lines under the sectors.
// The lines take no mouse events, so sectors stay clickable; the area under the pointer is found by
// point-in-polygon on the loaded features and reported through onHover.

export const BORDER_LAYERS = {
  nop: { label: 'NOP', minZoom: 0, light: '#7c3aed', dark: '#c4b5fd', weight: 3.2, dash: null },
  kab: { label: 'Kabupaten', minZoom: 0, light: '#0f172a', dark: '#f8fafc', weight: 2, dash: '6 4' },
  kec: { label: 'Kecamatan', minZoom: 10, light: '#334155', dark: '#e2e8f0', weight: 1.3, dash: '3 3' },
};
const ORDER = ['kec', 'kab', 'nop'];   // drawn bottom to top
const PANE = 'borders';
const LABEL_PANE = 'borderLabels';
// Name labels: black text with a yellow outline, each level only in the zoom range where it reads well
const LABEL_ZOOM = { nop: [0, 10], kab: [8, 11], kec: [12, 22] };
const LABEL_SIZE = { nop: 13, kab: 12, kec: 11 };
const HALO = '#facc15';
const haloShadow = [[-1.5, 0], [1.5, 0], [0, -1.5], [0, 1.5], [-1, -1], [1, -1], [-1, 1], [1, 1]]
  .map(([x, y]) => `${x}px ${y}px 0 ${HALO}`).join(',');
const labelIcon = (id, name) => L.divIcon({
  className: '',
  iconSize: null,
  html: `<div style="transform:translate(-50%,-50%);white-space:nowrap;color:#000;font-weight:${id === 'kec' ? 600 : 800};`
    + `font-size:${LABEL_SIZE[id]}px;letter-spacing:${id === 'kec' ? 0 : 0.3}px;text-shadow:${haloShadow};pointer-events:none">`
    + `${id === 'nop' ? 'NOP ' : id === 'kec' ? 'Kec. ' : ''}${String(name).replace(/[<>&]/g, '')}</div>`,
});

// Ray casting on one ring of [lon, lat]
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inPolygon = (x, y, poly) => inRing(x, y, poly[0]) && !poly.slice(1).some(h => inRing(x, y, h));

// Feature with its bounding box, for a quick reject before the ring test
function indexFeature(f) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  let w = Infinity; let s = Infinity; let e = -Infinity; let n = -Infinity;
  polys.forEach(p => p[0].forEach(([x, y]) => { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }));
  return { props: f.properties, polys, w, s, e, n };
}
const findAt = (list, x, y) => list?.find(f => x >= f.w && x <= f.e && y >= f.s && y <= f.n && f.polys.some(p => inPolygon(x, y, p)))?.props || null;

export default function BorderLayer({ layers, dark, onHover }) {
  const map = useMap();
  const [view, setView] = useState(null);
  const [data, setData] = useState({});           // layer -> FeatureCollection
  const indexRef = useRef({});
  const drawnRef = useRef({});

  const readView = () => {
    const b = map.getBounds();
    setView({ zoom: map.getZoom(), south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
  };
  const hoverRef = useRef('');
  useMapEvents({
    moveend: readView,
    movestart: () => { hoverRef.current = ''; onHover(null); },
    mousemove(e) {
      const { lat, lng } = e.latlng;
      const hit = {};
      ORDER.forEach(id => { if (layers[id]) hit[id] = findAt(indexRef.current[id], lng, lat); });
      const key = JSON.stringify(hit);
      if (key === hoverRef.current) return;
      hoverRef.current = key;
      onHover(Object.values(hit).some(Boolean) ? hit : null);
    },
    mouseout: () => { hoverRef.current = ''; onHover(null); },
  });
  useEffect(() => {
    if (!map.getPane(PANE)) {
      const pane = map.createPane(PANE);
      pane.style.zIndex = 390;              // above tiles and covmo, below the sectors (overlayPane 400)
      pane.style.pointerEvents = 'none';
    }
    if (!map.getPane(LABEL_PANE)) {
      const pane = map.createPane(LABEL_PANE);
      pane.style.zIndex = 450;              // above the sectors, under popups; never takes the mouse
      pane.style.pointerEvents = 'none';
    }
    const t = setTimeout(readView, 50);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch each switched-on layer for the view; the backend snaps and caches, so pans are cheap
  const anyOn = ORDER.some(id => layers[id]);
  useEffect(() => {
    if (!view || !anyOn) return undefined;
    let cancelled = false;
    const t = setTimeout(() => {
      ORDER.filter(id => layers[id] && view.zoom >= BORDER_LAYERS[id].minZoom).forEach(id => {
        getJson('/api/map/borders', {
          layer: id, zoom: view.zoom,
          south: view.south.toFixed(4), west: view.west.toFixed(4), north: view.north.toFixed(4), east: view.east.toFixed(4),
        }).then(json => {
          if (cancelled || json.error) return;
          indexRef.current[id] = json.features.map(indexFeature);
          setData(d => ({ ...d, [id]: json }));
        }).catch(() => {});
      });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [view, anyOn, layers.kab, layers.kec, layers.nop]); // eslint-disable-line react-hooks/exhaustive-deps

  // (Re)draw a layer when its data, its toggle, the zoom gate or the basemap tone changes
  const zoom = view?.zoom ?? 0;
  useEffect(() => {
    ORDER.forEach(id => {
      drawnRef.current[id]?.remove();
      drawnRef.current[id] = null;
      const cfg = BORDER_LAYERS[id];
      if (!layers[id] || !data[id] || zoom < cfg.minZoom) return;
      drawnRef.current[id] = L.geoJSON(data[id], {
        pane: PANE,
        interactive: false,
        style: { color: dark ? cfg.dark : cfg.light, weight: cfg.weight, dashArray: cfg.dash, fill: false, opacity: 0.9 },
      }).addTo(map);
    });
  }, [data, layers.kab, layers.kec, layers.nop, zoom >= BORDER_LAYERS.kec.minZoom, dark, map]); // eslint-disable-line react-hooks/exhaustive-deps

  // Labels at the point the backend picked inside the largest part of each area
  const labelsRef = useRef({});
  useEffect(() => {
    ORDER.forEach(id => {
      labelsRef.current[id]?.remove();
      labelsRef.current[id] = null;
      const [z0, z1] = LABEL_ZOOM[id];
      if (!layers[id] || !data[id] || zoom < Math.max(z0, BORDER_LAYERS[id].minZoom) || zoom > z1) return;
      labelsRef.current[id] = L.layerGroup(data[id].features.filter(f => f.properties.label).map(f => L.marker(f.properties.label, {
        icon: labelIcon(id, f.properties.name), pane: LABEL_PANE, interactive: false, keyboard: false,
      }))).addTo(map);
    });
  }, [data, layers.kab, layers.kec, layers.nop, zoom, map]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => ORDER.forEach(id => { drawnRef.current[id]?.remove(); labelsRef.current[id]?.remove(); }), []);
  return null;
}
