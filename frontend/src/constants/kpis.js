// KPI catalogs, band options and defaults shared by the monitoring views
export const APP_NAME = "NetPulse";
export const APP_VERSION = "v3.8.0";

export const BAND_OPTIONS_4G = [
  { id: 'L1800', label: 'L1800 (1.8 GHz)' },
  { id: 'L2100', label: 'L2100 (2.1 GHz)' },
  { id: 'L900', label: 'L900 (900 MHz)' },
  { id: 'L2300_1', label: 'L2300 Carrier 1' },
  { id: 'L2300_2', label: 'L2300 Carrier 2' },
  { id: 'L2300_3', label: 'L2300 Carrier 3' },
  { id: 'L700', label: 'L700 (700 MHz)' },
  { id: 'L2600', label: 'L2600' }
];

export const BAND_OPTIONS_5G = [
  { id: 'NR2300', label: 'NR2300 (2.3 GHz)' },
  { id: 'NR2600', label: 'NR2600 (2.6 GHz)' },
  { id: 'NR2100', label: 'NR2100 (2.1 GHz)' },
  { id: 'NR3500', label: 'NR3500 (3.5 GHz)' }
];

export const BAND_OPTIONS_2G = [
  { id: 'GSM', label: 'GSM (900 MHz)' },
  { id: 'DCS', label: 'DCS (1800 MHz)' }
];

export const ALL_BAND_IDS = BAND_OPTIONS_4G.map(b => b.id);

// Comprehensive list of Hourly KPIs for TwoDb measHy4g
export const HOURLY_KPIS = [
  { id: 'payload', label: 'Payload (GB)', unit: 'GB', category: 'Productivity' },
  { id: 'max_rrc', label: 'Max RRC User (Users)', unit: 'Users', category: 'User Concurrency' },
  { id: 'active_users', label: 'Active Users', unit: 'Users', category: 'User Concurrency' },
  { id: 'availability', label: 'Availability (%)', unit: '%', category: 'Accessibility' },
  { id: 'rrc_setup_sr', label: 'RRC Setup SR (%)', unit: '%', category: 'Accessibility' },
  { id: 'erab_setup_sr', label: 'E-RAB Setup SR (%)', unit: '%', category: 'Accessibility' },
  { id: 'cssr', label: 'CSSR (%)', unit: '%', category: 'Accessibility' },
  { id: 'erab_drop_rate', label: 'E-RAB Drop Rate (%)', unit: '%', category: 'Retainability' },
  { id: 'service_drop_rate', label: 'Service Drop Rate (%)', unit: '%', category: 'Retainability' },
  { id: 'dl_prb', label: 'DL PRB (%)', unit: '%', category: 'Capacity & Utilization' },
  { id: 'ul_prb', label: 'UL PRB (%)', unit: '%', category: 'Capacity & Utilization' },
  { id: 'user_dl_thp', label: 'User DL Thp (Mbps)', unit: 'Mbps', category: 'Throughput & Speed' },
  { id: 'user_ul_thp', label: 'User UL Thp (Mbps)', unit: 'Mbps', category: 'Throughput & Speed' },
  { id: 'spectrum_efficiency', label: 'Spectrum Efficiency', unit: '', category: 'Throughput & Speed' },
  { id: 'cqi', label: 'CQI', unit: '', category: 'Quality & Latency' },
  { id: 'avg_ni_dbm', label: 'Average NI (dBm)', unit: 'dBm', category: 'Quality & Latency' },
  { id: 'ifho_sr', label: 'IFHO SR (%)', unit: '%', category: 'Mobility' },
  { id: 'inter_freq_ho_sr', label: 'Inter-Freq HO SR (%)', unit: '%', category: 'Mobility' }
];

// Main KPIs for the Sectoral view (one column per sector); ids missing from a menu's catalog are skipped
export const SECTORAL_KPIS = ['payload', 'payload_total', 'dl_prb', 'user_dl_thp', 'user_ul_thp', 'availability', 'spectrum_efficiency', 'cqi', 'max_rrc', 'max_rrc_users'];

export const DEFAULT_HOURLY_KPIS = ['payload', 'max_rrc', 'availability', 'dl_prb', 'user_dl_thp', 'cqi'];

