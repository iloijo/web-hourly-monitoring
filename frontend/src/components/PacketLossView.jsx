import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactECharts from '../lib/echarts';
import { 
  Globe, 
  Network, 
  Building2, 
  MapPin, 
  Radio, 
  SlidersHorizontal,
  Calendar, 
  Search, 
  RotateCw, 
  Download, 
  FileSpreadsheet, 
  ChevronDown, 
  Check, 
  Activity, 
  Clock, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle,
  Layers,
  ArrowUpRight,
  X
} from 'lucide-react';
import { formatAxisDate } from './SectorPayloadChart';
import MultiSelectDropdown from './MultiSelectDropdown';
import { objectRowsSheet } from '../api/export';

// Aggregation scopes matching Gambar 2
const AGGREGATION_SCOPES = [
  { id: 'regional', label: 'Regional', icon: Globe },
  { id: 'nop', label: 'NOP', icon: Network },
  { id: 'city', label: 'City/Kabupaten', icon: Building2 },
  { id: 'kecamatan', label: 'Kecamatan', icon: MapPin },
  { id: 'site', label: 'Site', icon: Radio },
];

const ENTITY_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', 
  '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#6366f1', 
  '#84cc16', '#a855f7', '#64748b'
];

export default function PacketLossView({
  darkMode = false,
  allSites = [],
  siteNamesMap = {},
  hierarchyData = { nops: [], tree: {}, site_map: {}, sites: [] },
  onExportData = null
}) {
  // 1. Dates
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

  // 2. Scope selection (Regional | NOP | City/Kabupaten | Kecamatan | Site)
  const [scope, setScope] = useState('nop');

  // 3. Entity selections for higher scopes
  const [selectedNops, setSelectedNops] = useState([
    'MAKASSAR', 'MANADO', 'PALU', 'PARE-PARE', 'KENDARI'
  ]);
  const [parentNopForCity, setParentNopForCity] = useState('ALL');
  const [selectedCities, setSelectedCities] = useState([
    'KOTA MAKASSAR', 'KOTA MANADO', 'GOWA'
  ]);
  const [parentNopForKec, setParentNopForKec] = useState('ALL');
  const [parentCity, setParentCity] = useState('KOTA MAKASSAR');
  const [selectedKecamatans, setSelectedKecamatans] = useState([
    'PANAKKUKANG', 'RAPPOCINI', 'TALLO'
  ]);

  // 4. Site Scope state & Cascading Filters (NOP, Kabupaten, Kecamatan)
  const [siteMode, setSiteMode] = useState('single'); // 'single' | 'compare'
  const [siteFilterNop, setSiteFilterNop] = useState('ALL');
  const [siteFilterKabupaten, setSiteFilterKabupaten] = useState('ALL');
  const [siteFilterKecamatan, setSiteFilterKecamatan] = useState('ALL');

  const [selectedSite, setSelectedSite] = useState('KWA001');
  const [selectedSites, setSelectedSites] = useState(['ADL001', 'ADL002', 'ADL004']);
  const [siteSearch, setSiteSearch] = useState('');
  const [siteDropdownOpen, setSiteDropdownOpen] = useState(false);
  const siteDropdownRef = useRef(null);

  // 5. View options & Threshold
  const [viewMode, setViewMode] = useState('chart'); // 'chart' | 'table'
  const [chartsPerRow, setChartsPerRow] = useState(2); // 1, 2, 3
  const [thresholdPct, setThresholdPct] = useState(0.1); // Packet loss threshold %

  // 6. Data & loading
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Header "Export Excel": the TWAMP table rows currently loaded
  useEffect(() => {
    if (!onExportData) return undefined;
    const rows = data?.table_rows;
    if (!rows?.length) { onExportData(null); return undefined; }
    onExportData(() => ({
      filename: `TWAMP_PacketLoss_${scope}_${fromDate}_${toDate}`,
      sheets: [objectRowsSheet('TWAMP Packet Loss', rows)],
    }));
    return () => onExportData(null);
  }, [data, onExportData]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Initialize NOPs from hierarchy if available
  useEffect(() => {
    if (hierarchyData?.nops && hierarchyData.nops.length > 0) {
      if (!selectedNops || selectedNops.length === 0) {
        setSelectedNops(hierarchyData.nops.slice(0, 5));
      }
    }
  }, [hierarchyData]);

  // Available NOP options
  const nopOptions = useMemo(() => {
    if (hierarchyData?.nops && hierarchyData.nops.length > 0) {
      return hierarchyData.nops;
    }
    return ['BONE', 'KENDARI', 'MAKASSAR', 'MANADO', 'PALU', 'PARE-PARE', 'TERNATE'];
  }, [hierarchyData]);

  // Available Cities for City Scope
  const allCitiesList = useMemo(() => {
    const list = [];
    const tree = hierarchyData?.tree || {};
    if (parentNopForCity === 'ALL') {
      Object.keys(tree).forEach(nop => {
        Object.keys(tree[nop] || {}).forEach(c => {
          if (!list.includes(c)) list.push(c);
        });
      });
    } else if (tree[parentNopForCity]) {
      Object.keys(tree[parentNopForCity]).forEach(c => list.push(c));
    }
    return list.sort();
  }, [hierarchyData, parentNopForCity]);

  // Available Cities for Kecamatan Scope
  const citiesForKecamatanScope = useMemo(() => {
    const list = [];
    const tree = hierarchyData?.tree || {};
    if (parentNopForKec === 'ALL') {
      Object.keys(tree).forEach(nop => {
        Object.keys(tree[nop] || {}).forEach(c => {
          if (!list.includes(c)) list.push(c);
        });
      });
    } else if (tree[parentNopForKec]) {
      Object.keys(tree[parentNopForKec]).forEach(c => list.push(c));
    }
    return list.sort();
  }, [hierarchyData, parentNopForKec]);

  // Helper to get kecamatans for a city
  const getKecamatansForCity = (cityName) => {
    const list = [];
    const tree = hierarchyData?.tree || {};
    Object.keys(tree).forEach(nop => {
      const cities = tree[nop] || {};
      if (cities[cityName]) {
        Object.keys(cities[cityName]).forEach(k => {
          if (!list.includes(k)) list.push(k);
        });
      }
    });
    return list.sort();
  };

  const allKecamatansList = useMemo(() => {
    return getKecamatansForCity(parentCity);
  }, [hierarchyData, parentCity]);

  // =========================================================================
  // SITE SCOPE: CASCADING FILTERS (NOP -> Kabupaten -> Kecamatan -> Sites)
  // =========================================================================
  // Available Kabupaten options under siteFilterNop
  const siteKabupatenOptions = useMemo(() => {
    const tree = hierarchyData?.tree || {};
    const list = [];
    if (siteFilterNop === 'ALL') {
      Object.keys(tree).forEach(nop => {
        Object.keys(tree[nop] || {}).forEach(kab => {
          if (!list.includes(kab)) list.push(kab);
        });
      });
    } else if (tree[siteFilterNop]) {
      Object.keys(tree[siteFilterNop]).forEach(kab => list.push(kab));
    }
    return list.sort();
  }, [hierarchyData, siteFilterNop]);

  // Available Kecamatan options under siteFilterKabupaten
  const siteKecamatanOptions = useMemo(() => {
    const tree = hierarchyData?.tree || {};
    const list = [];
    if (siteFilterKabupaten === 'ALL') {
      if (siteFilterNop === 'ALL') {
        Object.keys(tree).forEach(nop => {
          Object.keys(tree[nop] || {}).forEach(kab => {
            Object.keys(tree[nop][kab] || {}).forEach(kec => {
              if (!list.includes(kec)) list.push(kec);
            });
          });
        });
      } else if (tree[siteFilterNop]) {
        Object.keys(tree[siteFilterNop]).forEach(kab => {
          Object.keys(tree[siteFilterNop][kab] || {}).forEach(kec => {
            if (!list.includes(kec)) list.push(kec);
          });
        });
      }
    } else {
      // Find the selected kabupaten
      Object.keys(tree).forEach(nop => {
        if (siteFilterNop === 'ALL' || siteFilterNop === nop) {
          if (tree[nop] && tree[nop][siteFilterKabupaten]) {
            Object.keys(tree[nop][siteFilterKabupaten]).forEach(kec => {
              if (!list.includes(kec)) list.push(kec);
            });
          }
        }
      });
    }
    return list.sort();
  }, [hierarchyData, siteFilterNop, siteFilterKabupaten]);

  // Sites filtered by NOP, Kabupaten, and Kecamatan
  const sitesFilteredByHierarchy = useMemo(() => {
    let list = allSites;
    const siteMap = hierarchyData?.site_map || {};

    if (siteFilterNop !== 'ALL') {
      list = list.filter(s => {
        const info = siteMap[s];
        return info && info.nop === siteFilterNop;
      });
    }

    if (siteFilterKabupaten !== 'ALL') {
      list = list.filter(s => {
        const info = siteMap[s];
        return info && info.kabupaten === siteFilterKabupaten;
      });
    }

    if (siteFilterKecamatan !== 'ALL') {
      list = list.filter(s => {
        const info = siteMap[s];
        return info && info.kecamatan === siteFilterKecamatan;
      });
    }

    return list;
  }, [allSites, hierarchyData, siteFilterNop, siteFilterKabupaten, siteFilterKecamatan]);

  // Sites for dropdown search
  const filteredSingleSites = useMemo(() => {
    const baseList = sitesFilteredByHierarchy;
    if (!siteSearch) return baseList.slice(0, 50);
    const q = siteSearch.toLowerCase();
    return baseList.filter(s => {
      const name = (siteNamesMap[s] || '').toLowerCase();
      return s.toLowerCase().includes(q) || name.includes(q);
    }).slice(0, 50);
  }, [sitesFilteredByHierarchy, siteSearch, siteNamesMap]);

  // Options for Compare Sites MultiSelectDropdown
  const compareSitesOptions = useMemo(() => {
    return sitesFilteredByHierarchy.slice(0, 200).map(s => ({
      value: s,
      label: siteNamesMap[s] ? `${s} - ${siteNamesMap[s]}` : s
    }));
  }, [sitesFilteredByHierarchy, siteNamesMap]);

  // =========================================================================
  // CORE FETCH FUNCTION WITH DYNAMIC OVERRIDES (Instant Chart Update)
  // =========================================================================
  const fetchData = async (overrides = {}) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const curScope = overrides.scope !== undefined ? overrides.scope : scope;
      const curSiteMode = overrides.siteMode !== undefined ? overrides.siteMode : siteMode;
      const curSite = overrides.selectedSite !== undefined ? overrides.selectedSite : selectedSite;
      const curNops = overrides.selectedNops !== undefined ? overrides.selectedNops : selectedNops;
      const curCities = overrides.selectedCities !== undefined ? overrides.selectedCities : selectedCities;
      const curParentCity = overrides.parentCity !== undefined ? overrides.parentCity : parentCity;
      const curKecamatans = overrides.selectedKecamatans !== undefined ? overrides.selectedKecamatans : selectedKecamatans;
      const curSites = overrides.selectedSites !== undefined ? overrides.selectedSites : selectedSites;
      const curFromDate = overrides.fromDate !== undefined ? overrides.fromDate : fromDate;
      const curToDate = overrides.toDate !== undefined ? overrides.toDate : toDate;

      if (curScope === 'site' && curSiteMode === 'single') {
        const params = new URLSearchParams({
          site_id: curSite,
          start_date: curFromDate,
          end_date: curToDate
        });
        const res = await fetch(`/api/packet_loss/4g?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const json = await res.json();
        if (json.status === 'error') throw new Error(json.message || 'Gagal memuat data');
        setData(json);
      } else {
        const params = new URLSearchParams({
          scope: curScope,
          start_date: curFromDate,
          end_date: curToDate
        });

        if (curScope === 'nop') {
          curNops.forEach(n => params.append('nops', n));
        } else if (curScope === 'city') {
          curCities.forEach(c => params.append('cities', c));
        } else if (curScope === 'kecamatan') {
          params.append('cities', curParentCity);
          curKecamatans.forEach(k => params.append('kecamatans', k));
        } else if (curScope === 'site' && curSiteMode === 'compare') {
          curSites.forEach(s => params.append('sites', s));
        }

        const res = await fetch(`/api/packet_loss/aggregation?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const json = await res.json();
        if (json.status === 'error') throw new Error(json.message || 'Gagal memuat data');
        setData(json);
      }
    } catch (err) {
      console.error('Error fetching TWAMP data:', err);
      setErrorMsg(err.message || 'Terjadi kesalahan saat memuat data');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  // No query on open or scope change: NOP / City / Kecamatan filters load right away,
  // site scope loads on site pick or Generate
  const handleScopeChange = (newScope) => {
    setScope(newScope);
    setData(null);
  };

  const handleNopsChange = (newList) => {
    setSelectedNops(newList);
    fetchData({ selectedNops: newList });
  };

  const handleCitiesChange = (newList) => {
    setSelectedCities(newList);
    fetchData({ selectedCities: newList });
  };

  const handleParentCityChange = (newCity) => {
    setParentCity(newCity);
    const newKecs = getKecamatansForCity(newCity);
    setSelectedKecamatans(newKecs);
    fetchData({ parentCity: newCity, selectedKecamatans: newKecs });
  };

  const handleKecamatansChange = (newList) => {
    setSelectedKecamatans(newList);
    fetchData({ selectedKecamatans: newList });
  };

  const handleSiteModeChange = (newMode) => {
    setSiteMode(newMode);
    setData(null);
  };

  const handleSelectSingleSite = (s) => {
    setSelectedSite(s);
    setSiteDropdownOpen(false);
    fetchData({ selectedSite: s });
  };

  const handleCompareSitesChange = (newList) => {
    setSelectedSites(newList);
  };

  // =========================================================================
  // CHART BUILDERS: SINGLE SITE MODE
  // =========================================================================
  const getSingleSiteLossRateOption = () => {
    if (!data || !data.dates || data.dates.length === 0) return {};
    const dates = data.dates.map(d => formatAxisDate(d, 'daily'));
    const rates = data.series?.packet_loss_rate || [];

    return {
      backgroundColor: 'transparent',
      title: {
        text: `TWAMP Packet Loss Rate (%) - ${data.site_id}`,
        left: 12,
        top: 8,
        textStyle: { fontSize: 13, fontWeight: 700, color: darkMode ? '#f1f5f9' : '#1e293b' }
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
      grid: { top: 50, left: 45, right: 25, bottom: 45, containLabel: false },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: darkMode ? '#475569' : '#cbd5e1' } },
        axisLabel: { rotate: 30, fontSize: 9.5, color: darkMode ? '#94a3b8' : '#64748b' }
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        splitLine: { lineStyle: { color: darkMode ? 'rgba(51, 65, 85, 0.4)' : 'rgba(226, 232, 240, 0.8)' } },
        axisLabel: { color: darkMode ? '#94a3b8' : '#64748b', fontSize: 10, formatter: '{value}%' }
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
              type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
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

  const getSingleSiteDelayJitterOption = () => {
    if (!data || !data.dates || data.dates.length === 0) return {};
    const dates = data.dates.map(d => formatAxisDate(d, 'daily'));
    const delays = data.series?.avg_delay || [];
    const jitters = data.series?.avg_jitter || [];

    return {
      backgroundColor: 'transparent',
      title: {
        text: `TWAMP Latency & Jitter (ms) - ${data.site_id}`,
        left: 12,
        top: 8,
        textStyle: { fontSize: 13, fontWeight: 700, color: darkMode ? '#f1f5f9' : '#1e293b' }
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: darkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        borderColor: darkMode ? '#334155' : '#cbd5e1',
        textStyle: { color: darkMode ? '#f8fafc' : '#0f172a', fontSize: 11 }
      },
      legend: {
        top: 32,
        left: 12,
        right: 12,
        icon: 'rect',
        itemWidth: 12,
        itemHeight: 12,
        textStyle: { color: darkMode ? '#94a3b8' : '#475569', fontSize: 11 }
      },
      grid: { top: 66, left: 45, right: 25, bottom: 45, containLabel: false },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: darkMode ? '#475569' : '#cbd5e1' } },
        axisLabel: { rotate: 30, fontSize: 9.5, color: darkMode ? '#94a3b8' : '#64748b' }
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        splitLine: { lineStyle: { color: darkMode ? 'rgba(51, 65, 85, 0.4)' : 'rgba(226, 232, 240, 0.8)' } },
        axisLabel: { color: darkMode ? '#94a3b8' : '#64748b', fontSize: 10, formatter: '{value} ms' }
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

  const getSingleSiteVolumeOption = () => {
    if (!data || !data.dates || data.dates.length === 0) return {};
    const dates = data.dates.map(d => formatAxisDate(d, 'daily'));
    const tx = data.series?.tx_packets || [];
    const rx = data.series?.rx_packets || [];

    return {
      backgroundColor: 'transparent',
      title: {
        text: `TWAMP Packet Volume - ${data.site_id}`,
        left: 12,
        top: 8,
        textStyle: { fontSize: 13, fontWeight: 700, color: darkMode ? '#f1f5f9' : '#1e293b' }
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: darkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        borderColor: darkMode ? '#334155' : '#cbd5e1',
        textStyle: { color: darkMode ? '#f8fafc' : '#0f172a', fontSize: 11 }
      },
      legend: {
        top: 32,
        left: 12,
        right: 12,
        icon: 'rect',
        itemWidth: 12,
        itemHeight: 12,
        textStyle: { color: darkMode ? '#94a3b8' : '#475569', fontSize: 11 }
      },
      grid: { top: 66, left: 55, right: 25, bottom: 45, containLabel: false },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: darkMode ? '#475569' : '#cbd5e1' } },
        axisLabel: { rotate: 30, fontSize: 9.5, color: darkMode ? '#94a3b8' : '#64748b' }
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        splitLine: { lineStyle: { color: darkMode ? 'rgba(51, 65, 85, 0.4)' : 'rgba(226, 232, 240, 0.8)' } },
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

  // =========================================================================
  // CHART BUILDERS: MULTI-ENTITY AGGREGATION SCOPE MODE (No legend collision)
  // =========================================================================
  const getAggregatedLossRateOption = () => {
    if (!data || !data.dates || data.dates.length === 0) return {};
    const dates = data.dates.map(d => formatAxisDate(d, 'daily'));
    const entities = data.entities || [];
    const seriesMap = data.series?.packet_loss_rate || {};

    const seriesList = entities.map((ent, idx) => ({
      name: ent,
      type: 'line',
      smooth: true,
      data: seriesMap[ent] || [],
      lineStyle: { color: ENTITY_COLORS[idx % ENTITY_COLORS.length], width: 2.2 },
      itemStyle: { color: ENTITY_COLORS[idx % ENTITY_COLORS.length] },
      markLine: idx === 0 && thresholdPct > 0 ? {
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
    }));

    return {
      backgroundColor: 'transparent',
      title: {
        text: `TWAMP Packet Loss Rate (%) - Scope: ${scope.toUpperCase()}`,
        left: 12,
        top: 8,
        textStyle: { fontSize: 13, fontWeight: 700, color: darkMode ? '#f1f5f9' : '#1e293b' }
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: darkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        borderColor: darkMode ? '#334155' : '#cbd5e1',
        textStyle: { color: darkMode ? '#f8fafc' : '#0f172a', fontSize: 11 },
        formatter: (params) => {
          if (!params || !params.length) return '';
          let html = `<div class="font-bold border-b pb-1 mb-1 border-slate-200 dark:border-slate-700">${params[0].axisValue}</div>`;
          const sorted = [...params].sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
          sorted.forEach(p => {
            if (p.value !== null && p.value !== undefined) {
              html += `<div class="flex items-center justify-between gap-4 py-0.5">
                        <span class="flex items-center gap-1.5">
                          <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${p.color};"></span>
                          <span>${p.seriesName}</span>
                        </span>
                        <span class="font-bold ${Number(p.value) > thresholdPct ? 'text-rose-500' : ''}">${p.value}%</span>
                      </div>`;
            }
          });
          return html;
        }
      },
      legend: {
        type: 'scroll',
        top: 32,
        left: 12,
        right: 12,
        icon: 'rect',
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: darkMode ? '#94a3b8' : '#475569', fontSize: 11 }
      },
      grid: { top: 66, left: 45, right: 25, bottom: 45, containLabel: false },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: darkMode ? '#475569' : '#cbd5e1' } },
        axisLabel: { rotate: 30, fontSize: 9.5, color: darkMode ? '#94a3b8' : '#64748b' }
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        splitLine: { lineStyle: { color: darkMode ? 'rgba(51, 65, 85, 0.4)' : 'rgba(226, 232, 240, 0.8)' } },
        axisLabel: { color: darkMode ? '#94a3b8' : '#64748b', fontSize: 10, formatter: '{value}%' }
      },
      series: seriesList
    };
  };

  const getAggregatedDelayOption = () => {
    if (!data || !data.dates || data.dates.length === 0) return {};
    const dates = data.dates.map(d => formatAxisDate(d, 'daily'));
    const entities = data.entities || [];
    const seriesMap = data.series?.avg_delay || {};

    const seriesList = entities.map((ent, idx) => ({
      name: ent,
      type: 'line',
      smooth: true,
      data: seriesMap[ent] || [],
      lineStyle: { color: ENTITY_COLORS[idx % ENTITY_COLORS.length], width: 2.2 },
      itemStyle: { color: ENTITY_COLORS[idx % ENTITY_COLORS.length] }
    }));

    return {
      backgroundColor: 'transparent',
      title: {
        text: `TWAMP Latency Delay (ms) - Scope: ${scope.toUpperCase()}`,
        left: 12,
        top: 8,
        textStyle: { fontSize: 13, fontWeight: 700, color: darkMode ? '#f1f5f9' : '#1e293b' }
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: darkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        borderColor: darkMode ? '#334155' : '#cbd5e1',
        textStyle: { color: darkMode ? '#f8fafc' : '#0f172a', fontSize: 11 }
      },
      legend: {
        type: 'scroll',
        top: 32,
        left: 12,
        right: 12,
        icon: 'rect',
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: darkMode ? '#94a3b8' : '#475569', fontSize: 11 }
      },
      grid: { top: 66, left: 45, right: 25, bottom: 45, containLabel: false },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: darkMode ? '#475569' : '#cbd5e1' } },
        axisLabel: { rotate: 30, fontSize: 9.5, color: darkMode ? '#94a3b8' : '#64748b' }
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        splitLine: { lineStyle: { color: darkMode ? 'rgba(51, 65, 85, 0.4)' : 'rgba(226, 232, 240, 0.8)' } },
        axisLabel: { color: darkMode ? '#94a3b8' : '#64748b', fontSize: 10, formatter: '{value} ms' }
      },
      series: seriesList
    };
  };

  const getAggregatedJitterOption = () => {
    if (!data || !data.dates || data.dates.length === 0) return {};
    const dates = data.dates.map(d => formatAxisDate(d, 'daily'));
    const entities = data.entities || [];
    const seriesMap = data.series?.avg_jitter || {};

    const seriesList = entities.map((ent, idx) => ({
      name: ent,
      type: 'line',
      smooth: true,
      data: seriesMap[ent] || [],
      lineStyle: { color: ENTITY_COLORS[idx % ENTITY_COLORS.length], width: 2.2 },
      itemStyle: { color: ENTITY_COLORS[idx % ENTITY_COLORS.length] }
    }));

    return {
      backgroundColor: 'transparent',
      title: {
        text: `TWAMP Jitter (ms) - Scope: ${scope.toUpperCase()}`,
        left: 12,
        top: 8,
        textStyle: { fontSize: 13, fontWeight: 700, color: darkMode ? '#f1f5f9' : '#1e293b' }
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: darkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        borderColor: darkMode ? '#334155' : '#cbd5e1',
        textStyle: { color: darkMode ? '#f8fafc' : '#0f172a', fontSize: 11 }
      },
      legend: {
        type: 'scroll',
        top: 32,
        left: 12,
        right: 12,
        icon: 'rect',
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: darkMode ? '#94a3b8' : '#475569', fontSize: 11 }
      },
      grid: { top: 66, left: 45, right: 25, bottom: 45, containLabel: false },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: darkMode ? '#475569' : '#cbd5e1' } },
        axisLabel: { rotate: 30, fontSize: 9.5, color: darkMode ? '#94a3b8' : '#64748b' }
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        splitLine: { lineStyle: { color: darkMode ? 'rgba(51, 65, 85, 0.4)' : 'rgba(226, 232, 240, 0.8)' } },
        axisLabel: { color: darkMode ? '#94a3b8' : '#64748b', fontSize: 10, formatter: '{value} ms' }
      },
      series: seriesList
    };
  };

  const getAggregatedVolumeOption = () => {
    if (!data || !data.dates || data.dates.length === 0) return {};
    const dates = data.dates.map(d => formatAxisDate(d, 'daily'));
    const entities = data.entities || [];
    const seriesMap = data.series?.tx_packets || {};

    const seriesList = entities.map((ent, idx) => ({
      name: ent,
      type: 'bar',
      stack: 'total',
      data: seriesMap[ent] || [],
      itemStyle: { color: ENTITY_COLORS[idx % ENTITY_COLORS.length] }
    }));

    return {
      backgroundColor: 'transparent',
      title: {
        text: `TWAMP Tx Volume - Scope: ${scope.toUpperCase()}`,
        left: 12,
        top: 8,
        textStyle: { fontSize: 13, fontWeight: 700, color: darkMode ? '#f1f5f9' : '#1e293b' }
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: darkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        borderColor: darkMode ? '#334155' : '#cbd5e1',
        textStyle: { color: darkMode ? '#f8fafc' : '#0f172a', fontSize: 11 }
      },
      legend: {
        type: 'scroll',
        top: 32,
        left: 12,
        right: 12,
        icon: 'rect',
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: darkMode ? '#94a3b8' : '#475569', fontSize: 11 }
      },
      grid: { top: 66, left: 55, right: 25, bottom: 45, containLabel: false },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: darkMode ? '#475569' : '#cbd5e1' } },
        axisLabel: { rotate: 30, fontSize: 9.5, color: darkMode ? '#94a3b8' : '#64748b' }
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        splitLine: { lineStyle: { color: darkMode ? 'rgba(51, 65, 85, 0.4)' : 'rgba(226, 232, 240, 0.8)' } },
        axisLabel: {
          color: darkMode ? '#94a3b8' : '#64748b',
          fontSize: 10,
          formatter: (v) => (v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)
        }
      },
      series: seriesList
    };
  };

  // Export CSV
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
    link.setAttribute('download', `TWAMP_PacketLoss_${scope}_${fromDate}_${toDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const summary = data?.summary || {};
  const isSingleSite = scope === 'site' && siteMode === 'single';

  return (
    <div className="space-y-4">
      
      {/* 1. TOP HEADER / DATE & GENERATE BAR */}
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

          <div className="w-28 sm:w-32">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Threshold (%)
            </label>
            <input 
              type="number"
              step="0.01"
              value={thresholdPct}
              onChange={(e) => setThresholdPct(parseFloat(e.target.value) || 0)}
              className={`w-full text-xs font-semibold px-2.5 py-1.5 rounded-lg border outline-none transition ${
                darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            />
          </div>

          <button
            type="button"
            onClick={() => fetchData()}
            disabled={loading}
            className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Loading...' : 'Generate'}</span>
          </button>
        </div>
      </div>

      {/* 2. FILTERS & KPI SELECTION CARD (Matching Gambar 2) */}
      <div className={`p-4 rounded-xl border shadow-sm transition-colors duration-200 space-y-3.5 ${
        darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        
        {/* Header: Filters & KPI Selection */}
        <div className="space-y-2.5 pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h3 className={`font-bold text-xs uppercase tracking-wider ${
              darkMode ? 'text-slate-200' : 'text-slate-800'
            }`}>
              Filters & KPI Selection
            </h3>
          </div>

          {/* Grouping Selection Scope Pills (Gambar 2) */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-semibold select-none">
            {AGGREGATION_SCOPES.map(s => {
              const Icon = s.icon;
              const isActive = scope === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleScopeChange(s.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-all duration-200 cursor-pointer shrink-0 border ${
                    isActive
                      ? darkMode
                        ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-500/20 font-bold'
                        : 'bg-white text-blue-600 border-blue-200 shadow-xs font-bold ring-1 ring-blue-500/20'
                      : darkMode
                        ? 'bg-slate-800/80 text-slate-400 border-slate-700/80 hover:bg-slate-800 hover:text-slate-200'
                        : 'bg-slate-100/90 text-slate-600 border-slate-200/80 hover:bg-slate-200 hover:text-slate-900'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? (darkMode ? 'text-white' : 'text-blue-600') : 'opacity-70'}`} />
                  <span>{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Dynamic Entity Selectors based on Scope */}
        <div className="pt-1">
          
          {/* A. REGIONAL */}
          {scope === 'regional' && (
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 ${
                darkMode ? 'bg-blue-950/40 text-blue-400 border border-blue-900/60' : 'bg-blue-50 text-blue-700 border border-blue-200'
              }`}>
                <Globe className="w-3.5 h-3.5" />
                <span>Regional Sulawesi Aggregate (All Monitored eNodeBs)</span>
              </span>
            </div>
          )}

          {/* B. NOP */}
          {scope === 'nop' && (
            <div className="flex flex-wrap items-center gap-4">
              <MultiSelectDropdown
                label="SELECT NOP"
                options={nopOptions}
                selectedValues={selectedNops}
                onChange={handleNopsChange}
                isMulti={true}
                placeholder="Pilih NOP..."
                darkMode={darkMode}
                minWidth="min-w-60"
              />
            </div>
          )}

          {/* C. CITY / KABUPATEN */}
          {scope === 'city' && (
            <div className="flex flex-wrap items-center gap-4">
              <div className="w-44">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">
                  FILTER NOP
                </label>
                <div className="relative">
                  <select
                    value={parentNopForCity}
                    onChange={(e) => setParentNopForCity(e.target.value)}
                    className={`w-full appearance-none border rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-none cursor-pointer ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  >
                    <option value="ALL">All NOPs</option>
                    {nopOptions.map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                </div>
              </div>

              <MultiSelectDropdown
                label="SELECT CITY / KABUPATEN"
                options={allCitiesList}
                selectedValues={selectedCities}
                onChange={handleCitiesChange}
                isMulti={true}
                placeholder="Pilih City/Kabupaten..."
                darkMode={darkMode}
                minWidth="min-w-64"
              />
            </div>
          )}

          {/* D. KECAMATAN */}
          {scope === 'kecamatan' && (
            <div className="flex flex-wrap items-center gap-4">
              
              {/* Optional NOP Filter for City */}
              <div className="w-40">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">
                  FILTER NOP
                </label>
                <div className="relative">
                  <select
                    value={parentNopForKec}
                    onChange={(e) => {
                      const newNop = e.target.value;
                      setParentNopForKec(newNop);
                      // Pick first city under new NOP if available
                      const tree = hierarchyData?.tree || {};
                      const availCities = newNop === 'ALL'
                        ? allCitiesList
                        : Object.keys(tree[newNop] || {}).sort();
                      if (availCities.length > 0 && !availCities.includes(parentCity)) {
                        handleParentCityChange(availCities[0]);
                      }
                    }}
                    className={`w-full appearance-none border rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-none cursor-pointer ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  >
                    <option value="ALL">All NOPs</option>
                    {nopOptions.map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                </div>
              </div>

              {/* Parent City Selector */}
              <div className="w-48">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">
                  PARENT CITY
                </label>
                <div className="relative">
                  <select
                    value={parentCity}
                    onChange={(e) => handleParentCityChange(e.target.value)}
                    className={`w-full appearance-none border rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-none cursor-pointer ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  >
                    {citiesForKecamatanScope.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                </div>
              </div>

              {/* Kecamatan MultiSelectDropdown */}
              <MultiSelectDropdown
                label="SELECT KECAMATAN"
                options={allKecamatansList}
                selectedValues={selectedKecamatans}
                onChange={handleKecamatansChange}
                isMulti={true}
                placeholder="Pilih Kecamatan..."
                darkMode={darkMode}
                minWidth="min-w-64"
              />
            </div>
          )}

          {/* E. SITE SCOPE: WITH NOP, KABUPATEN, KECAMATAN CASCADING FILTERS (Gambar 2 User Request) */}
          {scope === 'site' && (
            <div className="space-y-3">
              
              {/* Row 1: Cascading Filters for NOP, Kabupaten, Kecamatan */}
              <div className="flex flex-wrap items-center gap-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                
                {/* 1. Filter NOP */}
                <div className="w-36 sm:w-40">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">
                    Filter NOP
                  </label>
                  <div className="relative">
                    <select
                      value={siteFilterNop}
                      onChange={(e) => {
                        const newNop = e.target.value;
                        setSiteFilterNop(newNop);
                        setSiteFilterKabupaten('ALL');
                        setSiteFilterKecamatan('ALL');
                      }}
                      className={`w-full appearance-none border rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none cursor-pointer ${
                        darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                      }`}
                    >
                      <option value="ALL">All NOPs</option>
                      {nopOptions.map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
                  </div>
                </div>

                {/* 2. Filter Kabupaten */}
                <div className="w-44 sm:w-48">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">
                    Filter Kabupaten
                  </label>
                  <div className="relative">
                    <select
                      value={siteFilterKabupaten}
                      onChange={(e) => {
                        const newKab = e.target.value;
                        setSiteFilterKabupaten(newKab);
                        setSiteFilterKecamatan('ALL');
                      }}
                      className={`w-full appearance-none border rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none cursor-pointer ${
                        darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                      }`}
                    >
                      <option value="ALL">All Kabupaten</option>
                      {siteKabupatenOptions.map(k => (
                        <option key={k} value={k}>{k}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
                  </div>
                </div>

                {/* 3. Filter Kecamatan */}
                <div className="w-44 sm:w-48">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">
                    Filter Kecamatan
                  </label>
                  <div className="relative">
                    <select
                      value={siteFilterKecamatan}
                      onChange={(e) => {
                        setSiteFilterKecamatan(e.target.value);
                      }}
                      className={`w-full appearance-none border rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none cursor-pointer ${
                        darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                      }`}
                    >
                      <option value="ALL">All Kecamatan</option>
                      {siteKecamatanOptions.map(k => (
                        <option key={k} value={k}>{k}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
                  </div>
                </div>

                {/* Reset Hierarchy Filter Button */}
                {(siteFilterNop !== 'ALL' || siteFilterKabupaten !== 'ALL' || siteFilterKecamatan !== 'ALL') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSiteFilterNop('ALL');
                      setSiteFilterKabupaten('ALL');
                      setSiteFilterKecamatan('ALL');
                    }}
                    className="self-end mb-0.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900 transition cursor-pointer"
                  >
                    Reset Filter
                  </button>
                )}

              </div>

              {/* Row 2: Mode Toggle (Single Site vs Compare Sites) & Target Site Selectors */}
              <div className="flex flex-wrap items-center gap-4 pt-1">
                
                {/* Single / Compare Toggle */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">
                    SITE VIEW MODE
                  </label>
                  <div className={`flex items-center p-0.5 rounded-lg border ${
                    darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'
                  }`}>
                    <button
                      type="button"
                      onClick={() => handleSiteModeChange('single')}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                        siteMode === 'single'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : darkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}
                    >
                      Single Site
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSiteModeChange('compare')}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                        siteMode === 'compare'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : darkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}
                    >
                      Compare Sites
                    </button>
                  </div>
                </div>

                {/* Single Site Selector */}
                {siteMode === 'single' && (
                  <div className="w-60 sm:w-80 relative" ref={siteDropdownRef}>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-500">
                        TARGET SITE
                      </label>
                      <span className="text-[10px] text-slate-400">
                        {sitesFilteredByHierarchy.length} sites
                      </span>
                    </div>
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
                      <div className={`absolute top-full left-0 mt-1 w-84 rounded-xl border shadow-xl z-50 p-2 ${
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
                        <div className="max-h-56 overflow-y-auto space-y-0.5 text-xs">
                          {filteredSingleSites.length === 0 ? (
                            <div className="text-center py-4 text-slate-400 text-xs italic">
                              Tidak ada site yang cocok dengan filter wilayah
                            </div>
                          ) : (
                            filteredSingleSites.map(s => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => handleSelectSingleSite(s)}
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
                                {selectedSite === s && <Check className="w-3.5 h-3.5 shrink-0" />}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Compare Multiple Sites */}
                {siteMode === 'compare' && (
                  <MultiSelectDropdown
                    label="SELECT SITES TO COMPARE"
                    options={compareSitesOptions}
                    selectedValues={selectedSites}
                    onChange={handleCompareSitesChange}
                    isMulti={true}
                    placeholder="Pilih Sites..."
                    darkMode={darkMode}
                    minWidth="min-w-80"
                  />
                )}

              </div>

            </div>
          )}

        </div>
      </div>

      {/* 3. SUB-ACTION BAR (Export PNG removed per user request) */}
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

          {/* Export CSV only */}
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

      {/* 4. SUMMARY KPI HEADLINE CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Avg Loss Rate */}
        <div className={`p-4 rounded-xl border shadow-xs ${
          darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1">
            <span>Avg Packet Loss</span>
            <Activity className="w-4 h-4 text-teal-500" />
          </div>
          <div className={`text-xl font-extrabold tracking-tight ${
            (summary.avg_loss_rate || 0) > thresholdPct ? 'text-rose-500' : 'text-emerald-500'
          }`}>
            {(summary.avg_loss_rate || 0).toFixed(4)}%
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">Threshold: {thresholdPct}%</p>
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
          <p className="text-[10px] text-slate-400 mt-0.5">Scope average latency</p>
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

      {/* 5. CHARTS SECTION */}
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
              option={isSingleSite ? getSingleSiteLossRateOption() : getAggregatedLossRateOption()}
              style={{ height: '330px', width: '100%' }}
              opts={{ renderer: 'canvas' }}
              notMerge={true}
            />
          </div>

          {/* Chart 2: Delay */}
          <div className={`rounded-2xl border p-3 shadow-sm ${
            darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <ReactECharts
              ref={(e) => { chartRefs.current.delay_jitter = e; }}
              option={isSingleSite ? getSingleSiteDelayJitterOption() : getAggregatedDelayOption()}
              style={{ height: '330px', width: '100%' }}
              opts={{ renderer: 'canvas' }}
              notMerge={true}
            />
          </div>

          {/* Chart 3: Jitter or Volume */}
          <div className={`rounded-2xl border p-3 shadow-sm ${
            chartsPerRow === 2 && !isSingleSite ? 'lg:col-span-1' : ''
          } ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            <ReactECharts
              ref={(e) => { chartRefs.current.jitter = e; }}
              option={isSingleSite ? getSingleSiteVolumeOption() : getAggregatedJitterOption()}
              style={{ height: '330px', width: '100%' }}
              opts={{ renderer: 'canvas' }}
              notMerge={true}
            />
          </div>

          {/* Chart 4: Volume in Aggregated Scope */}
          {!isSingleSite && (
            <div className={`rounded-2xl border p-3 shadow-sm ${
              chartsPerRow === 2 ? 'lg:col-span-1' : ''
            } ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
              <ReactECharts
                ref={(e) => { chartRefs.current.volume = e; }}
                option={getAggregatedVolumeOption()}
                style={{ height: '330px', width: '100%' }}
                opts={{ renderer: 'canvas' }}
                notMerge={true}
              />
            </div>
          )}
        </div>
      )}

      {/* 6. TABLE SECTION */}
      {viewMode === 'table' && (
        <div className={`rounded-2xl border overflow-hidden shadow-xs ${
          darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="p-4 border-b flex items-center justify-between border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500">
                Data Rinci TWAMP Packet Loss ({scope.toUpperCase()}: {isSingleSite ? selectedSite : data?.entities?.join(', ') || 'Semua'})
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
                  <th className="px-3 py-2.5">{isSingleSite ? 'Managed Element' : 'Entity'}</th>
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
                    <td className="px-3 py-2 font-semibold truncate max-w-xs">{row.managed_element || row.entity}</td>
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
                      (row.packet_loss_rate_pct || 0) > thresholdPct ? 'text-rose-500' : 'text-emerald-500'
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
