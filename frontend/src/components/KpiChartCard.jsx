import React from 'react';
import ReactECharts from 'echarts-for-react';

export default function KpiChartCard({
  title,
  unit,
  timestamps,
  seriesData,
  carriers,
  darkMode
}) {
  // Carrier color mapping
  const carrierColors = {
    'L1800': '#3b82f6',     // Blue
    'L2100': '#c084fc',     // Purple
    'L2300_1': '#22c55e',   // Green
    'L900': '#f97316',      // Orange
    'L700': '#eab308',      // Gold
    'L2600': '#ec4899',     // Pink
  };

  const getCarrierColor = (code) => {
    for (const [key, color] of Object.entries(carrierColors)) {
      if (code.startsWith(key)) return color;
    }
    return '#64748b';
  };

  const series = Object.keys(seriesData).map(carrierCode => ({
    name: carrierCode,
    type: 'line',
    smooth: true,
    showSymbol: false,
    lineStyle: {
      width: 1.8,
      color: getCarrierColor(carrierCode)
    },
    itemStyle: {
      color: getCarrierColor(carrierCode)
    },
    data: seriesData[carrierCode]
  }));

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      borderColor: '#334155',
      borderWidth: 1,
      textStyle: {
        color: '#f8fafc',
        fontSize: 11
      },
      padding: [8, 12],
      formatter: function (params) {
        if (!params || !params.length) return '';
        let html = `<div class="font-bold text-slate-200 mb-1 border-b border-slate-700 pb-1">${params[0].axisValue}</div>`;
        params.forEach(p => {
          html += `
            <div class="flex items-center justify-between gap-4 text-xs py-0.5">
              <span style="color: ${p.color}; font-weight: 600;">${p.seriesName}:</span>
              <span class="font-bold font-mono text-white">${p.value} ${unit}</span>
            </div>
          `;
        });
        return html;
      }
    },
    grid: {
      top: 24,
      right: 14,
      bottom: 48,
      left: 38,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: timestamps,
      boundaryGap: false,
      axisLine: { lineStyle: { color: darkMode ? '#334155' : '#e2e8f0' } },
      axisLabel: {
        color: darkMode ? '#94a3b8' : '#64748b',
        fontSize: 10,
        interval: Math.floor(timestamps.length / 5) || 1
      },
      splitLine: {
        show: true,
        lineStyle: { color: darkMode ? '#1e293b' : '#f1f5f9' }
      }
    },
    yAxis: {
      type: 'value',
      name: unit ? `${unit}` : '',
      nameTextStyle: {
        color: darkMode ? '#94a3b8' : '#64748b',
        fontSize: 10,
        padding: [0, 0, 0, 10]
      },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: darkMode ? '#94a3b8' : '#64748b',
        fontSize: 10
      },
      splitLine: {
        lineStyle: { color: darkMode ? '#1e293b' : '#f1f5f9' }
      }
    },
    legend: {
      bottom: 4,
      left: 'center',
      icon: 'rect',
      itemWidth: 12,
      itemHeight: 12,
      textStyle: {
        color: darkMode ? '#cbd5e1' : '#475569',
        fontSize: 11
      }
    },
    series: series
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-2xs hover:shadow-xs transition duration-200 overflow-hidden flex flex-col">
      {/* Card Header */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="font-bold text-slate-800 text-sm tracking-tight flex items-center gap-1.5">
          <span>{title}</span>
        </h3>
      </div>

      {/* Chart Canvas Area */}
      <div className="p-2 grow min-h-[260px] relative">
        <ReactECharts
          option={option}
          style={{ height: '260px', width: '100%' }}
          notMerge={true}
          lazyUpdate={true}
        />
      </div>
    </div>
  );
}
