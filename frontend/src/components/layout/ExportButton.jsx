import { useState } from 'react';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { downloadXlsx } from '../../api/export';
import { collectScreenCharts } from '../../api/screenCharts';

// Header button: exports what the current page registered (getPayload returns the sheets, may be async)
export default function ExportButton({ getPayload, darkMode }) {
  const [busy, setBusy] = useState(false);
  const disabled = !getPayload || busy;

  const run = async () => {
    if (disabled) return;
    setBusy(true);
    try {
      const payload = await getPayload();
      // Pages without their own Charts sheet get the charts on screen as native Excel charts
      const sheets = payload.sheets || [];
      if (!sheets.some(sh => sh.charts?.length)) {
        const charts = collectScreenCharts(document.querySelector('main') || document);
        if (charts.length) payload.sheets = [...sheets, { name: 'Charts', charts }];
      }
      await downloadXlsx(payload);
    } catch (err) {
      console.error('Export failed:', err);
      alert(`Excel export failed: ${err.message || err}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={disabled}
      title={getPayload ? 'Export this page to Excel' : 'Load data first to export'}
      className={`h-9 px-3 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
        darkMode ? 'bg-slate-800 border-slate-700 text-emerald-400 hover:bg-slate-700' : 'bg-white border-slate-200 text-emerald-700 hover:bg-emerald-50 shadow-2xs'
      }`}
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
      <span className="hidden xl:inline">Export Excel</span>
    </button>
  );
}
