import { useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import MultiSelectDropdown from '../../components/MultiSelectDropdown';
import SegmentedToggle from '../../components/filters/SegmentedToggle';
import SimpleSelect from '../../components/filters/SimpleSelect';
import { FilterLabel } from '../../components/filters/FilterLabel';

const TECH_OPTIONS = [['2g', '2G'], ['4g', '4G'], ['5g', '5G']];
const SCOPE_OPTIONS = [['regional', 'Regional'], ['nop', 'NOP'], ['city', 'Kabupaten'], ['kecamatan', 'Kecamatan']];

const union = (lists) => Array.from(new Set(lists.flat())).sort();

// Tech + location scope + dates + Generate for the Worst Cell and ZTZP pages.
// `filters` = { tech, scope, nops, cities, kecamatans, kecKab }; NOP / Kabupaten / Kecamatan picks
// call onAutoQuery (they load right away), everything else waits for Generate.
export default function CellScopeFilters({
  filters, setFilters, hierarchyData, onGenerate, onAutoQuery, loading, darkMode, children,
}) {
  const nopOptions = useMemo(() => hierarchyData?.nops || [], [hierarchyData]);
  const cityOptions = useMemo(() => {
    const kabByNop = hierarchyData?.kabupaten_by_nop || {};
    const nops = filters.nops.length ? filters.nops : Object.keys(kabByNop);
    return union(nops.map(n => kabByNop[n] || []));
  }, [filters.nops, hierarchyData]);
  const allKabs = useMemo(() => union(Object.values(hierarchyData?.kabupaten_by_nop || {})), [hierarchyData]);
  const kecOptions = useMemo(
    () => (hierarchyData?.kecamatan_by_kab?.[filters.kecKab] || []).slice().sort(),
    [hierarchyData, filters.kecKab]
  );

  const update = (patch, autoQuery = false) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    if (autoQuery) onAutoQuery(next);
  };

  return (
    <div className={`rounded-xl border p-4 shadow-2xs space-y-3 ${darkMode ? 'bg-slate-800/80 border-slate-700/80' : 'bg-white border-slate-200/90'}`}>
      <div className="flex flex-wrap items-end gap-4">
        <SegmentedToggle label="TEKNOLOGI" options={TECH_OPTIONS} value={filters.tech} onChange={(tech) => update({ tech })} darkMode={darkMode} />
        <SegmentedToggle label="SCOPE" options={SCOPE_OPTIONS} value={filters.scope} onChange={(scope) => update({ scope })} darkMode={darkMode} />

        {filters.scope === 'nop' && (
          <MultiSelectDropdown
            label="NOP" options={nopOptions} selectedValues={filters.nops} isMulti
            onChange={(nops) => update({ nops }, true)} placeholder="Pilih NOP..." darkMode={darkMode} minWidth="min-w-44"
          />
        )}

        {filters.scope === 'city' && (
          <>
            <MultiSelectDropdown
              label="NOP (filter)" options={nopOptions} selectedValues={filters.nops} isMulti
              onChange={(nops) => update({ nops })} placeholder="Semua NOP" darkMode={darkMode} minWidth="min-w-40"
            />
            <MultiSelectDropdown
              label="KABUPATEN" options={cityOptions} selectedValues={filters.cities} isMulti
              onChange={(cities) => update({ cities }, true)} placeholder="Pilih Kabupaten..." darkMode={darkMode} minWidth="min-w-48"
            />
          </>
        )}

        {filters.scope === 'kecamatan' && (
          <>
            <SimpleSelect
              label="KABUPATEN" value={filters.kecKab} options={['', ...allKabs].map(k => [k, k || 'Pilih...'])}
              onChange={(kecKab) => update({ kecKab, kecamatans: [] })} darkMode={darkMode} bold
            />
            <MultiSelectDropdown
              label="KECAMATAN" options={kecOptions} selectedValues={filters.kecamatans} isMulti
              onChange={(kecamatans) => update({ kecamatans }, true)} placeholder="Pilih Kecamatan..." darkMode={darkMode} minWidth="min-w-48"
            />
          </>
        )}

        {children}

        <div>
          <FilterLabel>&nbsp;</FilterLabel>
          <button
            type="button"
            onClick={onGenerate}
            disabled={loading}
            className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Loading...' : 'Generate'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