// Fallback list of Daily KPIs from measDy4g and measBdbh4g
export const FALLBACK_DAILY_KPIS = [
  // Productivity
  { id: 'payload', label: 'Payload (GB)', unit: 'GB', category: 'Productivity', source: 'measDy4g', is_bdbh: false },
  { id: 'dl_traffic', label: 'DL Traffic Volume (GB)', unit: 'GB', category: 'Productivity', source: 'measDy4g', is_bdbh: false },
  { id: 'ul_traffic', label: 'UL Traffic Volume (GB)', unit: 'GB', category: 'Productivity', source: 'measDy4g', is_bdbh: false },
  { id: 'ca_payload_total', label: 'Total CA Payload (GB)', unit: 'GB', category: 'Productivity', source: 'measDy4g', is_bdbh: false },
  { id: 'ca_payload_dl', label: 'DL CA Payload (GB)', unit: 'GB', category: 'Productivity', source: 'measDy4g', is_bdbh: false },
  { id: 'ca_payload_ul', label: 'UL CA Payload (GB)', unit: 'GB', category: 'Productivity', source: 'measDy4g', is_bdbh: false },
  { id: 'volte_payload_dl', label: 'VoLTE DL Volume (MB)', unit: 'MB', category: 'Productivity', source: 'measDy4g', is_bdbh: false },
  { id: 'volte_payload_ul', label: 'VoLTE UL Volume (MB)', unit: 'MB', category: 'Productivity', source: 'measDy4g', is_bdbh: false },
  { id: 'volte_traffic', label: 'VoLTE Traffic (Erlang)', unit: 'Erl', category: 'Productivity', source: 'measDy4g', is_bdbh: false },

  // Accessibility
  { id: 'availability', label: 'Availability (%)', unit: '%', category: 'Accessibility', source: 'measDy4g', is_bdbh: false },
  { id: 'rrc_setup_sr', label: 'RRC Setup SR (%)', unit: '%', category: 'Accessibility', source: 'measDy4g', is_bdbh: false },
  { id: 'erab_setup_sr', label: 'E-RAB Setup SR (%)', unit: '%', category: 'Accessibility', source: 'measDy4g', is_bdbh: false },
  { id: 'cssr', label: 'CSSR (%)', unit: '%', category: 'Accessibility', source: 'measDy4g', is_bdbh: false },
  { id: 's1_conn_sr', label: 'S1 Connection SR (%)', unit: '%', category: 'Accessibility', source: 'measDy4g', is_bdbh: false },
  { id: 'volte_rrc_sr', label: 'VoLTE RRC SR (%)', unit: '%', category: 'Accessibility', source: 'measDy4g', is_bdbh: false },
  { id: 'volte_erab_qci1_sr', label: 'VoLTE E-RAB QCI1 SR (%)', unit: '%', category: 'Accessibility', source: 'measDy4g', is_bdbh: false },
  { id: 'volte_erab_qci5_sr', label: 'VoLTE E-RAB QCI5 SR (%)', unit: '%', category: 'Accessibility', source: 'measDy4g', is_bdbh: false },
  { id: 'volte_call_setup_sr', label: 'VoLTE Call Setup SR (%)', unit: '%', category: 'Accessibility', source: 'measDy4g', is_bdbh: false },
  { id: 'csfb_sr', label: 'CSFB SR (%)', unit: '%', category: 'Accessibility', source: 'measDy4g', is_bdbh: false },

  // Retainability
  { id: 'erab_drop_rate', label: 'E-RAB Drop Rate (%)', unit: '%', category: 'Retainability', source: 'measDy4g', is_bdbh: false },
  { id: 'service_drop_rate', label: 'Service Drop Rate (%)', unit: '%', category: 'Retainability', source: 'measDy4g', is_bdbh: false },
  { id: 'volte_call_drop_rate', label: 'VoLTE Call Drop Rate (%)', unit: '%', category: 'Retainability', source: 'measDy4g', is_bdbh: false },

  // Capacity & Utilization (measBdbh4g)
  { id: 'dl_prb', label: 'DL PRB (%) [BDBH]', unit: '%', category: 'Capacity & Utilization', source: 'measBdbh4g', is_bdbh: true },
  { id: 'ul_prb', label: 'UL PRB (%) [BDBH]', unit: '%', category: 'Capacity & Utilization', source: 'measBdbh4g', is_bdbh: true },

  // Throughput & Speed (measBdbh4g + measDy4g)
  { id: 'user_dl_thp', label: 'User DL Thp (Mbps) [BDBH]', unit: 'Mbps', category: 'Throughput & Speed', source: 'measBdbh4g', is_bdbh: true },
  { id: 'user_ul_thp', label: 'User UL Thp (Mbps) [BDBH]', unit: 'Mbps', category: 'Throughput & Speed', source: 'measBdbh4g', is_bdbh: true },
  { id: 'spectrum_efficiency', label: 'Spectrum Efficiency [BDBH]', unit: '', category: 'Throughput & Speed', source: 'measBdbh4g', is_bdbh: true },
  { id: 'cell_dl_thp', label: 'Cell DL Thp (Mbps)', unit: 'Mbps', category: 'Throughput & Speed', source: 'measDy4g', is_bdbh: false },
  { id: 'cell_ul_thp', label: 'Cell UL Thp (Mbps)', unit: 'Mbps', category: 'Throughput & Speed', source: 'measDy4g', is_bdbh: false },
  { id: 'ca_dl_thp', label: 'CA DL Thp (Mbps)', unit: 'Mbps', category: 'Throughput & Speed', source: 'measDy4g', is_bdbh: false },
  { id: 'ca_ul_thp', label: 'CA UL Thp (Mbps)', unit: 'Mbps', category: 'Throughput & Speed', source: 'measDy4g', is_bdbh: false },
  { id: 'max_cell_dl_rlc_thp', label: 'Max Cell DL RLC Thp (Mbps)', unit: 'Mbps', category: 'Throughput & Speed', source: 'measDy4g', is_bdbh: false },
  { id: 'max_cell_ul_rlc_thp', label: 'Max Cell UL RLC Thp (Mbps)', unit: 'Mbps', category: 'Throughput & Speed', source: 'measDy4g', is_bdbh: false },
  { id: 'max_cell_dl_pdcp_thp', label: 'Max Cell DL PDCP Thp (Mbps)', unit: 'Mbps', category: 'Throughput & Speed', source: 'measDy4g', is_bdbh: false },
  { id: 'max_cell_ul_pdcp_thp', label: 'Max Cell UL PDCP Thp (Mbps)', unit: 'Mbps', category: 'Throughput & Speed', source: 'measDy4g', is_bdbh: false },

  // User Concurrency
  { id: 'max_rrc', label: 'Max RRC User (Users)', unit: 'Users', category: 'User Concurrency', source: 'measDy4g', is_bdbh: false },
  { id: 'active_users', label: 'Active Users', unit: 'Users', category: 'User Concurrency', source: 'measDy4g', is_bdbh: false },
  { id: 'avg_dl_active_users', label: 'Avg DL Active Users', unit: 'Users', category: 'User Concurrency', source: 'measDy4g', is_bdbh: false },
  { id: 'max_dl_active_users_qci1', label: 'Max DL Active Users QCI1', unit: 'Users', category: 'User Concurrency', source: 'measDy4g', is_bdbh: false },
  { id: 'max_ul_active_users_qci1', label: 'Max UL Active Users QCI1', unit: 'Users', category: 'User Concurrency', source: 'measDy4g', is_bdbh: false },
  { id: 'max_user_volte', label: 'Max VoLTE Users', unit: 'Users', category: 'User Concurrency', source: 'measDy4g', is_bdbh: false },
  { id: 'simultaneous_ue_avg', label: 'Avg Simultaneous UE', unit: 'Users', category: 'User Concurrency', source: 'measDy4g', is_bdbh: false },
  { id: 'simultaneous_ue_max', label: 'Max Simultaneous UE', unit: 'Users', category: 'User Concurrency', source: 'measDy4g', is_bdbh: false },
  { id: 'rrc_connected_mean', label: 'Mean RRC Connected Users', unit: 'Users', category: 'User Concurrency', source: 'measDy4g', is_bdbh: false },

  // Quality & Latency
  { id: 'cqi', label: 'CQI', unit: '', category: 'Quality & Latency', source: 'measDy4g', is_bdbh: false },
  { id: 'cqi_rev', label: 'CQI Rev', unit: '', category: 'Quality & Latency', source: 'measDy4g', is_bdbh: false },
  { id: 'cqi_ge_7', label: 'CQI >= 7 (%)', unit: '%', category: 'Quality & Latency', source: 'measDy4g', is_bdbh: false },
  { id: 'avg_ni_dbm', label: 'Average NI (dBm)', unit: 'dBm', category: 'Quality & Latency', source: 'measDy4g', is_bdbh: false },
  { id: 'max_ni_dbm', label: 'Maximum NI (dBm)', unit: 'dBm', category: 'Quality & Latency', source: 'measDy4g', is_bdbh: false },
  { id: 'avg_cell_rssi', label: 'Average Cell RSSI (dBm)', unit: 'dBm', category: 'Quality & Latency', source: 'measDy4g', is_bdbh: false },
  { id: 'dl_init_bler', label: 'DL Init BLER (%)', unit: '%', category: 'Quality & Latency', source: 'measDy4g', is_bdbh: false },
  { id: 'ul_init_bler', label: 'UL Init BLER (%)', unit: '%', category: 'Quality & Latency', source: 'measDy4g', is_bdbh: false },
  { id: 'dl_ip_packet_delay', label: 'DL IP Packet Delay (ms)', unit: 'ms', category: 'Quality & Latency', source: 'measDy4g', is_bdbh: false },
  { id: 'ip_latency', label: 'IP Latency (ms)', unit: 'ms', category: 'Quality & Latency', source: 'measDy4g', is_bdbh: false },
  { id: 'pdcp_sdu_delay', label: 'Avg DL PDCP SDU Delay (ms)', unit: 'ms', category: 'Quality & Latency', source: 'measDy4g', is_bdbh: false },

  // Mobility
  { id: 'ifho_sr', label: 'IFHO SR (%)', unit: '%', category: 'Mobility', source: 'measDy4g', is_bdbh: false },
  { id: 'inter_freq_ho_sr', label: 'Inter-Freq LTE HO SR (%)', unit: '%', category: 'Mobility', source: 'measDy4g', is_bdbh: false },
  { id: 'x2_ho_out_sr', label: 'X2 HO Out (%)', unit: '%', category: 'Mobility', source: 'measDy4g', is_bdbh: false },
  { id: 's1_ho_out_sr', label: 'S1 HO Out (%)', unit: '%', category: 'Mobility', source: 'measDy4g', is_bdbh: false },
  { id: 'inter_freq_x2_ho_sr', label: 'Inter-Freq X2 HO SR (%)', unit: '%', category: 'Mobility', source: 'measDy4g', is_bdbh: false },
  { id: 'inter_freq_s1_ho_sr', label: 'Inter-Freq S1 HO SR (%)', unit: '%', category: 'Mobility', source: 'measDy4g', is_bdbh: false },
  { id: 'lte_gsm_ho_sr', label: 'LTE-GSM HO SR (%)', unit: '%', category: 'Mobility', source: 'measDy4g', is_bdbh: false },
  { id: 'volte_intra_freq_hosr', label: 'VoLTE Intra-Freq HO SR (%)', unit: '%', category: 'Mobility', source: 'measDy4g', is_bdbh: false },
  { id: 'volte_inter_freq_hosr', label: 'VoLTE Inter-Freq HO SR (%)', unit: '%', category: 'Mobility', source: 'measDy4g', is_bdbh: false },
  { id: 'srvcc_gsm_hosr', label: 'SRVCC LTE-GSM HO SR (%)', unit: '%', category: 'Mobility', source: 'measDy4g', is_bdbh: false }
];

