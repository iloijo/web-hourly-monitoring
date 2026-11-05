// Latest data date per menu, filled once from /api/latest_dates (fallback: yesterday)
import { getJson } from '../api/client';

export const toIsoDate = (d) => d.toISOString().split('T')[0];

export const shiftDate = (isoDate, days) => {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
};

export const yesterdayStr = shiftDate(toIsoDate(new Date()), -1);

// Keys match the menu ids; values are YYYY-MM-DD
export const latestDates = {
  '4g-hourly': yesterdayStr,
  '4g-daily': yesterdayStr,
  '5g': yesterdayStr,
  '2g': yesterdayStr,
  'ta-4g': yesterdayStr,
  'ta-5g': yesterdayStr,
  'packet-loss': yesterdayStr,
};

const API_KEY_TO_MENU = {
  '4g_hourly': '4g-hourly',
  '4g_daily': '4g-daily',
  '5g': '5g',
  '2g': '2g',
  'ta_4g': 'ta-4g',
  'ta_5g': 'ta-5g',
  'packet_loss': 'packet-loss',
};

let loadPromise = null;

// Fetches the latest dates once; later callers share the same promise
export const loadLatestDates = () => {
  if (!loadPromise) {
    loadPromise = getJson('/api/latest_dates')
      .then(json => {
        Object.entries(API_KEY_TO_MENU).forEach(([apiKey, menu]) => {
          if (json?.[apiKey]) latestDates[menu] = json[apiKey];
        });
        return latestDates;
      })
      .catch(() => latestDates);
  }
  return loadPromise;
};

export const getInitialDateRange = (mode = 'hourly', menu = mode === 'daily' ? '4g-daily' : '4g-hourly') => {
  const end = latestDates[menu] || yesterdayStr;
  return { start: shiftDate(end, mode === 'daily' ? -14 : -6), end };
};
