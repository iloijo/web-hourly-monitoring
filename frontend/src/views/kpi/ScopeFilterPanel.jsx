import { SlidersHorizontal } from 'lucide-react';
import AggregationScopeBar from '../../components/AggregationScopeBar';
import MultiSelectDropdown from '../../components/MultiSelectDropdown';
import BandFilter from '../../components/filters/BandFilter';
import KpiFilter from '../../components/filters/KpiFilter';
import SegmentedToggle from '../../components/filters/SegmentedToggle';
import SiteSearchSelect from '../../components/filters/SiteSearchSelect';
import SimpleSelect from '../../components/filters/SimpleSelect';

const FILTER_TYPE_OPTIONS = [['macro', 'Macro'], ['indoor', 'Indoor'], ['all', 'All']];
const AGGREGATION_MODE_OPTIONS = [['full', 'Aggregation'], ['band', 'Band']];
const VIEW_MODE_OPTIONS = [['all', 'All KPI'], ['sectoral', 'Sectoral']];

// "Filters & KPI Selection" card for the KPI monitoring menus
export default function ScopeFilterPanel({ km, siteNamesMap, darkMode, activeMenu }) {
  const scope = km.aggregationScope;
  const isFull = km.aggregationMode === 'full';

  const currentAvailableBands = scope === 'sector'
    ? km.data?.available_bands
    : (km.aggregationData?.available_bands || km.data?.available_bands);

  const bandFilter = (variant, className) => (
    <BandFilter
      options={km.activeBandOptions}
      selected={km.selectedBands}
      allIds={km.allActiveBandIds}
      onToggle={km.handleToggleBand}
      onToggleAll={km.handleToggleAllBands}
      activeBands={currentAvailableBands || km.allActiveBandIds}
      variant={variant}
      darkMode={darkMode}
      className={className}
    />
  );

  const modeToggle = (
    <SegmentedToggle
      label="AGGREGATION / BAND"
      options={AGGREGATION_MODE_OPTIONS}
      value={km.aggregationMode}
      onChange={km.handleSwitchAggregationMode}
      darkMode={darkMode}
    />
  );

  const scopeTail = (
    <>
      {modeToggle}
      {bandFilter('scope', 'min-w-40')}
      <KpiFilter km={km} darkMode={darkMode} className="min-w-44" />
    </>
  );

  return (
    <div className={`rounded-xl border p-4 shadow-2xs transition-colors duration-300 space-y-3.5 ${
      darkMode ? 'bg-slate-800/80 border-slate-700/80' : 'bg-white border-slate-200/90'
    }`}>
      <div className="space-y-2.5 pb-2 border-b border-slate-100 dark:border-slate-700/60">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <h3 className={`font-bold text-xs uppercase tracking-wider ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
            Filters & KPI Selection
          </h3>
        </div>
        <AggregationScopeBar currentScope={scope} onSelectScope={km.handleSelectScope} darkMode={darkMode} activeMenu={activeMenu || km.activeMenu} />
      </div>

      {scope === 'sector' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3.5">
          <SiteSearchSelect
            sites={km.activeSitesList}
            siteNamesMap={siteNamesMap}
            value={km.siteId}
            onSelect={km.handleSelectSectorSite}
            darkMode={darkMode}
          />

          {km.sectorViewMode === 'sectoral' ? (
            <MultiSelectDropdown
              label="FILTER SECTOR"
              options={km.availableSectors.map(s => ({ value: String(s), label: `Sector ${s}` }))}
              selectedValues={km.sectoralSectors}
              onChange={km.setSectoralSectors}
              isMulti={true}
              searchable={false}
              darkMode={darkMode}
              minWidth="min-w-0"
            />
          ) : (
            <SimpleSelect
              label="FILTER SECTOR"
              value={km.selectedSector}
              options={km.availableSectors.map(String)}
              onChange={km.setSelectedSector}
              darkMode={darkMode}
            />
          )}

          {bandFilter('sector')}
          <KpiFilter km={km} darkMode={darkMode} />
          <SimpleSelect label="FILTER TYPE" value={km.filterType} options={FILTER_TYPE_OPTIONS} onChange={km.setFilterType} darkMode={darkMode} />
          <SegmentedToggle
            label="MODE VIEW"
            options={VIEW_MODE_OPTIONS}
            value={km.sectorViewMode}
            onChange={km.handleSwitchSectorViewMode}
            darkMode={darkMode}
            stretch
          />
        </div>
      )}

      {scope === 'regional' && (
        <div className="flex flex-wrap items-center gap-4">
          {modeToggle}
          {bandFilter('scope', 'min-w-44')}
          <KpiFilter km={km} darkMode={darkMode} className="min-w-48" />
        </div>
      )}

      {scope === 'nop' && (
        <div className="flex flex-wrap items-center gap-4">
          <MultiSelectDropdown
            label="LEVEL NOP"
            options={km.nopOptions}
            selectedValues={km.selectedNops}
            onChange={km.handleNopsChange}
            isMulti={isFull}
            placeholder="Select NOP..."
            darkMode={darkMode}
            minWidth="min-w-48"
          />
          {scopeTail}
        </div>
      )}

      {scope === 'city' && (
        <div className="flex flex-wrap items-center gap-4">
          <MultiSelectDropdown
            label="NOP"
            options={km.nopOptions}
            selectedValues={km.cityFilterNops}
            onChange={(list) => km.handleCityNopsChange(list, km.nopOptions)}
            isMulti={true}
            placeholder="Select NOP..."
            darkMode={darkMode}
            minWidth="min-w-44"
          />
          <MultiSelectDropdown
            label="CITY / KABUPATEN"
            options={km.cityOptions}
            selectedValues={km.selectedCities}
            onChange={km.handleCitiesChange}
            isMulti={isFull}
            placeholder="Select City..."
            darkMode={darkMode}
            minWidth="min-w-48"
          />
          {scopeTail}
        </div>
      )}

      {scope === 'kecamatan' && (
        <div className="flex flex-wrap items-center gap-4">
          <SimpleSelect label="NOP" value={km.kecFilterNop} options={km.nopOptions} onChange={km.handleKecNopChange} darkMode={darkMode} bold />
          <SimpleSelect label="KABUPATEN" value={km.kecFilterKab} options={km.kecCityOptions} onChange={km.handleKecKabChange} darkMode={darkMode} bold />
          <MultiSelectDropdown
            label="KECAMATAN"
            options={km.kecOptions}
            selectedValues={km.selectedKecamatans}
            onChange={km.handleKecamatansChange}
            isMulti={isFull}
            placeholder="Select Kecamatan..."
            darkMode={darkMode}
            minWidth="min-w-48"
          />
          {scopeTail}
        </div>
      )}

      {scope === 'site' && (
        <div className="flex flex-wrap items-center gap-4">
          <MultiSelectDropdown
            label="SITE ID"
            options={km.activeSitesList.map(s => ({ value: s, label: siteNamesMap[s] ? `${s} - ${siteNamesMap[s]}` : s }))}
            selectedValues={km.selectedSites}
            onChange={km.handleSitesChange}
            isMulti={isFull}
            placeholder="Select Site..."
            darkMode={darkMode}
            minWidth="min-w-64"
          />
          {scopeTail}
        </div>
      )}
    </div>
  );
}
