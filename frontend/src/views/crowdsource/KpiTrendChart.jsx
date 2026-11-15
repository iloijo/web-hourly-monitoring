import React, { useMemo } from 'react';
import { LineChart } from 'lucide-react';
import ReactECharts from '../../lib/echarts';
import { Card, Spinner } from '../cei/ui';
import { kpiTrendOption } from './charts';

export default function KpiTrendChart({
  trendData,
  loading,
  darkMode,
}) {
  const chartOption = useMemo(
    () => kpiTrendOption(trendData, darkMode),
    [trendData, darkMode]
  );

  const title = trendData?.label
    ? `Trend — ${trendData.label} (${trendData.source})`
    : 'KPI Operator Trend';

  return (
    <Card
      title={title}
      Icon={LineChart}
      iconClass="text-emerald-500"
      meta={trendData?.unit ? `Unit: ${trendData.unit}` : ''}
      darkMode={darkMode}
    >
      {loading ? (
        <Spinner text="Loading operator trend..." />
      ) : (
        <div className="relative">
          <ReactECharts
            option={chartOption}
            notMerge={true}
            lazyUpdate={true}
            style={{ height: 280, width: '100%' }}
          />
          <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1 px-1">
            <span>
              {trendData?.source === 'ONX'
                ? 'Shaded area = 95% Confidence Interval (LCI – UCI)'
                : 'Score progression by operator'}
            </span>
            {trendData?.needed_win && (
              <span className="text-rose-500 font-bold">
                Target to win: {trendData.needed_win} {trendData.unit}
              </span>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
