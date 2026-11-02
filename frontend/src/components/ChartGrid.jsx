import React from 'react';
import KpiChartCard from './KpiChartCard';

export default function ChartGrid({
  data,
  chartsPerRow = 3,
  selectedKpis = ["payload", "max_rrc", "availability", "dl_prb", "dl_thp", "cqi"],
  darkMode = false,
  loading = false
}) {
  if (loading || !data || !data.kpis) {
    return (
      <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="h-72 bg-white rounded-xl border border-slate-200 animate-pulse p-4">
            <div className="h-4 bg-slate-200 rounded w-1/3 mb-4"></div>
            <div className="h-52 bg-slate-100 rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  // Column layout grid class based on chartsPerRow
  const getGridColsClass = () => {
    if (chartsPerRow === 1) return 'grid-cols-1';
    if (chartsPerRow === 2) return 'grid-cols-1 lg:grid-cols-2';
    return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
  };

  const { timestamps, carriers, kpis } = data;

  return (
    <div className="p-6 space-y-6">
      {/* Dynamic Grid Layout */}
      <div className={`grid ${getGridColsClass()} gap-4`}>
        {selectedKpis.map(kpiKey => {
          const kpi = kpis[kpiKey];
          if (!kpi) return null;

          return (
            <KpiChartCard
              key={kpiKey}
              title={kpi.title}
              unit={kpi.unit}
              timestamps={timestamps}
              seriesData={kpi.series}
              carriers={carriers}
              darkMode={darkMode}
            />
          );
        })}
      </div>
    </div>
  );
}
