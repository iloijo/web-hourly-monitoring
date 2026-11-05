import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { 
  Calendar, 
  Search, 
  RotateCw, 
  Download, 
  Image as ImageIcon, 
  FileSpreadsheet, 
  ChevronDown, 
  Check, 
  Activity, 
  Clock, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle,
  Layers,
  ArrowUpRight
} from 'lucide-react';
import { formatAxisDate } from './SectorPayloadChart';

export default function PacketLossView({
  darkMode = false,
  allSites = [],
  siteNamesMap = {}
}) {
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  });

  const [selectedSite, setSelectedSite] = useState('KWA001');
  const [siteSearch, setSiteSearch] = useState('');
  const [siteDropdownOpen, setSiteDropdownOpen] = useState(false);
  const siteDropdownRef = useRef(null);

  const [viewMode, setViewMode] = useState('chart'); // 'chart' | 'table'
  const [chartsPerRow, setChartsPerRow] = useState(2); // 1, 2, 3
  const [thresholdPct, setThresholdPct] = useState(0.1); // Packet loss threshold %

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const chartRefs = useRef({});

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (siteDropdownRef.current && !siteDropdownRef.current.contains(event.target)) {
        setSiteDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch latest date on mount
  useEffect(() => {
    fetch('/api/latest_dates')
      .then(res => res.json())
      .then(dates => {
        if (dates && dates.packet_loss) {
          setToDate(dates.packet_loss);
          const dStart = new Date(dates.packet_loss);
          dStart.setDate(dStart.getDate() - 13);
          setFromDate(dStart.toISOString().split('T')[0]);
        }
      })
      .catch(() => {});
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams({
        site_id: selectedSite,
        start_date: fromDate,
        end_date: toDate
      });
      const res = await fetch(`/api/packet_loss/4g?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const json = await res.json();
      if (json.status === 'error') {
        throw new Error(json.message || 'Gagal memuat data TWAMP Packet Loss');
      }
      setData(json);
    } catch (err) {
      console.error('Error fetching TWAMP data:', err);
      setErrorMsg(err.message || 'Terjadi kesalahan saat memuat data');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedSite]);

  const filteredSites = useMemo(() => {
    if (!siteSearch) return allSites.slice(0, 50);
    const q = siteSearch.toLowerCase();
    return allSites.filter(s => {
      const name = (siteNamesMap[s] || '').toLowerCase();
      return s.toLowerCase().includes(q) || name.includes(q);
    }).slice(0, 50);
  }, [allSites, siteSearch, siteNamesMap]);

  // Chart 1: Packet Loss Rate (%)
  const getLossRateOption = () => {
    if (!data || !data.dates || data.dates.length === 0) return {};
    const dates = data.dates.map(d => formatAxisDate(d, 'daily'));
    const rates = data.series?.packet_loss_rate || [];

    return {
      backgroundColor: 'transparent',
      title: {
        text: `TWAMP Packet Loss Rate (%) - ${data.site_id}`,
        left: 'left',
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
          const p = params[0];
          return `<div class="font-bold border-b pb-1 mb-1 border-slate-200 dark:border-slate-700">${p.axisValue}</div>
                  <div class="flex items-center justify-between gap-4 py-0.5">
                    <span class="flex items-center gap-1.5">
                      <span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#ef4444;"></span>
                      <span>Loss Rate</span>
                    </span>
                    <span class="font-bold text-rose-500">${p.value}%</span>
                  </div>`;
        }
      },
      grid: {
        top: 50,
        left: 45,
        right: 25,
        bottom: 45,
        containLabel: false
      },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: darkMode ? '#475569' : '#cbd5e1' } },
        axisLabel: {
          rotate: 30,
          fontSize: 9.5,
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
          formatter: '{value}%'
        }
      },
      series: [
        {
          name: 'Packet Loss Rate',
          type: 'line',
          smooth: true,
          data: rates,
          lineStyle: { color: '#ef4444', width: 2.5 },
          itemStyle: { color: '#ef4444' },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(239, 68, 68, 0.35)' },
                { offset: 1, color: 'rgba(239, 68, 68, 0.02)' }
              ]
            }
          },
          markLine: thresholdPct > 0 ? {
            silent: true,
            symbol: ['none', 'none'],
            label: {
              show: true,
              position: 'insideEndTop',
              formatter: `Threshold ${thresholdPct}%`,
              color: '#f59e0b',
              fontSize: 10,
              fontWeight: 'bold'
            },
            lineStyle: { type: 'dashed', color: '#f59e0b', width: 1.5 },
            data: [{ yAxis: Number(thresholdPct) }]
          } : undefined
        }
      ]
    };
  };

  // Chart 2: Transmission Delay & Jitter (ms)
  const getDelayJitterOption = () => {
    if (!data || !data.dates || data.dates.length === 0) return {};
    const dates = data.dates.map(d => formatAxisDate(d, 'daily'));
    const delays = data.series?.avg_delay || [];
    const jitters = data.series?.avg_jitter || [];

    return {
      backgroundColor: 'transparent',
      title: {
        text: `TWAMP Latency & Jitter (ms) - ${data.site_id}`,
        left: 'left',
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
        textStyle: { color: darkMode ? '#f8fafc' : '#0f172a', fontSize: 11 }
      },
      legend: {
        top: 8,
        right: 15,
        icon: 'rect',
        itemWidth: 12,
        itemHeight: 12,
        textStyle: { color: darkMode ? '#94a3b8' : '#475569', fontSize: 11 }
      },
      grid: {
        top: 50,
        left: 45,
        right: 25,
        bottom: 45,
        containLabel: false
      },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: darkMode ? '#475569' : '#cbd5e1' } },
        axisLabel: {
          rotate: 30,
          fontSize: 9.5,
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
          formatter: '{value} ms'
        }
      },
      series: [
        {
          name: 'Avg Delay',
          type: 'line',
          smooth: true,
          data: delays,
          lineStyle: { color: '#3b82f6', width: 2.2 },
          itemStyle: { color: '#3b82f6' }
        },
        {
          name: 'Avg Jitter',
          type: 'line',
          smooth: true,
          data: jitters,
          lineStyle: { color: '#f59e0b', width: 2.2 },
          itemStyle: { color: '#f59e0b' }
        }
      ]
    };
  };

  // Chart 3: Transmitted vs Received Packets
  const getVolumeOption = () => {
    if (!data || !data.dates || data.dates.length === 0) return {};
    const dates = data.dates.map(d => formatAxisDate(d, 'daily'));
    const tx = data.series?.tx_packets || [];
    const rx = data.series?.rx_packets || [];

    return {
      backgroundColor: 'transparent',
      title: {
        text: `TWAMP Packet Volume - ${data.site_id}`,
        left: 'left',
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
        top: 8,
        right: 15,
        icon: 'rect',
        itemWidth: 12,
        itemHeight: 12,
        textStyle: { color: darkMode ? '#94a3b8' : '#475569', fontSize: 11 }
      },
      grid: {
        top: 50,
        left: 55,
        right: 25,
        bottom: 45,
        containLabel: false
      },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: darkMode ? '#475569' : '#cbd5e1' } },
        axisLabel: {
          rotate: 30,
          fontSize: 9.5,
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
          formatter: (v) => (v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)
        }
      },
      series: [
        {
          name: 'Tx Packets',
          type: 'bar',
          data: tx,
          itemStyle: { color: '#06b6d4', borderRadius: [2, 2, 0, 0] }
        },
        {
          name: 'Rx Packets',
          type: 'bar',
          data: rx,
          itemStyle: { color: '#10b981', borderRadius: [2, 2, 0, 0] }
        }
      ]
    };
  };

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
    link.setAttribute('download', `TWAMP_PacketLoss_${selectedSite}_${fromDate}_${toDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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

  const summary = data?.summary || {};

  return (
    <div className="space-y-4">
      
      {/* 1. TOP HEADER / GENERATE BAR */}
      <div className={`p-4 rounded-xl border shadow-sm transition-colors duration-200 ${
        darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        <div className="flex flex-wrap items-end gap-3 sm:gap-4">
          
          <div className="w-36 sm:w-40">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              From Date
            </label>
            <input 
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className={`w-full text-xs font-semibold px-2.5 py-1.5 rounded-lg border outline-none transition ${
                darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
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
                darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            />
          </div>

          <div className="w-48 sm:w-60 relative" ref={siteDropdownRef}>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Site ID
            </label>
            <button
              type="button"
              onClick={() => setSiteDropdownOpen(!siteDropdownOpen)}
              className={`w-full text-xs font-semibold px-3 py-1.5 rounded-lg border flex items-center justify-between transition cursor-pointer ${
                darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
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

      {/* 2. SUB-ACTION BAR */}
      <div className={`px-4 py-2.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 shadow-xs ${
        darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
      }`}>
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

        <div className="flex items-center gap-3">
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

          <button
            type="button"
            onClick={handleExportPNG}
            className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition cursor-pointer"
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export PNG</span>
          </button>

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

      {/* 3. SUMMARY KPI HEADLINE CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Avg Loss Rate */}
        <div className={`p-4 rounded-xl border shadow-xs ${
          darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1">
            <span>Avg Packet Loss</span>
            <Activity className="w-4 h-4 text-rose-500" />
          </div>
          <div className={`text-xl font-extrabold tracking-tight ${
            (summary.avg_loss_rate || 0) > 0.1 ? 'text-rose-500' : 'text-emerald-500'
          }`}>
            {(summary.avg_loss_rate || 0).toFixed(4)}%
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">Threshold: 0.1%</p>
        </div>

        {/* Max Loss Rate */}
        <div className={`p-4 rounded-xl border shadow-xs ${
          darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1">
            <span>Peak Loss Rate</span>
            <ShieldAlert className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl font-extrabold tracking-tight text-amber-500">
            {(summary.max_loss_rate || 0).toFixed(4)}%
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">Highest daily spike</p>
        </div>

        {/* Avg Latency */}
        <div className={`p-4 rounded-xl border shadow-xs ${
          darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1">
            <span>Avg TWAMP Delay</span>
            <Clock className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-xl font-extrabold tracking-tight text-blue-500">
            {(summary.avg_delay || 0).toFixed(2)} ms
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">Peak: {(summary.max_delay || 0).toFixed(2)} ms</p>
        </div>

        {/* Avg Jitter */}
        <div className={`p-4 rounded-xl border shadow-xs ${
          darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1">
            <span>Avg Jitter</span>
            <ArrowUpRight className="w-4 h-4 text-cyan-500" />
          </div>
          <div className="text-xl font-extrabold tracking-tight text-cyan-500">
            {(summary.avg_jitter || 0).toFixed(2)} ms
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">Network jitter stability</p>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 flex items-center gap-3 text-xs">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 4. CHARTS SECTION */}
      {viewMode === 'chart' && (
        <div className={`grid gap-4 ${
          chartsPerRow === 1 
            ? 'grid-cols-1' 
            : chartsPerRow === 2 
              ? 'grid-cols-1 lg:grid-cols-2' 
              : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
        }`}>
          {/* Chart 1: Loss Rate */}
          <div className={`rounded-2xl border p-3 shadow-sm ${
            darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <ReactECharts
              ref={(e) => { chartRefs.current.packet_loss = e; }}
              option={getLossRateOption()}
              style={{ height: '320px', width: '100%' }}
              opts={{ renderer: 'canvas' }}
              notMerge={true}
            />
          </div>

          {/* Chart 2: Delay & Jitter */}
          <div className={`rounded-2xl border p-3 shadow-sm ${
            darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <ReactECharts
              ref={(e) => { chartRefs.current.delay_jitter = e; }}
              option={getDelayJitterOption()}
              style={{ height: '320px', width: '100%' }}
              opts={{ renderer: 'canvas' }}
              notMerge={true}
            />
          </div>

          {/* Chart 3: Volume */}
          <div className={`rounded-2xl border p-3 shadow-sm ${
            chartsPerRow === 2 ? 'lg:col-span-2' : ''
          } ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            <ReactECharts
              ref={(e) => { chartRefs.current.volume = e; }}
              option={getVolumeOption()}
              style={{ height: '320px', width: '100%' }}
              opts={{ renderer: 'canvas' }}
              notMerge={true}
            />
          </div>
        </div>
      )}

      {/* 5. TABLE SECTION */}
      {viewMode === 'table' && (
        <div className={`rounded-2xl border overflow-hidden shadow-xs ${
          darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="p-4 border-b flex items-center justify-between border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500">
                Data Rinci TWAMP Packet Loss ({selectedSite})
              </h3>
              <p className="text-[11px] text-slate-400">
                Total rekaman hari: {data?.table_rows?.length || 0}
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
                  <th className="px-3 py-2.5">Managed Element</th>
                  <th className="px-3 py-2.5 text-right">Tx Packets</th>
                  <th className="px-3 py-2.5 text-right">Rx Packets</th>
                  <th className="px-3 py-2.5 text-right">Loss Packets</th>
                  <th className="px-3 py-2.5 text-right">Loss Rate (%)</th>
                  <th className="px-3 py-2.5 text-right">Avg Delay (ms)</th>
                  <th className="px-3 py-2.5 text-right">Avg Jitter (ms)</th>
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
                    <td className="px-3 py-2 font-mono font-medium">{row.date}</td>
                    <td className="px-3 py-2 text-slate-500 truncate max-w-xs">{row.managed_element}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {Number(row.tx_packets || 0).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-emerald-600 dark:text-emerald-400">
                      {Number(row.rx_packets || 0).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-rose-500 font-bold">
                      {Number(row.loss_packets || 0).toLocaleString()}
                    </td>
                    <td className={`px-3 py-2 text-right font-bold font-mono ${
                      (row.packet_loss_rate_pct || 0) > 0.1 ? 'text-rose-500' : 'text-emerald-500'
                    }`}>
                      {row.packet_loss_rate_pct}%
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{row.avg_delay_ms}</td>
                    <td className="px-3 py-2 text-right font-mono">{row.avg_jitter_ms}</td>
                  </tr>
                ))}
                {(!data || !data.table_rows || data.table_rows.length === 0) && (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-slate-400">
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
