import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CircleMarker, MapContainer, Polygon, Popup, ScaleControl, TileLayer, Tooltip, useMap, useMapEvents,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, Layers, Loader2, Map as MapIcon, Ruler, Trash2, X } from 'lucide-react';
import { BAND_COLORS } from '../../../components/SectorPayloadChart';
import { getJson } from '../../../api/client';
import MeasureLayer from './MeasureLayer';
import useCellMap from './useCellMap';
import { bandLength, distanceM, formatDistance, sectorPolygon, siteSectorBase } from './geo';

const BASEMAPS = {
  osm: {
    label: 'OpenStreet',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    maxNativeZoom: 19,
  },
  satellite: {
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
    maxNativeZoom: 19,
    labels: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
  },
  contour: {
    label: 'Contour',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'Map data &copy; OpenStreetMap contributors, SRTM | Style &copy; OpenTopoMap (CC-BY-SA)',
    maxNativeZoom: 17,
  },
};

const STORE_KEY = 'netpulse_cellmap_prefs';
const readPrefs = () => {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
};
const writePrefs = (p) => {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(p)); } catch { /* storage unavailable */ }
};

const bandColor = (band) => BAND_COLORS[band] || '#64748b';
const fmt = (v) => (v === null || v === undefined || v === '' ? '–' : v);

// Fits the view to the loaded sites whenever the site or the tier option changes
function FitView({ data, fitKey }) {
  const map = useMap();
  useEffect(() => {
    if (!data?.sites?.length) return;
    if (data.sites.length === 1) {
      map.setView([data.center.lat, data.center.lon], 15);
      return;
    }
    const lats = data.sites.map(s => s.lat);
    const lons = data.sites.map(s => s.lon);
    map.fitBounds([[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]], {
      padding: [40, 40], maxZoom: 16,
    });
    // fitKey (site|tier) decides when to re-fit; data identity alone would re-fit on every reload
  }, [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// Keeps Leaflet's size in sync with the drawer width
function SizeWatcher({ width }) {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 320);
    return () => clearTimeout(t);
  }, [width, map]);
  return null;
}

