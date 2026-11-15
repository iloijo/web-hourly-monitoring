import React, { useMemo } from 'react';
import { Signal, Radio, Award } from 'lucide-react';
import ReactECharts from '../../lib/echarts';
import { Card } from '../cei/ui';
import { winLoseTrendOption, totalWinTrendOption } from './charts';

export default function WinLoseTrend({ trend, onSelectWeek, darkMode }) {
  const onxOption = useMemo(
    () => winLoseTrendOption(trend, 'ONX', darkMode),
    [trend, darkMode]
  );

  const ookOption = useMemo(
    () => winLoseTrendOption(trend, 'OOKLA', darkMode),
    [trend, darkMode]
  );

  const totalOption = useMemo(
    () => totalWinTrendOption(trend, darkMode),
    [trend, darkMode]
  );

  const onChartClick = (params) => {
    if (params && params.dataIndex !== undefined && trend[params.dataIndex]) {
      const selectedWeek = trend[params.dataIndex].week;
      if (selectedWeek && onSelectWeek) {
        onSelectWeek(selectedWeek);
      }
    }
  };

  const onEvents = {
    click: onChartClick,
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
      {/* 1. OpenSignal Trend */}
      <Card
        title="OpenSignal WIN / LOSE Trend"
        Icon={Signal}
        iconClass="text-emerald-500"
        meta="26 Weeks"
        darkMode={darkMode}
      >
        <div className="relative">
          <ReactECharts
            option={onxOption}
            onEvents={onEvents}
            notMerge={true}
            lazyUpdate={true}
            style={{ height: 250, width: '100%' }}
          />
          <div className="text-[10px] text-slate-400 text-center mt-1">
            Click bar to jump to that week · Dashed line = Target (≤ W40)
          </div>
        </div>
      </Card>

      {/* 2. Ookla Trend */}
      <Card
        title="Ookla WIN / LOSE Trend"
        Icon={Radio}
        iconClass="text-amber-500"
        meta="26 Weeks"
        darkMode={darkMode}
      >
        <div className="relative">
          <ReactECharts
            option={ookOption}
            onEvents={onEvents}
            notMerge={true}
            lazyUpdate={true}
            style={{ height: 250, width: '100%' }}
          />
          <div className="text-[10px] text-slate-400 text-center mt-1">
            Click bar to jump to that week · Dashed line = Target (≤ W40)
          </div>
        </div>
      </Card>

      {/* 3. Total Wins / Achievement Trend */}
      <Card
        title="Total Portofolio Achievement"
        Icon={Award}
        iconClass="text-blue-500"
        meta="Target ≥ 12 (W41+)"
        darkMode={darkMode}
      >
        <div className="relative">
          <ReactECharts
            option={totalOption}
            onEvents={onEvents}
            notMerge={true}
            lazyUpdate={true}
            style={{ height: 250, width: '100%' }}
          />
          <div className="text-[10px] text-slate-400 text-center mt-1">
            <span className="text-emerald-500 font-bold">Green = ACH</span> ·{' '}
            <span className="text-rose-500 font-bold">Red = NOT ACH</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
