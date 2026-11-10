import React, { useState, useMemo } from 'react';
import {
  Building2, ChevronLeft, ChevronRight, Download, FileSpreadsheet,
  ListOrdered, Search, ArrowUpDown, ArrowUp, ArrowDown
} from 'lucide-react';
import { downloadXlsx } from '../../api/export';
import { fmt, weekLabel } from './charts';

const KQI_CONFIG = [
  { key: 'wrtt', label: 'Web browsing RTT', color: '#f59e0b' },
  { key: 'wulr', label: 'Web UL retransmission', color: '#8b5cf6' },
  { key: 'vsd', label: 'Video start delay', color: '#ec4899' },
  { key: 'vul', label: 'VoIP UL jitter', color: '#a855f7' },
  { key: 'vdl', label: 'VoIP DL jitter', color: '#0ea5e9' },
  { key: 'grtt', label: 'Gaming RTT', color: '#10b981' },
  { key: 'gj', label: 'Gaming UL jitter', color: '#ef4444' },
];

export default function CeiComparisonTables({ data, darkMode }) {
  const d = darkMode;
  const { week, prev_week, target, branches = [], kabupaten_by_branch = {}, kecamatan_by_kabupaten = {}, rows = [] } = data || {};

  // --- Table 1 States ---
  const [branch1, setBranch1] = useState('ALL');
  const [kabupaten1, setKabupaten1] = useState('ALL');
  const [kecamatan1, setKecamatan1] = useState('ALL');

  // Cascading options for Table 1
  const kabOptions1 = useMemo(() => {
    if (branch1 === 'ALL') {
      const allKabs = new Set();
      Object.values(kabupaten_by_branch).forEach(list => list.forEach(k => allKabs.add(k)));
      return Array.from(allKabs).sort();
    }
    return kabupaten_by_branch[branch1] || [];
  }, [branch1, kabupaten_by_branch]);

  const kecOptions1 = useMemo(() => {
    if (kabupaten1 === 'ALL') {
      const allKecs = new Set();
      Object.values(kecamatan_by_kabupaten).forEach(list => list.forEach(k => allKecs.add(k)));
      return Array.from(allKecs).sort();
    }
    return kecamatan_by_kabupaten[kabupaten1] || [];
  }, [kabupaten1, kecamatan_by_kabupaten]);

  const handleBranch1Change = (b) => {
    setBranch1(b);
    setKabupaten1('ALL');
    setKecamatan1('ALL');
  };

  const handleKab1Change = (k) => {
    setKabupaten1(k);
    setKecamatan1('ALL');
  };

  // Filtered rows for Table 1
  const filteredRows1 = useMemo(() => {
    return rows.filter(r => {
      if (branch1 !== 'ALL' && r.branch !== branch1) return false;
      if (kabupaten1 !== 'ALL' && r.kabupaten !== kabupaten1) return false;
      if (kecamatan1 !== 'ALL' && r.kecamatan !== kecamatan1) return false;
      return true;
    });
  }, [rows, branch1, kabupaten1, kecamatan1]);

  // Aggregate Table 1
  const table1Data = useMemo(() => {
    return KQI_CONFIG.map(cfg => {
      let before = 0;
      let after = 0;
      for (const r of filteredRows1) {
        if (r.week === prev_week) before += (r[cfg.key] || 0);
        else if (r.week === week) after += (r[cfg.key] || 0);
      }
      const delta = after - before;
      const delta_pct = before > 0 ? (delta / before) * 100 : 0;
      const remark = delta < 0 ? 'Improve' : delta > 0 ? 'Degrade' : 'Stable';
      return {
        ...cfg,
        before,
        after,
        delta,
        delta_pct,
        remark,
      };
    });
  }, [filteredRows1, prev_week, week]);

  // Export Table 1
  const exportTable1 = () => {
    const sheetRows = table1Data.map(r => [
      r.label,
      r.before,
      r.after,
      r.delta > 0 ? `+${fmt(r.delta)}` : fmt(r.delta),
      r.delta_pct > 0 ? `+${fmt(r.delta_pct, 2)}%` : `${fmt(r.delta_pct, 2)}%`,
      r.remark
    ]);
    downloadXlsx({
      filename: `7_KQI_Comparison_Table_${prev_week}_vs_${week}`,
      sheets: [{
        name: '7 KQI Comparison WoW',
        columns: ['KQI7', `Before (${prev_week})`, `After (${week})`, 'Delta', 'Delta (%)', 'Remark'],
        rows: sheetRows,
      }]
    });
  };

  // --- Table 2 States ---
  const [branch2, setBranch2] = useState('ALL');
  const [focusKqi, setFocusKqi] = useState('all');
  const [searchKab, setSearchKab] = useState('');
  const [sortField, setSortField] = useState('kabupaten');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Group Table 2 per (Branch, Kabupaten)
  const table2RawData = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      if (branch2 !== 'ALL' && r.branch !== branch2) continue;
      const key = `${r.branch}|||${r.kabupaten}`;
      if (!map.has(key)) {
        map.set(key, {
          branch: r.branch,
          kabupaten: r.kabupaten,
          tot_prev: 0,
          good_prev: 0,
          tot_cur: 0,
          good_cur: 0,
          kqi_fail_prev: 0,
          kqi_fail_cur: 0,
        });
      }
      const entry = map.get(key);
      if (r.week === prev_week) {
        entry.tot_prev += r.total || 0;
        entry.good_prev += r.good || 0;
        if (focusKqi !== 'all') {
          entry.kqi_fail_prev += (r[focusKqi] || 0);
        }
      } else if (r.week === week) {
        entry.tot_cur += r.total || 0;
        entry.good_cur += r.good || 0;
        if (focusKqi !== 'all') {
          entry.kqi_fail_cur += (r[focusKqi] || 0);
        }
      }
    }

    const t = target || 90.51;
    const list = [];
    for (const item of map.values()) {
      let w1_ach = 0;
      let w_ach = 0;
      if (focusKqi === 'all') {
        w1_ach = item.tot_prev ? (100.0 * item.good_prev) / item.tot_prev : 0;
        w_ach = item.tot_cur ? (100.0 * item.good_cur) / item.tot_cur : 0;
      } else {
        w1_ach = item.tot_prev ? (100.0 * (item.tot_prev - item.kqi_fail_prev)) / item.tot_prev : 0;
        w_ach = item.tot_cur ? (100.0 * (item.tot_cur - item.kqi_fail_cur)) / item.tot_cur : 0;
      }

      const d_target = w_ach - t;
      const d_wow = w_ach - w1_ach;
      const target_status = w_ach >= t ? 'Pass' : 'Not Pass';
      const wow_status = d_wow >= 0 ? 'Improved' : 'Degraded';
      const overall_status = target_status;

      list.push({
        branch: item.branch,
        kabupaten: item.kabupaten,
        target: t,
        w1_ach,
        w_ach,
        d_target,
        d_wow,
        target_status,
        wow_status,
        overall_status,
      });
    }

    return list;
  }, [rows, branch2, focusKqi, prev_week, week, target]);

  // Search filter
  const searchedTable2Data = useMemo(() => {
    if (!searchKab.trim()) return table2RawData;
    const q = searchKab.toLowerCase().trim();
    return table2RawData.filter(r =>
      r.kabupaten.toLowerCase().includes(q) || r.branch.toLowerCase().includes(q)
    );
  }, [table2RawData, searchKab]);

  // Sort Table 2
  const sortedTable2Data = useMemo(() => {
    const list = [...searchedTable2Data];
    list.sort((a, b) => {
      let vA = a[sortField];
      let vB = b[sortField];
      if (typeof vA === 'string') {
        return sortDir === 'asc' ? vA.localeCompare(vB) : vB.localeCompare(vA);
      }
      return sortDir === 'asc' ? vA - vB : vB - vA;
    });
    return list;
  }, [searchedTable2Data, sortField, sortDir]);

  // Paginated Table 2
  const totalItems = sortedTable2Data.length;
  const totalPages = pageSize === 'ALL' ? 1 : Math.ceil(totalItems / pageSize) || 1;
  const paginatedTable2Data = useMemo(() => {
    if (pageSize === 'ALL') return sortedTable2Data;
    const start = (page - 1) * pageSize;
    return sortedTable2Data.slice(start, start + pageSize);
  }, [sortedTable2Data, page, pageSize]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  // Export Table 2
  const exportTable2 = () => {
    const sheetRows = sortedTable2Data.map(r => [
      r.branch,
      r.kabupaten,
      `${fmt(r.target, 2)}%`,
      `${fmt(r.w1_ach, 2)}%`,
      `${fmt(r.w_ach, 2)}%`,
      r.d_target > 0 ? `+${fmt(r.d_target, 2)}%` : `${fmt(r.d_target, 2)}%`,
      r.d_wow > 0 ? `+${fmt(r.d_wow, 2)}%` : `${fmt(r.d_wow, 2)}%`,
      r.target_status,
      r.wow_status,
      r.overall_status,
    ]);
    downloadXlsx({
      filename: `Kabupaten_WoW_Comparison_${prev_week}_vs_${week}`,
      sheets: [{
        name: 'Kabupaten Level WoW',
        columns: ['Branch', 'Kabupaten', 'Target', `W-1 Ach (${prev_week})`, `W Ach (${week})`, 'Δ Target', 'Δ WoW', 'Target Status', 'WoW Status', 'Overall Status'],
        rows: sheetRows,
      }]
    });
  };

  const selectClass = `border rounded-lg px-2.5 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer ${
    d ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-700'
  }`;

  const btnExport = `flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border shadow-xs cursor-pointer transition-colors ${
    d ? 'bg-slate-800 border-slate-700 text-emerald-400 hover:bg-slate-700' : 'bg-white border-slate-200 text-emerald-600 hover:bg-slate-50'
  }`;

  const SortHeader = ({ field, label, align = 'left' }) => {
    const isSorted = sortField === field;
    return (
      <th
        onClick={() => handleSort(field)}
        className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wider cursor-pointer select-none text-${align} transition-colors ${
          d ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}>
          <span>{label}</span>
          {isSorted ? (
            sortDir === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-blue-500" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-500" />
          ) : (
            <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
          )}
        </div>
      </th>
    );
  };

  return (
    <div className="space-y-6">
      {/* ======================================================== */}
      {/* 1. 7 KQI Comparison Table WoW                             */}
      {/* ======================================================== */}
      <div className={`p-4 rounded-xl border space-y-4 ${d ? 'bg-slate-900 border-slate-800 shadow-md shadow-black/20' : 'bg-white border-slate-200 shadow-sm'}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <ListOrdered className="w-4 h-4 text-blue-500" />
            <h2 className={`text-xs font-bold uppercase tracking-wider ${d ? 'text-slate-200' : 'text-slate-700'}`}>
              7 KQI Comparison Table WoW
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-[11px] font-semibold text-slate-400">Branch:</span>
              <select className={selectClass} value={branch1} onChange={e => handleBranch1Change(e.target.value)}>
                <option value="ALL">All Branches</option>
                {branches.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-[11px] font-semibold text-slate-400">Kabupaten:</span>
              <select className={selectClass} value={kabupaten1} onChange={e => handleKab1Change(e.target.value)}>
                <option value="ALL">All Kabupaten</option>
                {kabOptions1.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-[11px] font-semibold text-slate-400">Kecamatan:</span>
              <select className={selectClass} value={kecamatan1} onChange={e => setKecamatan1(e.target.value)}>
                <option value="ALL">All Kecamatan</option>
                {kecOptions1.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>

            <button type="button" onClick={exportTable1} className={btnExport}>
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export XLSX</span>
            </button>
          </div>
        </div>

        {/* Table 1 Data */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className={`border-b ${d ? 'bg-slate-800/60 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                <th className="px-4 py-2.5 font-bold uppercase tracking-wider">KQI7</th>
                <th className="px-4 py-2.5 font-bold uppercase tracking-wider text-right">Before ({prev_week})</th>
                <th className="px-4 py-2.5 font-bold uppercase tracking-wider text-right">After ({week})</th>
                <th className="px-4 py-2.5 font-bold uppercase tracking-wider text-right">Delta</th>
                <th className="px-4 py-2.5 font-bold uppercase tracking-wider text-right">Delta (%)</th>
                <th className="px-4 py-2.5 font-bold uppercase tracking-wider text-center">Remark</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {table1Data.map(row => {
                const isImprove = row.remark === 'Improve';
                const isDegrade = row.remark === 'Degrade';
                return (
                  <tr key={row.key} className={`transition-colors ${d ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50'}`}>
                    <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
                        <span>{row.label}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {fmt(row.before)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {fmt(row.after)}
                    </td>
                    <td className={`px-4 py-3 text-right font-bold whitespace-nowrap ${isImprove ? 'text-emerald-600 dark:text-emerald-400' : isDegrade ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'}`}>
                      {row.delta > 0 ? `+${fmt(row.delta)}` : fmt(row.delta)}
                    </td>
                    <td className={`px-4 py-3 text-right font-bold whitespace-nowrap ${isImprove ? 'text-emerald-600 dark:text-emerald-400' : isDegrade ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'}`}>
                      {row.delta_pct > 0 ? `+${fmt(row.delta_pct, 2)}%` : `${fmt(row.delta_pct, 2)}%`}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                        isImprove
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800'
                          : isDegrade
                          ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800'
                          : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                      }`}>
                        {row.remark}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. Kabupaten Level Comparison Table WoW                   */}
      {/* ======================================================== */}
      <div className={`p-4 rounded-xl border space-y-4 ${d ? 'bg-slate-900 border-slate-800 shadow-md shadow-black/20' : 'bg-white border-slate-200 shadow-sm'}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-500" />
            <h2 className={`text-xs font-bold uppercase tracking-wider ${d ? 'text-slate-200' : 'text-slate-700'}`}>
              Kabupaten Level Comparison Table WoW
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-[11px] font-semibold text-slate-400">Branch:</span>
              <select className={selectClass} value={branch2} onChange={e => { setBranch2(e.target.value); setPage(1); }}>
                <option value="ALL">All Branches</option>
                {branches.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-[11px] font-semibold text-slate-400">Focus KQI:</span>
              <select className={selectClass} value={focusKqi} onChange={e => { setFocusKqi(e.target.value); setPage(1); }}>
                <option value="all">All Metrics (% Good Cell)</option>
                {KQI_CONFIG.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
              </select>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search Kabupaten..."
                value={searchKab}
                onChange={e => { setSearchKab(e.target.value); setPage(1); }}
                className={`pl-8 pr-2.5 py-1 rounded-lg text-xs border focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                  d ? 'bg-slate-800 border-slate-700 text-slate-200 placeholder-slate-500' : 'bg-white border-slate-200 text-slate-700 placeholder-slate-400'
                }`}
              />
            </div>

            <button type="button" onClick={exportTable2} className={btnExport}>
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export XLSX</span>
            </button>
          </div>
        </div>

        {/* Table 2 Data */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className={`border-b ${d ? 'bg-slate-800/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <SortHeader field="branch" label="Branch" />
                <SortHeader field="kabupaten" label="Kabupaten" />
                <SortHeader field="target" label="Target" align="right" />
                <SortHeader field="w1_ach" label="W-1 Ach" align="right" />
                <SortHeader field="w_ach" label="W Ach" align="right" />
                <SortHeader field="d_target" label="Δ Target" align="right" />
                <SortHeader field="d_wow" label="Δ WoW" align="right" />
                <SortHeader field="target_status" label="Target Status" align="center" />
                <SortHeader field="wow_status" label="WoW Status" align="center" />
                <SortHeader field="overall_status" label="Overall Status" align="center" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {paginatedTable2Data.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-xs text-slate-400">
                    No data found for the selected filter.
                  </td>
                </tr>
              ) : (
                paginatedTable2Data.map((row, idx) => {
                  const targetPass = row.target_status === 'Pass';
                  const wowImproved = row.wow_status === 'Improved';
                  const overallPass = row.overall_status === 'Pass';
                  return (
                    <tr key={`${row.branch}-${row.kabupaten}-${idx}`} className={`transition-colors ${d ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50'}`}>
                      <td className="px-3 py-2.5 font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {row.branch}
                      </td>
                      <td className="px-3 py-2.5 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        {row.kabupaten}
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {fmt(row.target, 2)}%
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {fmt(row.w1_ach, 2)}%
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        {fmt(row.w_ach, 2)}%
                      </td>
                      <td className={`px-3 py-2.5 text-right font-bold whitespace-nowrap ${row.d_target >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {row.d_target > 0 ? `+${fmt(row.d_target, 2)}%` : `${fmt(row.d_target, 2)}%`}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-bold whitespace-nowrap ${row.d_wow >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {row.d_wow > 0 ? `+${fmt(row.d_wow, 2)}%` : `${fmt(row.d_wow, 2)}%`}
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                          targetPass
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800'
                            : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800'
                        }`}>
                          {row.target_status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                          wowImproved
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800'
                            : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800'
                        }`}>
                          {row.wow_status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                          overallPass
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800'
                            : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800'
                        }`}>
                          {row.overall_status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span>Showing {totalItems === 0 ? 0 : (page - 1) * (pageSize === 'ALL' ? totalItems : pageSize) + 1} to {pageSize === 'ALL' ? totalItems : Math.min(page * pageSize, totalItems)} of {totalItems} entries</span>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <div className="flex items-center gap-1">
              <span>Show</span>
              <select
                className={selectClass}
                value={pageSize}
                onChange={e => {
                  setPageSize(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value));
                  setPage(1);
                }}
              >
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value="ALL">All</option>
              </select>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className={`p-1 rounded border ${page <= 1 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer'} ${d ? 'border-slate-800' : 'border-slate-200'}`}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-semibold">Page {page} of {totalPages}</span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className={`p-1 rounded border ${page >= totalPages ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer'} ${d ? 'border-slate-800' : 'border-slate-200'}`}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
