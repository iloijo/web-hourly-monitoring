import React from 'react';
import { 
  BarChart2, 
  Clock, 
  Palette, 
  Moon, 
  Sun, 
  Maximize, 
  Database,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export default function TopHeader({ dbStatus, lastDate = "2026-10-30", darkMode, setDarkMode }) {
  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 select-none">
      {/* Title & Subtitle */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-slate-900 tracking-tight">4G Monitoring</h1>
          {/* TwoDb status indicator pill */}
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            <span>TwoDb Online (5434)</span>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-0.5">
          Hourly KPI trend — Regional / NOP / City / Subnet / Site
        </p>
      </div>

      {/* Right Controls & User Info */}
      <div className="flex items-center gap-3">
        {/* Aggregated badge */}
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-100">
          <BarChart2 className="w-3.5 h-3.5 text-blue-600" />
          <span>Hourly Aggregated</span>
        </div>

        {/* Last update date badge */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 text-slate-600 text-xs font-medium border border-slate-200">
          <Clock className="w-3.5 h-3.5 text-blue-500" />
          <span>Last: <strong className="font-semibold text-slate-800">{lastDate}</strong></span>
        </div>

        {/* Theme palette icon */}
        <button 
          title="Theme palette"
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
        >
          <Palette className="w-4 h-4" />
        </button>

        {/* Dark mode toggle */}
        <button 
          onClick={() => setDarkMode(!darkMode)}
          title="Toggle Dark Mode"
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
        >
          {darkMode ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Fullscreen toggle */}
        <button 
          onClick={toggleFullScreen}
          title="Toggle Fullscreen"
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
        >
          <Maximize className="w-4 h-4" />
        </button>

        {/* Profile Avatar Badge */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold uppercase shadow-sm">
            OS
          </div>
          <span className="text-xs font-medium text-slate-700 hidden md:inline">oss</span>
        </div>
      </div>
    </header>
  );
}
