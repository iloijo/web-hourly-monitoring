import { useMemo } from 'react';
import MultiSelectDropdown from '../../components/MultiSelectDropdown';
import SegmentedToggle from '../../components/filters/SegmentedToggle';
import SimpleSelect from '../../components/filters/SimpleSelect';
import { SCOPES } from './scope';

const union = (lists) => Array.from(new Set(lists.flat())).sort();

// All / NOP / Kabupaten / Kecamatan picker; options come from the CEI data (/api/cei/hierarchy)
export default function CeiScopeFilter({ filters, onChange, hierarchy, darkMode }) {
  const nopOptions = hierarchy?.nops || [];
  const allKabs = useMemo(() => union(Object.values(hierarchy?.kabupaten_by_nop || {})), [hierarchy]);
  const kecOptions = useMemo(() => hierarchy?.kecamatan_by_kab?.[filters.kecKab] || [], [hierarchy, filters.kecKab]);
  const update = (patch) => onChange({ ...filters, ...patch });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedToggle options={SCOPES} value={filters.scope} onChange={(scope) => update({ scope })} darkMode={darkMode} />
      {filters.scope === 'nop' && (
        <MultiSelectDropdown options={nopOptions} selectedValues={filters.nops} isMulti
          onChange={(nops) => update({ nops })} placeholder="Select NOP..." darkMode={darkMode} minWidth="min-w-40" />
      )}
      {filters.scope === 'kabupaten' && (
        <MultiSelectDropdown options={allKabs} selectedValues={filters.kabs} isMulti
          onChange={(kabs) => update({ kabs })} placeholder="Select Kabupaten..." darkMode={darkMode} minWidth="min-w-48" />
      )}
      {filters.scope === 'kecamatan' && (
        <>
          <SimpleSelect value={filters.kecKab} options={['', ...allKabs].map(k => [k, k || 'Kabupaten...'])}
            onChange={(kecKab) => update({ kecKab, kecs: [] })} darkMode={darkMode} bold />
          <MultiSelectDropdown options={kecOptions} selectedValues={filters.kecs} isMulti
            onChange={(kecs) => update({ kecs })} placeholder="Select Kecamatan..." darkMode={darkMode} minWidth="min-w-48" />
        </>
      )}
    </div>
  );
}
