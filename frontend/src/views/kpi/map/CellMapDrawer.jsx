import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CircleMarker, MapContainer, Polygon, Popup, ScaleControl, TileLayer, Tooltip, useMap, useMapEvents,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Compass, Crosshair, Layers, Loader2, Map as MapIcon, Mountain, Palette, Radar, Ruler, Trash2, X } from 'lucide-react';
import { getJson } from '../../../api/client';
import MeasureLayer from './MeasureLayer';
import useCellMap from './useCellMap';
import useCellKpi from './useCellKpi';
import CovmoLayer from './CovmoLayer';
import { COVMO_METRICS, COVMO_MIN_ZOOM } from './covmo';
import { bandColor, COLOR_MODES, NO_DATA, statusColor } from './colorModes';
import { bandLength, destination, distanceM, formatDistance, sectorPolygon, siteSectorBase } from './geo';
import { azimuthPath } from './profile';
import ProfilePanel from './ProfilePanel';
import { ProfileDrawLayer, ProfileShapes } from './ProfileLayer';
import ProtractorLayer, { NEEDLE_COLORS, ProtractorPanel } from './ProtractorLayer';

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

const fmt = (v) => (v === null || v === undefined || v === '' ? '–' : v);
const TA_OPTIONS = [0, 70, 80, 90];
const OTHER_LABEL_ZOOM = 14;
const OTHER_LABEL_MAX = 150;
// indoor / pRRU cells, decided by the backend from the OSS cell name code (IL, IR, QL ... vs ML, VE, EL ...)
const isIndoor = (c) => !!c.indoor;
const cellKey = (c) => `${c.siteid_ci}|${c.cell_name}`;
const shortWeek = (w) => (w ? `W${String(w).slice(-2)}` : '');

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
  const others = sites.filter(s => !shownIds.has(s.site_id));
  // Site ID labels from zoom 14, and only while they stay readable
  const labelled = view.zoom >= OTHER_LABEL_ZOOM && others.length <= OTHER_LABEL_MAX;
  return others.map(s => (
    <CircleMarker
      key={`${s.site_id}-${labelled}`}
      center={[s.lat, s.lon]}
      radius={3.5}
      pathOptions={{ color: '#1f2937', weight: 1, fillColor: '#9ca3af', fillOpacity: 0.9 }}
    >
      {labelled ? (
        <Tooltip permanent direction="bottom" offset={[0, 3]} className="netpulse-site-label netpulse-site-label-other">
          {s.site_id}
        </Tooltip>
      ) : (
        <Tooltip direction="top" offset={[0, -4]}>{s.site_id} · {s.cells} cells</Tooltip>
      )}
    </CircleMarker>
  ));
}

const StatusChip = ({ label, value, color }) => (
  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-1.5 py-px mr-1 mb-1">
    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
    <span className="opacity-60">{label}</span>
    <span className="font-semibold">{value || '–'}</span>
  </span>
);

