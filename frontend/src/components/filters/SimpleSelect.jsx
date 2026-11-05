import { ChevronDown } from 'lucide-react';
import { FilterLabel } from './FilterLabel';
import { fieldClass } from './styles';

// Native select with the dashboard's label and styling. options: [value] or [[value, text]]
export default function SimpleSelect({ label, value, options, onChange, darkMode, bold = false }) {
  return (
    <div>
      <FilterLabel>{label}</FilterLabel>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full appearance-none border rounded-lg pl-3 pr-8 py-1.5 text-xs ${bold ? 'font-bold' : 'font-semibold'} focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer ${fieldClass(darkMode)}`}
        >
          {options.map(opt => {
            const [v, text] = Array.isArray(opt) ? opt : [opt, opt];
            return <option key={v} value={v}>{text}</option>;
          })}
        </select>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
      </div>
    </div>
  );
}