export const DEFAULT_DAILY_KPIS = [
  'payload',
  'max_rrc',
  'availability',
  'dl_prb',
  'ul_prb',
  'user_dl_thp',
  'user_ul_thp',
  'spectrum_efficiency',
  'cqi',
  'cssr',
  'erab_drop_rate',
  'service_drop_rate'
];

// Default Regional KPIs matching user prompt
export const REGIONAL_DEFAULT_KPIS = [
  'payload',
  'dl_traffic',
  'ul_traffic',
  'volte_payload_dl',
  'max_rrc',
  'active_users',
  'availability',
  'rrc_setup_sr',
  'erab_setup_sr',
  'cssr',
  'ifho_sr',
  'inter_freq_ho_sr',
  'spectrum_efficiency',
  'cqi',
  'csfb_sr',
  'dl_ip_packet_delay'
];

// Fallback 5G KPIs
export const FALLBACK_5G_KPIS = [
  { id: 'payload', label: 'Payload (GB)', unit: 'GB', category: 'Productivity' },
  { id: 'payload_dl', label: 'DL Payload (GB)', unit: 'GB', category: 'Productivity' },
  { id: 'payload_ul', label: 'UL Payload (GB)', unit: 'GB', category: 'Productivity' },
  { id: 'user_dl_thp', label: 'User DL Thp (Mbps) [BDBH]', unit: 'Mbps', category: 'Throughput & Speed' },
  { id: 'user_ul_thp', label: 'User UL Thp (Mbps) [BDBH]', unit: 'Mbps', category: 'Throughput & Speed' },
  { id: 'cell_dl_thp', label: 'Cell DL Thp (Mbps) [BDBH]', unit: 'Mbps', category: 'Throughput & Speed' },
  { id: 'cell_ul_thp', label: 'Cell UL Thp (Mbps) [BDBH]', unit: 'Mbps', category: 'Throughput & Speed' },
  { id: 'spectrum_efficiency', label: 'Spectrum Efficiency (bps/Hz) [BDBH]', unit: 'bps/Hz', category: 'Throughput & Speed' },
  { id: 'sn_setup_sr', label: 'SN Setup SR (%)', unit: '%', category: 'Accessibility' },
  { id: 'availability', label: 'Availability (%)', unit: '%', category: 'Accessibility' },
  { id: 'retainability', label: 'NR Retainability Rate (%)', unit: '%', category: 'Retainability' },
  { id: 'packet_loss', label: 'Packet Loss Rate (%)', unit: '%', category: 'Retainability' },
  { id: 'intra_ho_sr', label: 'Intra-Freq HO SR (%)', unit: '%', category: 'Mobility' },
  { id: 'inter_ho_sr', label: 'Inter-Freq HO SR (%)', unit: '%', category: 'Mobility' },
  { id: 'dl_prb', label: 'DL PRB Utilization (%) [BDBH]', unit: '%', category: 'Capacity & Utilization' },
  { id: 'ul_prb', label: 'UL PRB Utilization (%) [BDBH]', unit: '%', category: 'Capacity & Utilization' },
  { id: 'active_users', label: 'Active Users', unit: 'Users', category: 'User Concurrency' },
  { id: 'rrc_users', label: 'RRC Users', unit: 'Users', category: 'User Concurrency' },
  { id: 'max_rrc_users', label: 'Max RRC Users', unit: 'Users', category: 'User Concurrency' },
  { id: 'cqi', label: 'CQI Average', unit: '', category: 'Quality & Latency' },
  { id: 'cqi_256qam', label: 'CQI 256 QAM', unit: '', category: 'Quality & Latency' },
  { id: 'cqi_64qam', label: 'CQI 64 QAM', unit: '', category: 'Quality & Latency' },
  { id: 'latency_dl', label: 'DL Latency (ms)', unit: 'ms', category: 'Quality & Latency' },
  { id: 'latency_ul', label: 'UL Latency (ms)', unit: 'ms', category: 'Quality & Latency' },
  { id: 'uplink_interference', label: 'UL Interference (dBm)', unit: 'dBm', category: 'Quality & Latency' }
];

