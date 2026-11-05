import { FilterLabel } from './FilterLabel';

// Two-or-more option pill toggle, e.g. Aggregation / Band or All KPI / Sectoral
export default function SegmentedToggle({ label, options, value, onChange, darkMode, stretch = false }) {
  return (
    <div>
      {label && <FilterLabel>{label}</FilterLabel>}
      <div className={`flex items-center p-0.5 rounded-lg border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'}`}>
        {options.map(([optValue, text]) => (
          <button
            key={optValue}
            type="button"
            onClick={() => onChange(optValue)}
            className={`${stretch ? 'flex-1 ' : ''}px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
              value === optValue
                ? 'bg-blue-600 text-white shadow-xs'
                : darkMode ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
