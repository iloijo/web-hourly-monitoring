import React, { useState, useEffect, useRef, useMemo } from 'react';
import SectorPayloadChart from './components/SectorPayloadChart';
import DataLoadingOverlay from './components/DataLoadingOverlay';
import { 
  Menu, 
  Calendar, 
  RefreshCw, 
  CheckCircle2, 
  Activity, 
  Radio, 
  BarChart3, 
  Sliders, 
  ChevronLeft, 
  ChevronDown,
  ChevronUp,
  Layers, 
  Search, 
  HardDrive,
  FileSpreadsheet,
  Filter,
  Check,
  Moon,
  Sun,
  X,
  LayoutGrid
} from 'lucide-react';

// Comprehensive list of all 18 radio network KPIs mapped from measHy4g
const ALL_KPIS = [
  // Core Traffic
  { id: 'payload', label: 'Payload (GB)', category: 'Traffic' },
  { id: 'max_rrc', label: 'Max RRC User (Users)', category: 'Traffic' },
  { id: 'active_users', label: 'Active Users', category: 'Traffic' },
  // Accessibility & Retainability
  { id: 'availability', label: 'Availability (%)', category: 'Accessibility' },
  { id: 'rrc_setup_sr', label: 'RRC Setup SR (%)', category: 'Accessibility' },
  { id: 'erab_setup_sr', label: 'E-RAB Setup SR (%)', category: 'Accessibility' },
  { id: 'cssr', label: 'CSSR (%)', category: 'Accessibility' },
  { id: 'erab_drop_rate', label: 'E-RAB Drop Rate (%)', category: 'Retainability' },
  { id: 'service_drop_rate', label: 'Service Drop Rate (%)', category: 'Retainability' },
  // Capacity & Utilization
  { id: 'dl_prb', label: 'DL PRB (%)', category: 'Capacity' },
  { id: 'ul_prb', label: 'UL PRB (%)', category: 'Capacity' },
  { id: 'user_dl_thp', label: 'User DL Thp (Mbps)', category: 'Throughput' },
  { id: 'user_ul_thp', label: 'User UL Thp (Mbps)', category: 'Throughput' },
  { id: 'spectrum_efficiency', label: 'Spectrum Efficiency (bps/Hz)', category: 'Throughput' },
  // Quality & Mobility
  { id: 'cqi', label: 'CQI', category: 'Quality' },
  { id: 'avg_ni_dbm', label: 'Average NI (dBm)', category: 'Quality' },
  { id: 'ifho_sr', label: 'IFHO SR (%)', category: 'Mobility' },
  { id: 'inter_freq_ho_sr', label: 'Inter-Freq HO SR (%)', category: 'Mobility' }
];

// Default Core 6 KPIs matching Image 7 reference
const DEFAULT_SELECTED_KPIS = ['payload', 'max_rrc', 'availability', 'dl_prb', 'user_dl_thp', 'cqi'];

// Standard LTE Band list matching Image 5 reference
const BAND_OPTIONS = [
  { id: 'L1800', label: 'L1800 (1.8 GHz)' },
  { id: 'L2100', label: 'L2100 (2.1 GHz)' },
  { id: 'L900', label: 'L900 (900 MHz)' },
  { id: 'L2300_1', label: 'L2300 Carrier 1' },
  { id: 'L2300_2', label: 'L2300 Carrier 2' },
  { id: 'L2300_3', label: 'L2300 Carrier 3' },
  { id: 'L700', label: 'L700 (700 MHz)' },
  { id: 'L2600', label: 'L2600' }
];

// Default End Date: Today - 1 per Gambar 3 & Image 2 instruction
const getYesterdayStr = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
};

const getSixDaysBeforeStr = (endDateStr) => {
  const d = new Date(endDateStr);
  d.setDate(d.getDate() - 5);
  return d.toISOString().split('T')[0];
};