export const ALL_5G_KPI_IDS = FALLBACK_5G_KPIS.map(k => k.id);

// Fallback 2G KPIs
export const FALLBACK_2G_KPIS = [
  { id: 'payload_total', label: 'Total 2G Payload (GB)', unit: 'GB', category: 'Traffic & Payload' },
  { id: 'payload_gprs', label: 'GPRS Payload (GB)', unit: 'GB', category: 'Traffic & Payload' },
  { id: 'payload_edge', label: 'EDGE Payload (GB)', unit: 'GB', category: 'Traffic & Payload' },
  { id: 'tch_traffic', label: 'TCH Traffic (Erlang)', unit: 'Erl', category: 'Traffic & Payload' },
  { id: 'sdcch_traffic', label: 'SDCCH Traffic (Erlang)', unit: 'Erl', category: 'Traffic & Payload' },
  { id: 'tch_hr_traffic', label: 'TCH Half Rate Traffic (Erl)', unit: 'Erl', category: 'Traffic & Payload' },
  { id: 'tch_fr_traffic', label: 'TCH Full Rate Traffic (Erl)', unit: 'Erl', category: 'Traffic & Payload' },
  { id: 'availability', label: 'TCH Availability (%)', unit: '%', category: 'Accessibility' },
  { id: 'sdsr', label: 'SDCCH Setup SR (%)', unit: '%', category: 'Accessibility' },
  { id: 'sd_to_tch_sr', label: 'SD to TCH Success Rate (%)', unit: '%', category: 'Accessibility' },
  { id: 'tch_block_rate', label: 'TCH Blocking Rate (%)', unit: '%', category: 'Accessibility' },
  { id: 'sdcch_block_rate', label: 'SDCCH Blocking Rate (%)', unit: '%', category: 'Accessibility' },
  { id: 'tbf_dl_est_sr', label: 'TBF DL Est SR (%)', unit: '%', category: 'Accessibility' },
  { id: 'tbf_ul_est_sr', label: 'TBF UL Est SR (%)', unit: '%', category: 'Accessibility' },
  { id: 'tch_drop_rate', label: 'TCH Drop Rate (%)', unit: '%', category: 'Retainability' },
  { id: 'tbf_comp_sr', label: 'TBF Completion SR (%)', unit: '%', category: 'Retainability' },
  { id: 'hosr', label: 'Handover Success Rate (HOSR) (%)', unit: '%', category: 'Mobility' },
  { id: 'fastreturn_lte', label: 'Fast Return to LTE', unit: 'Events', category: 'Mobility' },
  { id: 'fastreturn_utran', label: 'Fast Return to UTRAN', unit: 'Events', category: 'Mobility' },
  { id: 'edge_dl_thp', label: 'EDGE DL Throughput (kbps)', unit: 'kbps', category: 'Throughput & Speed' },
  { id: 'gprs_dl_thp', label: 'GPRS DL Throughput (kbps)', unit: 'kbps', category: 'Throughput & Speed' },
  { id: 'dl_qual', label: 'DL Qual 0-5 (%)', unit: '%', category: 'Quality & Interference' },
  { id: 'ul_qual', label: 'UL Qual 0-5 (%)', unit: '%', category: 'Quality & Interference' },
  { id: 'icm_interference', label: 'ICM Interference (%)', unit: '%', category: 'Quality & Interference' },
  { id: 'dl_emi', label: 'DL EMI', unit: '', category: 'Quality & Interference' },
  { id: 'ul_emi', label: 'UL EMI', unit: '', category: 'Quality & Interference' },
  { id: 'trx_count', label: 'Number of TRX', unit: 'TRX', category: 'Equipment & Capacity' },
  { id: 'tch_count', label: 'Number of TCH Channels', unit: 'Channels', category: 'Equipment & Capacity' },
  { id: 'sdcch_count', label: 'Number of SDCCH Channels', unit: 'Channels', category: 'Equipment & Capacity' },
  { id: 'pdtch_dynamic', label: 'Dynamic PDTCH', unit: 'Channels', category: 'Equipment & Capacity' }
];

export const ALL_2G_KPI_IDS = FALLBACK_2G_KPIS.map(k => k.id);

// Fixed chart order: these first (whatever the menu calls them), then the rest in catalog order
const KPI_DISPLAY_PRIORITY = [
  'payload', 'payload_total',
  'dl_prb', 'user_dl_thp',
  'ul_prb', 'user_ul_thp',
  'max_rrc', 'rrc_users', 'max_rrc_users',
  'active_users',
  'spectrum_efficiency',
  'cqi',
];

export const orderKpiIds = (ids, catalog) => {
  const catalogIndex = new Map(catalog.map((k, i) => [k.id, i]));
  const rank = (id) => {
    const p = KPI_DISPLAY_PRIORITY.indexOf(id);
    return p >= 0 ? p : KPI_DISPLAY_PRIORITY.length + (catalogIndex.get(id) ?? catalog.length);
  };
  return [...ids].sort((a, b) => rank(a) - rank(b));
};

export const KPI_MENUS = ['4g-hourly', '4g-daily', '5g', '2g'];

export const bandOptionsFor = (menu) =>
  menu === '5g' ? BAND_OPTIONS_5G : menu === '2g' ? BAND_OPTIONS_2G : BAND_OPTIONS_4G;
