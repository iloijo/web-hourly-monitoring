import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getJson, getStoredAuthUser } from '../api/client';
import { Spinner } from './cei/ui';
import CrowdFilters from './crowdsource/CrowdFilters';
import SummaryTiles from './crowdsource/SummaryTiles';
import WinLoseTrend from './crowdsource/WinLoseTrend';
import AchievementTable from './crowdsource/AchievementTable';
import PathToTarget from './crowdsource/PathToTarget';
import KpiTrendChart from './crowdsource/KpiTrendChart';
import KpiTrendGrid from './crowdsource/KpiTrendGrid';
import { BarChart3, LayoutGrid, MapPinned } from 'lucide-react';
import ContributorTables from './crowdsource/ContributorTables';
import WinLoseMap from './crowdsource/WinLoseMap';
import CrowdSettings from './crowdsource/CrowdSettings';
import { weekLabel } from './crowdsource/constants';

const STORAGE_KEY = 'netpulse_crowd_filters';
const TAB_KEY = 'netpulse_crowd_tab';

// Sub-menus of OKR > Crowdsource
const TABS = [
  ['achievement', 'Achievement', BarChart3],
  ['trend', 'KPI Trend', LayoutGrid],
  ['degradation', 'Degradation & Map', MapPinned],
];

function readStoredTab() {
  try {
    const t = localStorage.getItem(TAB_KEY);
    if (TABS.some(([k]) => k === t)) return t;
  } catch {
    // storage unavailable
  }
  return 'achievement';
}

const DEFAULT_FILTERS = {
  week: null,
  region: 'SULAWESI',
  source: 'all',
  tech: 'all',
  level: 'region',
  kabupaten: [],
  competitor: 'all',
  trendWeeks: 26,
};

function readStoredFilters() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // Week is never restored: the page always opens on the latest week from meta
    if (raw) return { ...DEFAULT_FILTERS, ...JSON.parse(raw), week: null };
  } catch (e) {
    // Ignore parse error
  }
  return DEFAULT_FILTERS;
}