export default function App() {
  // Theme state
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark';
  });

  // Filter & data states
  const [siteId, setSiteId] = useState("MRW002");
  const [selectedSector, setSelectedSector] = useState("1");
  const [selectedBands, setSelectedBands] = useState(['L1800', 'L2100', 'L900', 'L2300_1']);
  const [bandDropdownOpen, setBandDropdownOpen] = useState(false);
  const [selectedKpis, setSelectedKpis] = useState(DEFAULT_SELECTED_KPIS);
  const [kpiDropdownOpen, setKpiDropdownOpen] = useState(false);
  const [kpiSearchTerm, setKpiSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("macro"); // 'macro', 'indoor', 'all'
  
  // Date states (Default: today - 1)
  const initialEnd = getYesterdayStr();
  const initialStart = getSixDaysBeforeStr(initialEnd);
  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(initialEnd);
  const [timeMode, setTimeMode] = useState("hourly");

  // UI interaction states
  const [chartsPerRow, setChartsPerRow] = useState(3);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Site list & dropdown search
  const [allSites, setAllSites] = useState([]);
  const [siteSearch, setSiteSearch] = useState("");
  const [siteDropdownOpen, setSiteDropdownOpen] = useState(false);

  // Data fetching states
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dbStatus, setDbStatus] = useState("Connecting to TwoDb...");

  const kpiDropdownRef = useRef(null);
  const siteDropdownRef = useRef(null);
  const bandDropdownRef = useRef(null);

  // Toggle theme
  const toggleTheme = () => {
    setDarkMode(prev => {
      const next = !prev;
      localStorage.setItem('theme', next ? 'dark' : 'light');
      return next;
    });
  };

  // Sync dark mode class to html element
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  // Cycle charts per row: 3 -> 2 -> 1 -> 3
  const cycleGrid = () => {
    setChartsPerRow(prev => (prev === 3 ? 2 : prev === 2 ? 1 : 3));
  };

  // Close dropdowns on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (kpiDropdownRef.current && !kpiDropdownRef.current.contains(event.target)) {
        setKpiDropdownOpen(false);
      }
      if (siteDropdownRef.current && !siteDropdownRef.current.contains(event.target)) {
        setSiteDropdownOpen(false);
      }
      if (bandDropdownRef.current && !bandDropdownRef.current.contains(event.target)) {
        setBandDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch all site IDs from CellListRCI on mount (Image 8 requirement)
  useEffect(() => {
    fetch('/api/sites')
      .then(res => res.json())
      .then(json => {
        if (json.sites && json.sites.length > 0) {
          setAllSites(json.sites);
        }
      })
      .catch(() => {});
  }, []);

  // Filtered sites for dropdown
  const filteredSites = useMemo(() => {
    const term = siteSearch.trim().toUpperCase();
    if (!term) return allSites.slice(0, 80);
    return allSites.filter(s => s.toUpperCase().includes(term)).slice(0, 100);
  }, [allSites, siteSearch]);

  // Fetch payload & multi-KPI data from backend
  const fetchData = (
    targetSite = siteId, 
    start = startDate, 
    end = endDate, 
    mode = timeMode,
    cType = filterType
  ) => {
    setLoading(true);
    const startReqTime = Date.now();
    const params = new URLSearchParams({
      site_id: targetSite,
      start_date: start,
      end_date: end,
      time_mode: mode,
      cell_type: cType,
      days_back: "6"
    });

    fetch(`/api/payload_sectors?${params.toString()}`)
      .then(res => res.json())
      .then(json => {
        const elapsed = Date.now() - startReqTime;
        const delay = Math.max(0, 600 - elapsed);
        setTimeout(() => {
          setData(json);
          setLoading(false);
          if (json.source) {
            setDbStatus(json.source);
          }
          // Requirement: Default sector automatically displays Sector 1 after get data
          setSelectedSector("1");
          
          // Populate site's actual bands into selectedBands if currently empty or mismatched
          if (json.available_bands && json.available_bands.length > 0) {
            setSelectedBands(prev => {
              const valid = prev.filter(b => json.available_bands.includes(b));
              return valid.length > 0 ? valid : json.available_bands;
            });
          }
        }, delay);
      })
      .catch(err => {
        console.error("Failed to fetch payload sectors:", err);
        setLoading(false);
        setDbStatus("Connection Error");
      });
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleGetData = (e) => {
    if (e) e.preventDefault();
    fetchData(siteId, startDate, endDate, timeMode, filterType);
  };

  // Toggle single band selection
  const handleToggleBand = (bandId) => {
    if (selectedBands.includes(bandId)) {
      if (selectedBands.length > 1) {
        setSelectedBands(selectedBands.filter(b => b !== bandId));
      }
    } else {
      setSelectedBands([...selectedBands, bandId]);
    }
  };

  // Toggle All Bands
  const handleToggleAllBands = () => {
    const siteBands = data?.available_bands || BAND_OPTIONS.map(b => b.id);
    if (selectedBands.length === siteBands.length) {
      setSelectedBands([siteBands[0]]);
    } else {
      setSelectedBands([...siteBands]);
    }
  };

  // Toggle KPI selection
  const handleToggleKpi = (kpiId) => {
    if (selectedKpis.includes(kpiId)) {
      if (selectedKpis.length > 1) {
        setSelectedKpis(selectedKpis.filter(id => id !== kpiId));
      }
    } else {
      setSelectedKpis([...selectedKpis, kpiId]);
    }
  };

  const actualBands = data?.available_bands || ["L1800", "L2100", "L900", "L2300_1"];
  const availableSectors = data?.available_sectors || [1, 2, 3];
  const currentSectorData = data?.sectors?.[`sector${selectedSector}`] || data?.sectors?.[`sector1`] || null;
  const currentKpis = currentSectorData?.kpis || {};

  // Filtered KPI list for search in popover
  const displayedKpiOptions = useMemo(() => {
    if (!kpiSearchTerm) return ALL_KPIS;
    return ALL_KPIS.filter(k => k.label.toLowerCase().includes(kpiSearchTerm.toLowerCase()) || k.category.toLowerCase().includes(kpiSearchTerm.toLowerCase()));
  }, [kpiSearchTerm]);

  return (
    <div className={`min-h-screen flex flex-row font-sans select-none transition-colors duration-300 overflow-x-hidden ${
      darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-800'
    }`}>
      
      {/* ========================================================================= */}
      {/* 1. Smooth Sliding Left Sidebar (Gambar 4 requirement)                      */}
      {/* ========================================================================= */}
      <aside 
        className={`fixed inset-y-0 left-0 z-40 w-64 transition-transform duration-300 ease-in-out flex flex-col shadow-2xl border-r ${
          darkMode ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
        } ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        {/* Sidebar Brand Header */}
        <div className={`h-14 border-b px-5 flex items-center justify-between ${
          darkMode ? 'border-slate-800' : 'border-slate-200'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm font-bold text-sm">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <span className={`font-extrabold text-sm tracking-tight block leading-tight ${
                darkMode ? 'text-white' : 'text-slate-900'
              }`}>
                NetKPI Monitor
              </span>
              <span className={`text-[10px] font-medium tracking-wide ${
                darkMode ? 'text-slate-400' : 'text-slate-500'
              }`}>
                4G Hourly v4.0
              </span>
            </div>
          </div>
          <button 
            onClick={() => setSidebarOpen(false)}
            className={`p-1 rounded transition cursor-pointer ${
              darkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
            }`}
            title="Hide Sidebar"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>

        {/* Sidebar Navigation Items */}
        <div className="p-3 grow overflow-y-auto space-y-6 text-xs">
          <div>
            <span className={`px-3 text-[10px] font-bold uppercase tracking-wider ${
              darkMode ? 'text-slate-500' : 'text-slate-400'
            }`}>
              Network Monitoring
            </span>
            <div className="mt-2 space-y-1">
              <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md font-semibold text-white bg-blue-600 shadow-xs cursor-pointer">
                <Radio className="w-4 h-4 text-white" />
                <span>4G Monitoring</span>
                <span className="ml-auto w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              </button>
              <button className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md font-medium transition cursor-pointer ${
                darkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800/60' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}>
                <Radio className={`w-4 h-4 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                <span>2G Monitoring</span>
              </button>
              <button className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md font-medium transition cursor-pointer ${
                darkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800/60' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}>
                <Radio className={`w-4 h-4 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                <span>5G Monitoring</span>
              </button>
            </div>
          </div>

          <div>
            <span className={`px-3 text-[10px] font-bold uppercase tracking-wider ${
              darkMode ? 'text-slate-500' : 'text-slate-400'
            }`}>
              Analytics & KPIs
            </span>
            <div className="mt-2 space-y-1">
              <button className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md font-medium transition cursor-pointer ${
                darkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800/60' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}>
                <BarChart3 className={`w-4 h-4 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                <span>PRB & Capacity</span>
              </button>
              <button className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md font-medium transition cursor-pointer ${
                darkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800/60' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}>
                <Layers className={`w-4 h-4 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                <span>Carrier Distribution</span>
              </button>
              <button className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md font-medium transition cursor-pointer ${
                darkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800/60' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}>
                <Sliders className={`w-4 h-4 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                <span>CQI & Throughput</span>
              </button>
            </div>
          </div>

          <div>
            <span className={`px-3 text-[10px] font-bold uppercase tracking-wider ${
              darkMode ? 'text-slate-500' : 'text-slate-400'
            }`}>
              Data & Topology
            </span>
            <div className="mt-2 space-y-1">
              <button className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md font-medium transition cursor-pointer ${
                darkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800/60' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}>
                <HardDrive className={`w-4 h-4 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                <span>CellListRCI Topology</span>
              </button>
              <button className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md font-medium transition cursor-pointer ${
                darkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800/60' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}>
                <FileSpreadsheet className={`w-4 h-4 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                <span>Export CSV Report</span>
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className={`p-3 border-t text-[11px] transition-colors ${
          darkMode ? 'border-slate-800 text-slate-400 bg-slate-950/40' : 'border-slate-200 text-slate-600 bg-slate-50'
        }`}>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>TwoDb Live</span>
          </div>
          <span className={`text-[10px] block truncate ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>127.0.0.1:5434 / 192.168.1.231</span>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* 2. Main Content Area (Sidebar remains open without blocking backdrop)      */}
      {/* ========================================================================= */}
      <div className={`flex-1 flex flex-col min-w-0 min-h-screen transition-all duration-300 ease-in-out ${
        sidebarOpen ? "md:ml-64" : "ml-0"
      }`}>
        
        {/* ========================================================================= */}
        {/* Top Header Bar matching Image 2, 3, 6, 8                                  */}
        {/* ========================================================================= */}
        <header className={`border-b px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-xs transition-colors duration-300 ${
          darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
        }`}>
          
          {/* Left: Hamburger menu toggle + Title "Monitoring KPI" + TwoDb Live badge */}
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSidebarOpen(!sidebarOpen)}
              title="Toggle Sidebar"
              className="w-9 h-9 rounded-lg flex items-center justify-center transition cursor-pointer active:scale-95 bg-slate-800 text-white hover:bg-slate-700"
            >
              <Menu className="w-5 h-5" />
            </button>

            <h1 className={`text-xl sm:text-2xl font-black tracking-tight ${
              darkMode ? 'text-white' : 'text-slate-900'
            }`}>
              Monitoring KPI
            </h1>

            <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
              darkMode 
                ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800' 
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}>
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              <span>TwoDb Live</span>
            </div>
          </div>

          {/* Right side: Start Date, End Date, Daily/Hourly, Get Data, Grid Icon, Theme */}
          <form onSubmit={handleGetData} className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
            
            {/* Start Date Picker (Image 2 & 8) */}
            <div className="flex items-center gap-1.5">
              <span className={`text-[11px] font-semibold ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Start Date:
              </span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={`border rounded-lg px-2.5 py-1 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer shadow-2xs ${
                  darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              />
            </div>

            {/* End Date Picker (Image 2 & 8 - Default: Today - 1) */}
            <div className="flex items-center gap-1.5">
              <span className={`text-[11px] font-semibold ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                End Date:
              </span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={`border rounded-lg px-2.5 py-1 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer shadow-2xs ${
                  darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              />
            </div>

            {/* Daily / Hourly Toggle Switch (Image 8) */}
            <div className={`flex items-center p-0.5 rounded-lg border ${
              darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'
            }`}>
              <button
                type="button"
                onClick={() => { setTimeMode("daily"); fetchData(siteId, startDate, endDate, "daily", filterType); }}
                className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                  timeMode === "daily" 
                    ? "bg-white text-blue-600 shadow-xs dark:bg-blue-600 dark:text-white" 
                    : darkMode ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Daily
              </button>
              <button
                type="button"
                onClick={() => { setTimeMode("hourly"); fetchData(siteId, startDate, endDate, "hourly", filterType); }}
                className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                  timeMode === "hourly" 
                    ? "bg-white text-blue-600 shadow-xs dark:bg-blue-600 dark:text-white" 
                    : darkMode ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Hourly
              </button>
            </div>

            {/* Primary 'Get Data' Action Button (Image 2 requirement: "Tulisan action ubah jadi get data") */}
            <button
              type="submit"
              disabled={loading}
              className="bg-slate-800 hover:bg-slate-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white font-bold px-4 py-1.5 rounded-lg transition-all duration-200 shadow-xs cursor-pointer flex items-center gap-1.5 text-xs active:scale-95"
            >
              {loading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Search className="w-3.5 h-3.5" />
              )}
              <span>Get Data</span>
            </button>

            {/* Charts / Row Segmented Control strictly matching Gambar 3 */}
            <div className="flex items-center gap-1.5 pl-1">
              <span className={`text-[11px] font-semibold whitespace-nowrap ${
                darkMode ? 'text-slate-400' : 'text-slate-600'
              }`}>
                Charts / Row:
              </span>
              <div className={`flex items-center p-0.5 rounded-lg border shadow-2xs ${
                darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'
              }`}>
                {[1, 2, 3].map(num => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setChartsPerRow(num)}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all duration-200 cursor-pointer ${
                      chartsPerRow === num
                        ? darkMode
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-white text-blue-700 shadow-xs ring-1 ring-slate-200/50'
                        : darkMode
                          ? 'text-slate-400 hover:text-white'
                          : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            {/* Dark Mode / Light Mode Toggle Button */}
            <button
              type="button"
              onClick={toggleTheme}
              className={`w-9 h-9 rounded-lg border transition-all duration-300 cursor-pointer flex items-center justify-center active:scale-90 ${
                darkMode 
                  ? 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700' 
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 shadow-2xs'
              }`}
              title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

          </form>

        </header>

        {/* Content Body */}
        <main className="p-4 sm:p-5 grow overflow-y-auto space-y-4">
          
          {/* ========================================================================= */}
          {/* 3. Filter Bar Card strictly matching Image 4 & 7                          */}
          {/* SELECT SITES | FILTER SECTOR | FILTER BAND | FILTER KPI | FILTER TYPE     */}
          {/* ========================================================================= */}
          <div className={`rounded-xl border p-3.5 shadow-2xs transition-colors duration-300 ${
            darkMode ? 'bg-slate-800/80 border-slate-700/80' : 'bg-white border-slate-200/90'
          }`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3.5">
              
              {/* 1. SELECT SITES (Image 4 & Image 8) */}
              <div className="relative" ref={siteDropdownRef}>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">
                  SELECT SITES
                </label>
                <div 
                  onClick={() => setSiteDropdownOpen(!siteDropdownOpen)}
                  className={`w-full flex items-center justify-between border rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer transition ${
                    darkMode 
                      ? 'bg-slate-800 border-slate-700 text-white hover:border-slate-600' 
                      : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300'
                  }`}
                >
                  <span>{siteId}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </div>

                {/* Searchable Dropdown Popover with all 8,014 sites */}
                {siteDropdownOpen && (
                  <div className={`absolute top-full left-0 mt-1 w-72 border rounded-xl shadow-2xl z-50 p-2 text-xs space-y-2 ${
                    darkMode ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
                  }`}>
                    <div className="relative">
                      <input
                        type="text"
                        autoFocus
                        value={siteSearch}
                        onChange={(e) => setSiteSearch(e.target.value.toUpperCase())}
                        placeholder="Search site ID (e.g. MRW, UPD, SON)..."
                        className={`w-full border rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                        }`}
                      />
                      {siteSearch && (
                        <button
                          type="button"
                          onClick={() => setSiteSearch("")}
                          className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredSites.map(s => (
                        <div
                          key={s}
                          onClick={() => {
                            setSiteId(s);
                            setSiteDropdownOpen(false);
                            setSiteSearch("");
                            fetchData(s, startDate, endDate, timeMode, filterType);
                          }}
                          className={`px-3 py-1.5 rounded-md cursor-pointer font-bold flex items-center justify-between transition ${
                            s === siteId 
                              ? 'bg-blue-600 text-white' 
                              : darkMode ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-blue-50 text-slate-700'
                          }`}
                        >
                          <span>{s}</span>
                          {s === siteId && <Check className="w-3.5 h-3.5 text-white" />}
                        </div>
                      ))}
                      {filteredSites.length === 0 && (
                        <div className="p-3 text-center text-slate-400 text-xs">
                          No site matches "{siteSearch}"
                        </div>
                      )}
                    </div>

                    <div className="px-2 pt-1 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 flex justify-between">
                      <span>{allSites.length.toLocaleString()} total sites</span>
                      <span className="font-semibold text-blue-500">CellListRCI</span>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. FILTER SECTOR (Image 4 & Image 7) */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">
                  FILTER SECTOR
                </label>
                <div className="relative">
                  <select
                    value={selectedSector}
                    onChange={(e) => setSelectedSector(e.target.value)}
                    className={`w-full appearance-none border rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  >
                    {availableSectors.map(s => (
                      <option key={s} value={String(s)}>{s}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                </div>
              </div>

              {/* 3. FILTER BAND: Multi-select matching Image 4, 5, 7 */}
              <div className="relative" ref={bandDropdownRef}>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">
                  FILTER BAND
                </label>
                <button
                  type="button"
                  onClick={() => setBandDropdownOpen(!bandDropdownOpen)}
                  className={`w-full flex items-center justify-between border rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer ${
                    darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                  }`}
                >
                  <span>
                    {selectedBands.length === actualBands.length 
                      ? `${selectedBands.length} selected`
                      : `${selectedBands.length} selected`}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {/* Popover options matching Image 5 */}
                {bandDropdownOpen && (
                  <div className={`absolute top-full left-0 mt-1 w-64 border rounded-xl shadow-2xl z-50 p-2 text-xs space-y-1 ${
                    darkMode ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
                  }`}>
                    {/* All Bands / Select All option */}
                    <div
                      onClick={handleToggleAllBands}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer font-bold transition ${
                        selectedBands.length === actualBands.length
                          ? darkMode ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white'
                          : darkMode ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-100 text-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedBands.length === actualBands.length}
                          onChange={() => {}}
                          className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer pointer-events-none"
                        />
                        <span>Select All Bands</span>
                      </div>
                      {selectedBands.length === actualBands.length && <Check className="w-3.5 h-3.5" />}
                    </div>

                    <div className="border-t border-slate-100 dark:border-slate-800 my-1"></div>

                    {/* Individual band options matching Image 5 list */}
                    {BAND_OPTIONS.map(b => {
                      const isActual = actualBands.includes(b.id);
                      const isChecked = selectedBands.includes(b.id);
                      return (
                        <div
                          key={b.id}
                          onClick={() => handleToggleBand(b.id)}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition select-none ${
                            isChecked 
                              ? darkMode ? 'bg-blue-900/30 text-blue-300 font-bold' : 'bg-blue-50 text-blue-900 font-bold'
                              : darkMode ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}}
                              className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer pointer-events-none"
                            />
                            <span>{b.label}</span>
                          </div>
                          {isActual && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                              Active
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 4. FILTER KPI: Multi-select matching Image 4, 7 & Gambar 2 */}
              <div className="relative" ref={kpiDropdownRef}>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">
                  FILTER KPI
                </label>
                <button
                  type="button"
                  onClick={() => setKpiDropdownOpen(!kpiDropdownOpen)}
                  className={`w-full flex items-center justify-between border rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer ${
                    darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                  }`}
                >
                  <span>
                    {selectedKpis.length === ALL_KPIS.length 
                      ? `Select All (${ALL_KPIS.length})` 
                      : `${selectedKpis.length} selected`}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {/* Popover checkbox list with category grouping & search (Gambar 2 requirement) */}
                {kpiDropdownOpen && (
                  <div className={`absolute top-full right-0 mt-1 w-80 border rounded-xl shadow-2xl z-50 p-2.5 text-xs space-y-2 ${
                    darkMode ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
                  }`}>
                    <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
                      <span className="font-bold text-[11px] text-slate-400 uppercase">
                        Select KPIs ({ALL_KPIS.length} available)
                      </span>
                      <div className="flex items-center gap-2 text-[11px]">
                        <button
                          type="button"
                          onClick={() => setSelectedKpis(ALL_KPIS.map(k => k.id))}
                          className="text-blue-500 hover:underline cursor-pointer font-bold"
                        >
                          Select All
                        </button>
                        <span>|</span>
                        <button
                          type="button"
                          onClick={() => setSelectedKpis(DEFAULT_SELECTED_KPIS)}
                          className="text-blue-500 hover:underline cursor-pointer font-bold"
                        >
                          Core 6
                        </button>
                      </div>
                    </div>

                    {/* Search input for KPIs */}
                    <input
                      type="text"
                      value={kpiSearchTerm}
                      onChange={(e) => setKpiSearchTerm(e.target.value)}
                      placeholder="Search KPIs..."
                      className={`w-full border rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                      }`}
                    />

                    {/* Scrollable list */}
                    <div className="max-h-64 overflow-y-auto space-y-1">
                      {/* Gambar 2 Requirement: dedicated "Select All" option at the top of the list */}
                      <label
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition select-none font-bold border-b mb-1 ${
                          selectedKpis.length === ALL_KPIS.length
                            ? darkMode ? 'bg-blue-900/40 text-blue-300 border-slate-700' : 'bg-blue-50 text-blue-900 border-blue-100'
                            : darkMode ? 'hover:bg-slate-800 text-slate-300 border-slate-800' : 'hover:bg-slate-50 text-slate-700 border-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedKpis.length === ALL_KPIS.length}
                            onChange={() => {
                              if (selectedKpis.length === ALL_KPIS.length) {
                                setSelectedKpis(DEFAULT_SELECTED_KPIS);
                              } else {
                                setSelectedKpis(ALL_KPIS.map(k => k.id));
                              }
                            }}
                            className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                          <span>Select All</span>
                        </div>
                        <span className="text-[10px] font-semibold text-blue-500">
                          {selectedKpis.length === ALL_KPIS.length ? '18/18' : `${selectedKpis.length}/${ALL_KPIS.length}`}
                        </span>
                      </label>
                      {displayedKpiOptions.map(k => {
                        const isChecked = selectedKpis.includes(k.id);
                        return (
                          <label
                            key={k.id}
                            className={`flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer transition select-none ${
                              isChecked 
                                ? darkMode ? 'bg-blue-900/30 text-blue-300' : 'bg-blue-50 text-blue-900 font-semibold' 
                                : darkMode ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleKpi(k.id)}
                                className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                              <span>{k.label}</span>
                            </div>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                              darkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {k.category}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* 5. FILTER TYPE: Macro / Indoor / All matching Image 4 & 7 */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">
                  FILTER TYPE
                </label>
                <div className="relative">
                  <select
                    value={filterType}
                    onChange={(e) => {
                      const nextType = e.target.value;
                      setFilterType(nextType);
                      fetchData(siteId, startDate, endDate, timeMode, nextType);
                    }}
                    className={`w-full appearance-none border rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  >
                    <option value="macro">Macro</option>
                    <option value="indoor">Indoor</option>
                    <option value="all">All Types</option>
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                </div>
              </div>

            </div>
          </div>

          {/* ========================================================================= */}
          {/* 4. Multi-KPI Sector Dashboard Grid strictly matching Image 7              */}
          {/* 6 Cards in 3x2 Grid: Payload, Max RRC, Availability, DL PRB, User DL, CQI */}
          {/* ========================================================================= */}
          {!loading && !data && (
            <div className={`h-80 flex flex-col items-center justify-center gap-3 text-sm rounded-2xl border ${
              darkMode ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-500'
            }`}>
              <Activity className="w-8 h-8 text-blue-500" />
              <span className="font-medium">Silakan klik "Get Data" untuk memuat grafik Multi-KPI</span>
            </div>
          )}

          {data && currentSectorData && (
            <div className={`grid gap-4 transition-all duration-300 ${
              chartsPerRow === 1 
                ? "grid-cols-1" 
                : chartsPerRow === 2 
                  ? "grid-cols-1 md:grid-cols-2" 
                  : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
            }`}>
              
              {/* Map over selected KPIs strictly preserving order */}
              {ALL_KPIS.filter(k => selectedKpis.includes(k.id)).map(k => {
                const kpiData = currentKpis[k.id];
                if (!kpiData) return null;

                return (
                  <SectorPayloadChart
                    key={`${siteId}_${selectedSector}_${filterType}_${k.id}`}
                    title={kpiData.title}
                    unit={kpiData.unit}
                    timestamps={currentSectorData.timestamps}
                    carrierSeries={kpiData.carrier_series}
                    totalSeries={kpiData.total_series}
                    carrierBands={kpiData.carrier_bands}
                    hasTotal={kpiData.has_total}
                    bandFilter={selectedBands}
                    timeMode={timeMode}
                    minY={kpiData.min_y}
                    maxY={kpiData.max_y}
                    darkMode={darkMode}
                    chartsPerRow={chartsPerRow}
                  />
                );
              })}

            </div>
          )}

          {data && (!currentSectorData || selectedKpis.length === 0) && (
            <div className={`p-8 text-center rounded-2xl border ${
              darkMode ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-500'
            }`}>
              <span className="font-semibold block mb-1">Tidak ada chart yang dipilih</span>
              <span className="text-xs">Silakan pilih setidaknya 1 KPI pada menu Filter KPI.</span>
            </div>
          )}

        </main>

        {/* Bottom Status Footer */}
        <footer className={`border-t px-6 py-2.5 flex flex-wrap items-center justify-between text-xs transition-colors duration-300 ${
          darkMode ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-500'
        }`}>
          <div className="flex items-center gap-4">
            <div>
              <span className="font-semibold">Database: </span>
              <span className="font-mono font-medium">{dbStatus}</span>
            </div>
            {data?.enodeb_name && (
              <div className={`hidden sm:inline px-2 py-0.5 rounded border font-mono text-[11px] ${
                darkMode ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-600'
              }`}>
                eNodeB: {data.enodeb_name}
              </div>
            )}
          </div>
          <div>
            <span className="font-semibold">Total Records: </span>
            <span className="font-bold">
              {data?.total_records ? `${data.total_records.toLocaleString()} baris dari tabel measHy4g` : '0 baris'}
            </span>
          </div>
        </footer>

      </div>

      {/* Exact Apache ECharts graphic-loading animation */}
      {loading && <DataLoadingOverlay />}

    </div>
  );
}