function KpiSection({ kpi, meta }) {
  if (!meta) return <div className="mt-1.5 pt-1.5 border-t border-slate-200 opacity-60">Loading KPI...</div>;
  const k = kpi || {};
  const pair = (a, b, u) => (a === undefined && b === undefined ? null : `${fmt(a)} / ${fmt(b)}${u}`);
  const rows = [
    ['PRB DL / UL', pair(k.dl_prb, k.ul_prb, ' %')],
    ['User Thp DL / UL', pair(k.dl_thp, k.ul_thp, ' Mbps')],
    ['Max RRC user', k.max_rrc],
    ['Active user', k.active_user],
    ['TA 70 / 80 / 90', k.ta90 !== undefined && k.ta90 !== null
      ? `${formatDistance(k.ta70)} / ${formatDistance(k.ta80)} / ${formatDistance(k.ta90)}` : null],
  ];
  return (
    <div className="mt-1.5 pt-1.5 border-t border-slate-200">
      <div className="opacity-60 mb-0.5">KPI {meta.kpi_date} (BDBH)</div>
      <table className="w-full">
        <tbody>
          {rows.map(([label, v]) => (
            <tr key={label}>
              <td className="pr-2 py-px opacity-60 whitespace-nowrap">{label}</td>
              <td className="py-px font-semibold">{fmt(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-1 flex flex-wrap">
        <StatusChip label={`RCI ${shortWeek(meta.rci_week)}`} value={k.rci} color={statusColor.rci(k.rci)} />
        <StatusChip label={`CEI ${shortWeek(meta.cei_week)}`} value={k.cei} color={statusColor.cei(k.cei)} />
        <StatusChip label={`Unb ${shortWeek(meta.unbalance_week)}`} value={k.unbalance} color={statusColor.unbalance(k.unbalance)} />
      </div>
    </div>
  );
}

function CellPopup({ cell, site, siblings, canSelectSector, onSelectSector, kpi, kpiMeta, onProfile, onProtractor }) {
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
      <KpiSection kpi={kpi} meta={kpiMeta} />
      {siblings.length > 0 && (
        <div className="mt-1.5 pt-1.5 border-t border-slate-200">
          <div className="opacity-60 mb-0.5">Same direction on this site</div>
          {siblings.map(s => (
            <div key={cellKey(s)} className="flex items-center gap-1.5">
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
      <div className="mt-1.5 grid grid-cols-2 gap-1">
        <button type="button" onClick={() => onProfile(cell)} disabled={cell.indoor}
          className="flex items-center justify-center gap-1 rounded-md border border-amber-500 text-amber-700 hover:bg-amber-50 font-semibold py-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          title="Terrain profile from the site along this azimuth">
          <Mountain className="w-3.5 h-3.5" /> Profile
        </button>
        <button type="button" onClick={() => onProtractor(cell.site_id)}
          className="flex items-center justify-center gap-1 rounded-md border border-yellow-500 text-yellow-700 hover:bg-yellow-50 font-semibold py-1 cursor-pointer"
          title="Bearing protractor on this site, one needle per sector">
          <Compass className="w-3.5 h-3.5" /> Reazimuth
        </button>
      </div>
    </div>
  );
}

function Legend({ bands, darkMode, tier, mode, kpiMeta, ta }) {
  const m = COLOR_MODES[mode] || COLOR_MODES.band;
  const items = m.legend ? [...m.legend, [NO_DATA, 'No data']] : bands.map(b => [bandColor(b), b]);
  const week = m.week && kpiMeta?.[m.week] ? ` W${kpiMeta[m.week]}` : '';
  const day = (mode === 'dl_prb' || mode === 'dl_thp') && kpiMeta?.kpi_date ? ` ${kpiMeta.kpi_date}` : '';
  return (
    <div className={`absolute bottom-6 right-2 z-[500] rounded-lg border px-2.5 py-2 text-[10px] shadow-md space-y-1 max-w-56 ${
      darkMode ? 'bg-slate-900/90 border-slate-700 text-slate-200' : 'bg-white/95 border-slate-200 text-slate-700'
    }`}>
      <div className="font-bold uppercase tracking-wider opacity-70">{m.label}{week}{day}</div>
      {items.map(([color, label]) => (
        <div key={label} className="flex items-center gap-1.5">
          <span className="w-3 h-2.5 rounded-sm shrink-0" style={{ background: color, opacity: 0.85 }} />
          <span>{label}</span>
        </div>
      ))}
      <div className="pt-1 border-t border-slate-500/30 space-y-0.5">
        {ta > 0 && (
          <>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-2.5 rounded-sm border border-slate-600 bg-slate-400/60" /> Length = TA {ta}%
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-2.5 rounded-sm border border-dashed border-slate-600" /> No TA data
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full border-2 border-dashed border-slate-600" /> In-building TA ring
            </div>
          </>
        )}
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

function CovmoLegend({ metric, status, hover, darkMode }) {
  const m = COVMO_METRICS[metric];
  const v = hover ? hover[metric] : null;
  let note = null;
  if (status.state === 'zoom') note = `Zoom in to ${COVMO_MIN_ZOOM}+ to load the grid`;
  else if (status.state === 'loading') note = 'Loading grid...';
  else if (status.state === 'error') note = status.error;
  else if (status.state === 'ready') note = `${status.count.toLocaleString()} tiles${status.truncated ? ' (limit reached)' : ''}`;
  return (
    <div className={`absolute bottom-9 left-2 z-[500] rounded-lg border px-2.5 py-2 text-[10px] shadow-md space-y-1 w-44 ${
      darkMode ? 'bg-slate-900/90 border-slate-700 text-slate-200' : 'bg-white/95 border-slate-200 text-slate-700'
    }`}>
      <div className="font-bold uppercase tracking-wider opacity-70">
        Covmo {m.label} ({m.unit}){status.week ? ` W${status.week}` : ''}
      </div>
      {m.bins.map(([, color, label]) => (
        <div key={label} className="flex items-center gap-1.5">
          <span className="w-3 h-2.5 rounded-sm shrink-0" style={{ background: color, opacity: 0.7 }} />
          <span>{label}</span>
        </div>
      ))}
      <div className={`pt-1 border-t border-slate-500/30 ${status.state === 'error' ? 'text-rose-500' : 'opacity-70'}`}>{note}</div>
      {hover && (
        <div className="font-semibold">
          {v !== null && v !== undefined ? `${v} ${m.unit}` : 'n/a'} · {hover.mr} MR
        </div>
      )}
    </div>
  );
}

const OpacitySlider = ({ label, title, min, value, onChange }) => (
  <label className="flex items-center gap-1.5 text-[11px] font-semibold" title={title}>
    {label && <span className="opacity-60">{label}</span>}
    <input
      type="range"
      min={min}
      max={100}
      step={5}
      value={Math.round(value * 100)}
      onChange={e => onChange(Number(e.target.value) / 100)}
      className="w-20 accent-blue-600 cursor-pointer"
    />
    <span className="w-8 tabular-nums">{Math.round(value * 100)}%</span>
  </label>
);

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
  open, onClose, onSlideEnd, siteId, sectors = [], darkMode, width, onWidthChange, canSelectSector, onSelectSector,
}) {
  // The drawer first renders closed and slides in on the next frames, also on the very first open
  // (the lazy chunk mounts it with open already true). The map stays mounted after that, so reopening
  // only slides an existing panel.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    let id2;
    const id1 = requestAnimationFrame(() => { id2 = requestAnimationFrame(() => setEntered(true)); });
    return () => { cancelAnimationFrame(id1); cancelAnimationFrame(id2); };
  }, []);
  const shownOpen = open && entered;
  const [prefs, setPrefs] = useState(() => ({
    basemap: 'osm', tier: 0, otherSites: true, colorBy: 'band', ta: 0, opacity: 0.35, covmo: 'off', covmoOpacity: 0.4, ...readPrefs(),
  }));
  const covmoMetric = COVMO_METRICS[prefs.covmo] ? prefs.covmo : null;
  const [covmoStatus, setCovmoStatus] = useState({ state: 'zoom' });
  const [covmoHover, setCovmoHover] = useState(null);
  const updatePrefs = (patch) => setPrefs(p => { const next = { ...p, ...patch }; writePrefs(next); return next; });
  const [measuring, setMeasuring] = useState(false);
  const [measurePoints, setMeasurePoints] = useState([]);
  // Phase 4: elevation profile and bearing protractor
  const [profileDrawing, setProfileDrawing] = useState(false);
  const [profiles, setProfiles] = useState(null);      // [{ key, label, color, vertices, ctx, dashed }]
  const [profileHover, setProfileHover] = useState(null);
  const [placingProtractor, setPlacingProtractor] = useState(false);
  const [protractor, setProtractor] = useState(null);
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
  const siteIdList = useMemo(() => Object.keys(sitesById), [sitesById]);
  const kpi = useCellKpi(open && siteIdList.length > 0, siteIdList);
  const kpiCells = kpi.data?.cells;
  const mode = COLOR_MODES[prefs.colorBy] ? prefs.colorBy : 'band';

  // Longest sectors first so the shorter (higher band) wedges stay on top and clickable.
  // TA stretch: the sector reaches the cell's TA 70/80/90% distance; cells without TA keep the default length.
  // In-building cells are a small circle at the site; with TA stretch they become an unfilled dashed ring
  // (a TA far beyond the building points to IBC leakage) so several rings do not stack colour over the map.
  const shapes = useMemo(() => {
    if (!data?.cells) return [];
    return data.cells
      .filter(c => c.lat !== null && c.lon !== null && c.azimuth !== null)
      .map(c => {
        const site = sitesById[c.site_id];
        const taM = prefs.ta ? kpiCells?.[c.siteid_ci]?.[`ta${prefs.ta}`] : null;
        const noTa = !!prefs.ta && !(taM > 0);
        if (isIndoor(c)) {
          const ring = taM > 0;
          const radius = ring ? Math.max(taM, 40) : 15 + 30 * bandLength(c.band);
          return { cell: c, site, radius, noTa, indoor: true, ring, positions: sectorPolygon(c.lat, c.lon, 0, 360, radius) };
        }
        const radius = taM > 0 ? Math.max(taM, 60) : siteSectorBase(site?.nearest_km) * bandLength(c.band);
        const beam = c.beamwidth || 65;
        return { cell: c, site, radius, noTa, positions: sectorPolygon(c.lat, c.lon, c.azimuth, beam, radius) };
      })
      .sort((a, b) => b.radius - a.radius);
  }, [data, sitesById, prefs.ta, kpiCells]);

  const bands = useMemo(() => [...new Set(shapes.map(s => s.cell.band))].sort(), [shapes]);
  const measureTotal = measurePoints.reduce((t, p, i) => (i ? t + distanceM(measurePoints[i - 1], p) : 0), 0);
  const finishMeasure = useCallback(() => setMeasuring(false), []);
  const busy = measuring || profileDrawing || placingProtractor || !!protractor?.drawingLine;

  // Tools are exclusive: starting one stops the others
  const stopTools = () => { setMeasuring(false); setProfileDrawing(false); setPlacingProtractor(false); };

  // Antenna height, band and total tilt of a cell for the profile (DESIQA values, fallbacks when missing)
  const cellCtx = (c) => ({
    txHeight: c.antenna_height ?? 30,
    band: c.band,
    tiltDeg: c.et != null || c.mt != null ? (Number(c.et) || 0) + (Number(c.mt) || 0) : null,
  });
  const reach = (c) => Math.max(2000, (kpiCells?.[c.siteid_ci]?.ta90 || 0) * 1.3);
  const profileCell = (c) => {
    stopTools();
    setProfiles([{
      key: `cell|${cellKey(c)}|${Date.now()}`,
      label: `${c.cell_name} · ${c.band} · ${c.azimuth}°`,
      color: '#d97706',
      vertices: azimuthPath(c.lat, c.lon, c.azimuth, reach(c)),
      ctx: cellCtx(c),
    }]);
  };
  const finishProfile = useCallback((pts) => {
    setProfileDrawing(false);
    setProfiles([{ key: `line|${Date.now()}`, label: 'Drawn profile', color: '#d97706', vertices: pts, ctx: {} }]);
  }, []);
  const cancelProfile = useCallback(() => setProfileDrawing(false), []);

  // One needle per macro sector of a site, at the sector's azimuth (median of its cells)
  const sectorNeedles = (sid) => {
    const bySector = {};
    (data?.cells || []).filter(c => c.site_id === sid && !c.indoor && c.azimuth != null)
      .forEach(c => { (bySector[c.sector] = bySector[c.sector] || []).push(c); });
    return Object.keys(bySector).sort((x, y) => Number(x) - Number(y)).map((sec, i) => {
      const cells = bySector[sec];
      const azs = cells.map(c => Number(c.azimuth)).sort((x, y) => x - y);
      const az = azs[Math.floor(azs.length / 2)];
      const ref = cells.find(c => c.band === 'L1800') || cells[0];
      const ta = Math.max(0, ...cells.map(c => kpiCells?.[c.siteid_ci]?.ta90 || 0));
      return {
        id: `${sid}-${sec}`, label: `S${sec}`, color: NEEDLE_COLORS[i % NEEDLE_COLORS.length],
        az, origAz: az, beam: ref.beamwidth || 65, lenM: Math.round(ta > 0 ? ta : 1000), ctx: cellCtx(ref),
      };
    });
  };
  const openProtractorAt = (center, site) => {
    stopTools();
    const needles = site ? sectorNeedles(site.site_id) : [];
    setProtractor({
      center, siteId: site?.site_id || null, ringPx: 140, snap: true, lines: [], drawingLine: false,
      bearings: needles.length ? needles : [{ id: Date.now(), label: 'B1', color: NEEDLE_COLORS[0], az: 0, origAz: null, beam: 65, lenM: 1000 }],
    });
  };
  const protractorOnSite = (sid) => {
    const s = sitesById[sid];
    if (s) openProtractorAt([s.lat, s.lon], s);
    mapRef.current?.closePopup();
  };
  const loadSectors = (sid) => setProtractor(prev => ({ ...prev, bearings: sectorNeedles(sid) }));

  // Profile from the protractor: a needle (new vs original azimuth when moved) or a drawn line
  const profileFromProtractor = ({ kind, bearing, line }) => {
    const pr = protractor;
    if (kind === 'line') {
      setProfiles([{ key: `pl|${line.id}|${Date.now()}`, label: 'Protractor line', color: '#ef4444', vertices: [pr.center, line.to], ctx: {} }]);
      return;
    }
    const len = Math.max(bearing.lenM, 500);
    const main = {
      key: `pn|${bearing.id}|${bearing.az}|${Date.now()}`,
      label: `${bearing.label} ${Math.round(bearing.az)}°${bearing.origAz != null ? ' (proposed)' : ''}`,
      color: bearing.color, vertices: [pr.center, destination(pr.center[0], pr.center[1], bearing.az, len)], ctx: bearing.ctx || {},
    };
    const moved = bearing.origAz != null && Math.round(bearing.origAz) !== Math.round(bearing.az);
    setProfiles(moved ? [main, {
      key: `po|${bearing.id}`, label: `${bearing.label} ${Math.round(bearing.origAz)}° (current)`, color: '#7c3aed', dashed: true,
      vertices: [pr.center, destination(pr.center[0], pr.center[1], bearing.origAz, len)],
    }] : [main]);
  };

  const recenter = () => {
    if (data?.center && mapRef.current) mapRef.current.setView([data.center.lat, data.center.lon], Math.max(mapRef.current.getZoom(), 15));
  };

  const shell = darkMode ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800';

  return (
    <aside
      className={`fixed right-0 bottom-0 z-[35] border-l flex flex-col transition-[translate,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[translate] ${shell} ${
        shownOpen ? 'translate-x-0 shadow-[-12px_0_32px_rgba(0,0,0,0.18)]' : 'translate-x-full pointer-events-none'
      }`}
      style={{ top: headerH, width }}
      aria-hidden={!shownOpen}
      onTransitionEnd={(e) => { if (e.target === e.currentTarget && (e.propertyName === 'translate' || e.propertyName === 'transform')) onSlideEnd?.(shownOpen); }}
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
          onClick={() => { const on = !measuring; stopTools(); if (on) setMeasurePoints([]); setMeasuring(on); }}
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
        <ToolbarButton
          active={profileDrawing}
          onClick={() => { const on = !profileDrawing; stopTools(); setProfileDrawing(on); }}
          darkMode={darkMode}
          title="Elevation profile: click points, double-click to finish (max 20 km), Esc to cancel"
        >
          <Mountain className="w-3.5 h-3.5" /> Profile
        </ToolbarButton>
        <ToolbarButton
          active={placingProtractor || !!protractor}
          onClick={() => {
            if (protractor) { setProtractor(null); return; }
            const on = !placingProtractor; stopTools(); setPlacingProtractor(on);
          }}
          darkMode={darkMode}
          title={protractor ? 'Remove the protractor' : 'Bearing protractor: click the map (near a site to stick to it)'}
        >
          <Compass className="w-3.5 h-3.5" /> Protractor
        </ToolbarButton>
        <ToolbarButton onClick={recenter} darkMode={darkMode} title="Center on the searched site">
          <Crosshair className="w-3.5 h-3.5" />
        </ToolbarButton>
        <span className="w-px h-5 bg-slate-500/30 mx-0.5" />
        <label className="flex items-center gap-1 text-[11px] font-semibold" title="Colour sectors by">
          <Palette className="w-3.5 h-3.5 opacity-60" />
          <select
            value={mode}
            onChange={e => updatePrefs({ colorBy: e.target.value })}
            className={`rounded-md border px-1.5 py-1 text-[11px] font-semibold cursor-pointer ${
              darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
            }`}
          >
            {Object.entries(COLOR_MODES).map(([id, m]) => <option key={id} value={id}>{m.label}</option>)}
          </select>
        </label>
        <span className="w-px h-5 bg-slate-500/30 mx-0.5" />
        <div className="flex items-center gap-1">
        <Radar className="w-3.5 h-3.5 opacity-60" />
        {TA_OPTIONS.map(t => (
          <ToolbarButton
            key={t}
            active={prefs.ta === t}
            onClick={() => updatePrefs({ ta: t })}
            darkMode={darkMode}
            title={t ? `Stretch each sector to its TA ${t}% distance (${kpi.data?.ta_date || 'last day'})` : 'Default sector length'}
          >
            {t ? `TA${t}` : 'TA off'}
          </ToolbarButton>
        ))}
        </div>
        <span className="w-px h-5 bg-slate-500/30 mx-0.5" />
        <OpacitySlider label="Opacity" title="Sector fill opacity" min={5} value={prefs.opacity} onChange={v => updatePrefs({ opacity: v })} />
        <span className="w-px h-5 bg-slate-500/30 mx-0.5" />
        <div className="flex items-center gap-1">
        <span className="text-[11px] font-semibold opacity-60">Covmo</span>
        {['off', 'rsrp', 'rsrq'].map(c => (
          <ToolbarButton
            key={c}
            active={(covmoMetric || 'off') === c}
            onClick={() => { setCovmoHover(null); updatePrefs({ covmo: c }); }}
            darkMode={darkMode}
            title={c === 'off' ? 'Hide the covmo grid' : `Covmo ${COVMO_METRICS[c].label} grid of the latest week (zoom ${COVMO_MIN_ZOOM}+)`}
          >
            {c === 'off' ? 'Off' : COVMO_METRICS[c].label}
          </ToolbarButton>
        ))}
        {covmoMetric && (
          <OpacitySlider
            title="Covmo grid opacity"
            min={10}
            value={prefs.covmoOpacity ?? 0.4}
            onChange={v => updatePrefs({ covmoOpacity: v })}
          />
        )}
        </div>
        {kpi.loading && <span className="flex items-center gap-1 text-[10px] opacity-60"><Loader2 className="w-3 h-3 animate-spin" /> KPI</span>}
      </div>

      <div className="relative flex-1 min-h-0">
        {error && (
          <div className="absolute top-2 left-2 right-2 z-[600] rounded-md bg-rose-600 text-white text-xs px-3 py-2 shadow">
            {error}
          </div>
        )}
        {entered && (
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
            <CovmoLayer metric={covmoMetric} opacity={prefs.covmoOpacity ?? 0.4} onStatus={setCovmoStatus} onHover={setCovmoHover} />

            {shapes.map(({ cell, site, positions, noTa, indoor, ring }) => {
              const isMain = cell.site_id === mainSite;
              const highlighted = isMain && sectorSet.has(cell.sector);
              const cellKpi = kpiCells?.[cell.siteid_ci];
              const color = COLOR_MODES[mode].color(cell, cellKpi);
              const fill = isMain ? (highlighted ? Math.min(1, prefs.opacity + 0.25) : prefs.opacity) : prefs.opacity * 0.65;
              const siblings = data.cells.filter(o => o.site_id === cell.site_id && o !== cell
                && o.azimuth !== null && Math.abs(((o.azimuth - cell.azimuth + 540) % 360) - 180) <= 10);
              return (
                <Polygon
                  key={cellKey(cell)}
                  positions={positions}
                  interactive={!busy}
                  pathOptions={ring ? {
                    // indoor TA ring: outline only, so only the line is clickable and nothing is shaded
                    color: highlighted ? '#0f172a' : color,
                    weight: highlighted ? 2.5 : 1.5,
                    fill: false,
                    dashArray: '6 4',
                    opacity: isMain ? 0.95 : 0.75,
                  } : {
                    color: highlighted ? '#0f172a' : color,
                    weight: highlighted ? 2.5 : 1,
                    fillColor: color,
                    fillOpacity: indoor ? Math.min(1, fill + 0.2) : fill,
                    dashArray: noTa ? '2 4' : isMain ? null : '4 3',
                    opacity: isMain ? 1 : 0.8,
                  }}
                >
                  <Tooltip sticky>
                    {cell.cell_name} · {cell.band} · {indoor ? 'in-building' : `${cell.azimuth}°`}
                    {prefs.ta > 0 && ` · TA${prefs.ta} ${cellKpi?.[`ta${prefs.ta}`] ? formatDistance(cellKpi[`ta${prefs.ta}`]) : 'n/a'}`}
                  </Tooltip>
                  {!busy && (
                    <Popup maxWidth={340}>
                      <CellPopup
                        cell={cell}
                        site={site}
                        siblings={siblings}
                        canSelectSector={canSelectSector && isMain}
                        onSelectSector={onSelectSector}
                        kpi={cellKpi}
                        kpiMeta={kpi.data}
                        onProfile={(c) => { profileCell(c); mapRef.current?.closePopup(); }}
                        onProtractor={protractorOnSite}
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
            <ProfileDrawLayer active={profileDrawing} onFinish={finishProfile} onCancel={cancelProfile} />
            {profiles && <ProfileShapes profiles={profiles} hover={profileHover} />}
            <ProtractorLayer
              pr={protractor}
              onChange={setProtractor}
              sites={data?.sites}
              placing={placingProtractor}
              onPlace={(center, site) => { setPlacingProtractor(false); openProtractorAt(center, site); }}
            />
          </MapContainer>
        )}
        {kpi.error && (
          <div className="absolute top-2 left-12 right-2 z-[600] rounded-md bg-amber-500 text-white text-[11px] px-3 py-1.5 shadow">
            KPI/status partly unavailable: {kpi.error}
          </div>
        )}
        {covmoMetric && <CovmoLegend metric={covmoMetric} status={covmoStatus} hover={covmoHover} darkMode={darkMode} />}
        {placingProtractor && !protractor && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[640] rounded-md bg-yellow-400 text-slate-900 text-[11px] font-semibold px-2 py-1 shadow">
            Click the map to place the protractor (near a site it sticks to the site)
          </div>
        )}
        <ProtractorPanel
          pr={protractor}
          onChange={setProtractor}
          onClose={() => setProtractor(null)}
          onProfile={profileFromProtractor}
          onLoadSectors={loadSectors}
          sites={data?.sites}
          darkMode={darkMode}
        />
        {profiles && (
          <ProfilePanel
            key={profiles[0].key}
            profiles={profiles}
            onClose={() => { setProfiles(null); setProfileHover(null); }}
            onHover={setProfileHover}
            darkMode={darkMode}
          />
        )}
        {bands.length > 0 && (
          <Legend bands={bands} darkMode={darkMode} tier={prefs.tier} mode={mode} kpiMeta={kpi.data} ta={prefs.ta} />
        )}
      </div>
    </aside>
  );
}