// Grey dots for every other 4G site inside the viewport (zoom >= 11)
function OtherSites({ enabled, shownIds }) {
  const [sites, setSites] = useState([]);
  const [view, setView] = useState(null);
  const map = useMapEvents({ moveend: () => readView() });
  const readView = () => {
    const b = map.getBounds();
    setView({ zoom: map.getZoom(), south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
  };
  // The first fit can happen before this layer listens to the map, so read the view once after mounting
  useEffect(() => {
    const t = setTimeout(readView, 50);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!enabled || !view || view.zoom < 11) return undefined;
    let cancelled = false;
    const { south, west, north, east } = view;
    const t = setTimeout(() => {
      getJson('/api/map/sites', { south, west, north, east })
        .then(j => { if (!cancelled) setSites(j.sites || []); })
        .catch(() => { if (!cancelled) setSites([]); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [enabled, view]);

  if (!enabled || !view || view.zoom < 11) return null;
  return sites.filter(s => !shownIds.has(s.site_id)).map(s => (
    <CircleMarker
      key={s.site_id}
      center={[s.lat, s.lon]}
      radius={3.5}
      pathOptions={{ color: '#1f2937', weight: 1, fillColor: '#9ca3af', fillOpacity: 0.9 }}
    >
      <Tooltip direction="top" offset={[0, -4]}>{s.site_id} · {s.cells} cells</Tooltip>
    </CircleMarker>
  ));
}

function CellPopup({ cell, site, siblings, canSelectSector, onSelectSector }) {
  const tilt = (cell.et ?? null) !== null || (cell.mt ?? null) !== null ? (cell.et || 0) + (cell.mt || 0) : null;
  const rows = [
    ['SiteID_CI', cell.siteid_ci],
    ['Sector', cell.sector],
    ['Band', `${cell.band} (${fmt(cell.band_label)})`],
    ['Bandwidth', cell.bandwidth],
    ['PCI', cell.pci],
    ['LAC / CI', `${fmt(cell.lac)} / ${fmt(cell.ci)}`],
    ['Azimuth', cell.azimuth !== null ? `${cell.azimuth}°` : null],
    ['Beamwidth', cell.beamwidth ? `${cell.beamwidth}°` : '65° (default)'],
    ['E-Tilt / M-Tilt', `${fmt(cell.et)} / ${fmt(cell.mt)}`],
    ['Total tilt', tilt !== null ? `${tilt}°` : null],
    ['Antenna height', cell.antenna_height !== null ? `${cell.antenna_height} m` : null],
    ['Antenna type', cell.antenna_type],
    ['Lat / Long', `${cell.lat}, ${cell.lon}`],
    ['Type', [cell.micro_macro, cell.site_type].filter(Boolean).join(' · ')],
    ['Kabupaten', [cell.kecamatan, cell.kabupaten].filter(Boolean).join(', ')],
    ['NOP', cell.nop],
    ['On air', cell.oa_date],
  ];
  if (site?.tier === 1) rows.push(['From main site', `${formatDistance(site.distance_km * 1000)} @ ${site.bearing}°`]);
  return (
    <div className="text-[11px] min-w-60">
      <div className="font-bold text-xs mb-1 break-all">{cell.cell_name}</div>
      <table className="w-full">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td className="pr-2 py-px opacity-60 whitespace-nowrap align-top">{k}</td>
              <td className="py-px font-semibold">{fmt(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {siblings.length > 0 && (
        <div className="mt-1.5 pt-1.5 border-t border-slate-200">
          <div className="opacity-60 mb-0.5">Same direction on this site</div>
          {siblings.map(s => (
            <div key={s.siteid_ci} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: bandColor(s.band) }} />
              <span className="truncate">{s.cell_name}</span>
              <span className="opacity-60 ml-auto">{s.azimuth}°</span>
            </div>
          ))}
        </div>
      )}
      {canSelectSector && (
        <button
          type="button"
          onClick={() => onSelectSector(cell.sector)}
          className="mt-2 w-full rounded-md bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1 cursor-pointer"
        >
          Show sector {cell.sector} in charts
        </button>
      )}
    </div>
  );
}

function Legend({ bands, darkMode, tier }) {
  return (
    <div className={`absolute bottom-6 right-2 z-[500] rounded-lg border px-2.5 py-2 text-[10px] shadow-md space-y-1 ${
      darkMode ? 'bg-slate-900/90 border-slate-700 text-slate-200' : 'bg-white/95 border-slate-200 text-slate-700'
    }`}>
      <div className="font-bold uppercase tracking-wider opacity-70">Band</div>
      {bands.map(b => (
        <div key={b} className="flex items-center gap-1.5">
          <span className="w-3 h-2.5 rounded-sm" style={{ background: bandColor(b), opacity: 0.8 }} />
          <span>{b}</span>
        </div>
      ))}
      <div className="pt-1 border-t border-slate-500/30 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-2.5 rounded-sm border-2 border-slate-900 bg-slate-400" /> Selected sector
        </div>
        {tier === 1 && (
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-2.5 rounded-sm border border-dashed border-slate-500 bg-slate-300/50" /> 1st tier site
          </div>
        )}
      </div>
    </div>
  );
}

const ToolbarButton = ({ active, onClick, title, children, darkMode }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border transition cursor-pointer ${
      active
        ? 'bg-blue-600 border-blue-600 text-white'
        : darkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-100'
    }`}
  >
    {children}
  </button>
);

// Right-side map drawer for 4G Daily / 4G Hourly (sector scope)
export default function CellMapDrawer({
  open, onClose, siteId, sectors = [], darkMode, width, onWidthChange, canSelectSector, onSelectSector,
}) {
  const [prefs, setPrefs] = useState(() => ({ basemap: 'osm', tier: 0, otherSites: true, ...readPrefs() }));
  const updatePrefs = (patch) => setPrefs(p => { const next = { ...p, ...patch }; writePrefs(next); return next; });
  const [measuring, setMeasuring] = useState(false);
  const [measurePoints, setMeasurePoints] = useState([]);
  const [headerH, setHeaderH] = useState(56);
  const mapRef = useRef(null);
  const { loading, error, data } = useCellMap(open, siteId, prefs.tier);
  const basemap = BASEMAPS[prefs.basemap] || BASEMAPS.osm;

  // The drawer starts below the sticky page header, whose height changes when it wraps
  useEffect(() => {
    const header = document.querySelector('header');
    if (!header) return undefined;
    const ro = new ResizeObserver(() => setHeaderH(header.getBoundingClientRect().height));
    ro.observe(header);
    return () => ro.disconnect();
  }, []);

  // Drag the left edge to resize
  const startResize = (e) => {
    e.preventDefault();
    const onMove = (ev) => {
      const w = window.innerWidth - ev.clientX;
      onWidthChange(Math.max(360, Math.min(window.innerWidth * 0.75, w)));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.userSelect = '';
    };
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const sitesById = useMemo(() => Object.fromEntries((data?.sites || []).map(s => [s.site_id, s])), [data]);
  const shownIds = useMemo(() => new Set(Object.keys(sitesById)), [sitesById]);
  const mainSite = data?.site_id;
  const sectorSet = useMemo(() => new Set(sectors.map(Number)), [sectors]);

  // Longest sectors first so the shorter (higher band) wedges stay on top and clickable
  const shapes = useMemo(() => {
    if (!data?.cells) return [];
    return data.cells
      .filter(c => c.lat !== null && c.lon !== null && c.azimuth !== null)
      .map(c => {
        const site = sitesById[c.site_id];
        const radius = siteSectorBase(site?.nearest_km) * bandLength(c.band);
        const beam = c.beamwidth || 65;
        return { cell: c, site, radius, positions: sectorPolygon(c.lat, c.lon, c.azimuth, beam, radius) };
      })
      .sort((a, b) => b.radius - a.radius);
  }, [data, sitesById]);

  const bands = useMemo(() => [...new Set(shapes.map(s => s.cell.band))].sort(), [shapes]);
  const measureTotal = measurePoints.reduce((t, p, i) => (i ? t + distanceM(measurePoints[i - 1], p) : 0), 0);
  const finishMeasure = useCallback(() => setMeasuring(false), []);

  const recenter = () => {
    if (data?.center && mapRef.current) mapRef.current.setView([data.center.lat, data.center.lon], Math.max(mapRef.current.getZoom(), 15));
  };

  const shell = darkMode ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800';

  return (
    <aside
      className={`fixed right-0 bottom-0 z-[35] border-l shadow-[-12px_0_32px_rgba(0,0,0,0.18)] flex flex-col transition-transform duration-300 ease-out ${shell} ${
        open ? 'translate-x-0' : 'translate-x-full pointer-events-none'
      }`}
      style={{ top: headerH, width }}
      aria-hidden={!open}
    >
      <div
        onPointerDown={startResize}
        className="absolute left-0 top-0 bottom-0 w-1.5 -ml-0.5 cursor-col-resize hover:bg-blue-500/40 z-[600]"
        title="Drag to resize"
      />

      <div className={`flex flex-wrap items-center gap-1.5 px-3 py-2 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
        <MapIcon className="w-4 h-4 text-blue-500" />
        <span className="text-xs font-bold uppercase tracking-wider">Cell Map</span>
        <span className="text-xs font-semibold">{mainSite || siteId}</span>
        {data?.week && <span className="text-[10px] opacity-60">DESIQA W{data.week}</span>}
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin opacity-70" />}
        <button type="button" onClick={onClose} className="ml-auto p-1 rounded hover:bg-slate-500/15 cursor-pointer" title="Close map">
          <X className="w-4 h-4" />
        </button>
        <div className="basis-full h-0" />
        <div className="flex items-center gap-1">
          <Layers className="w-3.5 h-3.5 opacity-60" />
          {Object.entries(BASEMAPS).map(([id, b]) => (
            <ToolbarButton key={id} active={prefs.basemap === id} onClick={() => updatePrefs({ basemap: id })} darkMode={darkMode}>
              {b.label}
            </ToolbarButton>
          ))}
        </div>
        <span className="w-px h-5 bg-slate-500/30 mx-0.5" />
        <ToolbarButton active={prefs.tier === 0} onClick={() => updatePrefs({ tier: 0 })} darkMode={darkMode} title="Only the searched site">
          Main site
        </ToolbarButton>
        <ToolbarButton active={prefs.tier === 1} onClick={() => updatePrefs({ tier: 1 })} darkMode={darkMode} title="Searched site and its 1st tier">
          + 1st tier
        </ToolbarButton>
        <ToolbarButton active={prefs.otherSites} onClick={() => updatePrefs({ otherSites: !prefs.otherSites })} darkMode={darkMode} title="Grey dots for other sites in view (zoom 11+)">
          Other sites
        </ToolbarButton>
        <span className="w-px h-5 bg-slate-500/30 mx-0.5" />
        <ToolbarButton
          active={measuring}
          onClick={() => { if (!measuring) setMeasurePoints([]); setMeasuring(!measuring); }}
          darkMode={darkMode}
          title="Ruler: click points, double-click or Esc to finish"
        >
          <Ruler className="w-3.5 h-3.5" /> {measurePoints.length > 1 ? formatDistance(measureTotal) : 'Ruler'}
        </ToolbarButton>
        {measurePoints.length > 0 && (
          <ToolbarButton onClick={() => { setMeasurePoints([]); setMeasuring(false); }} darkMode={darkMode} title="Clear ruler">
            <Trash2 className="w-3.5 h-3.5" />
          </ToolbarButton>
        )}
        <ToolbarButton onClick={recenter} darkMode={darkMode} title="Center on the searched site">
          <Crosshair className="w-3.5 h-3.5" />
        </ToolbarButton>
      </div>

      <div className="relative flex-1 min-h-0">
        {error && (
          <div className="absolute top-2 left-2 right-2 z-[600] rounded-md bg-rose-600 text-white text-xs px-3 py-2 shadow">
            {error}
          </div>
        )}
        {open && (
          <MapContainer
            ref={mapRef}
            center={[-2.5, 121.5]}
            zoom={6}
            maxZoom={19}
            className="h-full w-full"
            zoomControl
          >
            <TileLayer
              key={prefs.basemap}
              url={basemap.url}
              attribution={basemap.attribution}
              maxNativeZoom={basemap.maxNativeZoom}
              maxZoom={19}
            />
            {basemap.labels && <TileLayer key="labels" url={basemap.labels} maxZoom={19} />}
            <ScaleControl position="bottomleft" imperial={false} />
            <FitView data={data} fitKey={data ? `${data.site_id}|${data.sites.length}` : ''} />
            <SizeWatcher width={width} />
            <OtherSites enabled={prefs.otherSites} shownIds={shownIds} />

            {shapes.map(({ cell, site, positions }) => {
              const isMain = cell.site_id === mainSite;
              const highlighted = isMain && sectorSet.has(cell.sector);
              const color = bandColor(cell.band);
              const siblings = data.cells.filter(o => o.site_id === cell.site_id && o.siteid_ci !== cell.siteid_ci
                && o.azimuth !== null && Math.abs(((o.azimuth - cell.azimuth + 540) % 360) - 180) <= 10);
              return (
                <Polygon
                  key={cell.siteid_ci}
                  positions={positions}
                  interactive={!measuring}
                  pathOptions={{
                    color: highlighted ? '#0f172a' : color,
                    weight: highlighted ? 2.5 : 1,
                    fillColor: color,
                    fillOpacity: isMain ? (highlighted ? 0.6 : 0.35) : 0.22,
                    dashArray: isMain ? null : '4 3',
                    opacity: isMain ? 1 : 0.8,
                  }}
                >
                  <Tooltip sticky>{cell.cell_name} · {cell.band} · {cell.azimuth}°</Tooltip>
                  {!measuring && (
                    <Popup maxWidth={340}>
                      <CellPopup
                        cell={cell}
                        site={site}
                        siblings={siblings}
                        canSelectSector={canSelectSector && isMain}
                        onSelectSector={onSelectSector}
                      />
                    </Popup>
                  )}
                </Polygon>
              );
            })}

            {(data?.sites || []).map(s => (
              <CircleMarker
                key={`site-${s.site_id}`}
                center={[s.lat, s.lon]}
                radius={s.tier === 0 ? 5 : 4}
                interactive={false}
                pathOptions={{ color: '#ffffff', weight: 1.5, fillColor: s.tier === 0 ? '#0f172a' : '#475569', fillOpacity: 1 }}
              >
                <Tooltip permanent direction="bottom" offset={[0, 4]} className="netpulse-site-label">
                  {s.site_id}
                </Tooltip>
              </CircleMarker>
            ))}

            <MeasureLayer active={measuring} points={measurePoints} onPointsChange={setMeasurePoints} onFinish={finishMeasure} />
          </MapContainer>
        )}
        {bands.length > 0 && <Legend bands={bands} darkMode={darkMode} tier={prefs.tier} />}
      </div>
    </aside>
  );
}
