import { useCallback, useRef, useState } from 'react';
import { Flag, Plus, X } from 'lucide-react';
import useClickOutside from '../../hooks/useClickOutside';

// Temporary activity markers (vertical lines on every chart) for screenshots; kept only until page reload
export default function MarkerControl({ markers, setMarkers, defaultDate, darkMode }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(defaultDate || '');
  const [label, setLabel] = useState('');
  const ref = useRef(null);
  useClickOutside(ref, useCallback(() => setOpen(false), []));

  const add = () => {
    if (!date) return;
    setMarkers([...markers.filter(m => m.date !== date), { date, label: label.trim() || 'Aktivitas' }]
      .sort((a, b) => a.date.localeCompare(b.date)));
    setLabel('');
  };

  const field = `border rounded-lg px-2 py-1 text-xs ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`;

  return (
    <div className="relative flex items-center gap-1.5 flex-wrap" ref={ref}>
      {markers.map(m => (
        <span key={m.date} className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-rose-600 text-white">
          <Flag className="w-3 h-3" />{m.date.slice(5)} {m.label}
          <button type="button" onClick={() => setMarkers(markers.filter(x => x.date !== m.date))} className="cursor-pointer opacity-80 hover:opacity-100" title="Hapus penanda">
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={() => { setOpen(!open); if (!date && defaultDate) setDate(defaultDate); }}
        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border cursor-pointer ${
          darkMode ? 'bg-slate-800 border-slate-700 text-rose-300 hover:bg-slate-700' : 'bg-white border-slate-200 text-rose-600 hover:bg-rose-50'
        }`}
        title="Tambah penanda aktivitas di semua grafik (sementara, untuk capture)"
      >
        <Flag className="w-3.5 h-3.5" /> Penanda
      </button>

      {open && (
        <div className={`absolute left-0 top-full mt-1.5 z-50 w-72 p-3 rounded-xl border shadow-2xl space-y-2 text-xs ${
          darkMode ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
        }`}>
          <div className="font-bold">Penanda aktivitas</div>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={`${field} w-full`} />
          <input
            type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder="Contoh: Tilt S1 4→6"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} className={`${field} w-full`}
          />
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setMarkers([])} disabled={!markers.length} className="text-[11px] opacity-70 hover:opacity-100 cursor-pointer disabled:opacity-30">
              Hapus semua
            </button>
            <button type="button" onClick={add} className="flex items-center gap-1 px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer">
              <Plus className="w-3.5 h-3.5" /> Tambah
            </button>
          </div>
          <p className="text-[10px] opacity-60">Sementara: hilang saat halaman di-refresh.</p>
        </div>
      )}
    </div>
  );
}
