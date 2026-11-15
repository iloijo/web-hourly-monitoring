import { useEffect, useMemo, useState } from 'react';
import { Loader2, Mountain, X } from 'lucide-react';
import ReactECharts from '../../../lib/echarts';
import { postJson } from '../../../api/client';
import { formatDistance } from './geo';
import { analyseProfile, BAND_FREQ_GHZ, BAND_VBW_DEG, samplePath } from './profile';

// Terrain heights for one sampled path, cached by the path itself
function useElevation(vertices) {
  const sampled = useMemo(() => samplePath(vertices || []), [vertices]);
  const key = sampled.points.length ? sampled.points.map(p => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join(';') : '';
  const [result, setResult] = useState({ key: null, data: null, error: null });
  const current = result.key === key;
  useEffect(() => {
    if (!key || current) return undefined;
    let cancelled = false;
    postJson('/api/map/elevation', { points: sampled.points })
      .then(json => { if (!cancelled) setResult({ key, data: json, error: json.error || null }); })
      .catch(err => { if (!cancelled) setResult({ key, data: null, error: String(err) }); });
    return () => { cancelled = true; };
  }, [key, current, sampled]);
  return { sampled, loading: !!key && !current, data: current ? result.data : null, error: current ? result.error : null };
}

const NumberField = ({ label, value, onChange, step = 1, unit, darkMode }) => (
  <label className="flex items-center gap-1">
    <span className="opacity-60">{label}</span>
    <input
      type="number"
      value={value}
      step={step}
      onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      className={`w-14 rounded border px-1 py-0.5 tabular-nums ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}
    />
    {unit && <span className="opacity-60">{unit}</span>}
  </label>
);

/**
 * profiles: [{ key, label, color, vertices: [[lat, lon], ...], ctx: { txHeight, band, tiltDeg } }]
 * The first profile is analysed in full (LOS, Fresnel, beam); a second one is drawn as a comparison terrain.
 */
export default function ProfilePanel({ profiles, onClose, onHover, darkMode }) {
  const main = profiles[0];
  const second = profiles[1];
  const a = useElevation(main?.vertices);
  const b = useElevation(second?.vertices);
  const ctx = main?.ctx || {};

  const [txHeight, setTxHeight] = useState(ctx.txHeight ?? 30);
  const [rxHeight, setRxHeight] = useState(1.5);
  const [tilt, setTilt] = useState(ctx.tiltDeg ?? '');
  const [vbw, setVbw] = useState(BAND_VBW_DEG[ctx.band] ?? 7);
  // the parent remounts this panel (key) for every new profile, so the inputs start from the cell's values

  const freqGhz = BAND_FREQ_GHZ[ctx.band] ?? 1.8;
  const res = useMemo(() => {
    if (!a.data?.elevations?.length) return null;
    return analyseProfile(a.data.elevations, a.sampled.dist, {
      txHeight: Number(txHeight) || 0,
      rxHeight: Number(rxHeight) || 0,
      freqGhz,
      tiltDeg: tilt === '' ? null : Number(tilt),
      vbwDeg: Number(vbw) || 7,
    });
  }, [a.data, a.sampled, txHeight, rxHeight, freqGhz, tilt, vbw]);

  const km = (d) => +(d / 1000).toFixed(3);
  const option = useMemo(() => {
    if (!res) return null;
    const x = a.sampled.dist.map(km);
    const pair = (ys) => ys.map((y, i) => [x[i], +y.toFixed(1)]);
    const series = [
      {
        name: 'Terrain', type: 'line', data: pair(res.eff), symbol: 'none', smooth: false,
        lineStyle: { color: '#92400e', width: 1.5 }, areaStyle: { color: 'rgba(146,64,14,0.35)' }, z: 2,
      },
      {
        name: 'Line of sight', type: 'line', data: pair(res.los), symbol: 'none',
        lineStyle: { color: res.firstBlock !== null ? '#dc2626' : '#16a34a', width: 1.5 }, z: 3,
      },
      {
        name: 'Fresnel 1', type: 'line', data: pair(res.los.map((v, i) => v - res.fresnel[i])), symbol: 'none',
        lineStyle: { color: '#0ea5e9', width: 1, type: 'dashed' }, z: 3,
      },
    ];
    if (res.beams) {
      const beam = (r, name, color, type) => {
        const end = r.hit ?? r.z.length - 1;
        series.push({
          name, type: 'line', symbol: 'none', z: 4,
          data: r.z.slice(0, end + 1).map((y, i) => [x[i], +y.toFixed(1)]),
          lineStyle: { color, width: name === 'Main beam' ? 2 : 1, type },
          markPoint: r.hit != null && name === 'Main beam' ? {
            symbol: 'pin', symbolSize: 34, itemStyle: { color },
            data: [{ coord: [x[r.hit], +r.z[r.hit].toFixed(1)], value: `${(a.sampled.dist[r.hit] / 1000).toFixed(2)} km` }],
            label: { fontSize: 9 },
          } : undefined,
        });
      };
      beam(res.beams.main, 'Main beam', '#f97316', 'solid');
      beam(res.beams.upper, '-3 dB upper', '#fb923c', 'dotted');
      beam(res.beams.lower, '-3 dB lower', '#fb923c', 'dotted');
    }
    if (b.data?.elevations?.length && second) {
      const xb = b.sampled.dist.map(km);
      series.push({
        name: second.label || 'Compare', type: 'line', symbol: 'none', z: 1,
        data: b.data.elevations.map((y, i) => [xb[i], y]),
        lineStyle: { color: second.color || '#7c3aed', width: 1.5, type: 'dashed' },
      });
    }
    const text = darkMode ? '#cbd5e1' : '#475569';
    return {
      animation: false,
      grid: { left: 46, right: 14, top: 26, bottom: 26 },
      legend: { top: 0, textStyle: { color: text, fontSize: 10 }, itemWidth: 14, itemHeight: 6 },
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'line' }, confine: true,
        formatter: (ps) => {
          const d = ps[0]?.data?.[0];
          return [`<b>${d} km</b>`, ...ps.map(p => `${p.marker}${p.seriesName}: ${p.data?.[1]} m`)].join('<br/>');
        },
      },
      xAxis: { type: 'value', name: 'km', nameGap: 4, axisLabel: { color: text, fontSize: 10 }, max: x[x.length - 1], min: 0 },
      yAxis: { type: 'value', name: 'm', scale: true, axisLabel: { color: text, fontSize: 10 }, splitLine: { lineStyle: { opacity: 0.25 } } },
      series,
    };
  }, [res, a.sampled, b.data, b.sampled, second, darkMode]);

  // Chart hover -> marker on the map
  const events = useMemo(() => ({
    updateAxisPointer: (e) => {
      const xv = e.axesInfo?.[0]?.value;
      if (xv == null) return;
      const d = xv * 1000;
      const dist = a.sampled.dist;
      let i = 0;
      while (i < dist.length - 1 && dist[i] < d) i += 1;
      onHover(a.sampled.points[i] || null);
    },
    globalout: () => onHover(null),
  }), [a.sampled, onHover]);

  const shell = darkMode ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-700';
  const hit = res?.beams?.main?.hit;
  const src = a.data?.source_label;
  return (
    <div className={`absolute left-0 right-0 bottom-0 z-[650] border-t shadow-[0_-8px_24px_rgba(0,0,0,0.15)] ${shell}`} style={{ height: 250 }}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pt-1.5 text-[11px]">
        <Mountain className="w-3.5 h-3.5 text-amber-600" />
        <span className="font-bold">{main?.label || 'Elevation profile'}</span>
        {res && <span className="opacity-70">{formatDistance(res.total)}</span>}
        {res && <span className="opacity-70">min {Math.round(res.minH)} m · max {Math.round(res.maxH)} m</span>}
        {res && (
          <span className={`font-semibold ${res.firstBlock !== null ? 'text-rose-500' : 'text-emerald-600'}`}>
            {res.firstBlock !== null ? `LOS blocked at ${formatDistance(a.sampled.dist[res.firstBlock])}` : 'LOS clear'}
          </span>
        )}
        {res?.clearancePct != null && <span className="opacity-70">Fresnel clearance {res.clearancePct}%</span>}
        {hit != null && <span className="font-semibold text-orange-500">Beam lands at {formatDistance(a.sampled.dist[hit])}</span>}
        {(a.loading || b.loading) && <Loader2 className="w-3.5 h-3.5 animate-spin opacity-70" />}
        <button type="button" onClick={onClose} className="ml-auto p-0.5 rounded hover:bg-slate-500/15 cursor-pointer" title="Close profile">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pt-1 text-[11px]">
        <NumberField label="Antenna" value={txHeight} onChange={setTxHeight} unit="m" darkMode={darkMode} />
        <NumberField label="UE" value={rxHeight} onChange={setRxHeight} step={0.5} unit="m" darkMode={darkMode} />
        <NumberField label="Tilt" value={tilt} onChange={setTilt} step={0.5} unit="°" darkMode={darkMode} />
        <NumberField label="V-BW" value={vbw} onChange={setVbw} unit="°" darkMode={darkMode} />
        <span className="opacity-60">{freqGhz} GHz · k=4/3</span>
        {src && (
          <span className={`ml-auto px-1.5 py-px rounded text-[10px] font-semibold ${a.data.source === 'local' ? 'bg-amber-500/20 text-amber-600' : 'bg-sky-500/15 text-sky-600'}`}>
            DEM: {src}{a.data.source === 'local' ? ' (backup)' : ''}
          </span>
        )}
      </div>
      <div style={{ height: 180 }}>
        {a.error && <div className="p-3 text-xs text-rose-500">Elevation failed: {a.error}</div>}
        {option && <ReactECharts option={option} notMerge style={{ height: '100%', width: '100%' }} onEvents={events} />}
      </div>
    </div>
  );
}
