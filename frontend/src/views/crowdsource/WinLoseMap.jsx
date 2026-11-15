import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Map as MapIcon } from 'lucide-react';
import { Card } from '../cei/ui';
import { STATUS_COLORS } from './constants';

// Helper to fit bounds to points
function MapController({ points, focusKabupaten }) {
  const map = useMap();

  // Keep the map sized to its container when the layout (or window) changes
  useEffect(() => {
    const onResize = () => map.invalidateSize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [map]);

  useEffect(() => {
    map.invalidateSize();
    if (focusKabupaten && points.length > 0) {
      const target = points.find(
        (p) => p.kabupaten?.toUpperCase() === focusKabupaten?.toUpperCase()
      );
      if (target && target.lat && target.lon) {
        map.flyTo([target.lat, target.lon], 9, { duration: 1.2 });
        return;
      }
    }

    const validPts = points.filter((p) => p.lat && p.lon);
    if (validPts.length > 0) {
      const lats = validPts.map((p) => p.lat);
      const lons = validPts.map((p) => p.lon);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLon = Math.min(...lons);
      const maxLon = Math.max(...lons);
      // Open framed on the Sulawesi kabupaten points
      map.fitBounds([
        [minLat, minLon],
        [maxLat, maxLon],
      ], { padding: [24, 24], maxZoom: 8 });
    }
  }, [points, focusKabupaten, map]);

  return null;
}

// Linear RGB interpolation between green (0), yellow (0.5), red (1.0)
function getCountGradientColor(ratio) {
  const clamped = Math.max(0, Math.min(1, ratio));
  if (clamped < 0.5) {
    // Green (#16A34A: 22, 163, 74) to Yellow (#EAB308: 234, 179, 8)
    const factor = clamped * 2;
    const r = Math.round(22 + factor * (234 - 22));
    const g = Math.round(163 + factor * (179 - 163));
    const b = Math.round(74 + factor * (8 - 74));
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    // Yellow (#EAB308: 234, 179, 8) to Red (#DC2626: 220, 38, 38)
    const factor = (clamped - 0.5) * 2;
    const r = Math.round(234 + factor * (220 - 234));
    const g = Math.round(179 + factor * (38 - 179));
    const b = Math.round(8 + factor * (38 - 8));
    return `rgb(${r}, ${g}, ${b})`;
  }
}

// Status shown for a marker: its own status (single KPI) or the dominant one (All KPI)
function pointStatus(p, mode) {
  if (mode === 'status') return p.status;
  const { win_count = 0, draw_count = 0, lose_count = 0 } = p;
  if (lose_count > win_count && lose_count > draw_count) return 'LOSE';
  if (win_count >= lose_count && win_count >= draw_count) return 'WIN';
  return 'DRAW';
}

export default function WinLoseMap({
  mapData,
  catalog = [],
  mapFilters,
  onMapFilterChange,
  focusKabupaten,
  region = 'SULAWESI',
  darkMode,
  fill = false,
}) {
  const [showWin, setShowWin] = useState(true);
  const [showDraw, setShowDraw] = useState(true);
  const [showLose, setShowLose] = useState(true);
  const [showLabels, setShowLabels] = useState(false);

  const { points = [], no_data = [], mode = 'count' } = mapData || {};

  // KPI options for selected source & tech
  const kpiOptions = useMemo(() => {
    return catalog.filter((c) => {
      if (c.source !== mapFilters.source) return false;
      if (c.manual) return false;
      if (mapFilters.tech === 'overall' && !['overall', 'all'].includes(c.tech.toLowerCase())) return false;
      if (mapFilters.tech === '5g' && c.tech.toLowerCase() !== '5g') return false;
      if (mapFilters.tech === '4g' && c.tech.toLowerCase() !== '4g') return false;
      return true;
    });
  }, [catalog, mapFilters.source, mapFilters.tech]);

  if (region !== 'SULAWESI') {
    return (
      <Card title="Distribution Map" Icon={MapIcon} iconClass="text-blue-500" darkMode={darkMode}>
        <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
          Map available for SULAWESI only.
        </div>
      </Card>
    );
  }

  // Filter points according to checkboxes
  const visiblePoints = points.filter((p) => {
    if (!p.has_data) return true; // Grey markers always stay visible
    const st = pointStatus(p, mode);
    if (st === 'WIN' && !showWin) return false;
    if (st === 'DRAW' && !showDraw) return false;
    if (st === 'LOSE' && !showLose) return false;
    return true;
  });

  // Legend counts kabupaten (one per marker), not KPI-level statuses
  const legendCounts = points.reduce(
    (acc, p) => {
      if (p.has_data) {
        const st = pointStatus(p, mode);
        if (st) acc[st] += 1;
      }
      return acc;
    },
    { WIN: 0, DRAW: 0, LOSE: 0 }
  );

  // OpenStreetMap tiles (no API key); dark mode is a CSS filter on the tile pane
  const tileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

  const selectClass = `px-2 py-1 text-xs font-semibold rounded-lg border transition cursor-pointer ${
    darkMode
      ? 'bg-slate-800 border-slate-700 text-slate-200'
      : 'bg-white border-slate-200 text-slate-800'
  }`;

  return (
    <Card
      title="WIN / LOSE Map — Region Sulawesi"
      Icon={MapIcon}
      iconClass="text-emerald-500"
      darkMode={darkMode}
      className={fill ? 'flex-1 flex flex-col min-h-0' : ''}
      meta={
        <div className="flex flex-wrap items-center gap-3">
          {/* Source Selector */}
          <select
            value={mapFilters.source}
            onChange={(e) => onMapFilterChange({ source: e.target.value, key: 'all' })}
            className={selectClass}
          >
            <option value="ONX">OpenSignal</option>
            <option value="OOKLA">Ookla</option>
          </select>

          {/* Tech Selector */}
          <select
            value={mapFilters.tech}
            onChange={(e) => onMapFilterChange({ tech: e.target.value, key: 'all' })}
            className={selectClass}
          >
            <option value="overall">Overall</option>
            <option value="5g">5G</option>
            {mapFilters.source === 'OOKLA' && <option value="4g">4G</option>}
          </select>

          {/* KPI Selector */}
          <select
            value={mapFilters.key}
            onChange={(e) => onMapFilterChange({ key: e.target.value })}
            className={selectClass}
          >
            <option value="all">All KPI (Overview)</option>
            {kpiOptions.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>

          {/* Visibility Checkboxes */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-300 dark:border-slate-700">
            <label className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 cursor-pointer">
              <input
                type="checkbox"
                checked={showWin}
                onChange={(e) => setShowWin(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-0"
              />
              <span className="font-bold">Win</span>
            </label>
            <label className="flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400 cursor-pointer">
              <input
                type="checkbox"
                checked={showDraw}
                onChange={(e) => setShowDraw(e.target.checked)}
                className="rounded text-teal-600 focus:ring-0"
              />
              <span className="font-bold">Draw</span>
            </label>
            <label className="flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400 cursor-pointer">
              <input
                type="checkbox"
                checked={showLose}
                onChange={(e) => setShowLose(e.target.checked)}
                className="rounded text-rose-600 focus:ring-0"
              />
              <span className="font-bold">Lose</span>
            </label>
            <label className="flex items-center gap-1 text-xs text-slate-400 cursor-pointer pl-1">
              <input
                type="checkbox"
                checked={showLabels}
                onChange={(e) => setShowLabels(e.target.checked)}
                className="rounded text-blue-600 focus:ring-0"
              />
              <span>Labels</span>
            </label>
          </div>
        </div>
      }
    >
      <div
        className={`relative w-full rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 ${
          fill ? 'flex-1 min-h-[520px]' : 'h-[520px]'
        }`}
      >
        <MapContainer
          center={[-2.5, 121.5]}
          zoom={6}
          scrollWheelZoom={true}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            key={darkMode ? 'dark' : 'light'}
            url={tileUrl}
            maxZoom={19}
            className={darkMode ? '[filter:invert(1)_hue-rotate(180deg)_brightness(0.9)_contrast(0.9)]' : ''}
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />

          <MapController points={points} focusKabupaten={focusKabupaten} />

          {visiblePoints.map((p) => {
            if (!p.lat || !p.lon) return null;

            let color = '#94a3b8';
            let radius = 7;
            let fillOpacity = 0.8;

            if (!p.has_data) {
              color = '#94a3b8';
              radius = 5;
              fillOpacity = 0.5;
            } else if (mode === 'status') {
              color = STATUS_COLORS[p.status] || '#94a3b8';
              const gapVal = Math.abs(p.gap_pct || 0);
              radius = Math.max(6, Math.min(22, 6 + gapVal * 1.5));
            } else {
              // Mode count: lose ratio gradient
              const tot = (p.win_count || 0) + (p.draw_count || 0) + (p.lose_count || 0);
              const ratio = tot > 0 ? (p.lose_count || 0) / tot : 0;
              color = getCountGradientColor(ratio);
              radius = 9;
            }

            const cleanName = (p.kabupaten || '').replace(/^KOTA\s+/i, '');

            return (
              <CircleMarker
                key={p.kabupaten}
                center={[p.lat, p.lon]}
                radius={radius}
                pathOptions={{
                  color: '#ffffff',
                  weight: 1.2,
                  fillColor: color,
                  fillOpacity: fillOpacity,
                }}
              >
                {/* Permanent label if toggled */}
                {showLabels && (
                  <Tooltip permanent direction="right" offset={[8, 0]} className="bg-transparent border-0 shadow-none font-bold text-[10px] text-slate-800 dark:text-slate-100">
                    {cleanName}
                  </Tooltip>
                )}

                {/* Hover Tooltip */}
                <Tooltip direction="top" offset={[0, -radius]} opacity={0.95}>
                  <div className="p-1 text-xs">
                    <div className="font-bold border-b border-slate-700/40 pb-0.5 mb-1">
                      {p.kabupaten} ({p.n_sites || 0} sites)
                    </div>
                    {!p.has_data ? (
                      <div className="text-slate-400">No data for this KPI</div>
                    ) : mode === 'status' ? (
                      <div className="space-y-0.5 font-sans">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-400">Status:</span>
                          <span
                            className="font-bold"
                            style={{ color: STATUS_COLORS[p.status] }}
                          >
                            {p.status} (Rank #{p.rank})
                          </span>
                        </div>
                        <div className="font-mono">
                          TSEL {p.tsel} vs {p.leader || 'OLO'} {p.leader_value || '–'}
                        </div>
                        {p.gap !== null && (
                          <div className="text-slate-300 font-mono">
                            {p.status === 'WIN' ? `Margin: +${p.gap}` : `Gap: -${p.gap} (${p.gap_pct}%)`}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1 font-sans">
                        <div className="flex items-center gap-2 font-bold">
                          <span className="text-emerald-500">Win: {p.win_count}</span> ·{' '}
                          <span className="text-teal-500">Draw: {p.draw_count}</span> ·{' '}
                          <span className="text-rose-500">Lose: {p.lose_count}</span>
                        </div>
                        {p.lose_kpis && p.lose_kpis.length > 0 && (
                          <div className="text-[10px] text-rose-400">
                            Lose on: {p.lose_kpis.slice(0, 3).join(', ')}
                            {p.lose_kpis.length > 3 ? ` +${p.lose_kpis.length - 3} more` : ''}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </Tooltip>
              </CircleMarker>
            );
          })}
        </MapContainer>

        {/* Floating Legend Bottom Right */}
        <div
          className={`absolute bottom-3 right-3 z-1000 p-2.5 rounded-lg border shadow-lg text-[11px] backdrop-blur-md ${
            darkMode ? 'bg-slate-900/90 border-slate-800 text-slate-200' : 'bg-white/90 border-slate-200 text-slate-800'
          }`}
        >
          <div className="font-bold uppercase tracking-wider mb-1 text-[10px] text-slate-400">
            Legend & Counter
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
              Win {legendCounts.WIN}
            </span>
            <span className="flex items-center gap-1 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-600"></span>
              Draw {legendCounts.DRAW}
            </span>
            <span className="flex items-center gap-1 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-600"></span>
              Lose {legendCounts.LOSE}
            </span>
            <span className="flex items-center gap-1 font-semibold text-slate-400">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
              No data {no_data.length}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
