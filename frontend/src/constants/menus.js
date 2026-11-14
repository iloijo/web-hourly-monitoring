// Sidebar / header metadata for every page
export const MENU_META = {
  'overview': { title: 'Overview', crumbGroup: 'Overview', crumb: 'Network Overview', source: 'OneDb Live (measDailyTrafficPayload)', db: 'onedb' },
  '2g': { title: '2G Monitoring', crumbGroup: 'KPI Monitoring', crumb: '2G Daily', source: 'OneDb Live (measDy2g)', db: 'onedb' },
  '4g-hourly': { title: '4G Hourly Monitoring', crumbGroup: 'KPI Monitoring', crumb: '4G Hourly', source: 'TwoDb Live (measHy4g)', db: 'twodb' },
  '4g-daily': { title: '4G Daily Monitoring', crumbGroup: 'KPI Monitoring', crumb: '4G Daily', source: 'OneDb Live (measDy4g & measBdbh4g)', db: 'onedb' },
  '5g': { title: '5G Monitoring', crumbGroup: 'KPI Monitoring', crumb: '5G Daily', source: 'OneDb Live (measDy5g & measBdbh5g)', db: 'onedb' },
  'worst-cell': { title: 'Worst Cell Top-N', crumbGroup: 'Worst Cell & ZTZP', crumb: 'WPC 2G/4G/5G', source: 'OneDb Live (measDy2g / measDy4g / measDy5g)', db: 'onedb' },
  'cluster': { title: 'Cluster Monitoring', crumbGroup: 'Cluster Monitoring', crumb: 'Before vs After', source: 'OneDb Live (measDy2g / measDy4g / measDy5g)', db: 'onedb' },
  'ztzp': { title: 'ZTZP', crumbGroup: 'Worst Cell & ZTZP', crumb: 'Sleeping / Low Payload', source: 'OneDb Live (measDy2g / measDy4g / measDy5g)', db: 'onedb' },
  'ta-4g': { title: 'Timing Advance 4G', crumbGroup: 'Timing Advance', crumb: '4G TA', source: 'OneDb Live (measTa4g)', db: 'onedb' },
  'ta-5g': { title: 'Timing Advance 5G', crumbGroup: 'Timing Advance', crumb: '5G TA', source: 'OneDb Live (measTa5g)', db: 'onedb' },
  'cei': { title: 'CEI', crumbGroup: 'OKR', crumb: 'Customer Experience Index', source: 'OneDb (measCEIweekly, measBdbh4g) & TwoDb (ceiKQI_daily_site)', db: 'onedb' },
  'packet-loss': { title: 'TWAMP Packet Loss', crumbGroup: 'Quality & Transport', crumb: 'TWAMP 4G', source: 'OneDb Live (measTwamp4g)', db: 'onedb' },
  'admin': { title: 'Administration', crumbGroup: 'Administration', crumb: 'User & Access Rights', source: 'Local (netpulse_auth.sqlite3)', db: 'local' },
};

// Sidebar order: the first menu a role may open becomes its landing page
export const MENU_ORDER = [
  'overview', '2g', '4g-hourly', '4g-daily', '5g', 'cluster', 'cei',
  'worst-cell', 'ztzp', 'ta-4g', 'ta-5g', 'packet-loss', 'admin',
];
