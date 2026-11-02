import React, { useState } from 'react';
import { 
  Globe, 
  Network, 
  Building2, 
  FolderGit2, 
  Radio, 
  Antenna, 
  Camera, 
  FileSpreadsheet, 
  ChevronDown, 
  ChevronUp, 
  SlidersHorizontal,
  Check
} from 'lucide-react';

export default function FilterSection({
  siteId,
  setSiteId,
  sector,
  setSector,
  granularity,
  setGranularity,
  bdbh,
  setBdbh,
  splitBySector,
  setSplitBySector,
  chartsPerRow,
  setChartsPerRow,
  viewMode,
  setViewMode,
  selectedBands,
  setSelectedBands,
  selectedKpis,
  setSelectedKpis,
  filterType,
  setFilterType,
  onExportPng,
  onExportCsv
}) {
  const [showFilters, setShowFilters] = useState(true);
  const [bandDropdownOpen, setBandDropdownOpen] = useState(false);
  const [kpiDropdownOpen, setKpiDropdownOpen] = useState(false);

  // Available bands from Band_LTE skill
  const ALL_BANDS = ["L700", "L900", "L1800", "L2100", "L2300_1", "L2300_2", "L2600_1"];

  // Available KPIs
  const ALL_KPIS = [
    { key: "payload", name: "Payload (GB)" },
    { key: "max_rrc", name: "Max RRC User (Users)" },
    { key: "availability", name: "Availability (%)" },
    { key: "dl_prb", name: "DL PRB (%)" },
    { key: "dl_thp", name: "User DL Thp (Mbps)" },
    { key: "cqi", name: "CQI" },
  ];

  const toggleBand = (b) => {
    if (selectedBands.includes(b)) {
      if (selectedBands.length > 1) {
        setSelectedBands(selectedBands.filter(x => x !== b));
      }
    } else {
      setSelectedBands([...selectedBands, b]);
    }
  };

  const toggleKpi = (k) => {
    if (selectedKpis.includes(k)) {
      if (selectedKpis.length > 1) {
        setSelectedKpis(selectedKpis.filter(x => x !== k));
      }
    } else {
      setSelectedKpis([...selectedKpis, k]);
    }
  };

  return (
    <div className="bg-white border-b border-slate-200 px-6 py-3.5 space-y-3 shrink-0 select-none shadow-xs">
      
      {/* Top Scope Tabs & Hide/Show button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-blue-600" />
          <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Filters & KPI Selection
          </h2>
        </div>

        <button 
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition"
        >
          <span>{showFilters ? 'Hide Filters' : 'Show Filters'}</span>
          {showFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Scope Hierarchy Buttons (Pills) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-medium">
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition shrink-0">
          <Globe className="w-3.5 h-3.5" />
          <span>Regional</span>
        </button>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition shrink-0">
          <Network className="w-3.5 h-3.5" />
          <span>NOP</span>
        </button>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition shrink-0">
          <Building2 className="w-3.5 h-3.5" />
          <span>City</span>
        </button>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition shrink-0">
          <FolderGit2 className="w-3.5 h-3.5" />
          <span>Subnet</span>
        </button>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition shrink-0">
          <Radio className="w-3.5 h-3.5" />
          <span>Site</span>
        </button>
        {/* Active Sector Scope */}
        <button className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-50 text-blue-600 font-semibold border border-blue-200 shrink-0 shadow-xs">
          <Antenna className="w-3.5 h-3.5 text-blue-600" />
          <span>Sector</span>
        </button>
      </div>

      {/* View & Aggregation Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-100 text-xs">
        
        {/* Left Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Chart / Table View Mode */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              onClick={() => setViewMode('chart')}
              className={`px-3 py-1 rounded-md font-medium transition ${
                viewMode === 'chart' 
                  ? 'bg-white text-blue-600 shadow-xs font-semibold' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Chart
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1 rounded-md font-medium transition ${
                viewMode === 'table' 
                  ? 'bg-white text-blue-600 shadow-xs font-semibold' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Table
            </button>
          </div>

          {/* BDBH Toggle */}
          <button
            onClick={() => setBdbh(!bdbh)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium border transition ${
              bdbh 
                ? 'bg-amber-50 text-amber-700 border-amber-300 font-semibold shadow-xs' 
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${bdbh ? 'bg-amber-500' : 'bg-slate-300'}`}></span>
            <span>BDBH</span>
          </button>

          {/* Daily / Hourly Granularity Toggle */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              onClick={() => setGranularity('daily')}
              className={`px-3 py-1 rounded-md font-medium transition ${
                granularity === 'daily' 
                  ? 'bg-white text-blue-600 shadow-xs font-semibold' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Daily
            </button>
            <button
              onClick={() => setGranularity('hourly')}
              className={`px-3 py-1 rounded-md font-medium transition ${
                granularity === 'hourly' 
                  ? 'bg-white text-blue-600 shadow-xs font-semibold' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Hourly
            </button>
          </div>

          {/* Combined / Split by Sector Toggle */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              onClick={() => setSplitBySector(false)}
              className={`px-2.5 py-1 rounded-md font-medium transition ${
                !splitBySector 
                  ? 'bg-white text-blue-600 shadow-xs font-semibold' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Combined
            </button>
            <button
              onClick={() => setSplitBySector(true)}
              className={`px-2.5 py-1 rounded-md font-medium transition ${
                splitBySector 
                  ? 'bg-white text-blue-600 shadow-xs font-semibold' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Split by Sector
            </button>
          </div>

          {/* Charts / Row (1, 2, 3) */}
          <div className="flex items-center gap-1 text-slate-500 font-medium pl-1">
            <span>Charts / Row:</span>
            {[1, 2, 3].map(num => (
              <button
                key={num}
                onClick={() => setChartsPerRow(num)}
                className={`w-6 h-6 rounded flex items-center justify-center font-semibold text-xs transition ${
                  chartsPerRow === num
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {num}
              </button>
            ))}
          </div>
        </div>

        {/* Action Buttons (Export PNG & CSV) */}
        <div className="flex items-center gap-2">
          <button
            onClick={onExportPng}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-medium transition shadow-xs cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Export PNG</span>
          </button>
          <button
            onClick={onExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-medium transition shadow-xs cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>

      </div>

      {/* Filter Dropdown Row */}
      {showFilters && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 pt-2 border-t border-slate-100 text-xs">
          
          {/* SELECT SITES */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Select Sites
            </label>
            <div className="relative">
              <select
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                className="w-full appearance-none bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 pr-8"
              >
                <option value="SON002">SON002</option>
                <option value="COI350">COI350</option>
                <option value="GTO077">GTO077</option>
                <option value="GTO186">GTO186</option>
                <option value="UPD012">UPD012</option>
                <option value="UPD014">UPD014</option>
                <option value="MKS001">MKS001</option>
                <option value="PLU001">PLU001</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>

          {/* FILTER SECTOR */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Filter Sector
            </label>
            <div className="relative">
              <select
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                className="w-full appearance-none bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 pr-8"
              >
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="8">8</option>
                <option value="All">All Sectors</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>

          {/* FILTER BAND (Multi-select dropdown) */}
          <div className="relative">
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Filter Band
            </label>
            <button
              type="button"
              onClick={() => setBandDropdownOpen(!bandDropdownOpen)}
              className="w-full flex items-center justify-between bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-slate-800 font-medium text-left"
            >
              <span>{selectedBands.length} selected</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {bandDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-lg z-30 p-2 space-y-1">
                {ALL_BANDS.map(b => (
                  <label key={b} className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 rounded cursor-pointer text-xs">
                    <input 
                      type="checkbox" 
                      checked={selectedBands.includes(b)} 
                      onChange={() => toggleBand(b)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="font-medium text-slate-700">{b}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* FILTER KPI (Multi-select dropdown) */}
          <div className="relative">
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Filter KPI
            </label>
            <button
              type="button"
              onClick={() => setKpiDropdownOpen(!kpiDropdownOpen)}
              className="w-full flex items-center justify-between bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-slate-800 font-medium text-left"
            >
              <span>{selectedKpis.length} selected</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {kpiDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-30 p-2 space-y-1">
                {ALL_KPIS.map(k => (
                  <label key={k.key} className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 rounded cursor-pointer text-xs">
                    <input 
                      type="checkbox" 
                      checked={selectedKpis.includes(k.key)} 
                      onChange={() => toggleKpi(k.key)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="font-medium text-slate-700">{k.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* FILTER TYPE */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Filter Type
            </label>
            <div className="relative">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="w-full appearance-none bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 pr-8"
              >
                <option value="Macro">Macro</option>
                <option value="Micro">Micro</option>
                <option value="Indoor">Indoor</option>
                <option value="All">All Types</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
