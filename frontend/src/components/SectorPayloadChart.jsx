import React, { useRef, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';

// Standard LTE Band color mapping strictly adhering to Band_LTE skill & Image 7 reference
export const BAND_COLORS = {
  'L1800': '#3b82f6',   // Vivid Royal Blue (ML, SL, QL, IL)
  'L2100': '#c084fc',   // Vivid Purple / Magenta (MR, VR, QR, IR)
  'L900': '#f97316',    // Vivid Orange (MT)
  'L2300_1': '#22c55e', // Vivid Emerald Green (ME, VE, QE, IE)
  'L2300_2': '#14b8a6', // Teal (MF, VF, QF, IF)
  'L2300_3': '#06b6d4', // Cyan (VV, QV)
  'L700': '#eab308',    // Gold / Amber (MD, VD)
  'L2600': '#ec4899',   // Pink (MG, VG)
  'L2600_1': '#ec4899',
  'L2600_2': '#db2777',
  'L2600_3': '#be185d',
  'L2600_4': '#9d174d',
  // 5G Bands & Carriers
  'NR2300': '#06b6d4',  // Cyan
  'NR2600': '#8b5cf6',  // Violet
  'NR2100': '#c084fc',  // Purple
  'NR3500': '#ec4899',  // Pink
  'VP1': '#06b6d4',     // Cyan
  'VQ1': '#3b82f6',     // Blue
  'MK1': '#10b981',     // Emerald
  'QP1': '#f59e0b',     // Amber
  // 2G Bands & Carriers
  'GSM': '#f97316',     // Vivid Orange (G900)
  'DCS': '#3b82f6',     // Vivid Blue (G1800)
  'G900': '#f97316',
  'G1800': '#3b82f6',
  'MD1': '#f97316',
  'MG1': '#3b82f6'
};

const MONTH_NAMES_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// Formats timestamp to match Image 7: "16 Okt 00:00" or "16 Okt"
export function formatAxisDate(val, timeMode = 'hourly') {
  if (!val) return '';
  const parts = String(val).trim().split(' ');
  const dateParts = parts[0].split('-');
  if (dateParts.length < 3) return val;
  const day = dateParts[2];
  const monthIdx = parseInt(dateParts[1], 10) - 1;
  const monthName = MONTH_NAMES_ID[monthIdx] || dateParts[1];

  if (timeMode === 'daily' || !parts[1]) {
    return `${day} ${monthName}`;
  }

  const time = parts[1].slice(0, 5); // "00:00"
  return `${day} ${monthName} ${time}`;
}

export function getBandForCarrier(cName, carrierBands = {}) {
  if (carrierBands && carrierBands[cName]) {
    return carrierBands[cName];
  }
  const upper = cName.toUpperCase();
  if (upper.includes('SL') || upper.includes('ML') || upper.includes('QL') || upper.includes('IL') || upper.endsWith('L1') || upper.endsWith('L2') || upper.endsWith('L3')) return 'L1800';
  if (upper.includes('MR') || upper.includes('VR') || upper.includes('QR') || upper.includes('IR') || upper.endsWith('R1') || upper.endsWith('R2') || upper.endsWith('R3')) return 'L2100';
  if (upper.includes('MT') || upper.endsWith('T1') || upper.endsWith('T2') || upper.endsWith('T3')) return 'L900';
  if (upper.includes('ME') || upper.includes('VE') || upper.includes('QE') || upper.includes('IE') || upper.endsWith('E1') || upper.endsWith('E2') || upper.endsWith('E3')) return 'L2300_1';
  if (upper.includes('MF') || upper.includes('VF') || upper.includes('QF') || upper.includes('IF') || upper.endsWith('F1') || upper.endsWith('F2') || upper.endsWith('F3')) return 'L2300_2';
  if (upper.includes('VV') || upper.includes('QV') || upper.endsWith('V1') || upper.endsWith('V2') || upper.endsWith('V3')) return 'L2300_3';
  if (upper.includes('MD') || upper.includes('VD')) return 'L700';
  if (upper.includes('MG') || upper.includes('VG')) return 'L2600';
  if (upper.includes('VP') || upper.includes('VQ') || upper.includes('NR') || upper.includes('5G')) return 'NR2300';
  if (upper.includes('DCS') || upper.includes('GSM') || upper.includes('2G')) return upper.includes('DCS') ? 'DCS' : 'GSM';
  return 'L1800';
}

export const ENTITY_PALETTE = [
  '#3b82f6', // Vivid Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#6366f1', // Indigo
  '#14b8a6', // Teal
  '#e11d48'  // Rose
];

export function getColorForCarrier(cName, carrierBands = {}, idx = 0) {
  if (carrierBands && carrierBands[cName] === 'ENTITY') {
    return ENTITY_PALETTE[idx % ENTITY_PALETTE.length];
  }
  if (BAND_COLORS[cName]) {
    return BAND_COLORS[cName];
  }
  const band = getBandForCarrier(cName, carrierBands);
  return BAND_COLORS[band] || ENTITY_PALETTE[idx % ENTITY_PALETTE.length];
}

export default function SectorPayloadChart({
  title,
  unit = "GB",
  timestamps = [],
  carrierSeries = {},
  totalSeries = null,
  carrierBands = {},
  hasTotal = false,
  bandFilter = "all",
  timeMode = "hourly",
  minY = null,
  maxY = null,
  darkMode = false,
  chartsPerRow = 3
}) {
  const echartsRef = useRef(null);

  // Smooth chart resize when chartsPerRow changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (echartsRef.current) {
        const inst = echartsRef.current.getEchartsInstance();
        if (inst) {
          inst.resize({ animation: { duration: 300, easing: 'cubicInOut' } });
        }
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [chartsPerRow]);

  const allCarrierKeys = Object.keys(carrierSeries || {});
  
  // Filter carriers based on bandFilter (can be string 'all' or array of selected bands)
  const carrierKeys = allCarrierKeys.filter(cName => {
    if (!bandFilter || bandFilter === "all") return true;
    if (carrierBands && carrierBands[cName] === 'ENTITY') return true;
    const b = (carrierBands && carrierBands[cName] && carrierBands[cName] !== 'ENTITY')
      ? carrierBands[cName]
      : getBandForCarrier(cName, carrierBands);
    if (Array.isArray(bandFilter)) {
      return bandFilter.includes(b);
    }
    return b.toLowerCase() === bandFilter.toLowerCase();
  });

  // Helper to format clean display name for series and legend
  const getSeriesDisplayName = (cName) => {
    if (carrierBands && carrierBands[cName]) {
      if (carrierBands[cName] === 'ENTITY' || carrierBands[cName] === cName) {
        return cName;
      }
      return `${carrierBands[cName]} ${cName}`;
    }
    if (cName.startsWith('L') && BAND_COLORS[cName]) {
      return cName;
    }
    const b = getBandForCarrier(cName, carrierBands);
    return `${b} ${cName}`;
  };

  // Calculate dynamic Total strictly based on filtered bands
  let dynamicTotal = [];
  if (hasTotal && timestamps.length > 0) {
    dynamicTotal = timestamps.map((_, idx) => {
      let sum = 0;
      carrierKeys.forEach(cName => {
        const v = carrierSeries[cName]?.[idx];
        if (typeof v === 'number') sum += v;
      });
      return Number(sum.toFixed(2));
    });
  }

  // Build series in standard order: Carriers first (lines), Total last (area)
  const series = [];

  // 1. Carrier line curves
  carrierKeys.forEach((cName, idx) => {
    const color = getColorForCarrier(cName, carrierBands, idx);
    const displayName = getSeriesDisplayName(cName);
    series.push({
      id: `carrier_${cName}`,
      name: displayName,
      rawName: cName,
      type: 'line',
      yAxisIndex: 0,
      smooth: true,
      showSymbol: false,
      lineStyle: {
        width: 1.8,
        color: color
      },
      itemStyle: {
        color: color
      },
      data: carrierSeries[cName] || []
    });
  });

  // 2. Total Payload (Right Axis, soft rose area) if requested
  if (hasTotal && dynamicTotal.length > 0) {
    series.push({
      id: 'total_payload',
      name: 'Total Payload',
      rawName: 'Total Payload',
      type: 'line',
      yAxisIndex: 1,
      smooth: true,
      showSymbol: false,
      lineStyle: {
        width: 1.5,
        color: '#f43f5e'
      },
      areaStyle: {
        color: darkMode ? 'rgba(244, 63, 94, 0.25)' : 'rgba(254, 205, 211, 0.40)'
      },
      itemStyle: {
        color: '#f43f5e'
      },
      data: dynamicTotal
    });
  }

  // Legend data at bottom: hollow colored square matching Image 7 ([ ] L1800 ML-21)
  const legendData = [
    ...carrierKeys.map((cName, idx) => {
      const color = getColorForCarrier(cName, carrierBands, idx);
      const displayName = getSeriesDisplayName(cName);
      return {
        name: displayName,
        icon: 'rect',
        itemStyle: {
          color: 'transparent',
          borderColor: color,
          borderWidth: 2
        }
      };
    })
  ];

  if (hasTotal && dynamicTotal.length > 0) {
    legendData.push({
      name: 'Total Payload',
      icon: 'rect',
      itemStyle: {
        color: 'rgba(244, 63, 94, 0.35)',
        borderColor: '#f43f5e',
        borderWidth: 2
      }
    });
  }

  // Y-axis configuration
  const yAxisList = [
    {
      type: 'value',
      name: unit,
      nameLocation: 'middle',
      nameGap: 28,
      nameTextStyle: {
        color: darkMode ? '#cbd5e1' : '#64748b',
        fontSize: 10,
        fontWeight: '600'
      },
      scale: true, // Axis does not always start from 0; auto-scales to data bounds (Gambar 1 Fix)
      min: (minY !== null && minY !== undefined && minY !== 0) ? minY : undefined,
      max: maxY !== null && maxY !== undefined ? maxY : undefined,
      axisLine: { show: true, lineStyle: { color: darkMode ? '#475569' : '#cbd5e1' } },
      axisTick: { show: true },
      axisLabel: {
        color: darkMode ? '#cbd5e1' : '#64748b',
        fontSize: 9
      },
      splitLine: {
        lineStyle: { color: darkMode ? 'rgba(148, 163, 184, 0.15)' : '#f1f5f9' }
      }
    }
  ];

  // Right Y-axis for Total Payload
  if (hasTotal) {
    yAxisList.push({
      type: 'value',
      name: 'Total (GB)',
      nameLocation: 'middle',
      nameGap: 30,
      nameTextStyle: {
        color: darkMode ? '#cbd5e1' : '#64748b',
        fontSize: 10,
        fontWeight: '600'
      },
      axisLine: { show: true, lineStyle: { color: darkMode ? '#475569' : '#cbd5e1' } },
      axisTick: { show: true },
      axisLabel: {
        color: darkMode ? '#cbd5e1' : '#64748b',
        fontSize: 9
      },
      splitLine: { show: false }
    });
  }

  // Calculate clean tick interval for horizontal X-axis labels
  const tsLen = timestamps?.length || 1;
  const labelInterval = Math.max(1, Math.floor((tsLen - 1) / 3));

  // Check for BDBH remark in title
  const isBdbh = title.includes('[BDBH]') || title.includes('(BDBH)');
  const cleanTitle = title.replace(/\[BDBH\]|\(BDBH\)/gi, '').trim();

  // Identical smooth cubicInOut transition animation in both directions
  const option = {
    backgroundColor: darkMode ? 'transparent' : '#ffffff',
    animation: true,
    animationDuration: 500,
    animationDurationUpdate: 500,
    animationEasing: 'cubicInOut',
    animationEasingUpdate: 'cubicInOut',
    title: [
      {
        text: `{bold|${cleanTitle}}`,
        left: 14,
        top: 10,
        textStyle: {
          rich: {
            bold: {
              fontSize: 13,
              fontWeight: 700,
              color: darkMode ? '#ffffff' : '#0f172a',
              fontFamily: 'Inter, system-ui, sans-serif'
            }
          }
        }
      },
      ...(isBdbh ? [{
        text: '(BDBH)',
        right: 14,
        top: 11,
        textStyle: {
          fontSize: 10,
          fontWeight: 700,
          color: darkMode ? '#f97316' : '#94a3b8',
          fontFamily: 'Inter, system-ui, sans-serif'
        }
      }] : [])
    ],
    // Legend positioned at bottom, well below X-axis labels to completely eliminate overlap
    legend: {
      type: 'scroll',
      bottom: 8,
      left: 'center',
      data: legendData,
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 14,
      pageIconSize: 10,
      pageTextStyle: {
        fontSize: 10,
        color: darkMode ? '#cbd5e1' : '#64748b'
      },
      textStyle: {
        color: darkMode ? '#e2e8f0' : '#475569',
        fontSize: 10,
        fontWeight: '500'
      }
    },
    // Tooltip strictly styled with standard band colors (Image 2 requirement)
    tooltip: {
      trigger: 'axis',
      backgroundColor: darkMode ? 'rgba(15, 23, 42, 0.96)' : 'rgba(15, 23, 42, 0.96)',
      borderColor: darkMode ? '#475569' : '#334155',
      borderWidth: 1,
      textStyle: {
        color: '#ffffff',
        fontSize: 12
      },
      padding: [10, 14],
      formatter: function (params) {
        if (!params || !params.length) return '';
        const rawTime = params[0].axisValue;
        const formattedTime = formatAxisDate(rawTime, timeMode);
        let html = `<div style="font-weight: 700; color: #f8fafc; margin-bottom: 8px; border-bottom: 1px solid #334155; padding-bottom: 4px; font-size: 11px;">${formattedTime}</div>`;
        
        params.forEach((p, pIdx) => {
          const isTotal = p.seriesName === 'Total Payload';
          const bandColor = isTotal ? '#f43f5e' : (p.color || getColorForCarrier(p.seriesName, carrierBands, p.seriesIndex ?? pIdx));
          const displayName = p.seriesName;
          html += `
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 20px; font-size: 11px; padding: 2px 0;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="display: inline-block; width: 8px; height: 8px; border-radius: 2px; background-color: ${bandColor};"></span>
                <span style="color: ${bandColor}; font-weight: 700;">${displayName}:</span>
              </div>
              <span style="font-weight: 700; font-family: monospace; color: #ffffff;">${p.value} ${unit}</span>
            </div>
          `;
        });
        return html;
      }
    },
    grid: {
      top: 45,
      right: hasTotal ? 48 : 25,
      bottom: 60, // 60px bottom padding ensures X-axis and legend never overlap
      left: 45,
      containLabel: false
    },
    xAxis: {
      type: 'category',
      data: timestamps || [],
      boundaryGap: false,
      axisLine: { lineStyle: { color: darkMode ? '#475569' : '#cbd5e1' } },
      axisTick: { show: true },
      axisLabel: {
        color: darkMode ? '#cbd5e1' : '#64748b',
        fontSize: 10,
        rotate: 0, // Clean horizontal labels matching Image 7
        margin: 12,
        showMinLabel: true,
        showMaxLabel: true,
        interval: labelInterval,
        formatter: (val) => formatAxisDate(val, timeMode)
      },
      splitLine: {
        show: true,
        lineStyle: { color: darkMode ? 'rgba(148, 163, 184, 0.15)' : '#f1f5f9' }
      }
    },
    yAxis: yAxisList,
    series: series
  };

  return (
    <div className={`rounded-2xl border shadow-xs hover:shadow-md transition-all duration-300 overflow-hidden flex flex-col p-2 ${
      darkMode ? 'bg-slate-850 bg-slate-800/90 border-slate-700/80 shadow-md' : 'bg-white border-slate-200/90'
    }`}>
      <div className="grow min-h-[290px]">
        <ReactECharts
          ref={echartsRef}
          option={option}
          style={{ height: '290px', width: '100%' }}
          notMerge={true} // Eliminates ghost series/cache leaks when switching sites or toggling filters
          lazyUpdate={false}
        />
      </div>
    </div>
  );
}