export default function CrowdsourceView({ darkMode, onExportData }) {
  const [meta, setMeta] = useState(null);
  const [filters, setFilters] = useState(readStoredFilters);
  const [tab, setTab] = useState(readStoredTab);
  const [mapFilters, setMapFilters] = useState({
    source: 'ONX',
    tech: 'overall',
    key: 'all',
  });
  const [selectedKey, setSelectedKey] = useState('onx_dl_all');
  const [focusKabupaten, setFocusKabupaten] = useState(null);

  // Data states
  const [summaryData, setSummaryData] = useState(null);
  const [achievementData, setAchievementData] = useState(null);
  const [trendData, setTrendData] = useState(null);
  const [contributorsData, setContributorsData] = useState(null);
  const [mapData, setMapData] = useState(null);

  // Settings state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsData, setSettingsData] = useState({ targets: [], manual: [] });

  // Loading & error states
  const [loading, setLoading] = useState({
    meta: true,
    summary: false,
    achievement: false,
    trend: false,
    contributors: false,
    map: false,
  });
  const [errors, setErrors] = useState({});

  // Request sequencing refs to ignore stale asynchronous responses
  const seqRef = useRef({
    summary: 0,
    achievement: 0,
    trend: 0,
    contributors: 0,
    map: 0,
  });

  const isSuperAdmin = Boolean(getStoredAuthUser()?.is_super);

  // Filter change handler
  const handleFilterChange = (partial) => {
    setFilters((prev) => {
      const next = { ...prev, ...partial };
      try {
        const { week: _week, ...persisted } = next; // eslint-disable-line no-unused-vars
        localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
      } catch (e) {
        // Ignore storage error
      }
      return next;
    });
  };

  const handleTabChange = (t) => {
    setTab(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      // storage unavailable
    }
  };

  const handleMapFilterChange = (partial) => {
    setMapFilters((prev) => ({ ...prev, ...partial }));
  };

  // 1. Initial metadata fetch on mount
  useEffect(() => {
    setLoading((l) => ({ ...l, meta: true }));
    getJson('/api/crowdsource/meta')
      .then((m) => {
        setMeta(m);
        setFilters((prev) => {
          const validRegion = m.regions.includes(prev.region) ? prev.region : m.default_region || 'SULAWESI';
          const validWeek = m.latest_week;
          const next = { ...prev, region: validRegion, week: validWeek };
          return next;
        });
      })
      .catch((e) => setErrors((err) => ({ ...err, meta: String(e.message || e) })))
      .finally(() => setLoading((l) => ({ ...l, meta: false })));
  }, []);

  // 2. Fetch Summary & WinLoseTrend (when week or region changes)
  const fetchSummary = useCallback(() => {
    if (!filters.week || !filters.region) return;
    const seq = ++seqRef.current.summary;
    setLoading((l) => ({ ...l, summary: true }));
    setErrors((e) => ({ ...e, summary: null }));

    getJson('/api/crowdsource/summary', {
      week: filters.week,
      region: filters.region,
    })
      .then((data) => {
        if (seq === seqRef.current.summary) {
          setSummaryData(data);
        }
      })
      .catch((e) => {
        if (seq === seqRef.current.summary) {
          setErrors((err) => ({ ...err, summary: String(e.message || e) }));
        }
      })
      .finally(() => {
        if (seq === seqRef.current.summary) {
          setLoading((l) => ({ ...l, summary: false }));
        }
      });
  }, [filters.week, filters.region]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // 3. Fetch Achievement Table & Path to Target
  const fetchAchievement = useCallback(() => {
    if (!filters.week || !filters.region) return;
    const seq = ++seqRef.current.achievement;
    setLoading((l) => ({ ...l, achievement: true }));
    setErrors((e) => ({ ...e, achievement: null }));

    const params = {
      week: filters.week,
      weeks: 8,
      region: filters.region,
      level: filters.level,
      source: filters.source,
      tech: filters.tech,
      competitor: filters.competitor,
    };
    if (filters.level === 'kabupaten' && filters.kabupaten?.length > 0) {
      params.kabupaten = filters.kabupaten;
    }

    getJson('/api/crowdsource/achievement', params)
      .then((data) => {
        if (seq === seqRef.current.achievement) {
          setAchievementData(data);
          // Set default selectedKey if current is not in rows
          if (data?.rows?.length > 0) {
            setSelectedKey((prevKey) => {
              const hasKey = data.rows.some((r) => r.key === prevKey);
              return hasKey ? prevKey : (data.path_to_target?.[0]?.key || data.rows[0].key);
            });
          }
        }
      })
      .catch((e) => {
        if (seq === seqRef.current.achievement) {
          setErrors((err) => ({ ...err, achievement: String(e.message || e) }));
        }
      })
      .finally(() => {
        if (seq === seqRef.current.achievement) {
          setLoading((l) => ({ ...l, achievement: false }));
        }
      });
  }, [
    filters.week,
    filters.region,
    filters.level,
    filters.kabupaten,
    filters.source,
    filters.tech,
    filters.competitor,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchAchievement();
  }, [fetchAchievement]);

  // 4. Fetch KPI Trend Chart
  const fetchTrend = useCallback(() => {
    if (!selectedKey || !filters.region) return;
    const seq = ++seqRef.current.trend;
    setLoading((l) => ({ ...l, trend: true }));
    setErrors((e) => ({ ...e, trend: null }));

    const params = {
      key: selectedKey,
      region: filters.region,
      weeks: filters.trendWeeks || 26,
    };
    if (filters.level === 'kabupaten' && filters.kabupaten?.length === 1) {
      params.kabupaten = filters.kabupaten[0];
    }

    getJson('/api/crowdsource/trend', params)
      .then((data) => {
        if (seq === seqRef.current.trend) {
          setTrendData(data);
        }
      })
      .catch((e) => {
        if (seq === seqRef.current.trend) {
          setErrors((err) => ({ ...err, trend: String(e.message || e) }));
        }
      })
      .finally(() => {
        if (seq === seqRef.current.trend) {
          setLoading((l) => ({ ...l, trend: false }));
        }
      });
  }, [selectedKey, filters.region, filters.level, filters.kabupaten, filters.trendWeeks]);

  useEffect(() => {
    fetchTrend();
  }, [fetchTrend]);

  // 5. Fetch Contributors
  const fetchContributors = useCallback(
    (kpiKey = null) => {
      if (!filters.week || !filters.region) return;
      const seq = ++seqRef.current.contributors;
      setLoading((l) => ({ ...l, contributors: true }));
      setErrors((e) => ({ ...e, contributors: null }));

      const params = {
        week: filters.week,
        region: filters.region,
        source: filters.source,
        tech: filters.tech,
      };
      if (kpiKey) params.key = kpiKey;

      getJson('/api/crowdsource/contributors', params)
        .then((data) => {
          if (seq === seqRef.current.contributors) {
            setContributorsData(data);
          }
        })
        .catch((e) => {
          if (seq === seqRef.current.contributors) {
            setErrors((err) => ({ ...err, contributors: String(e.message || e) }));
          }
        })
        .finally(() => {
          if (seq === seqRef.current.contributors) {
            setLoading((l) => ({ ...l, contributors: false }));
          }
        });
    },
    [filters.week, filters.region, filters.source, filters.tech]
  );

  // Degradation tab data is only loaded once that tab is opened
  const degradationOpen = tab === 'degradation';
  useEffect(() => {
    if (degradationOpen) fetchContributors();
  }, [fetchContributors, degradationOpen]);

  // 6. Fetch Map Data
  const fetchMap = useCallback(() => {
    if (!filters.week || !filters.region) return;
    const seq = ++seqRef.current.map;
    setLoading((l) => ({ ...l, map: true }));
    setErrors((e) => ({ ...e, map: null }));

    getJson('/api/crowdsource/map', {
      week: filters.week,
      region: filters.region,
      source: mapFilters.source,
      tech: mapFilters.tech,
      key: mapFilters.key,
    })
      .then((data) => {
        if (seq === seqRef.current.map) {
          setMapData(data);
        }
      })
      .catch((e) => {
        if (seq === seqRef.current.map) {
          setErrors((err) => ({ ...err, map: String(e.message || e) }));
        }
      })
      .finally(() => {
        if (seq === seqRef.current.map) {
          setLoading((l) => ({ ...l, map: false }));
        }
      });
  }, [filters.week, filters.region, mapFilters.source, mapFilters.tech, mapFilters.key]);

  useEffect(() => {
    if (degradationOpen) fetchMap();
  }, [fetchMap, degradationOpen]);

  // 7. Settings data fetch
  const openSettingsModal = () => {
    getJson('/api/crowdsource/settings')
      .then((d) => {
        setSettingsData(d);
        setSettingsOpen(true);
      })
      .catch((e) => alert(String(e.message || e)));
  };

  const handleSettingsSaved = (newSettings) => {
    if (newSettings) setSettingsData(newSettings);
    // Refresh summary, achievement, trend
    fetchSummary();
    fetchAchievement();
    fetchTrend();
  };

  // 8. Register Excel Export (6 Sheets)
  useEffect(() => {
    if (!achievementData?.rows || !summaryData?.tiles) {
      if (onExportData) onExportData(null);
      return;
    }

    if (onExportData) {
      onExportData(async () => {
        const yw = filters.week;
        // Degradation tab data loads lazily; fetch it for the export when that tab was never opened
        const [contrib, mapPts] = await Promise.all([
          contributorsData ||
            getJson('/api/crowdsource/contributors', {
              week: yw, region: filters.region, source: filters.source, tech: filters.tech,
            }).catch(() => null),
          mapData ||
            getJson('/api/crowdsource/map', {
              week: yw, region: filters.region, source: mapFilters.source, tech: mapFilters.tech, key: mapFilters.key,
            }).catch(() => null),
        ]);
        const wStr = String(yw % 100).padStart(2, '0');
        const yStr = Math.floor(yw / 100);

        const sTiles = summaryData.tiles;
        const onx = sTiles.ONX || {};
        const ook = sTiles.OOKLA || {};
        const tot = sTiles.TOTAL || {};

        // Sheet 1: Summary
        const summarySheet = {
          name: 'Summary',
          columns: ['Metric', 'OpenSignal', 'Ookla', 'Total Portofolio'],
          rows: [
            ['Total KPIs Evaluated', onx.total, ook.total, tot.total],
            ['Wins (inc. Draw)', onx.wins, ook.wins, tot.wins],
            ['Win Target', onx.target, ook.target, tot.target],
            ['Wins Needed', onx.wins_needed, ook.wins_needed, tot.wins_needed],
            ['Official Status', '–', '–', tot.achievement],
            ['WoW Wins Change', onx.wow_wins, ook.wow_wins, '–'],
            ['KPIs At Risk', onx.at_risk, ook.at_risk, (onx.at_risk || 0) + (ook.at_risk || 0)],
          ],
        };

        // Sheet 2: Achievement
        const achWeeks = achievementData.weeks || [];
        const achCols = [
          'Source',
          'Tech',
          'KPI',
          'Unit',
          ...achWeeks.map((w) => weekLabel(w)),
          'Δ WoW',
          'Leader',
          'Leader Val',
          'Gap',
          'Gap %',
          'Need WIN',
          'Need DRAW',
          'Margin',
          'At Risk',
        ];
        const achRows = achievementData.rows.map((r) => [
          r.source,
          r.tech,
          r.label,
          r.unit,
          ...r.cells.map((c) => (c.tsel !== null ? `${c.tsel} (${c.status})` : '–')),
          r.wow,
          r.leader || '–',
          r.leader_value,
          r.gap,
          r.gap_pct,
          r.needed_win,
          r.needed_draw,
          r.margin,
          r.at_risk ? 'YES' : 'NO',
        ]);

        // Sheet 3: Path to Target
        const pathCols = ['KPI', 'Source', 'Tech', 'Tsel', 'Leader', 'Leader Val', 'Gap', 'Gap %', 'Need WIN', 'Focus'];
        const pathRows = (achievementData.path_to_target || []).map((p) => [
          p.label,
          p.source,
          p.tech,
          p.tsel,
          p.leader,
          p.leader_value,
          p.gap,
          p.gap_pct,
          p.needed_win,
          p.focus ? 'FOCUS' : 'NO',
        ]);

        // Sheet 4: KPI Degradation
        const kpiDegCols = [
          'KPI',
          'Source',
          'Tech',
          `Prev (${weekLabel(contrib?.prev_week)})`,
          `Cur (${weekLabel(contrib?.week)})`,
          'Δ WoW',
          'Δ %',
          'Status Prev',
          'Status Cur',
          'Leader',
          'Gap',
          'Status Flip',
        ];
        const kpiDegRows = (contrib?.kpi_degrade || []).map((d) => [
          d.label,
          d.source,
          d.tech,
          d.prev,
          d.cur,
          d.delta,
          d.delta_pct,
          d.status_prev,
          d.status_cur,
          d.leader || '–',
          d.gap,
          d.flip ? 'FLIP' : 'NO',
        ]);

        // Sheet 5: Kabupaten Contributors
        const kabCols = [
          'Kabupaten',
          'KPI',
          'Prev',
          'Cur',
          'Δ WoW',
          'Δ %',
          'Status Prev',
          'Status Cur',
          'Leader',
          'Leader Val',
          'Gap',
          'Status Flip',
        ];
        const kabRows = (contrib?.kabupaten || []).map((k) => [
          k.kabupaten,
          contrib?.selected_key,
          k.prev,
          k.cur,
          k.delta,
          k.delta_pct,
          k.status_prev,
          k.status_cur,
          k.leader || '–',
          k.leader_value,
          k.gap,
          k.flip ? 'FLIP' : 'NO',
        ]);

        // Sheet 6: Map Data
        const mapCols = [
          'Kabupaten',
          'Latitude',
          'Longitude',
          'Sites',
          'Status',
          'Tsel',
          'Leader',
          'Leader Val',
          'Gap',
          'Gap %',
          'Win Count',
          'Draw Count',
          'Lose Count',
        ];
        const mapRows = (mapPts?.points || []).map((p) => [
          p.kabupaten,
          p.lat,
          p.lon,
          p.n_sites,
          p.status || '–',
          p.tsel,
          p.leader || '–',
          p.leader_value,
          p.gap,
          p.gap_pct,
          p.win_count || 0,
          p.draw_count || 0,
          p.lose_count || 0,
        ]);

        return {
          filename: `Crowdsource_${filters.region}_W${wStr}_${yStr}`,
          sheets: [
            summarySheet,
            { name: 'Achievement', columns: achCols, rows: achRows },
            { name: 'Path to target', columns: pathCols, rows: pathRows },
            { name: 'KPI degradation', columns: kpiDegCols, rows: kpiDegRows },
            { name: 'Kabupaten contributors', columns: kabCols, rows: kabRows },
            { name: 'Map', columns: mapCols, rows: mapRows },
          ],
        };
      });
    }

    return () => {
      if (onExportData) onExportData(null);
    };
  }, [achievementData, summaryData, contributorsData, mapData, mapFilters, filters, onExportData]);

  if (loading.meta) {
    return <Spinner text="Loading Crowdsource metadata..." />;
  }

  return (
    <div className="space-y-4">
      {/* Global or critical error banner */}
      {Object.values(errors).some(Boolean) && (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs font-semibold">
          {Object.entries(errors)
            .filter(([, msg]) => Boolean(msg))
            .map(([k, msg]) => (
              <div key={k}>
                <span className="font-bold uppercase tracking-wider">{k}:</span> {msg}
              </div>
            ))}
        </div>
      )}

      {/* 1. Filter Bar */}
      <CrowdFilters
        meta={meta}
        filters={filters}
        onChange={handleFilterChange}
        dataWeek={summaryData?.data_week}
        isSuperAdmin={isSuperAdmin}
        onOpenSettings={openSettingsModal}
        darkMode={darkMode}
      />

      {/* Sub-menu */}
      <div
        role="tablist"
        className={`flex flex-wrap items-center gap-1 p-1 rounded-xl border w-fit ${
          darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        {TABS.map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => handleTabChange(key)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              tab === key
                ? 'bg-blue-600 text-white shadow-xs'
                : darkMode
                  ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'achievement' && (
        <>
          {/* Summary Tiles */}
          {loading.summary && !summaryData ? (
            <Spinner text="Loading summary tiles..." />
          ) : (
            <SummaryTiles tiles={summaryData?.tiles} darkMode={darkMode} />
          )}

          {/* Win/Lose award trend: OpenSignal, Ookla, Total */}
          {summaryData?.trend && (
            <WinLoseTrend
              trend={summaryData.trend}
              onSelectWeek={(yw) => handleFilterChange({ week: yw })}
              darkMode={darkMode}
            />
          )}

          {/* Achievement & Target Table */}
          {loading.achievement && !achievementData ? (
            <Spinner text="Loading achievement table..." />
          ) : (
            <AchievementTable
              achievementData={achievementData}
              selectedKey={selectedKey}
              onSelectKey={(k) => setSelectedKey(k)}
              darkMode={darkMode}
            />
          )}

          {/* Path to Target & KPI Operator Trend */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PathToTarget
              pathToTarget={achievementData?.path_to_target}
              achievementData={achievementData}
              summaryTiles={summaryData?.tiles}
              selectedKey={selectedKey}
              onSelectKey={(k) => setSelectedKey(k)}
              darkMode={darkMode}
            />
            <KpiTrendChart trendData={trendData} loading={loading.trend} darkMode={darkMode} />
          </div>
        </>
      )}

      {tab === 'trend' && (
        <>
          <KpiTrendGrid
            region={filters.region}
            week={filters.week}
            selectedKey={selectedKey}
            onSelectKey={(k) => setSelectedKey(k)}
            darkMode={darkMode}
          />
          <KpiTrendChart trendData={trendData} loading={loading.trend} darkMode={darkMode} />
        </>
      )}

      {tab === 'degradation' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
            {/* Left: KPI degradation stacked above kabupaten contributors */}
            <div className="min-w-0">
              {loading.contributors && !contributorsData ? (
                <Spinner text="Loading KPI degradation..." />
              ) : (
                <ContributorTables
                  stacked
                  contributorsData={contributorsData}
                  onSelectKpi={(k) => {
                    setSelectedKey(k);
                    fetchContributors(k);
                  }}
                  onSelectKabupaten={(kab) => setFocusKabupaten(kab)}
                  darkMode={darkMode}
                />
              )}
            </div>

            {/* Right: distribution map, stretched to the height of the tables on the left */}
            <div className="min-w-0 h-full flex flex-col">
              <WinLoseMap
                fill
                mapData={mapData}
                catalog={meta?.catalog}
                mapFilters={mapFilters}
                onMapFilterChange={handleMapFilterChange}
                focusKabupaten={focusKabupaten}
                region={filters.region}
                darkMode={darkMode}
              />
            </div>
          </div>
        </>
      )}

      {/* Settings Modal (SuperAdmin) */}
      {settingsOpen && (
        <CrowdSettings
          targets={settingsData.targets}
          manual={settingsData.manual}
          onChange={handleSettingsSaved}
          onClose={() => setSettingsOpen(false)}
          darkMode={darkMode}
        />
      )}
    </div>
  );
}
