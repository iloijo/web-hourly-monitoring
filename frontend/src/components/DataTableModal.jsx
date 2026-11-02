import React, { useState } from 'react';
import { Download, Search } from 'lucide-react';

export default function DataTableModal({ data, onExportCsv }) {
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;

  if (!data || !data.timestamps) return null;

  const { timestamps, carriers, kpis } = data;
  const carrierCodes = carriers.map(c => c.code);

  // Flatten rows for table
  const allRows = timestamps.map((ts, idx) => {
    const row = { timestamp: ts };
    carrierCodes.forEach(code => {
      row[`payload_${code}`] = kpis.payload.series[code]?.[idx] ?? '-';
      row[`rrc_${code}`] = kpis.max_rrc.series[code]?.[idx] ?? '-';
      row[`avail_${code}`] = kpis.availability.series[code]?.[idx] ?? '-';
      row[`prb_${code}`] = kpis.dl_prb.series[code]?.[idx] ?? '-';
      row[`thp_${code}`] = kpis.dl_thp.series[code]?.[idx] ?? '-';
      row[`cqi_${code}`] = kpis.cqi.series[code]?.[idx] ?? '-';
    });
    return row;
  });

  const filteredRows = allRows.filter(r => r.timestamp.toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.ceil(filteredRows.length / rowsPerPage);
  const currentRows = filteredRows.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  return (
    <div className="p-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        
        {/* Table Toolbar */}
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-slate-800 text-sm">Hourly Measurement Records</h3>
            <span className="text-xs text-slate-500 font-medium">({filteredRows.length} hours)</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search timestamp..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={onExportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-medium transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Table Container */}
        <div className="overflow-x-auto max-h-[600px]">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-600 font-semibold sticky top-0 z-10 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3 border-r border-slate-200 bg-slate-100">Timestamp</th>
                {carrierCodes.map(code => (
                  <th key={code} colSpan={6} className="py-2 px-3 text-center border-r border-slate-200 font-bold bg-slate-50">
                    {code}
                  </th>
                ))}
              </tr>
              <tr className="text-[11px] bg-slate-50 text-slate-500 border-b border-slate-200">
                <th className="py-1.5 px-3 border-r border-slate-200"></th>
                {carrierCodes.map(code => (
                  <React.Fragment key={code}>
                    <th className="py-1.5 px-2 font-medium">Payload (GB)</th>
                    <th className="py-1.5 px-2 font-medium">RRC User</th>
                    <th className="py-1.5 px-2 font-medium">Avail (%)</th>
                    <th className="py-1.5 px-2 font-medium">PRB (%)</th>
                    <th className="py-1.5 px-2 font-medium">Thp (Mbps)</th>
                    <th className="py-1.5 px-2 font-medium border-r border-slate-200">CQI</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {currentRows.map((r, idx) => (
                <tr key={idx} className="hover:bg-blue-50/40 transition">
                  <td className="py-2 px-3 font-medium text-slate-900 font-mono border-r border-slate-100 whitespace-nowrap">
                    {r.timestamp}
                  </td>
                  {carrierCodes.map(code => (
                    <React.Fragment key={code}>
                      <td className="py-2 px-2 text-slate-800 font-mono">{r[`payload_${code}`]}</td>
                      <td className="py-2 px-2 text-slate-800 font-mono">{r[`rrc_${code}`]}</td>
                      <td className="py-2 px-2 text-slate-800 font-mono">{r[`avail_${code}`]}</td>
                      <td className="py-2 px-2 text-slate-800 font-mono">
                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                          r[`prb_${code}`] > 80 ? 'bg-rose-100 text-rose-700' :
                          r[`prb_${code}`] > 60 ? 'bg-amber-100 text-amber-700' : 'text-slate-800'
                        }`}>
                          {r[`prb_${code}`]}%
                        </span>
                      </td>
                      <td className="py-2 px-2 text-slate-800 font-mono">{r[`thp_${code}`]}</td>
                      <td className="py-2 px-2 text-slate-800 font-mono border-r border-slate-100">{r[`cqi_${code}`]}</td>
                    </React.Fragment>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <div>
            Showing {(currentPage - 1) * rowsPerPage + 1} to {Math.min(currentPage * rowsPerPage, filteredRows.length)} of {filteredRows.length}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1 rounded border border-slate-300 bg-white disabled:opacity-40 hover:bg-slate-100 transition"
            >
              Prev
            </button>
            <span className="px-2 font-medium">Page {currentPage} of {totalPages}</span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-2.5 py-1 rounded border border-slate-300 bg-white disabled:opacity-40 hover:bg-slate-100 transition"
            >
              Next
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
