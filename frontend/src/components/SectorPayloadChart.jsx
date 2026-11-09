import React, { useRef, useEffect } from 'react';
import ReactECharts from '../lib/echarts';

// Distinct LTE Band palette (Tableau 10) optimized for high visual contrast across bands
export const BAND_COLORS = {
  // 4G LTE Bands
  'L1800': '#4e79a7',   // Blue
  'L900': '#f28e2b',    // Orange
  'L2100': '#e15759',   // Red
  'L2300_1': '#59a14f', // Green
  'L2300_2': '#76b7b2', // Light Teal
  'L2300_3': '#9c755f', // Brown
  'L700': '#edc948',    // Yellow
  'L2600': '#b07aa1',   // Purple
  'L2600_1': '#b07aa1',
  'L2600_2': '#b07aa1',
  'L2600_3': '#b07aa1',
  'L2600_4': '#b07aa1',
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

// Adjust brightness of a hex color (+percent lightens, -percent darkens)
export function adjustBrightness(hex, percent) {
  if (!hex || typeof hex !== 'string') return hex;
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  if (isNaN(num)) return hex;
  let r = (num >> 16);
  let g = ((num >> 8) & 0x00FF);
  let b = (num & 0x0000FF);

  if (percent > 0) {
    r = Math.min(255, Math.round(r + (255 - r) * percent));
    g = Math.min(255, Math.round(g + (255 - g) * percent));
    b = Math.min(255, Math.round(b + (255 - b) * percent));
  } else if (percent < 0) {
    const factor = 1 + percent;
    r = Math.max(0, Math.round(r * factor));
    g = Math.max(0, Math.round(g * factor));
    b = Math.max(0, Math.round(b * factor));
  }

  const toHex = (c) => c.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Color variants for carriers sharing a band (shades within the same hue)
export const BAND_COLOR_VARIANTS = {
  'L1800': ['#4e79a7', '#1d4ed8', '#60a5fa', '#1e3a8a', '#38bdf8', '#93c5fd'],
  'L900': ['#f28e2b', '#c2410c', '#fb923c', '#7c2d12', '#fdba74', '#ea580c'],
  'L2100': ['#e15759', '#991b1b', '#f87171', '#be123c', '#fca5a5', '#b91c1c'],
  'L2300_1': ['#59a14f', '#15803d', '#4ade80', '#14532d', '#86efac', '#16a34a'],
  'L2300_2': ['#76b7b2', '#0f766e', '#2dd4bf', '#134e4a', '#99f6e4', '#0d9488'],
  'L2300_3': ['#9c755f', '#78350f', '#d97706', '#451a03', '#fde68a', '#92400e'],
  'L700': ['#edc948', '#a16207', '#fde047', '#713f12', '#fef08a', '#ca8a04'],
  'L2600': ['#b07aa1', '#7e22ce', '#c084fc', '#581c87', '#e9d5ff', '#a855f7'],
  'L2600_1': ['#b07aa1', '#7e22ce', '#c084fc', '#581c87'],
  'L2600_2': ['#7e22ce', '#581c87', '#b07aa1', '#c084fc'],
  'L2600_3': ['#c084fc', '#581c87', '#b07aa1', '#7e22ce'],
  'L2600_4': ['#581c87', '#b07aa1', '#c084fc', '#7e22ce'],
  // 5G Bands & Carriers (Unchanged)
  'NR2300': ['#06b6d4', '#0e7490', '#22d3ee', '#164e63'],
  'NR2600': ['#8b5cf6', '#6d28d9', '#a78bfa', '#4c1d95'],
  'NR2100': ['#c084fc', '#9333ea', '#e879f9', '#6b21a8'],
  'NR3500': ['#ec4899', '#db2777', '#be185d', '#f472b6'],
  // 2G Bands & Carriers (Unchanged)
  'GSM': ['#f97316', '#c2410c', '#fb923c', '#7c2d12'],
  'G900': ['#f97316', '#c2410c', '#fb923c', '#7c2d12'],
  'DCS': ['#3b82f6', '#1d4ed8', '#0284c7', '#60a5fa'],
  'G1800': ['#3b82f6', '#1d4ed8', '#0284c7', '#60a5fa']
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
  if (upper.includes('SL') || upper.includes('ML') || upper.includes('QL') || upper.includes('IL') || upper.includes('VL') || upper.endsWith('L1') || upper.endsWith('L2') || upper.endsWith('L3')) return 'L1800';
  if (upper.includes('MR') || upper.includes('VR') || upper.includes('QR') || upper.includes('IR') || upper.endsWith('R1') || upper.endsWith('R2') || upper.endsWith('R3')) return 'L2100';
  if (upper.includes('MT') || upper.includes('VT') || upper.includes('QT') || upper.includes('IT') || upper.endsWith('T1') || upper.endsWith('T2') || upper.endsWith('T3')) return 'L900';
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

// Returns { color, lineType } for a carrier within its band (all lines solid, distinct shade per carrier)
export function getCarrierStyle(cName, carrierBands = {}, idxInBand = 0) {
  if (carrierBands && carrierBands[cName] === 'ENTITY') {
    return {
      color: ENTITY_PALETTE[idxInBand % ENTITY_PALETTE.length],
      lineType: 'solid'
    };
  }

  const rawBand = (carrierBands && carrierBands[cName]) ? carrierBands[cName] : getBandForCarrier(cName, carrierBands);
  const band = (rawBand && rawBand.startsWith('L2600')) ? 'L2600' : rawBand;

  const variants = BAND_COLOR_VARIANTS[band] || BAND_COLOR_VARIANTS[rawBand];
  let color;
  if (variants && variants.length > 0) {
    color = variants[idxInBand % variants.length];
  } else {
    color = BAND_COLORS[band] || BAND_COLORS[rawBand] || BAND_COLORS[cName] || '#4e79a7';
  }

  return { color, lineType: 'solid' };
}

export function getColorForCarrier(cName, carrierBands = {}, idxInBand = 0) {
  return getCarrierStyle(cName, carrierBands, idxInBand).color;
}

function SectorPayloadChart({
  title,
  unit = "GB",
  timestamps = [],
  carrierSeries = {},
  totalSeries = null,
  carrierBands = {},
  availableBands = null,
  hasTotal = false,
  bandFilter = "all",
  timeMode = "hourly",
  minY = null,
  maxY = null,
  darkMode = false,
  chartsPerRow = 3,
  markers = [],  // [{ date: 'YYYY-MM-DD', label }] activity markers drawn as vertical lines
  periods = [],  // [{ start, end, label, color }] shaded date windows (30% opacity, no border), e.g. before / after
  threshold = null, // { value: number, unit?: string }
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
    // Exclude bands not owned by the site
    if (availableBands && Array.isArray(availableBands) && availableBands.length > 0) {
      if (!carrierBands || carrierBands[cName] !== 'ENTITY') {
        const rawBand = (carrierBands && carrierBands[cName]) ? carrierBands[cName] : getBandForCarrier(cName, carrierBands);
        const b = rawBand.startsWith('L2600') ? 'L2600' : rawBand;
        if (!availableBands.includes(b) && !availableBands.includes(rawBand)) {
          return false;
        }
      }
    }
    if (!bandFilter || bandFilter === "all") return true;
    if (carrierBands && carrierBands[cName] === 'ENTITY') return true;
    const rawBand = (carrierBands && carrierBands[cName] && carrierBands[cName] !== 'ENTITY')
      ? carrierBands[cName]
      : getBandForCarrier(cName, carrierBands);
    // Band filter has a single 'L2600' option for carriers L2600_1..L2600_4
    const b = rawBand.startsWith('L2600') ? 'L2600' : rawBand;
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

  // Pre-calculate distinct color and line style for each carrier
  const bandCounts = {};
  const carrierStyleMap = {};
  const carrierColorMap = {};
  carrierKeys.forEach((cName, idx) => {
    let style;
    if (carrierBands && carrierBands[cName] === 'ENTITY') {
      style = {
        color: ENTITY_PALETTE[idx % ENTITY_PALETTE.length],
        lineType: 'solid'
      };
    } else {
      const rawBand = (carrierBands && carrierBands[cName]) ? carrierBands[cName] : getBandForCarrier(cName, carrierBands);
      const band = (rawBand && rawBand.startsWith('L2600')) ? 'L2600' : rawBand;
      const idxInBand = bandCounts[band] || 0;
      bandCounts[band] = idxInBand + 1;
      style = getCarrierStyle(cName, carrierBands, idxInBand);
    }
    carrierStyleMap[cName] = style;
    carrierColorMap[cName] = style.color;
    const displayName = getSeriesDisplayName(cName);
    carrierStyleMap[displayName] = style;
    carrierColorMap[displayName] = style.color;
  });

  // Build series in standard order: Carriers first (lines), Total last (area)
  const series = [];

  // 1. Carrier line curves with band hue + carrier line style pattern
  carrierKeys.forEach((cName) => {
    const style = carrierStyleMap[cName] || { color: '#4e79a7', lineType: 'solid' };
    const displayName = getSeriesDisplayName(cName);
    series.push({
      id: `carrier_${cName}`,
      name: displayName,
      rawName: cName,
      type: 'line',
      yAxisIndex: 0,
      smooth: true,
      showSymbol: false,
      emphasis: {
        scale: false
      },
      lineStyle: {
        width: 1.8,
        color: style.color,
        type: style.lineType
      },
      itemStyle: {
        color: style.color
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
      emphasis: {
        scale: false
      },
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

  // 3. Activity markers: dashed vertical line at the first timestamp of each marker date
  const markerLines = (markers || [])
    .map(m => {
      const x = (timestamps || []).find(t => String(t).startsWith(m.date));
      return x ? { xAxis: x, text: m.label || m.date } : null;
    })
    .filter(Boolean)
    // Labels sit horizontally above the plot; neighbours alternate between 2 rows so they never cover each other
    .map((m, i) => ({ xAxis: m.xAxis, label: { formatter: m.text, distance: [0, 4 + (i % 2) * 16] } }));
  if (markerLines.length > 0) {
    series.push({
      id: 'activity_markers',
      name: '__markers',
      type: 'line',
      data: [],
      silent: true,
      z: 20,
      markLine: {
        symbol: ['none', 'none'],
        silent: true,
        animation: false,
        lineStyle: { type: 'dashed', color: '#e11d48', width: 1.5 },
        label: {
          position: 'end',
          color: '#ffffff',
          backgroundColor: '#e11d48',
          borderRadius: 3,
          padding: [2, 4],
          fontSize: 8,
          fontWeight: 'bold'
        },
        data: markerLines
      }
    });
  }

  // 4. Shaded periods (Cluster Monitoring before / after windows)
  const periodAreas = (periods || [])
    .map(p => {
      const start = (timestamps || []).find(t => String(t) >= p.start);
      const end = [...(timestamps || [])].reverse().find(t => String(t).slice(0, 10) <= p.end);
      return start && end && start <= end ? { ...p, start, end } : null;
    })
    .filter(Boolean);
  if (periodAreas.length > 0) {
    series.push({
      id: 'period_areas',
      name: '__periods',
      type: 'line',
      data: [],
      silent: true,
      z: 0,
      markArea: {
        silent: true,
        animation: false,
        data: periodAreas.map(p => [
          {
            xAxis: p.start,
            name: p.label,
            itemStyle: { color: p.color, opacity: 0.3, borderWidth: 0 },
            label: { position: 'insideTop', color: p.color, fontSize: 9, fontWeight: 'bold' }
          },
          { xAxis: p.end }
        ])
      }
    });
  }

  // 5. Threshold line (PRB % or User Throughput Mbps)
  if (threshold && typeof threshold.value === 'number') {
    series.push({
      id: 'threshold_markline',
      name: '__threshold',
      type: 'line',
      data: [],
      silent: true,
      z: 15,
      markLine: {
        symbol: ['none', 'none'],
        silent: true,
        animation: false,
        lineStyle: {
          type: 'dashed',
          color: '#ef4444',
          opacity: 0.35,
          width: 1.5
        },
        label: {
          show: true,
          position: 'insideEndTop',
          formatter: `${threshold.value}${threshold.unit ? ` ${threshold.unit}` : ''}`,
          color: darkMode ? '#f87171' : '#ef4444',
          fontSize: 9,
          fontWeight: 'bold',
          padding: [2, 4]
        },
        data: [
          { yAxis: threshold.value }
        ]
      }
    });
  }

  // Legend data at bottom: hollow colored square matching Image 7 ([ ] L1800 ML-21)
  const legendData = [
    ...carrierKeys.map((cName) => {
      const color = carrierColorMap[cName] || '#3b82f6';
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

  // Estimate number of wrapped legend rows to adjust chart height and bottom grid
  const itemsPerLegendRow = chartsPerRow === 1 ? 8 : chartsPerRow === 2 ? 5 : chartsPerRow === 3 ? 4 : 3;
  const legendRows = Math.max(1, Math.ceil(legendData.length / itemsPerLegendRow));
  const extraRows = Math.max(0, legendRows - 1);
  const extraHeight = extraRows * 18;
  const chartHeight = 290 + extraHeight;
  const gridBottom = 55 + (extraRows * 18);

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
      max: (threshold && typeof threshold.value === 'number')
        ? (maxY !== null && maxY !== undefined
            ? Math.max(maxY, threshold.value)
            : (val) => Math.max(val.max, threshold.value))
        : (maxY !== null && maxY !== undefined ? maxY : undefined),
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
      name: `Total (${unit})`,
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
  const titleStr = typeof title === 'string' ? title : '';
  const isBdbh = titleStr.includes('[BDBH]') || titleStr.includes('(BDBH)');
  const cleanTitle = titleStr.replace(/\[BDBH\]|\(BDBH\)/gi, '').trim();

  // Identical smooth cubicInOut transition animation in both directions
  const option = {
    backgroundColor: darkMode ? 'transparent' : '#ffffff',
    animation: true,
    animationDuration: 300,
    animationDurationUpdate: 300,
    animationEasing: 'cubicOut',
    animationEasingUpdate: 'cubicOut',
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
      type: 'plain',
      bottom: 6,
      left: 'center',
      data: legendData,
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 14,
      textStyle: {
        color: darkMode ? '#e2e8f0' : '#475569',
        fontSize: 10,
        fontWeight: '500'
      }
    },
    // Tooltip strictly styled with standard band colors (Image 2 requirement)
    tooltip: {
      trigger: 'axis',
      confine: true, // "Tidak Terpotong": ensures tooltip is never clipped outside chart boundaries
      className: 'echarts-tooltip',
      transitionDuration: 0.1,
      axisPointer: {
        type: 'line',
        animation: false,
        snap: true,
        lineStyle: {
          color: darkMode ? '#64748b' : '#94a3b8',
          width: 1,
          type: 'dashed'
        }
      },
      backgroundColor: darkMode ? 'rgba(15, 23, 42, 0.96)' : 'rgba(15, 23, 42, 0.96)',
      borderColor: darkMode ? '#475569' : '#334155',
      borderWidth: 1,
      textStyle: {
        color: '#ffffff',
        fontSize: 12
      },
      padding: [8, 12],
      extraCssText: 'pointer-events: none !important; user-select: none; z-index: 50; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);',
      formatter: function (params) {
        if (!params || !params.length) return '';
        const rawTime = params[0].axisValue;
        const formattedTime = formatAxisDate(rawTime, timeMode);
        let html = `<div style="font-weight: 700; color: #f8fafc; margin-bottom: 6px; border-bottom: 1px solid #334155; padding-bottom: 3px; font-size: 11px;">${formattedTime}</div>`;
        
        // Filter out pseudo-series like markers or threshold
        const validParams = params.filter(p => p && p.seriesName !== '__markers' && p.seriesName !== '__threshold' && p.seriesName !== '__periods');
        
        // Separate Total Payload from carrier series so Total Payload stays at the bottom
        const totalItems = validParams.filter(p => p.seriesName === 'Total Payload' || p.seriesId === 'total_payload');
        const carrierItems = validParams.filter(p => p.seriesName !== 'Total Payload' && p.seriesId !== 'total_payload');
        
        // NO SORTING: Keep natural series order as requested!

        // "Tidak Terpotong": 2-column layout when more than 6 carriers so height remains compact (~120px) and fits comfortably inside chart
        const isMultiCol = carrierItems.length > 6;
        if (isMultiCol) {
          html += '<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 16px; row-gap: 2px;">';
        } else {
          html += '<div style="display: flex; flex-direction: column; gap: 2px;">';
        }

        carrierItems.forEach((p, pIdx) => {
          const bandColor = carrierColorMap[p.seriesName] || p.color || getColorForCarrier(p.seriesName, carrierBands, p.seriesIndex ?? pIdx);
          const displayName = p.seriesName;
          const val = (p.value !== null && p.value !== undefined && !isNaN(p.value)) ? p.value : '–';
          html += `
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 14px; font-size: 11px; padding: 1px 0;">
              <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
                <span style="display: inline-block; width: 8px; height: 8px; border-radius: 2px; background-color: ${bandColor}; shrink: 0;"></span>
                <span style="color: ${bandColor}; font-weight: 700; white-space: nowrap;">${displayName}:</span>
              </div>
              <span style="font-weight: 700; font-family: monospace; color: #ffffff; white-space: nowrap;">${val} ${unit}</span>
            </div>
          `;
        });
        html += '</div>';

        // Render Total Payload at bottom (full width)
        if (totalItems.length > 0) {
          totalItems.forEach(p => {
            const val = (p.value !== null && p.value !== undefined && !isNaN(p.value)) ? p.value : '–';
            html += `
              <div style="margin-top: 6px; padding-top: 4px; border-top: 1px solid #334155; display: flex; align-items: center; justify-content: space-between; gap: 16px; font-size: 11px;">
                <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
                  <span style="display: inline-block; width: 8px; height: 8px; border-radius: 2px; background-color: #f43f5e; shrink: 0;"></span>
                  <span style="color: #f43f5e; font-weight: 700; white-space: nowrap;">Total Payload:</span>
                </div>
                <span style="font-weight: 700; font-family: monospace; color: #ffffff; white-space: nowrap;">${val} ${unit}</span>
              </div>
            `;
          });
        }

        return html;
      }
    },
    grid: {
      top: markerLines.length > 1 ? 58 : markerLines.length ? 50 : 45,
      right: hasTotal ? 48 : 25,
      bottom: gridBottom,
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
      <div className="grow" style={{ minHeight: `${chartHeight}px` }}>
        <ReactECharts
          ref={echartsRef}
          option={option}
          style={{ height: `${chartHeight}px`, width: '100%' }}
          notMerge={true} // Eliminates ghost series/cache leaks when switching sites or toggling filters
          lazyUpdate={false}
        />
      </div>
    </div>
  );
}

// Re-render only when a prop really changes. `threshold` is rebuilt by the parent on every render,
// so it is compared by value; everything else by reference.
const sameThreshold = (a, b) => (a === b) || (!!a && !!b && a.value === b.value && a.unit === b.unit);
export default React.memo(SectorPayloadChart, (prev, next) => {
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const k of keys) {
    if (k === 'threshold' ? !sameThreshold(prev[k], next[k]) : prev[k] !== next[k]) return false;
  }
  return true;
});
