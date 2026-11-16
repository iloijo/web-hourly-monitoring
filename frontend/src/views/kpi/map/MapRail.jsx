import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';

// Icon rail on the right edge of the map. Each icon opens a small dropdown to its left.
// MapRail keeps which menu is open; a click outside or Esc closes it.

const RailCtx = createContext({ open: null, setOpen: () => {}, darkMode: false });

export const useRail = () => useContext(RailCtx);

export function MapRail({ darkMode, children }) {
  const [open, setOpen] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(null); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(null); };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <RailCtx.Provider value={{ open, setOpen, darkMode }}>
      <div ref={ref} className="absolute top-2 right-2 z-[700] flex flex-col gap-1.5">
        {children}
      </div>
    </RailCtx.Provider>
  );
}

// One icon button with its dropdown. `active` marks something switched on (blue); `width` is the dropdown width.
export function RailMenu({ id, icon: Icon, label, active, width = 208, children }) {
  const { open, setOpen, darkMode } = useContext(RailCtx);
  const isOpen = open === id;
  const shell = darkMode ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-700';
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(isOpen ? null : id)}
        title={label}
        aria-label={label}
        aria-expanded={isOpen}
        className={`w-8 h-8 flex items-center justify-center rounded-lg border shadow-md transition cursor-pointer ${
          active
            ? 'bg-blue-600 border-blue-600 text-white'
            : isOpen
              ? (darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-100 border-slate-300 text-slate-800')
              : `${shell} ${darkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`
        }`}
      >
        <Icon className="w-4 h-4" />
      </button>
      {isOpen && (
        <div
          className={`absolute right-full top-0 mr-2 rounded-lg border shadow-xl p-1.5 text-[11px] space-y-0.5 ${shell}`}
          style={{ width }}
        >
          <div className="px-1.5 pt-0.5 pb-1 text-[10px] font-bold uppercase tracking-wider opacity-50">{label}</div>
          {children}
        </div>
      )}
    </div>
  );
}

// A row in a dropdown. kind "radio" / "check" show a tick when `selected`; "plain" is an action.
// The dropdown closes after the click unless keepOpen.
export function MenuItem({ icon: Icon, selected, onClick, keepOpen, disabled, kind = 'radio', title, children }) {
  const { setOpen, darkMode } = useContext(RailCtx);
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={() => { onClick?.(); if (!keepOpen) setOpen(null); }}
      className={`w-full flex items-center gap-2 px-1.5 h-7 rounded-md text-left font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-default ${
        selected
          ? (darkMode ? 'bg-blue-600/25 text-blue-300' : 'bg-blue-50 text-blue-700')
          : darkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100'
      }`}
    >
      {Icon && <Icon className="w-3.5 h-3.5 shrink-0 opacity-80" />}
      <span className="flex-1 truncate">{children}</span>
      {kind === 'check' ? (
        <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
          selected ? 'bg-blue-600 border-blue-600 text-white' : darkMode ? 'border-slate-600' : 'border-slate-300'
        }`}>
          {selected && <Check className="w-3 h-3" />}
        </span>
      ) : kind === 'radio' && selected ? <Check className="w-3.5 h-3.5 shrink-0" /> : null}
    </button>
  );
}

export const MenuDivider = () => <div className="my-1 border-t border-slate-500/20" />;

// A labelled control (select, slider, segmented buttons) inside a dropdown
export const MenuField = ({ label, children }) => (
  <div className="px-1.5 py-1 space-y-1">
    {label && <div className="text-[10px] font-bold uppercase tracking-wider opacity-50">{label}</div>}
    {children}
  </div>
);
