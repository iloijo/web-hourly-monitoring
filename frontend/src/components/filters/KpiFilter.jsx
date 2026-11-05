import { useCallback, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import KpiDropdownPopover from '../KpiDropdownPopover';
import useClickOutside from '../../hooks/useClickOutside';
import { FilterLabel } from './FilterLabel';
import { fieldClass } from './styles';

// "FILTER KPI" button with the category popover
export default function KpiFilter({ km, darkMode, className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close);

  return (
    <div className={`relative ${className}`} ref={ref}>
      <FilterLabel>FILTER KPI</FilterLabel>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between border rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer ${fieldClass(darkMode)}`}
      >
        <span className="truncate">{km.activeSelectedKpiIds.length} KPI Terpilih</span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      </button>

      <KpiDropdownPopover
        isOpen={open}
        onClose={close}
        allKpis={km.activeKpiCatalog}
        selectedKpiIds={km.activeSelectedKpiIds}
        onToggleKpi={km.handleToggleKpi}
        onToggleCategory={km.handleToggleCategory}
        onSelectAll={km.handleSelectAllKpis}
        onDeselectAll={km.handleDeselectAllKpis}
        onSelectDefault={km.handleSelectDefaultKpis}
        darkMode={darkMode}
      />
    </div>
  );
}
