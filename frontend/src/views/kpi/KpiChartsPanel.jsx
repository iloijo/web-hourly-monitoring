import { AlertTriangle, Building2, Globe, MapPin, MousePointerClick, Network, Radio, SlidersHorizontal } from 'lucide-react';
import SectorPayloadChart from '../../components/SectorPayloadChart';

const SCOPE_ICON = { regional: Globe, nop: Network, city: Building2, kecamatan: MapPin };
const SCOPE_CAPTION = {
  sector: 'TARGET NETWORK ELEMENT (NE)',
  regional: 'REGIONAL ANALYSIS',
  nop: 'NOP CLUSTER ANALYSIS',
  city: 'CITY / KABUPATEN ANALYSIS',
  kecamatan: 'KECAMATAN ANALYSIS',
  site: 'SITE AGGREGATED ANALYSIS',
};

const gridClass = (perRow) =>
  perRow === 1 ? 'grid-cols-1' : perRow === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';

const plural = (list, many, one) => (list.length > 1 ? `${list.length} ${many}` : one);

// Chart container for the KPI monitoring menus (sector, sectoral and higher-scope charts)
export default function KpiChartsPanel({ km, activeMenu, siteNamesMap, chartsPerRow, darkMode, markers = [] }) {
  const scope = km.aggregationScope;
  const ScopeIcon = SCOPE_ICON[scope] || Radio;
  const sectorData = km.data;
  const aggData = km.aggregationData;
  const isSectoralView = scope === 'sector' && km.sectorViewMode === 'sectoral';
  const currentSectorData = sectorData?.sectors?.[`sector${km.selectedSector}`];
  const shownSectoralSectors = km.availableSectors.filter(s => km.sectoralSectors.includes(String(s)));
  const errorText = scope === 'sector' ? sectorData?.error : aggData?.error;
  const hasResult = scope === 'sector' ? !!sectorData : !!aggData;

  const siteLabel = (s) => (siteNamesMap[s] ? `${s} - ${siteNamesMap[s]}` : s);
  const title = {
    sector: km.resolvedNeName,
    regional: 'Region Sulawesi',
    nop: km.selectedNops.length > 1 ? 'Multiple NOP' : `NOP ${km.selectedNops[0] || ''}`,
    city: km.selectedCities.length > 1 ? 'Multiple City' : (km.selectedCities[0] || ''),
    kecamatan: km.selectedKecamatans.length > 1 ? 'Multiple Kecamatan' : `Kecamatan ${km.selectedKecamatans[0] || ''}`,
    site: km.selectedSites.length > 1 ? 'Multiple Site' : km.selectedSites[0] ? siteLabel(km.selectedSites[0]) : 'Site',
  }[scope];

  const contextBadge = {
    regional: 'Sulawesi Region',
    nop: plural(km.selectedNops, 'NOPs', km.selectedNops[0]),
    city: km.selectedCities.length > 1
      ? `${km.selectedCities.length} Cities`
      : `${plural(km.cityFilterNops, 'NOPs', km.cityFilterNops[0])} • ${km.selectedCities[0]}`,
    kecamatan: km.selectedKecamatans.length > 1 ? `${km.selectedKecamatans.length} Kecamatans` : `${km.kecFilterKab} • ${km.selectedKecamatans[0]}`,
    site: plural(km.selectedSites, 'Sites', km.selectedSites[0]),
  }[scope] || `${km.currentSiteMeta.nop} • ${km.currentSiteMeta.kabupaten}`;

  const chartProps = (kpiData) => ({
    unit: kpiData.unit,
    carrierSeries: kpiData.carrier_series,
    totalSeries: kpiData.total_series,
    carrierBands: kpiData.carrier_bands || {},
    hasTotal: kpiData.has_total || kpiData.has_tot,
    minY: kpiData.min_y,
    maxY: kpiData.max_y,
    darkMode,
    chartsPerRow,
    markers,
  });

  const kpiIds = km.activeSelectedKpiIds;

  return (
    <div className={`p-5 rounded-2xl border transition-all ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold shrink-0 ${darkMode ? 'bg-blue-900/40 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
            <ScopeIcon className="w-6 h-6" />
          </div>
          <div>
            <div className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
              <span>{SCOPE_CAPTION[scope]}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            </div>
            <div className={`text-lg sm:text-xl font-semibold tracking-tight flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              <span>{title}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={`px-3 py-1 rounded-lg text-xs font-bold border ${darkMode ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
            {scope === 'sector'
              ? (km.sectorViewMode === 'sectoral' ? 'Sectoral View' : `Sector ${km.selectedSector}`)
              : km.aggregationMode === 'full' ? 'Mode: Aggregation' : 'Mode: Band'}
          </span>
          <span className={`px-3 py-1 rounded-lg text-xs font-semibold border ${darkMode ? 'bg-blue-950/60 text-blue-300 border-blue-900' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
            {contextBadge}
          </span>
        </div>
      </div>

      {errorText && (
        <div className={`p-5 rounded-2xl border flex items-center gap-4 ${darkMode ? 'bg-rose-950/40 border-rose-800/80 text-rose-200' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
          <AlertTriangle className="w-6 h-6 text-rose-500 shrink-0" />
          <div className="text-xs">
            <div className="font-bold text-sm">Gagal memuat data grafik</div>
            <p>{errorText}</p>
          </div>
        </div>
      )}

      {!hasResult && !km.loading && (
        <div className={`py-16 text-center border-2 border-dashed rounded-2xl ${darkMode ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
          <MousePointerClick className="w-8 h-8 mx-auto mb-2 opacity-50 text-blue-500" />
          <p className="font-semibold text-sm">Belum ada data</p>
          <p className="text-xs opacity-75 mt-1">
            {scope === 'sector' ? 'Pilih Target Site atau klik Generate untuk memuat grafik.' : 'Atur filter lalu klik Generate untuk memuat grafik.'}
          </p>
        </div>
      )}

      <div className={`grid gap-4 transition-all duration-300 ${gridClass(chartsPerRow)}`}>
        {hasResult && kpiIds.length === 0 && (
          <div className={`col-span-full py-16 text-center border-2 border-dashed rounded-2xl ${darkMode ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
            <SlidersHorizontal className="w-8 h-8 mx-auto mb-2 opacity-40 text-blue-500" />
            <p className="font-semibold text-sm">Tidak ada KPI yang dipilih</p>
            <p className="text-xs opacity-75 mt-1">Buka menu Filter KPI di atas untuk memilih metrik yang ingin ditampilkan.</p>
          </div>
        )}

        {isSectoralView && sectorData?.sectors && kpiIds.flatMap(kpiId => {
          const kpiLabel = km.activeKpiCatalog.find(k => k.id === kpiId)?.label || kpiId;
          // KPI heading spans the full row so wrapped sector charts stay grouped under their KPI
          const heading = shownSectoralSectors.length > chartsPerRow && (
            <div key={`sectoral_head_${kpiId}`} className={`col-span-full text-xs font-bold uppercase tracking-wider pt-1 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
              {kpiLabel}
            </div>
          );
          return [heading, ...shownSectoralSectors.map(s => {
            const secData = sectorData.sectors[`sector${s}`];
            const kpiData = secData?.kpis?.[kpiId];
            if (!kpiData) return <div key={`sectoral_${s}_${kpiId}`} />;
            return (
              <SectorPayloadChart
                key={`${activeMenu}_sectoral_${s}_${kpiId}`}
                title={`${kpiData.title} - ${km.siteId} Sector ${s}`}
                timestamps={secData.timestamps || sectorData.timestamps || []}
                bandFilter={km.selectedBands}
                timeMode={km.timeMode}
                {...chartProps(kpiData)}
              />
            );
          })];
        })}

        {scope === 'sector' && !isSectoralView && currentSectorData && kpiIds.map(kpiId => {
          const kpiData = currentSectorData.kpis?.[kpiId];
          if (!kpiData) return null;
          return (
            <SectorPayloadChart
              key={`${activeMenu}_sector_${km.selectedSector}_${kpiId}`}
              title={kpiData.title}
              timestamps={currentSectorData.timestamps || sectorData?.timestamps || []}
              bandFilter={km.selectedBands}
              timeMode={km.timeMode}
              {...chartProps(kpiData)}
            />
          );
        })}

        {scope !== 'sector' && aggData?.kpis && kpiIds.map(kpiId => {
          const kpiData = aggData.kpis[kpiId];
          if (!kpiData) return null;
          return (
            <SectorPayloadChart
              key={`${activeMenu}_${scope}_${km.aggregationMode}_${kpiId}`}
              title={kpiData.title}
              timestamps={aggData.timestamps}
              bandFilter={km.aggregationMode === 'band' ? km.selectedBands : 'all'}
              timeMode="daily"
              {...chartProps(kpiData)}
            />
          );
        })}
      </div>
    </div>
  );
}
