import { useCallback, useRef, useState } from 'react';
import { Check, Palette } from 'lucide-react';
import useClickOutside from '../../hooks/useClickOutside';
import { THEMES } from '../../constants/themes';

// Palette menu in the header (replaces the light/dark toggle)
export default function ThemePicker({ themeId, onChange, darkMode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, useCallback(() => setOpen(false), []));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-9 h-9 rounded-lg border transition-all duration-300 cursor-pointer flex items-center justify-center active:scale-90 ${
          darkMode ? 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 shadow-2xs'
        }`}
        title="Change color palette"
      >
        <Palette className="w-4 h-4" />
      </button>

      {open && (
        <div className={`absolute right-0 top-full mt-1.5 w-52 border rounded-xl shadow-2xl z-50 p-1.5 text-xs ${
          darkMode ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
        }`}>
          {THEMES.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => { onChange(t.id); setOpen(false); }}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer font-semibold ${
                t.id === themeId
                  ? 'bg-blue-600 text-white'
                  : darkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="flex -space-x-1">
                  {t.swatch.map(c => (
                    <span key={c} className="w-3.5 h-3.5 rounded-full border border-black/15" style={{ background: c }} />
                  ))}
                </span>
                {t.label}
              </span>
              {t.id === themeId && <Check className="w-3.5 h-3.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
