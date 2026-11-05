import { useState } from 'react';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { downloadXlsx } from '../../api/export';

// Header button: exports what the current page registered (getPayload returns the sheets, may be async)
export default function ExportButton({ getPayload, darkMode }) {
  const [busy, setBusy] = useState(false);
  const disabled = !getPayload || busy;

  const run = async () => {
    if (disabled) return;
    setBusy(true);
    try {
      await downloadXlsx(await getPayload());
    } catch (err) {
      console.error('Export failed:', err);
      alert(`Export Excel gagal: ${err.message || err}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={disabled}
      title={getPayload ? 'Export data halaman ini ke Excel' : 'Muat data dulu untuk export'}
      className={`h-9 px-3 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
        darkMode ? 'bg-slate-800 border-slate-700 text-emerald-400 hover:bg-slate-700' : 'bg-white border-slate-200 text-emerald-700 hover:bg-emerald-50 shadow-2xs'
      }`}
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
      <span className="hidden xl:inline">Export Excel</span>
    </button>
  );
}
