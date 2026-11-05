import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { 
  Calendar, 
  Search, 
  RotateCw, 
  Download, 
  Image as ImageIcon, 
  FileSpreadsheet, 
  Filter, 
  ChevronDown, 
  Check, 
  X,
  Layers,
  AlertCircle
} from 'lucide-react';
import { BAND_COLORS } from './SectorPayloadChart';

export default function TimingAdvanceView({
  tech = '4g', // '4g' or '5g'
  darkMode = false,
  allSites = [],
  siteNamesMap = {}
}) {
  const is5G = tech === '5g';

  // Dates
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
  const [errorMsg, setErrorMsg] = useState(null);

  // Chart references for PNG export
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

  // Fetch initial latest dates on mount
  useEffect(() => {
    fetch('/api/latest_dates')
      .then(res => res.json())
      .then(dates => {
        const key = is5G ? 'ta_5g' : 'ta_4g';
        if (dates && dates[key]) {
          setToDate(dates[key]);
          const dStart = new Date(dates[key]);
          dStart.setDate(dStart.getDate() - 6);
          setFromDate(dStart.toISOString().split('T')[0]);
        }
      })
      .catch(() => {});
  }, [is5G]);

  // Main data fetch function
  const fetchData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const endpoint = is5G ? '/api/timing_advance/5g' : '/api/timing_advance/4g';
      const params = new URLSearchParams({
        site_id: selectedSite,
        start_date: fromDate,
        end_date: toDate,
        sector: sectorFilter,
        band: bandFilter,
        cell_type: filterType
      });

      const res = await fetch(`${endpoint}?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const json = await res.json();

      if (json.status === 'error') {
        throw new Error(json.message || 'Gagal memuat data Timing Advance');
      }
      setData(json);
    } catch (err) {
      console.error('Error fetching TA data:', err);
      setErrorMsg(err.message || 'Terjadi kesalahan saat memuat data');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  // Trigger initial fetch when component mounts or tech changes
  useEffect(() => {
    fetchData();
  }, [tech, selectedSite]);

  // Filtered sites for dropdown autocomplete
  const filteredSites = useMemo(() => {
    if (!siteSearch) return allSites.slice(0, 50);
    const q = siteSearch.toLowerCase();
    return allSites.filter(s => {
      const name = (siteNamesMap[s] || '').toLowerCase();
      return s.toLowerCase().includes(q) || name.includes(q);
    }).slice(0, 50);
  }, [allSites, siteSearch, siteNamesMap]);

  // Available sectors from loaded data
  const availableSectors = useMemo(() => {
    if (data && data.sectors && data.sectors.length > 0) {
      return data.sectors;
    }
    return ['1', '2', '3'];
  }, [data]);

  // Available bands from loaded data
  const availableBands = useMemo(() => {
    if (data && data.bands && data.bands.length > 0) {
      return data.bands;
    }
    return is5G ? ['NR2300', 'NR2600'] : ['L900', 'L1800', 'L2100', 'L2300_1'];
  }, [data, is5G]);

  // Visible sectors to render (either single filtered sector or all sectors)
  const visibleSectors = useMemo(() => {
    if (sectorFilter !== 'all') {
      const cleanSec = sectorFilter.replace('S', '').replace('s', '');
      return [cleanSec];
    }
    return availableSectors;
  }, [sectorFilter, availableSectors]);

  // Generate ECharts option for Distribution (Bar Chart)
  const getDistributionOption = (sectorKey) => {
    if (!data || !data.data_by_sector || !data.data_by_sector[sectorKey]) {
      return {};
    }
    const sectorData = data.data_by_sector[sectorKey];
    const bins = data.bins || [];

    // Filter bands if bandFilter is set
    const activeBands = Object.keys(sectorData).filter(b => {
      if (bandFilter !== 'all' && b.toUpperCase() !== bandFilter.toUpperCase()) return false;
      return true;
    });

    const series = activeBands.map(b => {
      const bColor = BAND_COLORS[b] || (b === 'L900' ? '#f87171' : '#3b82f6');
      return {
        name: b,
        type: 'bar',
        barGap: '10%',
        barCategoryGap: '20%',
        data: sectorData[b].counts || [],
        itemStyle: {
          color: bColor,
          borderRadius: [2, 2, 0, 0]
        }
      };
    });

    return {
      backgroundColor: 'transparent',
      title: {
        text: `TA Distribution ${data.site_id}_S${sectorKey}`,
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
        textStyle: { color: darkMode ? '#f8fafc' : '#0f172a', fontSize: 11 },
        formatter: (params) => {
          if (!params || !params.length) return '';
          let s = `<div class="font-bold border-b pb-1 mb-1 border-slate-200 dark:border-slate-700">Bin: ${params[0].axisValue} km</div>`;
          params.forEach(p => {
            const val = Number(p.value || 0).toLocaleString();
            s += `<div class="flex items-center justify-between gap-4 py-0.5">
                    <span class="flex items-center gap-1.5">
                      <span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${p.color};"></span>
                      <span>${p.seriesName}</span>
                    </span>
                    <span class="font-bold">${val}</span>
                  </div>`;
          });
          return s;
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
        top: 45,
        left: 55,
        right: 20,
        bottom: 75,
        containLabel: false
      },
      xAxis: {
        type: 'category',
        data: bins,
        axisLine: { lineStyle: { color: darkMode ? '#475569' : '#cbd5e1' } },
        axisLabel: {
          rotate: 45,
          fontSize: 9.5,
          interval: 0,
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
          formatter: (v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)
        }
      },
      series
    };
  };

  // Generate ECharts option for Cumulative % (Line Chart)
  const getCumulativeOption = (sectorKey) => {
    if (!data || !data.data_by_sector || !data.data_by_sector[sectorKey]) {
      return {};
    }
    const sectorData = data.data_by_sector[sectorKey];
    const bins = data.bins || [];

    const activeBands = Object.keys(sectorData).filter(b => {
      if (bandFilter !== 'all' && b.toUpperCase() !== bandFilter.toUpperCase()) return false;
      return true;
    });

    const series = activeBands.map((b, idx) => {
      const bColor = BAND_COLORS[b] || (b === 'L900' ? '#f87171' : '#3b82f6');
      const isFirst = idx === 0;

      return {
        name: b,
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        data: sectorData[b].cumulative || [],
        lineStyle: {
          color: bColor,
          width: 2.2
        },
        itemStyle: {
          color: bColor
        },
        markLine: isFirst && thresholdPct > 0 ? {
          symbol: ['none', 'none'],
          silent: true,
          label: {
            show: true,
            position: 'insideEndTop',
            formatter: `${thresholdPct}%`,
            color: '#ef4444',
            fontSize: 10,
            fontWeight: 'bold'
          },
          lineStyle: {
            type: 'dashed',
            color: '#ef4444',
            width: 1.8
          },
          data: [
            { yAxis: Number(thresholdPct) }
          ]
        } : undefined
      };
    });

    return {
      backgroundColor: 'transparent',
      title: {
        text: `Cumulative % TA ${data.site_id}_S${sectorKey}`,
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
          let s = `<div class="font-bold border-b pb-1 mb-1 border-slate-200 dark:border-slate-700">Bin: ${params[0].axisValue} km</div>`;
          params.forEach(p => {
            s += `<div class="flex items-center justify-between gap-4 py-0.5">
                    <span class="flex items-center gap-1.5">
                      <span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${p.color};"></span>
                      <span>${p.seriesName}</span>
                    </span>
                    <span class="font-bold">${p.value}%</span>
                  </div>`;
          });
          return s;
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
        top: 45,
        left: 45,
        right: 20,
        bottom: 75,
        containLabel: false
      },
      xAxis: {
        type: 'category',
        data: bins,
        axisLine: { lineStyle: { color: darkMode ? '#475569' : '#cbd5e1' } },
        axisLabel: {
          rotate: 45,
          fontSize: 9.5,
          interval: 0,
          color: darkMode ? '#94a3b8' : '#64748b'
        }
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        interval: 20,
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
      series
    };
  };

  // Export Table Data to CSV
  const handleExportCSV = () => {
    if (!data || !data.table_rows || data.table_rows.length === 0) {
      alert('Tidak ada data tabel untuk diekspor');
      return;
    }
    const rows = data.table_rows;
    const headers = Object.keys(rows[0]);
    const csvContent = [
      headers.join(','),
      ...rows.map(r => headers.map(h => `"${r[h] !== undefined ? r[h] : ''}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `TA_${tech.toUpperCase()}_${selectedSite}_${fromDate}_${toDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export Visible Charts to PNG
  const handleExportPNG = () => {
    const keys = Object.keys(chartRefs.current);
    if (keys.length === 0) {
      alert('Tidak ada grafik untuk diekspor.');
      return;
    }
    keys.forEach((key) => {
      const chartInstance = chartRefs.current[key]?.getEchartsInstance();
      if (chartInstance) {
        const dataUrl = chartInstance.getDataURL({
          type: 'png',
          pixelRatio: 2,
          backgroundColor: darkMode ? '#0f172a' : '#ffffff'
        });
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `${key}_${selectedSite}.png`;
        link.click();
      }
    });
  };

  return (
    <div className="space-y-4">
      
      {/* 1. TOP HEADER / GENERATE BAR (Matching Gambar 1) */}
      <div className={`p-4 rounded-xl border shadow-sm transition-colors duration-200 ${
        darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        <div className="flex flex-wrap items-end gap-3 sm:gap-4">
          
          {/* FROM DATE */}
          <div className="w-36 sm:w-40">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              From Date
            </label>
            <div className="relative">
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
          </div>

          {/* TO DATE */}
          <div className="w-36 sm:w-40">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              To Date
            </label>
            <div className="relative">
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
          </div>

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

            {/* Dropdown Menu */}
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
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between transition cursor-pointer ${
                        selectedSite === s 
                          ? 'bg-blue-600 text-white font-bold' 
                          : darkMode 
                            ? 'hover:bg-slate-800 text-slate-200' 
                            : 'hover:bg-slate-100 text-slate-800'
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
                  {filteredSites.length === 0 && (
                    <div className="text-center py-4 text-xs text-slate-400">
                      Site tidak ditemukan
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* GENERATE BUTTON */}
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Loading...' : 'Generate'}</span>
          </button>
        </div>
      </div>

      {/* 2. SUB-ACTION BAR: Chart/Table, Charts/Row, Export Buttons (Matching Gambar 1) */}
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

        {/* Right Action Controls */}
        <div className="flex items-center gap-3">
          {/* Charts / Row Segmented Switch */}
          {viewMode === 'chart' && (
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

          {/* Export PNG */}
          <button
            type="button"
            onClick={handleExportPNG}
            className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition cursor-pointer"
            title="Download PNG chart images"
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export PNG</span>
          </button>

          {/* Export CSV */}
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition cursor-pointer"
            title="Download CSV table data"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
        </div>
      </div>

      {/* 3. FILTER BAR: Sector, Band, Threshold, Chart View, Filter Type (Matching Gambar 1) */}
      <div className={`p-3.5 rounded-xl border shadow-xs ${
        darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          
          {/* SECTOR */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Sector
            </label>
            <select
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              className={`w-full text-xs font-semibold px-2.5 py-1.5 rounded-lg border outline-none transition cursor-pointer ${
                darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            >
              <option value="all">All Sectors</option>
              {availableSectors.map(s => (
                <option key={s} value={s}>Sector {s}</option>
              ))}
            </select>
          </div>

          {/* BAND */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Band
            </label>
            <select
              value={bandFilter}
              onChange={(e) => setBandFilter(e.target.value)}
              className={`w-full text-xs font-semibold px-2.5 py-1.5 rounded-lg border outline-none transition cursor-pointer ${
                darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            >
              <option value="all">All Bands</option>
              {availableBands.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
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
              onChange={(e) => setThresholdPct(Number(e.target.value))}
              className={`w-full text-xs font-bold px-2.5 py-1.5 rounded-lg border outline-none transition ${
                darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            />
          </div>

          {/* CHART VIEW */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Chart View
            </label>
            <select
              value={chartView}
              onChange={(e) => setChartView(e.target.value)}
              className={`w-full text-xs font-semibold px-2.5 py-1.5 rounded-lg border outline-none transition cursor-pointer ${
                darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            >
              <option value="all">All</option>
              <option value="distribution">Distribution</option>
              <option value="cumulative">Cumulative</option>
            </select>
          </div>

          {/* FILTER TYPE */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Filter Type
            </label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className={`w-full text-xs font-semibold px-2.5 py-1.5 rounded-lg border outline-none transition cursor-pointer ${
                darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            >
              <option value="all">All</option>
              <option value="macro">Macro</option>
              <option value="indoor">Indoor</option>
            </select>
          </div>

        </div>
      </div>

      {/* 4. CONTENT DISPLAY */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 flex items-center gap-3 text-xs">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* CHART VIEW RENDERING (Matching Gambar 1: Sector Columns) */}
      {viewMode === 'chart' && (
        <div className={`grid gap-4 ${
          chartsPerRow === 1 
            ? 'grid-cols-1' 
            : chartsPerRow === 2 
              ? 'grid-cols-1 md:grid-cols-2' 
              : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
        }`}>
          {visibleSectors.map(secKey => {
            const hasData = data && data.data_by_sector && data.data_by_sector[secKey];
            return (
              <div key={secKey} className="space-y-4">
                
                {/* Top: TA Distribution (Bar Chart) */}
                {(chartView === 'all' || chartView === 'distribution') && (
                  <div className={`rounded-2xl border p-3 shadow-sm transition-colors ${
                    darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                  }`}>
                    {hasData ? (
                      <ReactECharts
                        ref={(e) => { chartRefs.current[`distribution_S${secKey}`] = e; }}
                        option={getDistributionOption(secKey)}
                        style={{ height: '310px', width: '100%' }}
                        opts={{ renderer: 'canvas' }}
                        notMerge={true}
                      />
                    ) : (
                      <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-xs">
                        <Layers className="w-6 h-6 mb-2 opacity-50" />
                        <span>Tidak ada data distribusi untuk Sektor {secKey}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Bottom: Cumulative % TA (Line Chart) */}
                {(chartView === 'all' || chartView === 'cumulative') && (
                  <div className={`rounded-2xl border p-3 shadow-sm transition-colors ${
                    darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                  }`}>
                    {hasData ? (
                      <ReactECharts
                        ref={(e) => { chartRefs.current[`cumulative_S${secKey}`] = e; }}
                        option={getCumulativeOption(secKey)}
                        style={{ height: '310px', width: '100%' }}
                        opts={{ renderer: 'canvas' }}
                        notMerge={true}
                      />
                    ) : (
                      <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-xs">
                        <Layers className="w-6 h-6 mb-2 opacity-50" />
                        <span>Tidak ada data kumulatif untuk Sektor {secKey}</span>
                      </div>
                    )}
                  </div>
                )}

              </div>
            );
          })}
        </div>
      )}

      {/* TABLE VIEW RENDERING */}
      {viewMode === 'table' && (
        <div className={`rounded-2xl border overflow-hidden shadow-xs ${
          darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="p-4 border-b flex items-center justify-between border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500">
                Data Rinci Timing Advance {tech.toUpperCase()} ({selectedSite})
              </h3>
              <p className="text-[11px] text-slate-400">
                Total baris: {data?.table_rows?.length || 0}
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
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Cell Name</th>
                  <th className="px-3 py-2.5">Sector</th>
                  <th className="px-3 py-2.5">Band</th>
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5 text-right">Total</th>
                  {(data?.bins || []).map(b => (
                    <th key={b} className="px-2 py-2.5 text-right whitespace-nowrap">{b}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(data?.table_rows || []).map((row, idx) => (
                  <tr 
                    key={idx}
                    className={`transition ${
                      darkMode ? 'hover:bg-slate-800/60' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="px-3 py-2 font-mono">{row.date}</td>
                    <td className="px-3 py-2 font-medium">{row.cell_name}</td>
                    <td className="px-3 py-2">{row.sector}</td>
                    <td className="px-3 py-2 font-bold">{row.band}</td>
                    <td className="px-3 py-2">{row.type}</td>
                    <td className="px-3 py-2 text-right font-bold text-blue-600 dark:text-blue-400">
                      {Number(row.total_samples || 0).toLocaleString()}
                    </td>
                    {(data?.bins || []).map(b => (
                      <td key={b} className="px-2 py-2 text-right font-mono opacity-85">
                        {Number(row[b] || 0).toLocaleString()}
                      </td>
                    ))}
                  </tr>
                ))}
                {(!data || !data.table_rows || data.table_rows.length === 0) && (
                  <tr>
                    <td colSpan={6 + (data?.bins?.length || 15)} className="text-center py-8 text-slate-400">
                      Tidak ada data yang sesuai dengan filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
