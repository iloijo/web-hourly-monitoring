import DataLoadingOverlay from './DataLoadingOverlay';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactECharts from '../lib/echarts';
import { 
  Calendar, 
  Search, 
  RotateCw, 
  Download, 
  FileSpreadsheet, 
  Filter, 
  ChevronDown, 
  Check, 
  X,
  Layers,
  AlertCircle,
  GitCompare,
  ArrowRight
} from 'lucide-react';
import { BAND_COLORS } from './SectorPayloadChart';
import { loadLatestDates, shiftDate } from '../constants/dates';
import { objectRowsSheet } from '../api/export';
import { getJson } from '../api/client';

// Color variants for multiple CIs sharing the same band in a sector
const BAND_COLOR_VARIANTS = {
  'L1800': ['#3b82f6', '#1d4ed8', '#60a5fa', '#1e3a8a'],
  'L2100': ['#c084fc', '#9333ea', '#e879f9', '#6b21a8'],
  'L900':  ['#f97316', '#c2410c', '#fb923c', '#7c2d12'],
  'L2300_1': ['#22c55e', '#15803d', '#4ade80', '#14532d'],
  'L2300_2': ['#14b8a6', '#0f766e', '#2dd4bf', '#134e4a'],
  'L2300_3': ['#06b6d4', '#0e7490', '#22d3ee', '#164e63'],
  'L700':  ['#eab308', '#a16207', '#fde047', '#713f12'],
  'L2600': ['#ec4899', '#be185d', '#f472b6', '#831843'],
};

const BAND_ORDER = {
  'L700': 1, 'L900': 2, 'L1800': 3, 'L2100': 4,
  'L2300_1': 5, 'L2300_2': 6, 'L2300_3': 7, 'L2600': 8,
  'NR2300': 9, 'NR2600': 10
};

function getTaSeriesName(key, entry, fallbackSiteId) {
  if (entry && entry.ci !== undefined && entry.ci !== null && entry.ci !== '') {
    const sId = entry.site_id || fallbackSiteId || '';
    const ciNum = parseInt(entry.ci, 10);
    const ciStr = isNaN(ciNum) ? entry.ci : ciNum;
    return sId ? `${sId}_${ciStr}` : `${key}_${ciStr}`;
  }
  return key;
}

function getTaSeriesColor(band, idxInBand) {
  const variants = BAND_COLOR_VARIANTS[band];
  if (variants && variants[idxInBand]) {
    return variants[idxInBand];
  }
  const base = BAND_COLORS[band] || '#60a5fa';
  if (idxInBand === 0) return base;
  return idxInBand % 2 === 1 ? '#1d4ed8' : '#93c5fd';
}

