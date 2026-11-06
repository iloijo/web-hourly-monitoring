import React from 'react';
import { 
  Globe, 
  Network, 
  Building2, 
  MapPin, 
  Radio, 
  Antenna, 
  Layers,
  Sparkles
} from 'lucide-react';

export const AGGREGATION_SCOPES = [
  { id: 'regional', label: 'Regional', icon: Globe },
  { id: 'nop', label: 'NOP', icon: Network },
  { id: 'city', label: 'City/Kabupaten', icon: Building2 },
  { id: 'kecamatan', label: 'Kecamatan', icon: MapPin },
  { id: 'site', label: 'Site', icon: Radio },
  { id: 'sector', label: 'Sector', icon: Antenna, isDefault: true }
];

export default function AggregationScopeBar({
  currentScope = 'sector',
  onSelectScope,
  darkMode = false,
  activeMenu = '4g-hourly'
}) {
  const visibleScopes = activeMenu === '4g-hourly'
    ? AGGREGATION_SCOPES.filter(s => s.id === 'site' || s.id === 'sector')
    : AGGREGATION_SCOPES;

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-semibold select-none">
      {visibleScopes.map(scope => {
        const Icon = scope.icon;
        const isActive = currentScope === scope.id;

        return (
          <button
            key={scope.id}
            type="button"
            onClick={() => onSelectScope(scope.id)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-all duration-200 cursor-pointer shrink-0 border ${
              isActive
                ? darkMode
                  ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-500/20 font-bold'
                  : 'bg-white text-blue-600 border-blue-200 shadow-xs font-bold ring-1 ring-blue-500/20'
                : darkMode
                  ? 'bg-slate-800/80 text-slate-400 border-slate-700/80 hover:bg-slate-800 hover:text-slate-200'
                  : 'bg-slate-100/90 text-slate-600 border-slate-200/80 hover:bg-slate-200 hover:text-slate-900'
            }`}
          >
            <Icon className={`w-3.5 h-3.5 ${isActive ? (darkMode ? 'text-white' : 'text-blue-600') : 'opacity-70'}`} />
            <span>{scope.label}</span>
            {scope.isDefault && !isActive && (
              <span className="text-[9px] px-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                Default
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
