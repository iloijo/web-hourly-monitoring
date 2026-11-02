import React, { useState } from 'react';
import { 
  Home, 
  TrendingUp, 
  Activity, 
  BarChart3, 
  Cpu, 
  Target, 
  Clock, 
  Radio, 
  Wifi, 
  ChevronDown, 
  ChevronRight, 
  PanelLeftClose, 
  PanelLeft,
  Layers
} from 'lucide-react';

export default function Sidebar({ collapsed, setCollapsed }) {
  const [networkKpiOpen, setNetworkKpiOpen] = useState(true);

  return (
    <aside 
      className={`bg-white border-r border-slate-200 transition-all duration-300 flex flex-col justify-between shrink-0 select-none z-20 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div>
        <div className="h-16 flex items-center px-4 border-b border-slate-100 gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-200 shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <h1 className="font-bold text-slate-900 text-base leading-tight tracking-tight">NetKPI</h1>
              <p className="text-xs text-slate-400 font-medium">Monitor v3.8</p>
            </div>
          )}
        </div>

        {/* Navigation Links */}
        <div className="py-4 px-2 space-y-6 overflow-y-auto max-h-[calc(100vh-8rem)]">
          
          {/* Overview Section */}
          <div>
            {!collapsed && (
              <p className="px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Overview
              </p>
            )}
            <ul className="space-y-1">
              <li>
                <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 text-xs font-medium transition">
                  <Home className="w-4 h-4 shrink-0" />
                  {!collapsed && <span>Home</span>}
                </button>
              </li>
              <li>
                <button className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 text-xs font-medium transition">
                  <div className="flex items-center gap-3">
                    <TrendingUp className="w-4 h-4 shrink-0" />
                    {!collapsed && <span>Productivity</span>}
                  </div>
                  {!collapsed && <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                </button>
              </li>
            </ul>
          </div>

          {/* Network KPI Section */}
          <div>
            {!collapsed && (
              <p className="px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Network KPI
              </p>
            )}
            <ul className="space-y-1">
              <li>
                <button 
                  onClick={() => setNetworkKpiOpen(!networkKpiOpen)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-blue-50/70 text-blue-600 text-xs font-semibold transition"
                >
                  <div className="flex items-center gap-3">
                    <Activity className="w-4 h-4 shrink-0" />
                    {!collapsed && <span>KPI Monitoring</span>}
                  </div>
                  {!collapsed && (
                    networkKpiOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />
                  )}
                </button>

                {/* Submenu */}
                {networkKpiOpen && !collapsed && (
                  <ul className="mt-1 pl-7 space-y-1 text-xs">
                    <li>
                      <button className="w-full text-left py-1.5 px-3 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition">
                        2G Monitoring
                      </button>
                    </li>
                    <li>
                      <button className="w-full flex items-center gap-2 py-1.5 px-3 rounded bg-blue-50 text-blue-600 font-semibold transition">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                        4G Monitoring
                      </button>
                    </li>
                    <li>
                      <button className="w-full text-left py-1.5 px-3 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition">
                        5G Monitoring
                      </button>
                    </li>
                  </ul>
                )}
              </li>

              <li>
                <button className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 text-xs font-medium transition">
                  <div className="flex items-center gap-3">
                    <Radio className="w-4 h-4 shrink-0" />
                    {!collapsed && <span>WPC Monitoring</span>}
                  </div>
                  {!collapsed && <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                </button>
              </li>

              <li>
                <button className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 text-xs font-medium transition">
                  <div className="flex items-center gap-3">
                    <BarChart3 className="w-4 h-4 shrink-0" />
                    {!collapsed && <span>Dashboard</span>}
                  </div>
                  {!collapsed && <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                </button>
              </li>

              <li>
                <button className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 text-xs font-medium transition">
                  <div className="flex items-center gap-3">
                    <Cpu className="w-4 h-4 shrink-0" />
                    {!collapsed && <span>Capacity</span>}
                  </div>
                  {!collapsed && <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                </button>
              </li>

              <li>
                <button className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 text-xs font-medium transition">
                  <div className="flex items-center gap-3">
                    <Target className="w-4 h-4 shrink-0" />
                    {!collapsed && <span>OKR</span>}
                  </div>
                  {!collapsed && <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                </button>
              </li>
            </ul>
          </div>

          {/* Others Section */}
          <div>
            {!collapsed && (
              <p className="px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Others
              </p>
            )}
            <ul className="space-y-1">
              <li>
                <button className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 text-xs font-medium transition">
                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 shrink-0" />
                    {!collapsed && <span>Timing Advance</span>}
                  </div>
                  {!collapsed && <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                </button>
              </li>
              <li>
                <button className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 text-xs font-medium transition">
                  <div className="flex items-center gap-3">
                    <Wifi className="w-4 h-4 shrink-0" />
                    {!collapsed && <span>Coverage</span>}
                  </div>
                  {!collapsed && <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                </button>
              </li>
            </ul>
          </div>

        </div>
      </div>

      {/* Footer Collapse Button */}
      <div className="p-3 border-t border-slate-100">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 text-xs font-medium transition"
        >
          {collapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4 shrink-0" />}
          {!collapsed && <span>Collapse sidebar</span>}
        </button>
      </div>
    </aside>
  );
}
