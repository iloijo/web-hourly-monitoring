import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { useMap, useMapEvents } from 'react-leaflet';
import { getJson } from '../../../api/client';
import { COVMO_MIN_ZOOM, covmoColor, GRID, MAX_AREA, N, Z } from './covmo';

// Covmo MR grid (RSRP / RSRQ) of one week (default the latest). Every covmo row is a zoom-20 web-mercator tile (~38 m),
// drawn on canvas tiles under the sectors at 40% opacity. Only the viewport (plus a margin) is loaded.

const z20Key = (lat, lon) => {
  const x = Math.floor(((lon + 180) / 360) * N);
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * N);
  return x * N + y;
};

// "dx,dy,rsrp,rsrq,mr;..." -> Map(z20 key -> [rsrp, rsrq, mr])
function parseTiles(json) {
  const store = new Map();
  if (!json?.tiles) return store;
  const { x0, y0 } = json;
  for (const t of json.tiles.split(';')) {
    const [dx, dy, rsrp, rsrq, mr] = t.split(',');
    store.set((x0 + Number(dx)) * N + (y0 + Number(dy)), [
      rsrp === '' ? null : Number(rsrp), rsrq === '' ? null : Number(rsrq), Number(mr),
    ]);
  }
  return store;
}

// Canvas grid layer that paints the z20 cells falling inside each map tile
const CovmoGrid = L.GridLayer.extend({
  createTile(coords) {
    const tile = document.createElement('canvas');
    const size = this.getTileSize();
    tile.width = size.x;
    tile.height = size.y;
    const { store, metric } = this.options;
    if (!store?.size || coords.z > Z) return tile;
    const ctx = tile.getContext('2d');
    const s = 2 ** (Z - coords.z);       // z20 cells per map tile side
    const px = size.x / s;
    const cell = Math.max(px, 1);
    const idx = metric === 'rsrq' ? 1 : 0;
    const x0 = coords.x * s;
    const y0 = coords.y * s;
    for (let i = 0; i < s; i += 1) {
      for (let j = 0; j < s; j += 1) {
        const v = store.get((x0 + i) * N + (y0 + j));
        if (!v) continue;
        const color = covmoColor(metric, v[idx]);
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(i * px, j * px, cell, cell);
      }
    }
    return tile;
  },
});

const contains = (outer, v) => outer && v.south >= outer.south && v.north <= outer.north && v.west >= outer.west && v.east <= outer.east;

// Viewport plus a 25% margin, snapped outward to GRID; falls back to the bare viewport when that is too large
function requestBounds(v) {
  const padLat = (v.north - v.south) * 0.25;
  const padLon = (v.east - v.west) * 0.25;
  const snap = (b) => ({
    south: Math.floor(b.south / GRID) * GRID,
    west: Math.floor(b.west / GRID) * GRID,
    north: Math.ceil(b.north / GRID) * GRID,
    east: Math.ceil(b.east / GRID) * GRID,
  });
  const area = (b) => (b.north - b.south) * (b.east - b.west);
  const padded = snap({ south: v.south - padLat, west: v.west - padLon, north: v.north + padLat, east: v.east + padLon });
  if (area(padded) <= MAX_AREA) return padded;
  const bare = snap(v);
  return area(bare) <= MAX_AREA ? bare : null;
}

const round = (b) => Object.fromEntries(Object.entries(b).map(([k, x]) => [k, Number(x.toFixed(4))]));

export default function CovmoLayer({ metric, week = '', opacity = 0.4, onStatus, onHover }) {
  const map = useMap();
  const layerRef = useRef(null);
  const storeRef = useRef(new Map());
  const loadedRef = useRef(null);
  const [view, setView] = useState(null);
  const [data, setData] = useState(null);

  const readView = () => {
    const b = map.getBounds();
    setView({ zoom: map.getZoom(), south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
  };
  // Hover readout: reported only when the pointer enters another tile, so the map does not re-render per pixel
  const hoverKey = useRef(null);
  const setHover = (key) => {
    if (key === hoverKey.current) return;
    hoverKey.current = key;
    const v = key === null ? null : storeRef.current.get(key);
    onHover(v ? { rsrp: v[0], rsrq: v[1], mr: v[2] } : null);
  };
  useMapEvents({
    moveend: readView,
    mousemove(e) {
      if (!metric || !storeRef.current.size) return;
      const key = z20Key(e.latlng.lat, e.latlng.lng);
      setHover(storeRef.current.has(key) ? key : null);
    },
    mouseout: () => setHover(null),
  });
  useEffect(() => {
    const t = setTimeout(readView, 50);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Opacity changes restyle the existing layer instead of rebuilding it
  const opacityRef = useRef(opacity);
  useEffect(() => {
    opacityRef.current = opacity;
    layerRef.current?.setOpacity(opacity);
  }, [opacity]);

  // The canvas layer lives as long as the covmo toggle is on
  useEffect(() => {
    if (!metric) return undefined;
    const layer = new CovmoGrid({ opacity: opacityRef.current, zIndex: 5, store: storeRef.current, metric, updateWhenZooming: false });
    layer.addTo(map);
    layerRef.current = layer;
    return () => { layer.remove(); layerRef.current = null; };
  }, [metric, map]);

  // Load the area around the viewport when the view leaves the area already loaded
  useEffect(() => {
    if (!metric || !view) return undefined;
    if (view.zoom < COVMO_MIN_ZOOM) {
      onStatus({ state: 'zoom' });
      return undefined;
    }
    // the loaded area only counts for the same week
    if (loadedRef.current?.week === week && contains(loadedRef.current.bounds, view)) return undefined;
    const bounds = requestBounds(view);
    if (!bounds) {
      onStatus({ state: 'zoom' });
      return undefined;
    }
    let cancelled = false;
    onStatus({ state: 'loading' });
    const t = setTimeout(() => {
      getJson('/api/map/covmo', { ...round(bounds), week })
        .then(json => {
          if (cancelled) return;
          if (json.error) { onStatus({ state: 'error', error: json.error }); return; }
          loadedRef.current = { bounds, week };
          setData(json);
        })
        .catch(err => { if (!cancelled) onStatus({ state: 'error', error: String(err) }); });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [metric, view, week, onStatus]);

  // New tiles: swap the store and repaint
  useEffect(() => {
    if (!data) return;
    storeRef.current = parseTiles(data);
    onStatus({ state: 'ready', week: data.week, firstDate: data.first_date, lastDate: data.last_date, count: data.count, truncated: data.truncated });
    const layer = layerRef.current;
    if (layer) {
      layer.options.store = storeRef.current;
      layer.redraw();
    }
  }, [data, onStatus]);

  // A new layer (metric switch) must use the loaded store
  useEffect(() => {
    const layer = layerRef.current;
    if (layer && layer.options.store !== storeRef.current) {
      layer.options.store = storeRef.current;
      layer.redraw();
    }
  });

  return null;
}