export default function TimingAdvanceView({
  tech = '4g', // '4g' or '5g'
  darkMode = false,
  allSites = [],
  siteNamesMap = {},
  onExportData = null
}) {
  const is5G = tech === '5g';

  // Compare mode toggle
  const [compareMode, setCompareMode] = useState(false);

  // Standard Dates
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  });

  // Compare Dates (Before vs After)
  const [beforeStart, setBeforeStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString().split('T')[0];
  });
  const [beforeEnd, setBeforeEnd] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 8);
    return d.toISOString().split('T')[0];
  });
  const [afterStart, setAfterStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [afterEnd, setAfterEnd] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  });

  // Site selection
  const [selectedSite, setSelectedSite] = useState(is5G ? 'UPD364' : 'BUO028');
  const [siteSearch, setSiteSearch] = useState('');
  const [siteDropdownOpen, setSiteDropdownOpen] = useState(false);
  const siteDropdownRef = useRef(null);

  // View controls
  const [viewMode, setViewMode] = useState('chart'); // 'chart' | 'table'
  const [chartsPerRow, setChartsPerRow] = useState(3); // 1, 2, 3

  // Sub filters
  const [sectorFilter, setSectorFilter] = useState('all');
  const [bandFilter, setBandFilter] = useState('all');
  const [thresholdPct, setThresholdPct] = useState(90);
  const [chartView, setChartView] = useState('all'); // 'all' | 'distribution' | 'cumulative'
  const [filterType, setFilterType] = useState('all'); // 'all' | 'macro' | 'indoor'

  // Data states
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [compareData, setCompareData] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Chart instances
  const chartRefs = useRef({});

  // Close site dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (siteDropdownRef.current && !siteDropdownRef.current.contains(event.target)) {
        setSiteDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Default dates from the latest TA data: standard = last 7 days,
  // compare = latest day (after) vs the same weekday one week earlier (before)
  useEffect(() => {
    loadLatestDates().then(dates => {
      const latest = dates[is5G ? 'ta-5g' : 'ta-4g'];
      const weekBefore = shiftDate(latest, -7);
      setToDate(latest);
      setFromDate(shiftDate(latest, -6));
      setAfterStart(latest);
      setAfterEnd(latest);
      setBeforeStart(weekBefore);
      setBeforeEnd(weekBefore);
    });
  }, [is5G]);

  // Fetch standard data
  const fetchStandardData = async (site = selectedSite) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const endpoint = is5G ? '/api/timing_advance/5g' : '/api/timing_advance/4g';
      const params = {
        site_id: site,
        start_date: fromDate,
        end_date: toDate,
        sector: sectorFilter,
        band: bandFilter,
        cell_type: filterType
      };
      const json = await getJson(endpoint, params);
      if (json.status === 'error') throw new Error(json.message || 'Failed to load data');
      setData(json);
    } catch (err) {
      console.error('Error fetching TA data:', err);
      setErrorMsg(err.message || 'An error occurred while loading data');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  // Fetch compare data
  const fetchCompareData = async (site = selectedSite) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = {
        tech: tech,
        site_id: site,
        before_start: beforeStart,
        before_end: beforeEnd,
        after_start: afterStart,
        after_end: afterEnd,
        sector: sectorFilter,
        band: bandFilter,
        cell_type: filterType
      };
      const json = await getJson('/api/timing_advance/compare', params);
      if (json.status === 'error') throw new Error(json.message || 'Failed to load comparison data');
      setCompareData(json);
    } catch (err) {
      console.error('Error fetching TA compare data:', err);
      setErrorMsg(err.message || 'An error occurred while loading comparison data');
      setCompareData(null);
    } finally {
      setLoading(false);
    }
  };

  // Loads only on Generate or when a site is picked; other filter changes wait for Generate
  const fetchData = (site = selectedSite) => {
    if (compareMode) {
      fetchCompareData(site);
    } else {
      fetchStandardData(site);
    }
  };

  // Filtered sites for dropdown
  const filteredSites = useMemo(() => {
    if (!siteSearch) return allSites.slice(0, 50);
    const q = siteSearch.toLowerCase();
    return allSites.filter(s => {
      const name = (siteNamesMap[s] || '').toLowerCase();
      return s.toLowerCase().includes(q) || name.includes(q);
    }).slice(0, 50);
  }, [allSites, siteSearch, siteNamesMap]);

  // Active data source
  const activeDataSource = compareMode ? compareData : data;

  // Header "Export Excel": the TA table rows currently loaded
  useEffect(() => {
    if (!onExportData) return undefined;
    const rows = activeDataSource?.table_rows;
    if (!rows?.length) { onExportData(null); return undefined; }
    onExportData(() => ({
      filename: `${compareMode ? 'TA_Compare' : 'TA'}_${tech.toUpperCase()}_${activeDataSource.site_id || selectedSite}`,
      sheets: [objectRowsSheet(compareMode ? 'TA Compare' : 'Timing Advance', rows)],
    }));
    return () => onExportData(null);
  }, [activeDataSource, compareMode, onExportData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Available sectors from loaded data
  const availableSectors = useMemo(() => {
    if (activeDataSource && activeDataSource.sectors && activeDataSource.sectors.length > 0) {
      return activeDataSource.sectors;
    }
    return ['1', '2', '3'];
  }, [activeDataSource]);

  // Available bands from loaded data
  const availableBands = useMemo(() => {
    if (activeDataSource && activeDataSource.bands && activeDataSource.bands.length > 0) {
      return activeDataSource.bands;
    }
    return is5G ? ['NR2300', 'NR2600'] : ['L900', 'L1800', 'L2100', 'L2300_1'];
  }, [activeDataSource, is5G]);

  // Visible sectors
  const visibleSectors = useMemo(() => {
    if (sectorFilter !== 'all') {
      const cleanSec = sectorFilter.replace('S', '').replace('s', '');
      return [cleanSec];
    }
    return availableSectors;
  }, [sectorFilter, availableSectors]);

  // =========================================================================
  // 1. TA DISTRIBUTION OPTION (Bar Chart of Sample Counts)
  // =========================================================================
  const getDistributionOption = (sectorKey, period = null) => {
    if (!activeDataSource || !activeDataSource.data_by_sector || !activeDataSource.data_by_sector[sectorKey]) {
      return {};
    }
    const sectorData = activeDataSource.data_by_sector[sectorKey];
    const bins = activeDataSource.bins || [];
    const siteId = activeDataSource.site_id || selectedSite;

    const activeKeys = Object.keys(sectorData).filter(k => {
      const entry = sectorData[k] || {};
      const band = entry.band || k;
      if (bandFilter !== 'all' && band.toUpperCase() !== bandFilter.toUpperCase()) return false;
      return true;
    });

    const sortedKeys = activeKeys.sort((k1, k2) => {
      const e1 = sectorData[k1] || {};
      const e2 = sectorData[k2] || {};
      const b1 = e1.band || k1;
      const b2 = e2.band || k2;
      const o1 = BAND_ORDER[b1] || 99;
      const o2 = BAND_ORDER[b2] || 99;
      if (o1 !== o2) return o1 - o2;
      const ci1 = e1.ci !== undefined && e1.ci !== null ? Number(e1.ci) : 999;
      const ci2 = e2.ci !== undefined && e2.ci !== null ? Number(e2.ci) : 999;
      return ci1 - ci2;
    });

    const bandIdxMap = {};
    const series = sortedKeys.map((k) => {
      const entry = sectorData[k] || {};
      const band = entry.band || k;
      const idxInBand = bandIdxMap[band] || 0;
      bandIdxMap[band] = idxInBand + 1;

      const sColor = getTaSeriesColor(band, idxInBand);
      const sName = getTaSeriesName(k, entry, siteId);

      let countData = [];
      if (period === 'Before') {
        countData = entry.before_counts || [];
      } else if (period === 'After') {
        countData = entry.after_counts || [];
      } else {
        countData = entry.counts || [];
      }

      return {
        name: sName,
        type: 'bar',
        barGap: '15%',
        barCategoryGap: '20%',
        data: countData,
        itemStyle: {
          color: sColor,
          borderRadius: [2, 2, 0, 0]
        }
      };
    });

    const titleText = period 
      ? `TA Distribution ${siteId}_S${sectorKey} (${period})`
      : `TA Distribution ${siteId}_S${sectorKey}`;

    return {
      animation: false,
      backgroundColor: 'transparent',
      title: {
        text: titleText,
        left: 'center',
        top: 8,
        textStyle: {
          fontSize: 13,
          fontWeight: 700,
          color: darkMode ? '#f1f5f9' : '#1e293b'
        }
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: darkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        borderColor: darkMode ? '#334155' : '#cbd5e1',
        textStyle: { color: darkMode ? '#f8fafc' : '#0f172a', fontSize: 11 }
      },
      legend: {
        bottom: 4,
        left: 'center',
        icon: 'rect',
        itemWidth: 12,
        itemHeight: 12,
        textStyle: {
          color: darkMode ? '#94a3b8' : '#475569',
          fontSize: 11
        }
      },
      grid: {
        top: 40,
        left: 55,
        right: 25,
        bottom: 95,
        containLabel: false
      },
      xAxis: {
        type: 'category',
        data: bins,
        axisLine: { lineStyle: { color: darkMode ? '#475569' : '#cbd5e1' } },
        axisLabel: {
          rotate: 45,
          fontSize: 9,
          margin: 10,
          color: darkMode ? '#94a3b8' : '#64748b'
        }
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        splitLine: {
          lineStyle: {
            color: darkMode ? 'rgba(51, 65, 85, 0.4)' : 'rgba(226, 232, 240, 0.8)'
          }
        },
        axisLabel: {
          color: darkMode ? '#94a3b8' : '#64748b',
          fontSize: 10,
          formatter: (v) => v >= 1000 ? v.toLocaleString() : v
        }
      },
      series: series
    };
  };

  // =========================================================================
  // 2. CUMULATIVE % TA OPTION (Line Chart with 90% Threshold MarkLine)
  // =========================================================================
  const getCumulativeOption = (sectorKey, period = null) => {
    if (!activeDataSource || !activeDataSource.data_by_sector || !activeDataSource.data_by_sector[sectorKey]) {
      return {};
    }
    const sectorData = activeDataSource.data_by_sector[sectorKey];
    const bins = activeDataSource.bins || [];
    const siteId = activeDataSource.site_id || selectedSite;

    const activeKeys = Object.keys(sectorData).filter(k => {
      const entry = sectorData[k] || {};
      const band = entry.band || k;
      if (bandFilter !== 'all' && band.toUpperCase() !== bandFilter.toUpperCase()) return false;
      return true;
    });

    const sortedKeys = activeKeys.sort((k1, k2) => {
      const e1 = sectorData[k1] || {};
      const e2 = sectorData[k2] || {};
      const b1 = e1.band || k1;
      const b2 = e2.band || k2;
      const o1 = BAND_ORDER[b1] || 99;
      const o2 = BAND_ORDER[b2] || 99;
      if (o1 !== o2) return o1 - o2;
      const ci1 = e1.ci !== undefined && e1.ci !== null ? Number(e1.ci) : 999;
      const ci2 = e2.ci !== undefined && e2.ci !== null ? Number(e2.ci) : 999;
      return ci1 - ci2;
    });

    const bandIdxMap = {};
    const series = sortedKeys.map((k, idx) => {
      const entry = sectorData[k] || {};
      const band = entry.band || k;
      const idxInBand = bandIdxMap[band] || 0;
      bandIdxMap[band] = idxInBand + 1;

      const sColor = getTaSeriesColor(band, idxInBand);
      const sName = getTaSeriesName(k, entry, siteId);
      const isFirst = idx === 0;

      let cumData = [];
      if (period === 'Before') {
        cumData = entry.before_cumulative || [];
      } else if (period === 'After') {
        cumData = entry.after_cumulative || [];
      } else {
        cumData = entry.cumulative || [];
      }

      return {
        name: sName,
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 3,
        data: cumData,
        lineStyle: {
          color: sColor,
          width: 2.2
        },
        itemStyle: {
          color: sColor
        },
        markLine: isFirst && thresholdPct > 0 ? {
          symbol: ['none', 'none'],
          silent: true,
          // Value in a highlighted box just outside the plot, level with the line
          label: {
            show: true,
            position: 'end',
            distance: 6,
            formatter: `${thresholdPct}`,
            color: '#ef4444',
            fontSize: 11,
            fontWeight: 'bold',
            backgroundColor: darkMode ? '#0f172a' : '#ffffff',
            borderColor: '#ef4444',
            borderWidth: 1.5,
            padding: [2, 5]
          },
          lineStyle: {
            type: 'dashed',
            color: '#ef4444',
            width: 1.5
          },
          data: [{ yAxis: Number(thresholdPct) }]
        } : undefined
      };
    });

    const titleText = period 
      ? `Cumulative % TA ${siteId}_S${sectorKey} (${period})`
      : `Cumulative % TA ${siteId}_S${sectorKey}`;

    return {
      animation: false,
      backgroundColor: 'transparent',
      title: {
        text: titleText,
        left: 'center',
        top: 8,
        textStyle: {
          fontSize: 13,
          fontWeight: 700,
          color: darkMode ? '#f1f5f9' : '#1e293b'
        }
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: darkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        borderColor: darkMode ? '#334155' : '#cbd5e1',
        textStyle: { color: darkMode ? '#f8fafc' : '#0f172a', fontSize: 11 },
        formatter: (params) => {
          if (!params || !params.length) return '';
          let html = `<div class="font-bold border-b pb-1 mb-1 border-slate-200 dark:border-slate-700">${params[0].axisValue}</div>`;
          params.forEach(p => {
            html += `<div class="flex items-center justify-between gap-4 py-0.5">
                      <span class="flex items-center gap-1.5">
                        <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${p.color};"></span>
                        <span>${p.seriesName}</span>
                      </span>
                      <span class="font-bold">${p.value}%</span>
                    </div>`;
          });
          return html;
        }
      },
      legend: {
        bottom: 4,
        left: 'center',
        icon: 'rect',
        itemWidth: 12,
        itemHeight: 12,
        textStyle: {
          color: darkMode ? '#94a3b8' : '#475569',
          fontSize: 11
        }
      },
      grid: {
        top: 40,
        left: 45,
        right: thresholdPct > 0 ? 48 : 25,
        bottom: 95,
        containLabel: false
      },
      xAxis: {
        type: 'category',
        data: bins,
        axisLine: { lineStyle: { color: darkMode ? '#475569' : '#cbd5e1' } },
        axisLabel: {
          rotate: 45,
          fontSize: 9,
          margin: 10,
          color: darkMode ? '#94a3b8' : '#64748b'
        }
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        axisLine: { show: false },
        splitLine: {
          lineStyle: {
            color: darkMode ? 'rgba(51, 65, 85, 0.4)' : 'rgba(226, 232, 240, 0.8)'
          }
        },
        axisLabel: {
          color: darkMode ? '#94a3b8' : '#64748b',
          fontSize: 10,
          formatter: '{value}%'
        }
      },
      series: series
    };
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!activeDataSource || !activeDataSource.table_rows || activeDataSource.table_rows.length === 0) {
      alert('No table data to export');
      return;
    }
    const rows = activeDataSource.table_rows;
    const headers = Object.keys(rows[0]);
    const csvContent = [
      headers.join(','),
      ...rows.map(r => headers.map(h => `"${r[h] !== undefined ? r[h] : ''}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const prefix = compareMode ? `TA_Compare_${tech}` : `TA_${tech}`;
    link.setAttribute('download', `${prefix}_${selectedSite}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      
      {/* 1. TOP HEADER / GENERATE BAR */}
      <div className={`p-4 rounded-xl border shadow-sm transition-colors duration-200 ${
        darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          
          <div className="flex flex-wrap items-end gap-3 sm:gap-4">
            
            {/* Standard Date Range */}
            {!compareMode ? (
              <>
                <div className="w-36 sm:w-40">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    From Date
                  </label>
                  <input 
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className={`w-full text-xs font-semibold px-2.5 py-1.5 rounded-lg border outline-none transition ${
                      darkMode 
                        ? 'bg-slate-800 border-slate-700 text-white focus:border-blue-500' 
                        : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-blue-500'
                    }`}
                  />
                </div>

                <div className="w-36 sm:w-40">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    To Date
                  </label>
                  <input 
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className={`w-full text-xs font-semibold px-2.5 py-1.5 rounded-lg border outline-none transition ${
                      darkMode 
                        ? 'bg-slate-800 border-slate-700 text-white focus:border-blue-500' 
                        : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-blue-500'
                    }`}
                  />
                </div>
              </>
            ) : (
              /* Compare Date Ranges (Before vs After) */
              <div className="flex flex-wrap items-center gap-3">
                {/* Before Range */}
                <div className={`p-2 rounded-lg border flex items-center gap-2 ${
                  darkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50 border-slate-200'
                }`}>
                  <span className="text-[11px] font-bold text-amber-500 uppercase">Before:</span>
                  <input 
                    type="date"
                    value={beforeStart}
                    onChange={(e) => setBeforeStart(e.target.value)}
                    className="text-xs font-semibold px-2 py-1 rounded border bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 outline-none"
                  />
                  <span className="text-xs opacity-60">to</span>
                  <input 
                    type="date"
                    value={beforeEnd}
                    onChange={(e) => setBeforeEnd(e.target.value)}
                    className="text-xs font-semibold px-2 py-1 rounded border bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 outline-none"
                  />
                </div>

                <ArrowRight className="w-4 h-4 text-slate-400 hidden sm:inline" />

                {/* After Range */}
                <div className={`p-2 rounded-lg border flex items-center gap-2 ${
                  darkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50 border-slate-200'
                }`}>
                  <span className="text-[11px] font-bold text-emerald-500 uppercase">After:</span>
                  <input 
                    type="date"
                    value={afterStart}
                    onChange={(e) => setAfterStart(e.target.value)}
                    className="text-xs font-semibold px-2 py-1 rounded border bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 outline-none"
                  />
                  <span className="text-xs opacity-60">to</span>
                  <input 
                    type="date"
                    value={afterEnd}
                    onChange={(e) => setAfterEnd(e.target.value)}
                    className="text-xs font-semibold px-2 py-1 rounded border bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 outline-none"
                  />
                </div>
              </div>
            )}

            {/* SITE ID POPUP / SELECTOR */}
            <div className="w-48 sm:w-60 relative" ref={siteDropdownRef}>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Site ID
              </label>
              <button
                type="button"
                onClick={() => setSiteDropdownOpen(!siteDropdownOpen)}
                className={`w-full text-xs font-semibold px-3 py-1.5 rounded-lg border flex items-center justify-between transition cursor-pointer ${
                  darkMode 
                    ? 'bg-slate-800 border-slate-700 text-white hover:border-blue-500' 
                    : 'bg-slate-50 border-slate-300 text-slate-900 hover:border-blue-500'
                }`}
              >
                <span className="truncate">
                  {selectedSite} {siteNamesMap[selectedSite] ? `- ${siteNamesMap[selectedSite]}` : ''}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-1" />
              </button>

              {siteDropdownOpen && (
                <div className={`absolute top-full left-0 mt-1 w-72 rounded-xl border shadow-xl z-50 p-2 ${
                  darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
                }`}>
                  <div className="relative mb-2">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      value={siteSearch}
                      onChange={(e) => setSiteSearch(e.target.value)}
                      placeholder="Search Site ID or Name..."
                      className={`w-full text-xs pl-8 pr-3 py-1.5 rounded-lg border outline-none ${
                        darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                      }`}
                      autoFocus
                    />
                  </div>
                  <div className="max-h-52 overflow-y-auto space-y-0.5 text-xs">
                    {filteredSites.map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          setSelectedSite(s);
                          setSiteDropdownOpen(false);
                          fetchData(s);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between transition cursor-pointer ${
                          selectedSite === s 
                            ? 'bg-blue-600 text-white font-bold' 
                            : darkMode ? 'hover:bg-slate-800 text-slate-200' : 'hover:bg-slate-100 text-slate-800'
                        }`}
                      >
                        <div className="truncate">
                          <span className="font-mono">{s}</span>
                          {siteNamesMap[s] && (
                            <span className="text-[11px] opacity-75 ml-1.5 truncate">
                              {siteNamesMap[s]}
                            </span>
                          )}
                        </div>
                        {selectedSite === s && <Check className="w-3.5 h-3.5" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* GENERATE BUTTON */}
            <button
              type="button"
              onClick={() => fetchData()}
              disabled={loading}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
            >
              <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Loading...' : 'Generate'}</span>
            </button>
          </div>

          {/* RIGHT SIDE: COMPARE BEFORE / AFTER TOGGLE (Gambar 1) */}
          <div>
            <button
              type="button"
              onClick={() => setCompareMode(!compareMode)}
              className={`px-4 py-2 rounded-lg font-bold text-xs border flex items-center gap-2 transition cursor-pointer ${
                compareMode
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                  : darkMode 
                    ? 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white' 
                    : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <GitCompare className="w-3.5 h-3.5" />
              <span>{compareMode ? 'Mode Single Site' : 'Compare Before vs After'}</span>
            </button>
          </div>

        </div>
      </div>

      {/* 2. SUB-ACTION BAR: Chart/Table, Charts/Row, Export CSV */}
      <div className={`px-4 py-2.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 shadow-xs ${
        darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        {/* View Mode Toggle: [ Chart | Table ] */}
        <div className={`p-0.5 rounded-lg border flex items-center ${
          darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-100 border-slate-200'
        }`}>
          <button
            type="button"
            onClick={() => setViewMode('chart')}
            className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
              viewMode === 'chart'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Chart
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
              viewMode === 'table'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Table
          </button>
        </div>

        {/* Sub-Action Controls: Charts/Row + Export CSV */}
        <div className="flex items-center gap-3">
          
          {viewMode === 'chart' && !compareMode && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold">
              <span className="hidden sm:inline">Charts / Row:</span>
              <div className={`p-0.5 rounded-lg border flex items-center ${
                darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-100 border-slate-200'
              }`}>
                {[1, 2, 3].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setChartsPerRow(n)}
                    className={`w-6 h-6 rounded flex items-center justify-center font-bold text-xs transition cursor-pointer ${
                      chartsPerRow === n
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Export CSV only (Export PNG removed per user request) */}
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>

        </div>
      </div>

      {/* 3. FILTERS BAR (SECTOR, BAND, THRESHOLD, CHART VIEW, FILTER TYPE) */}
      <div className={`p-4 rounded-xl border shadow-xs transition-colors duration-200 ${
        darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          
          {/* SECTOR */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Sector
            </label>
            <div className="relative">
              <select
                value={sectorFilter}
                onChange={(e) => setSectorFilter(e.target.value)}
                className={`w-full appearance-none border rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none cursor-pointer ${
                  darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                }`}
              >
                <option value="all">All Sectors</option>
                {availableSectors.map(s => (
                  <option key={s} value={`S${s}`}>Sector {s}</option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>

          {/* BAND */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Band
            </label>
            <div className="relative">
              <select
                value={bandFilter}
                onChange={(e) => setBandFilter(e.target.value)}
                className={`w-full appearance-none border rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none cursor-pointer ${
                  darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                }`}
              >
                <option value="all">All Bands</option>
                {availableBands.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>

          {/* THRESHOLD (%) */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Threshold (%)
            </label>
            <input 
              type="number"
              min="1"
              max="100"
              value={thresholdPct}
              onChange={(e) => setThresholdPct(parseInt(e.target.value, 10) || 0)}
              className={`w-full border rounded-lg px-2.5 py-1.5 text-xs font-semibold outline-none transition ${
                darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
              }`}
            />
          </div>

          {/* CHART VIEW */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Chart View
            </label>
            <div className="relative">
              <select
                value={chartView}
                onChange={(e) => setChartView(e.target.value)}
                className={`w-full appearance-none border rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none cursor-pointer ${
                  darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                }`}
              >
                <option value="all">All (Both)</option>
                <option value="distribution">Distribution Only</option>
                <option value="cumulative">Cumulative Only</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>

          {/* FILTER TYPE */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Filter Type
            </label>
            <div className="relative">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className={`w-full appearance-none border rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none cursor-pointer ${
                  darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                }`}
              >
                <option value="all">All</option>
                <option value="macro">Macro</option>
                <option value="indoor">Indoor</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>

        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 flex items-center gap-3 text-xs">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 4. CHARTS DISPLAY */}
      {viewMode === 'chart' && (
        <div className="space-y-4">
          
          {/* A. STANDARD VIEW: SEPARATE DISTRIBUTION & CUMULATIVE CHARTS (Gambar 1) */}
          {!compareMode && (
            <div className={`grid gap-4 ${
              chartsPerRow === 1 
                ? 'grid-cols-1' 
                : chartsPerRow === 2 
                  ? 'grid-cols-1 md:grid-cols-2' 
                  : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
            }`}>
              {visibleSectors.map(secKey => {
                const hasData = activeDataSource && activeDataSource.data_by_sector && activeDataSource.data_by_sector[secKey];
                return (
                  <div 
                    key={secKey}
                    className={`rounded-2xl border p-4 shadow-sm transition-colors space-y-4 ${
                      darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                    }`}
                  >
                    {hasData ? (
                      <>
                        {/* 1. TA Distribution (Bar Chart) */}
                        {(chartView === 'all' || chartView === 'distribution') && (
                          <div className="w-full">
                            <ReactECharts
                              ref={(e) => { chartRefs.current[`dist_S${secKey}`] = e; }}
                              option={getDistributionOption(secKey)}
                              style={{ height: '335px', width: '100%' }}
                              opts={{ renderer: 'canvas' }}
                              notMerge={true}
                            />
                          </div>
                        )}

                        {/* 2. Cumulative % TA (Line Chart) */}
                        {(chartView === 'all' || chartView === 'cumulative') && (
                          <div className="w-full pt-2 border-t border-slate-100 dark:border-slate-800/80">
                            <ReactECharts
                              ref={(e) => { chartRefs.current[`cum_S${secKey}`] = e; }}
                              option={getCumulativeOption(secKey)}
                              style={{ height: '295px', width: '100%' }}
                              opts={{ renderer: 'canvas' }}
                              notMerge={true}
                            />
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="h-80 flex flex-col items-center justify-center text-slate-400 text-xs">
                        <Layers className="w-7 h-7 mb-2 opacity-50" />
                        <span>No data for Sector {secKey}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* B. COMPARE MODE: SIDE-BY-SIDE BEFORE vs AFTER PER SECTOR (Gambar 2) */}
          {compareMode && (
            <div className="space-y-6">
              {visibleSectors.map(secKey => {
                const hasData = activeDataSource && activeDataSource.data_by_sector && activeDataSource.data_by_sector[secKey];
                return (
                  <div 
                    key={secKey}
                    className={`rounded-2xl border p-4 sm:p-5 shadow-sm transition-colors ${
                      darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                    }`}
                  >
                    {hasData ? (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 divide-y lg:divide-y-0 lg:divide-x divide-slate-100 dark:divide-slate-800">
                        
                        {/* Left Side: BEFORE */}
                        <div className="space-y-4 lg:pr-3">
                          {(chartView === 'all' || chartView === 'distribution') && (
                            <ReactECharts
                              ref={(e) => { chartRefs.current[`dist_S${secKey}_before`] = e; }}
                              option={getDistributionOption(secKey, 'Before')}
                              style={{ height: '335px', width: '100%' }}
                              opts={{ renderer: 'canvas' }}
                              notMerge={true}
                            />
                          )}
                          {(chartView === 'all' || chartView === 'cumulative') && (
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
                              <ReactECharts
                                ref={(e) => { chartRefs.current[`cum_S${secKey}_before`] = e; }}
                                option={getCumulativeOption(secKey, 'Before')}
                                style={{ height: '295px', width: '100%' }}
                                opts={{ renderer: 'canvas' }}
                                notMerge={true}
                              />
                            </div>
                          )}
                        </div>

                        {/* Right Side: AFTER */}
                        <div className="space-y-4 pt-4 lg:pt-0 lg:pl-3">
                          {(chartView === 'all' || chartView === 'distribution') && (
                            <ReactECharts
                              ref={(e) => { chartRefs.current[`dist_S${secKey}_after`] = e; }}
                              option={getDistributionOption(secKey, 'After')}
                              style={{ height: '335px', width: '100%' }}
                              opts={{ renderer: 'canvas' }}
                              notMerge={true}
                            />
                          )}
                          {(chartView === 'all' || chartView === 'cumulative') && (
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
                              <ReactECharts
                                ref={(e) => { chartRefs.current[`cum_S${secKey}_after`] = e; }}
                                option={getCumulativeOption(secKey, 'After')}
                                style={{ height: '295px', width: '100%' }}
                                opts={{ renderer: 'canvas' }}
                                notMerge={true}
                              />
                            </div>
                          )}
                        </div>

                      </div>
                    ) : (
                      <div className="h-60 flex flex-col items-center justify-center text-slate-400 text-xs">
                        <Layers className="w-7 h-7 mb-2 opacity-50" />
                        <span>No comparison data for Sector {secKey}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

        </div>
      )}

      {/* 5. TABLE VIEW RENDERING */}
      {viewMode === 'table' && (
        <div className={`rounded-2xl border overflow-hidden shadow-xs ${
          darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="p-4 border-b flex items-center justify-between border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500">
                Timing Advance Details {tech.toUpperCase()} ({selectedSite}) {compareMode ? '— Compare Before vs After' : ''}
              </h3>
              <p className="text-[11px] text-slate-400">
                Total rows: {activeDataSource?.table_rows?.length || 0}
              </p>
            </div>
            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download CSV</span>
            </button>
          </div>

          <div className="overflow-x-auto max-h-[600px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className={`sticky top-0 z-10 font-bold uppercase tracking-wider text-[10px] ${
                darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700'
              }`}>
                <tr>
                  {compareMode && <th className="px-3 py-2.5">Period</th>}
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Sector</th>
                  <th className="px-3 py-2.5">Band</th>
                  <th className="px-3 py-2.5 text-right">Total Samples</th>
                  <th className="px-3 py-2.5 text-right">% &le; 1km</th>
                  <th className="px-3 py-2.5 text-right">% &le; 2.1km</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(activeDataSource?.table_rows || []).map((row, idx) => (
                  <tr 
                    key={idx}
                    className={`transition ${
                      darkMode ? 'hover:bg-slate-800/60' : 'hover:bg-slate-50'
                    }`}
                  >
                    {compareMode && (
                      <td className="px-3 py-2 font-bold font-mono">
                        <span className={`px-2 py-0.5 rounded text-[10px] ${
                          row.period === 'Before' 
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' 
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        }`}>
                          {row.period}
                        </span>
                      </td>
                    )}
                    <td className="px-3 py-2 font-mono">{row.date}</td>
                    <td className="px-3 py-2 font-semibold">Sector {row.sector}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 font-mono text-[11px] font-bold">
                        {row.band}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-medium">
                      {Number(row.total_samples || 0).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                      {row.pct_within_1km}%
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {row.pct_within_2km}%
                    </td>
                  </tr>
                ))}
                {(!activeDataSource || !activeDataSource.table_rows || activeDataSource.table_rows.length === 0) && (
                  <tr>
                    <td colSpan={compareMode ? 7 : 6} className="text-center py-8 text-slate-400">
                      No data matches the filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loading && <DataLoadingOverlay message="Calculating Timing Advance Distribution..." />}
    </div>
  );
}
