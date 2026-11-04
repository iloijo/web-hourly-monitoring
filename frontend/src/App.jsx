import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import SectorPayloadChart from './components/SectorPayloadChart';
import DataLoadingOverlay from './components/DataLoadingOverlay';
import KpiDropdownPopover from './components/KpiDropdownPopover';
import AggregationScopeBar from './components/AggregationScopeBar';
import MultiSelectDropdown from './components/MultiSelectDropdown';
import { 
  Menu, 
  Calendar, 
  RefreshCw, 
  CheckCircle2, 
  Activity, 
  Radio, 
  BarChart3, 
  Sliders, 
  ChevronLeft, 
  ChevronDown, 
  ChevronUp, 
  ChevronRight, 
  Clock, 
  Layers, 
  Search, 
  HardDrive, 
  FileSpreadsheet, 
  Filter, 
  Check, 
  Moon, 
  Sun, 
  X, 
  LayoutGrid, 
  AlertTriangle, 
  Info, 
  SlidersHorizontal, 
  Sparkles, 
  Database,
  Antenna,
  Network,
  Building2,
  MapPin,
  Globe,
  Zap,
  Wifi
} from 'lucide-react';

const BAND_OPTIONS_4G = [
  { id: 'L1800', label: 'L1800 (1.8 GHz)' },
  { id: 'L2100', label: 'L2100 (2.1 GHz)' },
  { id: 'L900', label: 'L900 (900 MHz)' },
  { id: 'L2300_1', label: 'L2300 Carrier 1' },
  { id: 'L2300_2', label: 'L2300 Carrier 2' },
  { id: 'L2300_3', label: 'L2300 Carrier 3' },
  { id: 'L700', label: 'L700 (700 MHz)' },
  { id: 'L2600', label: 'L2600' }
];

const BAND_OPTIONS_5G = [
  { id: 'NR2300', label: 'NR2300 (2.3 GHz)' },
  { id: 'NR2100', label: 'NR2100 (2.1 GHz)' },
  { id: 'NR3500', label: 'NR3500 (3.5 GHz)' }
];

const BAND_OPTIONS_2G = [
  { id: 'GSM', label: 'GSM (900 MHz)' },
  { id: 'DCS', label: 'DCS (1800 MHz)' }
];

const BAND_OPTIONS = BAND_OPTIONS_4G;
const ALL_BAND_IDS = BAND_OPTIONS_4G.map(b => b.id);

// Comprehensive list of Hourly KPIs for TwoDb measHy4g
const HOURLY_KPIS = [
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

const DEFAULT_HOURLY_KPIS = ['payload', 'max_rrc', 'availability', 'dl_prb', 'user_dl_thp', 'cqi'];

// Fallback list of Daily KPIs from measDy4g and measBdbh4g
const FALLBACK_DAILY_KPIS = [
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
  { id: 'srvcc_gsm_hosr', label: 'SRVCC LTE-GSM HO SR (%)', unit: '%', category: 'Mobility', source: 'measDy4g', is_bdbh: false },

  // Equipment & System
  { id: 'avg_cpu_util', label: 'Avg CPU Util (%)', unit: '%', category: 'Equipment & System', source: 'measDy4g', is_bdbh: false },
  { id: 'peak_cpu_util', label: 'Peak CPU Util (%)', unit: '%', category: 'Equipment & System', source: 'measDy4g', is_bdbh: false },
  { id: 'paging_congestion_rate', label: 'Paging Congestion Rate (%)', unit: '%', category: 'Equipment & System', source: 'measDy4g', is_bdbh: false },
  { id: 'paging_sr', label: 'Paging Success Rate (%)', unit: '%', category: 'Equipment & System', source: 'measDy4g', is_bdbh: false },
  { id: 'rrc_reestablishment_ratio', label: 'RRC Re-establishment Ratio (%)', unit: '%', category: 'Equipment & System', source: 'measDy4g', is_bdbh: false }
];

const DEFAULT_DAILY_KPIS = [
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
const REGIONAL_DEFAULT_KPIS = [
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
  'ip_delay'
];

// Fallback 5G KPIs
const FALLBACK_5G_KPIS = [
  { id: 'payload', label: 'Payload (GB)', unit: 'GB', category: 'Productivity' },
  { id: 'payload_dl', label: 'DL Payload (GB)', unit: 'GB', category: 'Productivity' },
  { id: 'payload_ul', label: 'UL Payload (GB)', unit: 'GB', category: 'Productivity' },
  { id: 'user_dl_thp', label: 'User DL Thp (Mbps)', unit: 'Mbps', category: 'Throughput & Speed' },
  { id: 'user_ul_thp', label: 'User UL Thp (Mbps)', unit: 'Mbps', category: 'Throughput & Speed' },
  { id: 'cell_dl_thp', label: 'Cell DL Thp (Mbps)', unit: 'Mbps', category: 'Throughput & Speed' },
  { id: 'cell_ul_thp', label: 'Cell UL Thp (Mbps)', unit: 'Mbps', category: 'Throughput & Speed' },
  { id: 'spectrum_efficiency', label: 'Spectrum Efficiency (bps/Hz)', unit: 'bps/Hz', category: 'Throughput & Speed' },
  { id: 'sn_setup_sr', label: 'SN Setup SR (%)', unit: '%', category: 'Accessibility' },
  { id: 'availability', label: 'Availability (%)', unit: '%', category: 'Accessibility' },
  { id: 'retainability', label: 'NR Retainability Rate (%)', unit: '%', category: 'Retainability' },
  { id: 'packet_loss', label: 'Packet Loss Rate (%)', unit: '%', category: 'Retainability' },
  { id: 'intra_ho_sr', label: 'Intra-Freq HO SR (%)', unit: '%', category: 'Mobility' },
  { id: 'inter_ho_sr', label: 'Inter-Freq HO SR (%)', unit: '%', category: 'Mobility' },
  { id: 'dl_prb', label: 'DL PRB Utilization (%)', unit: '%', category: 'Capacity & Utilization' },
  { id: 'ul_prb', label: 'UL PRB Utilization (%)', unit: '%', category: 'Capacity & Utilization' },
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

const ALL_5G_KPI_IDS = FALLBACK_5G_KPIS.map(k => k.id);

// Fallback 2G KPIs
const FALLBACK_2G_KPIS = [
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

const ALL_2G_KPI_IDS = FALLBACK_2G_KPIS.map(k => k.id);

const LATEST_TWODB_DATE = '2026-10-27';
const LATEST_ONEDB_DATE = '2026-11-03';

const getInitialDateRange = (mode = 'hourly') => {
  const latestDateStr = mode === 'daily' ? LATEST_ONEDB_DATE : LATEST_TWODB_DATE;
  const dEnd = new Date(latestDateStr);
  const dStart = new Date(latestDateStr);
  dStart.setDate(dStart.getDate() - (mode === 'daily' ? 14 : 6));
  return {
    start: dStart.toISOString().split('T')[0],
    end: dEnd.toISOString().split('T')[0]
  };
};

export default function App() {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');

  // Navigation mode: '4g-hourly' or '4g-daily'
  const [activeMenu, setActiveMenu] = useState("4g-hourly");
  const [timeMode, setTimeMode] = useState("hourly");

  // Aggregation Scope: Regional, NOP, City/Kabupaten, Kecamatan, Site, Sector (DEFAULT!)
  const [aggregationScope, setAggregationScope] = useState("sector");
  // Aggregation Mode: 'full' (Aggregation) vs 'band' (Band)
  const [aggregationMode, setAggregationMode] = useState("full");

  // Scope Entity Selections
  const [selectedNops, setSelectedNops] = useState(['MAKASSAR']);
  const [selectedCities, setSelectedCities] = useState(['KOTA MAKASSAR']);
  const [selectedKecamatans, setSelectedKecamatans] = useState(['UJUNG PANDANG']);
  const [selectedSites, setSelectedSites] = useState(['MRW002']);

  // Cascading helpers for City & Kecamatan
  const [cityFilterNop, setCityFilterNop] = useState('MAKASSAR');
  const [kecFilterNop, setKecFilterNop] = useState('MAKASSAR');
  const [kecFilterKab, setKecFilterKab] = useState('KOTA MAKASSAR');

  // Site & Hierarchy states
  const [siteId, setSiteId] = useState("MRW002");
  const [hierarchyData, setHierarchyData] = useState({ nops: [], tree: {}, site_map: {}, sites: [] });

  // Sector Level Filters (DEFAULT)
  const [selectedSector, setSelectedSector] = useState("1");
  const [selectedBands, setSelectedBands] = useState(ALL_BAND_IDS);
  const [bandDropdownOpen, setBandDropdownOpen] = useState(false);
  const [filterType, setFilterType] = useState("macro"); // 'macro', 'indoor', 'all'

  // KPI selections
  const [selectedHourlyKpis, setSelectedHourlyKpis] = useState(DEFAULT_HOURLY_KPIS);
  const [selectedDailyKpiIds, setSelectedDailyKpiIds] = useState(DEFAULT_DAILY_KPIS);
  const [dailyKpisList, setDailyKpisList] = useState(FALLBACK_DAILY_KPIS);

  // 5G & 2G KPI selections (DEFAULT: tampilkan SEMUA KPI!)
  const [selected5gKpiIds, setSelected5gKpiIds] = useState(ALL_5G_KPI_IDS);
  const [kpis5gList, setKpis5gList] = useState(FALLBACK_5G_KPIS);

  const [selected2gKpiIds, setSelected2gKpiIds] = useState(ALL_2G_KPI_IDS);
  const [kpis2gList, setKpis2gList] = useState(FALLBACK_2G_KPIS);

  // Sites list per technology
  const [sites5g, setSites5g] = useState(['UPD012', 'UPD003', 'UPD076', 'SSU136', 'TER129', 'UPD183', 'COI344', 'COI350']);
  const [sites2g, setSites2g] = useState(['MRW002', 'UPD012', 'UPD183', 'COI350', 'UPD919', 'TMH018']);

  const [kpiDropdownOpen, setKpiDropdownOpen] = useState(false);

  // Date range
  const initialDates = getInitialDateRange('hourly');
  const [startDate, setStartDate] = useState(initialDates.start);
  const [endDate, setEndDate] = useState(initialDates.end);

  // Layout UI
  const [chartsPerRow, setChartsPerRow] = useState(3);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expanded4G, setExpanded4G] = useState(true);

  // Sites list and names map for dropdown
  const [allSites, setAllSites] = useState([]);
  const [siteNamesMap, setSiteNamesMap] = useState({});
  const [siteSearch, setSiteSearch] = useState("");
  const [siteDropdownOpen, setSiteDropdownOpen] = useState(false);

  // Data fetching
  const [data, setData] = useState(null);
  const [aggregationData, setAggregationData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dbStatus, setDbStatus] = useState("Checking connections...");

  const siteDropdownRef = useRef(null);
  const bandDropdownRef = useRef(null);
  const kpiDropdownRef = useRef(null);

  // Toggle Theme
  const toggleTheme = () => {
    setDarkMode(prev => {
      const next = !prev;
      localStorage.setItem('theme', next ? 'dark' : 'light');
      return next;
    });
  };

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  // Click outside to close dropdowns
  useEffect(() => {
    function handleClickOutside(event) {
      if (siteDropdownRef.current && !siteDropdownRef.current.contains(event.target)) {
        setSiteDropdownOpen(false);
      }
      if (bandDropdownRef.current && !bandDropdownRef.current.contains(event.target)) {
        setBandDropdownOpen(false);
      }
      if (kpiDropdownRef.current && !kpiDropdownRef.current.contains(event.target)) {
        setKpiDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Fetch status, sites list, hierarchy, and daily KPI catalog on mount
  useEffect(() => {
    fetch('/api/status')
      .then(res => res.json())
      .then(json => {
        setDbStatus(json.status || "Connected");
      })
      .catch(() => setDbStatus("Connection Error"));

    fetch('/api/sites')
      .then(res => res.json())
      .then(json => {
        if (json.sites && Array.isArray(json.sites)) {
          setAllSites(json.sites);
        }
        if (json.site_names && typeof json.site_names === 'object') {
          setSiteNamesMap(prev => ({ ...prev, ...json.site_names }));
        }
      })
      .catch(err => console.error("Could not fetch sites:", err));

    fetch('/api/site_names')
      .then(res => res.json())
      .then(json => {
        if (json && typeof json === 'object') {
          setSiteNamesMap(prev => ({ ...prev, ...json }));
        }
      })
      .catch(() => {});

    fetch('/api/hierarchy')
      .then(res => res.json())
      .then(json => {
        if (json && json.tree) {
          setHierarchyData(json);
        }
      })
      .catch(err => console.error("Could not fetch hierarchy:", err));

    fetch('/api/daily/kpi_list')
      .then(res => res.json())
      .then(json => {
        if (json && Array.isArray(json.kpis)) {
          setDailyKpisList(json.kpis);
        }
      })
      .catch(err => console.error("Could not fetch daily KPI catalog:", err));

    // Fetch 5G Sites and KPI catalog
    fetch('/api/5g/sites')
      .then(res => res.json())
      .then(json => {
        if (json.sites && Array.isArray(json.sites)) {
          setSites5g(json.sites);
        }
        if (json.site_names && typeof json.site_names === 'object') {
          setSiteNamesMap(prev => ({ ...prev, ...json.site_names }));
        }
      })
      .catch(err => console.error("Could not fetch 5G sites:", err));

    fetch('/api/5g/kpi_list')
      .then(res => res.json())
      .then(json => {
        if (json && Array.isArray(json.kpis)) {
          setKpis5gList(json.kpis);
          setSelected5gKpiIds(json.kpis.map(k => k.id));
        }
      })
      .catch(err => console.error("Could not fetch 5G KPI catalog:", err));

    // Fetch 2G Sites and KPI catalog
    fetch('/api/2g/sites')
      .then(res => res.json())
      .then(json => {
        if (json.sites && Array.isArray(json.sites)) {
          setSites2g(json.sites);
        }
        if (json.site_names && typeof json.site_names === 'object') {
          setSiteNamesMap(prev => ({ ...prev, ...json.site_names }));
        }
      })
      .catch(err => console.error("Could not fetch 2G sites:", err));

    fetch('/api/2g/kpi_list')
      .then(res => res.json())
      .then(json => {
        if (json && Array.isArray(json.kpis)) {
          setKpis2gList(json.kpis);
          setSelected2gKpiIds(json.kpis.map(k => k.id));
        }
      })
      .catch(err => console.error("Could not fetch 2G KPI catalog:", err));
  }, []);

  // Dynamic band options per technology
  const activeBandOptions = useMemo(() => {
    if (activeMenu === '5g') return BAND_OPTIONS_5G;
    if (activeMenu === '2g') return BAND_OPTIONS_2G;
    return BAND_OPTIONS_4G;
  }, [activeMenu]);

  const allActiveBandIds = useMemo(() => activeBandOptions.map(b => b.id), [activeBandOptions]);

  // Dynamic sites list per technology
  const activeSitesList = useMemo(() => {
    if (activeMenu === '5g') return sites5g.length > 0 ? sites5g : ['UPD012', 'UPD003', 'UPD076', 'SSU136', 'TER129', 'UPD183'];
    if (activeMenu === '2g') return sites2g.length > 0 ? sites2g : ['MRW002', 'UPD012', 'UPD183', 'COI350', 'UPD919'];
    return allSites;
  }, [activeMenu, sites5g, sites2g, allSites]);

  // Filter sites for autocomplete search (matches Site ID or Site Name)
  const filteredSites = useMemo(() => {
    if (!siteSearch) return activeSitesList.slice(0, 50);
    const q = siteSearch.toLowerCase().trim();
    return activeSitesList
      .filter(s => {
        const idMatch = s.toLowerCase().includes(q);
        const nameMatch = siteNamesMap[s] && siteNamesMap[s].toLowerCase().includes(q);
        return idMatch || nameMatch;
      })
      .slice(0, 50);
  }, [activeSitesList, siteSearch, siteNamesMap]);

  const isDailyMode = activeMenu === "4g-daily";

  // Fetch Sector-Level Payload Data
  const fetchSectorData = (targetSite, start, end, menuMode, cellType) => {
    setLoading(true);
    const startTime = Date.now();
    let endpoint = "/api/payload_sectors";
    if (menuMode === "4g-daily") endpoint = "/api/daily/payload_sectors";
    else if (menuMode === "5g") endpoint = "/api/5g/payload_sectors";
    else if (menuMode === "2g") endpoint = "/api/2g/payload_sectors";

    const params = new URLSearchParams();
    params.append('site_id', targetSite);
    if (start) params.append('start_date', start);
    if (end) params.append('end_date', end);
    if (cellType) params.append('cell_type', cellType);
    params.append('days_back', menuMode === "4g-hourly" ? '6' : '14');

    fetch(`${endpoint}?${params.toString()}`)
      .then(res => res.json())
      .then(json => {
        const elapsed = Date.now() - startTime;
        const delay = Math.max(0, 400 - elapsed);
        setTimeout(() => {
          setData(json);
          setLoading(false);
          // Keep all bands default if not restricted
        }, delay);
      })
      .catch(err => {
        console.error("Failed to fetch sector data:", err);
        setLoading(false);
        setDbStatus("Connection Error");
        setData({ error: "Gagal terhubung ke server backend API." });
      });
  };

  // Fetch Higher-Scope Aggregation Data (Regional, NOP, City, Kecamatan, Site)
  const fetchScopeAggregationData = (scope, mode, start, end, nopsList, citiesList, kecList, sitesList, bandsList) => {
    setLoading(true);
    const params = new URLSearchParams();
    params.append('scope', scope);
    params.append('mode', mode);
    if (start) params.append('start_date', start);
    if (end) params.append('end_date', end);

    if (scope === 'nop') {
      const activeList = mode === 'band' 
        ? (nopsList && nopsList.length > 0 ? [nopsList[0]] : ['MAKASSAR'])
        : (nopsList && nopsList.length > 0 ? nopsList : ['MAKASSAR']);
      activeList.forEach(n => params.append('nops', n));
    } else if (scope === 'city') {
      const activeList = mode === 'band'
        ? (citiesList && citiesList.length > 0 ? [citiesList[0]] : ['KOTA MAKASSAR'])
        : (citiesList && citiesList.length > 0 ? citiesList : ['KOTA MAKASSAR']);
      activeList.forEach(c => params.append('cities', c));
    } else if (scope === 'kecamatan') {
      const activeList = mode === 'band'
        ? (kecList && kecList.length > 0 ? [kecList[0]] : ['UJUNG PANDANG'])
        : (kecList && kecList.length > 0 ? kecList : ['UJUNG PANDANG']);
      activeList.forEach(k => params.append('kecamatans', k));
    } else if (scope === 'site') {
      const activeList = mode === 'band'
        ? (sitesList && sitesList.length > 0 ? [sitesList[0]] : [siteId])
        : (sitesList && sitesList.length > 0 ? sitesList : [siteId]);
      activeList.forEach(s => params.append('sites', s));
    }

    if (bandsList && bandsList.length > 0 && bandsList.length < BAND_OPTIONS.length) {
      bandsList.forEach(b => params.append('bands', b));
    }

    fetch(`/api/daily/aggregation?${params.toString()}`)
      .then(res => res.json())
      .then(json => {
        setAggregationData(json);
        setLoading(false);
      })
      .catch(err => {
        console.error("Aggregation fetch error:", err);
        setAggregationData({ error: String(err) });
        setLoading(false);
      });
  };

  // Initial load on mount
  useEffect(() => {
    fetchSectorData("MRW002", startDate, endDate, "4g-hourly", "macro");
  }, []);

  // When scope changes, load appropriate data
  const handleSelectScope = (newScope) => {
    setAggregationScope(newScope);
    if (newScope === 'sector') {
      fetchSectorData(siteId, startDate, endDate, activeMenu, filterType);
    } else {
      fetchScopeAggregationData(newScope, aggregationMode, startDate, endDate, selectedNops, selectedCities, selectedKecamatans, selectedSites, selectedBands);
    }
  };

  // Switch between Aggregation vs Band mode
  const handleSwitchAggregationMode = (newMode) => {
    setAggregationMode(newMode);
    let nops = selectedNops;
    let cities = selectedCities;
    let kecs = selectedKecamatans;
    let sites = selectedSites;

    if (newMode === 'band') {
      if (nops.length > 1) {
        nops = [nops[0]];
        setSelectedNops(nops);
      }
      if (cities.length > 1) {
        cities = [cities[0]];
        setSelectedCities(cities);
      }
      if (kecs.length > 1) {
        kecs = [kecs[0]];
        setSelectedKecamatans(kecs);
      }
      if (sites.length > 1) {
        sites = [sites[0]];
        setSelectedSites(sites);
      }
    }

    fetchScopeAggregationData(aggregationScope, newMode, startDate, endDate, nops, cities, kecs, sites, selectedBands);
  };

  // Switch Menu Mode (4G Hourly <-> 4G Daily <-> 5G <-> 2G)
  const handleSwitchMenu = (targetMenu) => {
    if (targetMenu === activeMenu) return;
    setActiveMenu(targetMenu);
    
    let nextSite = siteId;
    if (targetMenu === '5g') {
      const s5List = sites5g.length > 0 ? sites5g : ['UPD012', 'UPD003', 'UPD076'];
      if (!s5List.includes(siteId.toUpperCase())) {
        nextSite = 'UPD012';
        setSiteId('UPD012');
      }
      setSelectedBands(BAND_OPTIONS_5G.map(b => b.id));
      setAggregationScope('sector');
    } else if (targetMenu === '2g') {
      const s2List = sites2g.length > 0 ? sites2g : ['MRW002', 'UPD012', 'UPD183'];
      if (!s2List.includes(siteId.toUpperCase())) {
        nextSite = 'MRW002';
        setSiteId('MRW002');
      }
      setSelectedBands(BAND_OPTIONS_2G.map(b => b.id));
      setAggregationScope('sector');
    } else if (targetMenu === '4g-hourly') {
      setSelectedBands(BAND_OPTIONS_4G.map(b => b.id));
      setAggregationScope('sector');
    } else if (targetMenu === '4g-daily') {
      setSelectedBands(BAND_OPTIONS_4G.map(b => b.id));
    }

    const isDaily = targetMenu !== "4g-hourly";
    setTimeMode(isDaily ? "daily" : "hourly");

    const newDates = getInitialDateRange(isDaily ? 'daily' : 'hourly');
    setStartDate(newDates.start);
    setEndDate(newDates.end);

    const targetScope = targetMenu === '4g-daily' ? aggregationScope : 'sector';

    if (targetScope === 'sector') {
      fetchSectorData(nextSite, newDates.start, newDates.end, targetMenu, filterType);
    } else {
      fetchScopeAggregationData(targetScope, aggregationMode, newDates.start, newDates.end, selectedNops, selectedCities, selectedKecamatans, selectedSites, selectedBands);
    }
  };

  // Master Get Data button submit
  const handleGetData = (e) => {
    if (e) e.preventDefault();
    if (aggregationScope === 'sector') {
      fetchSectorData(siteId, startDate, endDate, activeMenu, filterType);
    } else {
      fetchScopeAggregationData(aggregationScope, aggregationMode, startDate, endDate, selectedNops, selectedCities, selectedKecamatans, selectedSites, selectedBands);
    }
  };

  // Band toggles
  const handleToggleBand = (bandId) => {
    if (selectedBands.includes(bandId)) {
      if (selectedBands.length > 1) {
        setSelectedBands(selectedBands.filter(b => b !== bandId));
      }
    } else {
      setSelectedBands([...selectedBands, bandId]);
    }
  };

  const handleToggleAllBands = () => {
    if (selectedBands.length === allActiveBandIds.length) {
      setSelectedBands([allActiveBandIds[0]]);
    } else {
      setSelectedBands([...allActiveBandIds]);
    }
  };

  // Toggle single KPI
  const handleToggleKpi = (kpiId) => {
    if (activeMenu === '5g') {
      setSelected5gKpiIds(prev => {
        if (prev.includes(kpiId)) {
          if (prev.length <= 1) return prev;
          return prev.filter(id => id !== kpiId);
        } else {
          return [...prev, kpiId];
        }
      });
    } else if (activeMenu === '2g') {
      setSelected2gKpiIds(prev => {
        if (prev.includes(kpiId)) {
          if (prev.length <= 1) return prev;
          return prev.filter(id => id !== kpiId);
        } else {
          return [...prev, kpiId];
        }
      });
    } else if (activeMenu === '4g-daily') {
      setSelectedDailyKpiIds(prev => {
        if (prev.includes(kpiId)) {
          if (prev.length <= 1) return prev;
          return prev.filter(id => id !== kpiId);
        } else {
          return [...prev, kpiId];
        }
      });
    } else {
      setSelectedHourlyKpis(prev => {
        if (prev.includes(kpiId)) {
          if (prev.length <= 1) return prev;
          return prev.filter(id => id !== kpiId);
        } else {
          return [...prev, kpiId];
        }
      });
    }
  };

  // Select all KPIs
  const handleSelectAllKpis = () => {
    if (activeMenu === '5g') {
      setSelected5gKpiIds(kpis5gList.map(k => k.id));
    } else if (activeMenu === '2g') {
      setSelected2gKpiIds(kpis2gList.map(k => k.id));
    } else if (activeMenu === '4g-daily') {
      setSelectedDailyKpiIds(dailyKpisList.map(k => k.id));
    } else {
      setSelectedHourlyKpis(HOURLY_KPIS.map(k => k.id));
    }
  };

  // Select default KPIs
  const handleSelectDefaultKpis = () => {
    if (activeMenu === '5g') {
      // 5G: Tampilkan semua KPI
      setSelected5gKpiIds(kpis5gList.map(k => k.id));
    } else if (activeMenu === '2g') {
      // 2G: Tampilkan semua KPI
      setSelected2gKpiIds(kpis2gList.map(k => k.id));
    } else if (activeMenu === '4g-daily') {
      if (aggregationScope !== 'sector') {
        setSelectedDailyKpiIds(REGIONAL_DEFAULT_KPIS);
      } else {
        setSelectedDailyKpiIds(DEFAULT_DAILY_KPIS);
      }
    } else {
      setSelectedHourlyKpis(DEFAULT_HOURLY_KPIS);
    }
  };

  // Current active KPI list and active IDs
  const activeKpiCatalog = useMemo(() => {
    if (activeMenu === '5g') return kpis5gList;
    if (activeMenu === '2g') return kpis2gList;
    if (activeMenu === '4g-daily') return dailyKpisList;
    return HOURLY_KPIS;
  }, [activeMenu, kpis5gList, kpis2gList, dailyKpisList]);

  const activeSelectedKpiIds = useMemo(() => {
    if (activeMenu === '5g') return selected5gKpiIds;
    if (activeMenu === '2g') return selected2gKpiIds;
    if (activeMenu === '4g-daily') return selectedDailyKpiIds;
    return selectedHourlyKpis;
  }, [activeMenu, selected5gKpiIds, selected2gKpiIds, selectedDailyKpiIds, selectedHourlyKpis]);

  const actualBands = data?.available_bands || ALL_BAND_IDS;
  const availableSectors = data?.available_sectors || [1, 2, 3];
  const currentSectorData = data?.sectors?.[`sector${selectedSector}`];
  const currentKpis = currentSectorData?.kpis || {};

  // Site metadata & resolved NE Name
  const currentSiteMeta = hierarchyData?.site_map?.[siteId.toUpperCase()] || data?.site_info || {
    site_id: siteId,
    nop: "UNKNOWN",
    kabupaten: "UNKNOWN",
    kecamatan: "UNKNOWN"
  };

  const cleanNeName = siteNamesMap[siteId.toUpperCase()]
    ? `${siteId.toUpperCase()} - ${siteNamesMap[siteId.toUpperCase()]}`
    : (data?.enodeb_name || currentSiteMeta?.enodeb_name || siteId);
  const resolvedNeName = data?.enodeb_name && data.enodeb_name.includes(" - ")
    ? data.enodeb_name
    : cleanNeName;

  // Cascading options
  const nopOptions = useMemo(() => {
    return hierarchyData?.nops || ['BONE', 'KENDARI', 'MAKASSAR', 'MANADO', 'PALU', 'PARE-PARE', 'TERNATE'];
  }, [hierarchyData]);

  const cityOptions = useMemo(() => {
    if (cityFilterNop && hierarchyData?.kabupaten_by_nop?.[cityFilterNop]) {
      return Array.from(hierarchyData.kabupaten_by_nop[cityFilterNop]).sort();
    }
    return ['KOTA MAKASSAR', 'GOWA', 'MAROS', 'MOROWALI', 'KENDARI', 'PALU', 'MANADO'];
  }, [cityFilterNop, hierarchyData]);

  const kecCityOptions = useMemo(() => {
    if (kecFilterNop && hierarchyData?.kabupaten_by_nop?.[kecFilterNop]) {
      return Array.from(hierarchyData.kabupaten_by_nop[kecFilterNop]).sort();
    }
    return cityOptions;
  }, [kecFilterNop, hierarchyData, cityOptions]);

  const kecOptions = useMemo(() => {
    if (kecFilterKab && hierarchyData?.kecamatan_by_kab?.[kecFilterKab]) {
      return Array.from(hierarchyData.kecamatan_by_kab[kecFilterKab]).sort();
    }
    return ['UJUNG PANDANG', 'MAMAJANG', 'PANAKKUKANG', 'TAMALATE', 'BUNGKU TENGAH'];
  }, [kecFilterKab, hierarchyData]);

  return (
    <div className={`min-h-screen flex flex-row font-sans select-none transition-colors duration-300 overflow-x-hidden ${
      darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-800'
    }`}>
      
      {/* 1. Sidebar Navigation */}
      <aside 
        className={`fixed inset-y-0 left-0 z-40 w-64 transition-transform duration-300 ease-in-out flex flex-col shadow-2xl border-r ${
          darkMode ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
        } ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        {/* Brand Header */}
        <div className={`h-14 border-b px-5 flex items-center justify-between ${
          darkMode ? 'border-slate-800' : 'border-slate-200'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/30">
              <Activity className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <span className={`font-extrabold text-sm tracking-tight block leading-tight ${
                darkMode ? 'text-white' : 'text-slate-900'
              }`}>
                NetKPI Monitor
              </span>
              <span className={`text-[10px] font-medium tracking-wide ${
                darkMode ? 'text-slate-400' : 'text-slate-500'
              }`}>
                {activeMenu === '2g' ? '2G Monitoring (oneDB)' :
                 activeMenu === '5g' ? '5G Monitoring (oneDB)' :
                 isDailyMode ? '4G Daily (oneDB)' : '4G Hourly (twoDB)'}
              </span>
            </div>
          </div>
          <button 
            type="button"
            onClick={() => setSidebarOpen(false)}
            className={`p-1 rounded transition cursor-pointer ${
              darkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
            }`}
            title="Hide Sidebar"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Menus */}
        <div className="p-3 space-y-1 grow overflow-y-auto">
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Main Navigation
          </div>

          {/* 1. 2G Monitoring */}
          <div className="mb-1">
            <button 
              type="button"
              onClick={() => handleSwitchMenu("2g")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg font-bold text-xs transition cursor-pointer ${
                activeMenu === "2g"
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : darkMode 
                    ? 'text-slate-300 hover:text-white hover:bg-slate-800/80' 
                    : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Radio className={`w-4 h-4 ${activeMenu === "2g" ? 'text-white' : 'text-emerald-500'}`} />
                <span>2G Monitoring</span>
              </div>
              {activeMenu === "2g" ? (
                <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse"></span>
              ) : (
                <span className="text-[10px] opacity-60">OneDb</span>
              )}
            </button>
          </div>

          {/* 2. 4G Monitoring Group */}
          <div>
            <button
              type="button"
              onClick={() => setExpanded4G(!expanded4G)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg font-bold text-xs transition cursor-pointer ${
                (activeMenu === "4g-hourly" || activeMenu === "4g-daily") && !expanded4G
                  ? 'bg-blue-600 text-white'
                  : darkMode ? 'text-slate-200 hover:bg-slate-800/80' : 'text-slate-800 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <BarChart3 className="w-4 h-4 text-blue-500" />
                <span>4G Monitoring</span>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${expanded4G ? 'rotate-180' : ''}`} />
            </button>

            {expanded4G && (
              <div className={`mt-1 ml-3.5 pl-3 border-l space-y-1 ${
                darkMode ? 'border-slate-800' : 'border-slate-200'
              }`}>
                {/* 1. 4G Hourly */}
                <button 
                  type="button"
                  onClick={() => handleSwitchMenu("4g-hourly")}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md font-semibold text-xs transition cursor-pointer ${
                    activeMenu === "4g-hourly"
                      ? 'bg-blue-600 text-white shadow-xs'
                      : darkMode 
                        ? 'text-slate-400 hover:text-white hover:bg-slate-800/60' 
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5" />
                    <span>4G Hourly</span>
                  </div>
                  {activeMenu === "4g-hourly" ? (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  ) : (
                    <span className="text-[10px] opacity-60">TwoDb</span>
                  )}
                </button>

                {/* 2. 4G Daily (oneDB) */}
                <button 
                  type="button"
                  onClick={() => handleSwitchMenu("4g-daily")}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md font-semibold text-xs transition cursor-pointer ${
                    activeMenu === "4g-daily"
                      ? 'bg-amber-600 text-white shadow-xs'
                      : darkMode 
                        ? 'text-slate-400 hover:text-white hover:bg-slate-800/60' 
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>4G Daily</span>
                  </div>
                  {activeMenu === "4g-daily" ? (
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                  ) : (
                    <span className="text-[10px] opacity-60">OneDb</span>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* 3. 5G Monitoring */}
          <div className="mt-1">
            <button 
              type="button"
              onClick={() => handleSwitchMenu("5g")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg font-bold text-xs transition cursor-pointer ${
                activeMenu === "5g"
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : darkMode 
                    ? 'text-slate-300 hover:text-white hover:bg-slate-800/80' 
                    : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Wifi className={`w-4 h-4 ${activeMenu === "5g" ? 'text-white' : 'text-cyan-500'}`} />
                <span>5G Monitoring</span>
              </div>
              {activeMenu === "5g" ? (
                <span className="w-2 h-2 rounded-full bg-cyan-300 animate-pulse"></span>
              ) : (
                <span className="text-[10px] opacity-60">OneDb</span>
              )}
            </button>
          </div>
        </div>

        {/* Database Status in Sidebar */}
        <div className={`p-3 border-t text-xs ${darkMode ? 'border-slate-800 bg-slate-900/60' : 'border-slate-200 bg-slate-50'}`}>
          <div className="flex items-center gap-2 mb-1.5 font-bold">
            <Database className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-[11px] text-slate-500 uppercase tracking-wider">Database Status</span>
          </div>
          <div className="text-[11px] font-mono leading-tight space-y-1">
            <div className="flex items-center justify-between">
              <span className="opacity-70">TwoDb (Hourly):</span>
              <span className="font-bold text-emerald-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                5434
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="opacity-70">OneDb (Daily):</span>
              <span className="font-bold text-emerald-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                5432
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${sidebarOpen ? "ml-64" : "ml-0"}`}>
        
        {/* Top Header */}
        <header className={`h-14 border-b px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 transition-colors duration-300 ${
          darkMode ? 'bg-slate-900/95 border-slate-800 backdrop-blur' : 'bg-white/95 border-slate-200 backdrop-blur'
        }`}>
          
          <div className="flex items-center gap-3">
            {!sidebarOpen && (
              <button 
                type="button"
                onClick={() => setSidebarOpen(true)}
                className={`p-1.5 rounded-lg border transition cursor-pointer shadow-2xs ${
                  darkMode ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
                title="Open Sidebar"
              >
                <Menu className="w-4 h-4" />
              </button>
            )}

            <div className="flex items-center gap-2">
              <h1 className={`text-sm sm:text-base font-black tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                {isDailyMode ? '4G Daily Monitoring' : '4G Hourly Monitoring'}
              </h1>
              <div className={`hidden md:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                isDailyMode
                  ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                  : 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
              }`}>
                <span className="opacity-70 font-medium">4G Monitoring</span>
                <span className="opacity-40">/</span>
                <span className="font-bold">{isDailyMode ? '4G Daily' : '4G Hourly'}</span>
              </div>
            </div>

            {/* Live Connection Badge */}
            <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
              isDailyMode
                ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
            }`}>
              <CheckCircle2 className={`w-3 h-3 ${isDailyMode ? 'text-amber-500' : 'text-emerald-500'}`} />
              <span>{isDailyMode ? 'OneDb Live' : 'TwoDb Live'}</span>
            </div>
          </div>

          {/* Right side controls: Dates, Toggle Hourly/Daily, Get Data, Charts/Row, Theme */}
          <form onSubmit={handleGetData} className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
            
            {/* Start Date */}
            <div className="flex items-center gap-1.5">
              <span className={`text-[11px] font-semibold ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Start:
              </span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={`border rounded-lg px-2.5 py-1 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer shadow-2xs ${
                  darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              />
            </div>

            {/* End Date */}
            <div className="flex items-center gap-1.5">
              <span className={`text-[11px] font-semibold ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                End:
              </span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={`border rounded-lg px-2.5 py-1 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer shadow-2xs ${
                  darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              />
            </div>

            {/* Top Hourly / Daily Switcher Toggle (matching user request) */}
            <div className={`flex items-center p-0.5 rounded-lg border ${
              darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'
            }`}>
              <button
                type="button"
                onClick={() => handleSwitchMenu("4g-hourly")}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                  !isDailyMode
                    ? 'bg-blue-600 text-white shadow-xs'
                    : darkMode ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Hourly
              </button>
              <button
                type="button"
                onClick={() => handleSwitchMenu("4g-daily")}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                  isDailyMode
                    ? 'bg-amber-600 text-white shadow-xs'
                    : darkMode ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Daily
              </button>
            </div>

            {/* Get Data Button */}
            <button
              type="submit"
              disabled={loading}
              className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold transition flex items-center gap-1.5 shadow-md shadow-blue-500/20 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>{loading ? "Loading..." : "Get Data"}</span>
            </button>

            {/* Charts Per Row */}
            <div className={`hidden lg:flex items-center p-0.5 rounded-lg border ${
              darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'
            }`}>
              {[1, 2, 3].map(num => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setChartsPerRow(num)}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all duration-200 cursor-pointer ${
                    chartsPerRow === num
                      ? darkMode
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-white text-blue-700 shadow-xs ring-1 ring-slate-200/50'
                      : darkMode
                        ? 'text-slate-400 hover:text-white'
                        : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>

            {/* Dark / Light Mode Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className={`w-9 h-9 rounded-lg border transition-all duration-300 cursor-pointer flex items-center justify-center active:scale-90 ${
                darkMode 
                  ? 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700' 
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 shadow-2xs'
              }`}
              title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </form>

        </header>

        {/* Content Body */}
        <main className="p-4 sm:p-5 grow overflow-y-auto space-y-4">
          
          {/* ========================================================================= */}
          {/* Filters & KPI Selection Card                                              */}
          {/* ========================================================================= */}
          <div className={`rounded-xl border p-4 shadow-2xs transition-colors duration-300 space-y-3.5 ${
            darkMode ? 'bg-slate-800/80 border-slate-700/80' : 'bg-white border-slate-200/90'
          }`}>
            
            {/* Header: Filters & KPI Selection + Scope Aggregation Bar */}
            <div className="space-y-2.5 pb-2 border-b border-slate-100 dark:border-slate-700/60">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h3 className={`font-bold text-xs uppercase tracking-wider ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                  Filters & KPI Selection
                </h3>
              </div>

              {/* Aggregation Scope Bar: displayed across 4G, 5G, and 2G (Gambar 2) */}
              <AggregationScopeBar
                currentScope={aggregationScope}
                onSelectScope={handleSelectScope}
                darkMode={darkMode}
              />
            </div>

            {/* Dynamic Filter Controls based on Scope */}
            {aggregationScope === 'sector' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3.5">
                
                {/* 1. TARGET SITE */}
                <div className="relative" ref={siteDropdownRef}>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">
                    TARGET SITE
                  </label>
                  <div 
                    onClick={() => setSiteDropdownOpen(!siteDropdownOpen)}
                    className={`border rounded-lg px-3 py-1.5 flex items-center justify-between text-xs font-bold cursor-pointer ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                      <span className="font-bold truncate">{siteId}</span>
                      {siteNamesMap[siteId] && (
                        <span className={`text-[11px] truncate font-normal ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          • {siteNamesMap[siteId]}
                        </span>
                      )}
                    </div>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </div>

                  {siteDropdownOpen && (
                    <div className={`absolute top-full left-0 mt-1 w-80 border rounded-xl shadow-2xl z-50 p-2 text-xs space-y-1 ${
                      darkMode ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
                    }`}>
                      <input
                        type="text"
                        placeholder="Cari Site ID atau Nama Site..."
                        value={siteSearch}
                        onChange={(e) => setSiteSearch(e.target.value)}
                        autoFocus
                        className={`w-full border rounded-lg px-2.5 py-1 text-xs mb-1 font-medium ${
                          darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'
                        }`}
                      />
                      <div className="max-h-56 overflow-y-auto space-y-0.5">
                        {filteredSites.map(s => (
                          <div
                            key={s}
                            onClick={() => {
                              setSiteId(s);
                              setSiteDropdownOpen(false);
                              setSiteSearch("");
                              fetchSectorData(s, startDate, endDate, activeMenu, filterType);
                            }}
                            className={`px-2.5 py-1.5 rounded-lg cursor-pointer flex items-center justify-between ${
                              s === siteId 
                                ? 'bg-blue-600 text-white font-bold' 
                                : darkMode ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-blue-50 text-slate-700'
                            }`}
                          >
                            <div className="flex flex-col min-w-0 pr-2">
                              <span className="font-bold">{s}</span>
                              {siteNamesMap[s] && (
                                <span className={`text-[11px] truncate ${s === siteId ? 'text-blue-100' : darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                  {siteNamesMap[s]}
                                </span>
                              )}
                            </div>
                            {s === siteId && <Check className="w-3.5 h-3.5 shrink-0 text-white" />}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. FILTER SECTOR */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">
                    FILTER SECTOR
                  </label>
                  <div className="relative">
                    <select
                      value={selectedSector}
                      onChange={(e) => setSelectedSector(e.target.value)}
                      className={`w-full appearance-none border rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer ${
                        darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                      }`}
                    >
                      {availableSectors.map(s => (
                        <option key={s} value={String(s)}>{s}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                  </div>
                </div>

                {/* 3. FILTER BAND (Default: All Bands) */}
                <div className="relative" ref={bandDropdownRef}>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">
                    FILTER BAND
                  </label>
                  <button
                    type="button"
                    onClick={() => setBandDropdownOpen(!bandDropdownOpen)}
                    className={`w-full flex items-center justify-between border rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  >
                    <span>{selectedBands.length === allActiveBandIds.length ? 'Semua Band' : `${selectedBands.length} selected`}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  </button>

                  {bandDropdownOpen && (
                    <div className={`absolute top-full left-0 mt-1 w-64 border rounded-xl shadow-2xl z-50 p-2 text-xs space-y-1 ${
                      darkMode ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
                    }`}>
                      <div
                        onClick={handleToggleAllBands}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer font-bold transition ${
                          selectedBands.length === allActiveBandIds.length
                            ? 'bg-blue-600 text-white'
                            : darkMode ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-100 text-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedBands.length === allActiveBandIds.length}
                            onChange={() => {}}
                            className="w-3.5 h-3.5 rounded text-blue-600 pointer-events-none"
                          />
                          <span>Pilih Semua Band</span>
                        </div>
                        {selectedBands.length === allActiveBandIds.length && <Check className="w-3.5 h-3.5" />}
                      </div>

                      <div className="border-t border-slate-100 dark:border-slate-800 my-1"></div>

                      {activeBandOptions.map(b => {
                        const isActual = actualBands.includes(b.id);
                        const isChecked = selectedBands.includes(b.id);
                        return (
                          <div
                            key={b.id}
                            onClick={() => handleToggleBand(b.id)}
                            className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition select-none ${
                              isChecked 
                                ? darkMode ? 'bg-blue-900/30 text-blue-300 font-bold' : 'bg-blue-50 text-blue-900 font-bold'
                                : darkMode ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {}}
                                className="w-3.5 h-3.5 rounded text-blue-600 pointer-events-none"
                              />
                              <span>{b.label}</span>
                            </div>
                            {isActual && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                Active
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 4. FILTER KPI: Attached Popover Dropdown (Versi Awal) */}
                <div className="relative" ref={kpiDropdownRef}>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">
                    FILTER KPI
                  </label>
                  <button
                    type="button"
                    onClick={() => setKpiDropdownOpen(!kpiDropdownOpen)}
                    className={`w-full flex items-center justify-between border rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  >
                    <span className="truncate">{activeSelectedKpiIds.length} KPI Terpilih</span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </button>

                  <KpiDropdownPopover
                    isOpen={kpiDropdownOpen}
                    onClose={() => setKpiDropdownOpen(false)}
                    allKpis={activeKpiCatalog}
                    selectedKpiIds={activeSelectedKpiIds}
                    onToggleKpi={handleToggleKpi}
                    onSelectAll={handleSelectAllKpis}
                    onSelectDefault={handleSelectDefaultKpis}
                    darkMode={darkMode}
                  />
                </div>

                {/* 5. FILTER TYPE */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">
                    FILTER TYPE
                  </label>
                  <div className="relative">
                    <select
                      value={filterType}
                      onChange={(e) => {
                        const nextType = e.target.value;
                        setFilterType(nextType);
                        fetchSectorData(siteId, startDate, endDate, activeMenu, nextType);
                      }}
                      className={`w-full appearance-none border rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer ${
                        darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                      }`}
                    >
                      <option value="macro">Macro</option>
                      <option value="indoor">Indoor</option>
                      <option value="all">All</option>
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                  </div>
                </div>

              </div>
            )}

            {/* Scope == Regional Filter Controls */}
            {aggregationScope === 'regional' && (
              <div className="flex flex-wrap items-center gap-4">
                
                {/* 1. Aggregation / Band Mode Toggle */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">
                    AGGREGATION / BAND
                  </label>
                  <div className={`flex items-center p-0.5 rounded-lg border ${
                    darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'
                  }`}>
                    <button
                      type="button"
                      onClick={() => handleSwitchAggregationMode("full")}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                        aggregationMode === "full"
                          ? 'bg-blue-600 text-white shadow-xs'
                          : darkMode ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Aggregation
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchAggregationMode("band")}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                        aggregationMode === "band"
                          ? 'bg-blue-600 text-white shadow-xs'
                          : darkMode ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Band
                    </button>
                  </div>
                </div>

                {/* 2. FILTER BAND */}
                <div className="relative min-w-44" ref={bandDropdownRef}>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">
                    FILTER BAND
                  </label>
                  <button
                    type="button"
                    onClick={() => setBandDropdownOpen(!bandDropdownOpen)}
                    className={`w-full flex items-center justify-between border rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  >
                    <span>{selectedBands.length === ALL_BAND_IDS.length ? 'Semua Band' : `${selectedBands.length} Bands`}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  </button>

                  {bandDropdownOpen && (
                    <div className={`absolute top-full left-0 mt-1 w-56 border rounded-xl shadow-2xl z-50 p-2 text-xs space-y-1 ${
                      darkMode ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
                    }`}>
                      {BAND_OPTIONS.map(b => (
                        <div
                          key={b.id}
                          onClick={() => handleToggleBand(b.id)}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer ${
                            selectedBands.includes(b.id)
                              ? darkMode ? 'bg-blue-900/30 text-blue-300 font-bold' : 'bg-blue-50 text-blue-900 font-bold'
                              : darkMode ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <span>{b.label}</span>
                          {selectedBands.includes(b.id) && <Check className="w-3.5 h-3.5" />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3. FILTER KPI */}
                <div className="relative min-w-48" ref={kpiDropdownRef}>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">
                    FILTER KPI
                  </label>
                  <button
                    type="button"
                    onClick={() => setKpiDropdownOpen(!kpiDropdownOpen)}
                    className={`w-full flex items-center justify-between border rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  >
                    <span>{activeSelectedKpiIds.length} KPI Terpilih</span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </button>

                  <KpiDropdownPopover
                    isOpen={kpiDropdownOpen}
                    onClose={() => setKpiDropdownOpen(false)}
                    allKpis={activeKpiCatalog}
                    selectedKpiIds={activeSelectedKpiIds}
                    onToggleKpi={handleToggleKpi}
                    onSelectAll={handleSelectAllKpis}
                    onSelectDefault={handleSelectDefaultKpis}
                    darkMode={darkMode}
                  />
                </div>

              </div>
            )}

            {/* Scope == NOP Filter Controls: Dropdown Multi-Select */}
            {aggregationScope === 'nop' && (
              <div className="flex flex-wrap items-center gap-4">
                
                {/* Level NOP: Dropdown Multi-Select */}
                <MultiSelectDropdown
                  label="LEVEL NOP"
                  options={nopOptions}
                  selectedValues={selectedNops}
                  onChange={(newList) => {
                    setSelectedNops(newList);
                    fetchScopeAggregationData('nop', aggregationMode, startDate, endDate, newList, selectedCities, selectedKecamatans, selectedSites, selectedBands);
                  }}
                  isMulti={aggregationMode === 'full'}
                  placeholder="Pilih NOP..."
                  darkMode={darkMode}
                  minWidth="min-w-48"
                />

                {/* Aggregation / Band Mode Toggle */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">
                    AGGREGATION / BAND
                  </label>
                  <div className={`flex items-center p-0.5 rounded-lg border ${
                    darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'
                  }`}>
                    <button
                      type="button"
                      onClick={() => handleSwitchAggregationMode("full")}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                        aggregationMode === "full" ? 'bg-blue-600 text-white shadow-xs' : darkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}
                    >
                      Aggregation
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchAggregationMode("band")}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                        aggregationMode === "band" ? 'bg-blue-600 text-white shadow-xs' : darkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}
                    >
                      Band
                    </button>
                  </div>
                </div>

                {/* Filter Band */}
                <div className="relative min-w-40" ref={bandDropdownRef}>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">
                    FILTER BAND
                  </label>
                  <button
                    type="button"
                    onClick={() => setBandDropdownOpen(!bandDropdownOpen)}
                    className={`w-full flex items-center justify-between border rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  >
                    <span>{selectedBands.length === ALL_BAND_IDS.length ? 'Semua Band' : `${selectedBands.length} Bands`}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  </button>

                  {bandDropdownOpen && (
                    <div className={`absolute top-full left-0 mt-1 w-56 border rounded-xl shadow-2xl z-50 p-2 text-xs space-y-1 ${
                      darkMode ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
                    }`}>
                      {BAND_OPTIONS.map(b => (
                        <div
                          key={b.id}
                          onClick={() => handleToggleBand(b.id)}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer ${
                            selectedBands.includes(b.id)
                              ? darkMode ? 'bg-blue-900/30 text-blue-300 font-bold' : 'bg-blue-50 text-blue-900 font-bold'
                              : darkMode ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <span>{b.label}</span>
                          {selectedBands.includes(b.id) && <Check className="w-3.5 h-3.5" />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Filter KPI */}
                <div className="relative min-w-44" ref={kpiDropdownRef}>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">
                    FILTER KPI
                  </label>
                  <button
                    type="button"
                    onClick={() => setKpiDropdownOpen(!kpiDropdownOpen)}
                    className={`w-full flex items-center justify-between border rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  >
                    <span>{activeSelectedKpiIds.length} KPI Terpilih</span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </button>

                  <KpiDropdownPopover
                    isOpen={kpiDropdownOpen}
                    onClose={() => setKpiDropdownOpen(false)}
                    allKpis={activeKpiCatalog}
                    selectedKpiIds={activeSelectedKpiIds}
                    onToggleKpi={handleToggleKpi}
                    onSelectAll={handleSelectAllKpis}
                    onSelectDefault={handleSelectDefaultKpis}
                    darkMode={darkMode}
                  />
                </div>

              </div>
            )}

            {/* Scope == City Filter Controls: Dropdown Multi-Select */}
            {aggregationScope === 'city' && (
              <div className="flex flex-wrap items-center gap-4">
                
                {/* NOP Selector */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">
                    NOP
                  </label>
                  <select
                    value={cityFilterNop}
                    onChange={(e) => {
                      setCityFilterNop(e.target.value);
                      const available = hierarchyData?.kabupaten_by_nop?.[e.target.value] ? Array.from(hierarchyData.kabupaten_by_nop[e.target.value]) : [];
                      if (available.length > 0) {
                        setSelectedCities([available[0]]);
                        fetchScopeAggregationData('city', aggregationMode, startDate, endDate, [e.target.value], [available[0]], selectedKecamatans, selectedSites, selectedBands);
                      }
                    }}
                    className={`border rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  >
                    {nopOptions.map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>

                {/* City / Kabupaten Dropdown Multi-Select */}
                <MultiSelectDropdown
                  label="CITY / KABUPATEN"
                  options={cityOptions}
                  selectedValues={selectedCities}
                  onChange={(newList) => {
                    setSelectedCities(newList);
                    fetchScopeAggregationData('city', aggregationMode, startDate, endDate, [cityFilterNop], newList, selectedKecamatans, selectedSites, selectedBands);
                  }}
                  isMulti={aggregationMode === 'full'}
                  placeholder="Pilih City..."
                  darkMode={darkMode}
                  minWidth="min-w-48"
                />

                {/* Aggregation / Band Mode Toggle */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">
                    AGGREGATION / BAND
                  </label>
                  <div className={`flex items-center p-0.5 rounded-lg border ${
                    darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'
                  }`}>
                    <button
                      type="button"
                      onClick={() => handleSwitchAggregationMode("full")}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                        aggregationMode === "full" ? 'bg-blue-600 text-white shadow-xs' : darkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}
                    >
                      Aggregation
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchAggregationMode("band")}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                        aggregationMode === "band" ? 'bg-blue-600 text-white shadow-xs' : darkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}
                    >
                      Band
                    </button>
                  </div>
                </div>

                {/* Filter Band */}
                <div className="relative min-w-40" ref={bandDropdownRef}>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">
                    FILTER BAND
                  </label>
                  <button
                    type="button"
                    onClick={() => setBandDropdownOpen(!bandDropdownOpen)}
                    className={`w-full flex items-center justify-between border rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  >
                    <span>{selectedBands.length === ALL_BAND_IDS.length ? 'Semua Band' : `${selectedBands.length} Bands`}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  </button>

                  {bandDropdownOpen && (
                    <div className={`absolute top-full left-0 mt-1 w-56 border rounded-xl shadow-2xl z-50 p-2 text-xs space-y-1 ${
                      darkMode ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
                    }`}>
                      {BAND_OPTIONS.map(b => (
                        <div
                          key={b.id}
                          onClick={() => handleToggleBand(b.id)}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer ${
                            selectedBands.includes(b.id)
                              ? darkMode ? 'bg-blue-900/30 text-blue-300 font-bold' : 'bg-blue-50 text-blue-900 font-bold'
                              : darkMode ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <span>{b.label}</span>
                          {selectedBands.includes(b.id) && <Check className="w-3.5 h-3.5" />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Filter KPI */}
                <div className="relative min-w-44" ref={kpiDropdownRef}>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">
                    FILTER KPI
                  </label>
                  <button
                    type="button"
                    onClick={() => setKpiDropdownOpen(!kpiDropdownOpen)}
                    className={`w-full flex items-center justify-between border rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  >
                    <span>{activeSelectedKpiIds.length} KPI Terpilih</span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </button>

                  <KpiDropdownPopover
                    isOpen={kpiDropdownOpen}
                    onClose={() => setKpiDropdownOpen(false)}
                    allKpis={activeKpiCatalog}
                    selectedKpiIds={activeSelectedKpiIds}
                    onToggleKpi={handleToggleKpi}
                    onSelectAll={handleSelectAllKpis}
                    onSelectDefault={handleSelectDefaultKpis}
                    darkMode={darkMode}
                  />
                </div>

              </div>
            )}

            {/* Scope == Kecamatan Filter Controls */}
            {aggregationScope === 'kecamatan' && (
              <div className="flex flex-wrap items-center gap-4">
                
                {/* 1. NOP Selector */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">
                    NOP
                  </label>
                  <select
                    value={kecFilterNop}
                    onChange={(e) => {
                      setKecFilterNop(e.target.value);
                      const kabs = hierarchyData?.kabupaten_by_nop?.[e.target.value] ? Array.from(hierarchyData.kabupaten_by_nop[e.target.value]) : [];
                      if (kabs.length > 0) {
                        setKecFilterKab(kabs[0]);
                        const kecs = hierarchyData?.kecamatan_by_kab?.[kabs[0]] ? Array.from(hierarchyData.kecamatan_by_kab[kabs[0]]) : [];
                        if (kecs.length > 0) {
                          setSelectedKecamatans([kecs[0]]);
                          fetchScopeAggregationData('kecamatan', aggregationMode, startDate, endDate, [e.target.value], [kabs[0]], [kecs[0]], selectedSites, selectedBands);
                        }
                      }
                    }}
                    className={`border rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  >
                    {nopOptions.map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>

                {/* 2. City / Kabupaten Selector */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">
                    KABUPATEN
                  </label>
                  <select
                    value={kecFilterKab}
                    onChange={(e) => {
                      setKecFilterKab(e.target.value);
                      const kecs = hierarchyData?.kecamatan_by_kab?.[e.target.value] ? Array.from(hierarchyData.kecamatan_by_kab[e.target.value]) : [];
                      if (kecs.length > 0) {
                        setSelectedKecamatans([kecs[0]]);
                        fetchScopeAggregationData('kecamatan', aggregationMode, startDate, endDate, [kecFilterNop], [e.target.value], [kecs[0]], selectedSites, selectedBands);
                      }
                    }}
                    className={`border rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  >
                    {kecCityOptions.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* 3. Kecamatan Dropdown Multi-Select */}
                <MultiSelectDropdown
                  label="KECAMATAN"
                  options={kecOptions}
                  selectedValues={selectedKecamatans}
                  onChange={(newList) => {
                    setSelectedKecamatans(newList);
                    fetchScopeAggregationData('kecamatan', aggregationMode, startDate, endDate, [kecFilterNop], [kecFilterKab], newList, selectedSites, selectedBands);
                  }}
                  isMulti={aggregationMode === 'full'}
                  placeholder="Pilih Kecamatan..."
                  darkMode={darkMode}
                  minWidth="min-w-48"
                />

                {/* 4. Aggregation / Band Mode Toggle */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">
                    AGGREGATION / BAND
                  </label>
                  <div className={`flex items-center p-0.5 rounded-lg border ${
                    darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'
                  }`}>
                    <button
                      type="button"
                      onClick={() => handleSwitchAggregationMode("full")}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                        aggregationMode === "full" ? 'bg-blue-600 text-white shadow-xs' : darkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}
                    >
                      Aggregation
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchAggregationMode("band")}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                        aggregationMode === "band" ? 'bg-blue-600 text-white shadow-xs' : darkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}
                    >
                      Band
                    </button>
                  </div>
                </div>

                {/* 5. Filter Band */}
                <div className="relative min-w-40" ref={bandDropdownRef}>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">
                    FILTER BAND
                  </label>
                  <button
                    type="button"
                    onClick={() => setBandDropdownOpen(!bandDropdownOpen)}
                    className={`w-full flex items-center justify-between border rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  >
                    <span>{selectedBands.length === ALL_BAND_IDS.length ? 'Semua Band' : `${selectedBands.length} Bands`}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  </button>

                  {bandDropdownOpen && (
                    <div className={`absolute top-full left-0 mt-1 w-56 border rounded-xl shadow-2xl z-50 p-2 text-xs space-y-1 ${
                      darkMode ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
                    }`}>
                      {BAND_OPTIONS.map(b => (
                        <div
                          key={b.id}
                          onClick={() => handleToggleBand(b.id)}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer ${
                            selectedBands.includes(b.id)
                              ? darkMode ? 'bg-blue-900/30 text-blue-300 font-bold' : 'bg-blue-50 text-blue-900 font-bold'
                              : darkMode ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <span>{b.label}</span>
                          {selectedBands.includes(b.id) && <Check className="w-3.5 h-3.5" />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 6. Filter KPI */}
                <div className="relative min-w-44" ref={kpiDropdownRef}>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">
                    FILTER KPI
                  </label>
                  <button
                    type="button"
                    onClick={() => setKpiDropdownOpen(!kpiDropdownOpen)}
                    className={`w-full flex items-center justify-between border rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  >
                    <span>{activeSelectedKpiIds.length} KPI Terpilih</span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </button>

                  <KpiDropdownPopover
                    isOpen={kpiDropdownOpen}
                    onClose={() => setKpiDropdownOpen(false)}
                    allKpis={activeKpiCatalog}
                    selectedKpiIds={activeSelectedKpiIds}
                    onToggleKpi={handleToggleKpi}
                    onSelectAll={handleSelectAllKpis}
                    onSelectDefault={handleSelectDefaultKpis}
                    darkMode={darkMode}
                  />
                </div>

              </div>
            )}

            {/* Scope == Site Filter Controls: SiteID dropdown with all sites inside */}
            {aggregationScope === 'site' && (
              <div className="flex flex-wrap items-center gap-4">
                
                {/* Site Selection: Dropdown with all sites based on Site ID and Site Name */}
                <MultiSelectDropdown
                  label="SITE ID"
                  options={activeSitesList.map(s => ({
                    value: s,
                    label: siteNamesMap[s] ? `${s} - ${siteNamesMap[s]}` : s
                  }))}
                  selectedValues={selectedSites}
                  onChange={(newList) => {
                    setSelectedSites(newList);
                    fetchScopeAggregationData('site', aggregationMode, startDate, endDate, selectedNops, selectedCities, selectedKecamatans, newList, selectedBands);
                  }}
                  isMulti={aggregationMode === 'full'}
                  placeholder="Pilih Site..."
                  darkMode={darkMode}
                  minWidth="min-w-64"
                />

                {/* Aggregation / Band Mode Toggle */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">
                    AGGREGATION / BAND
                  </label>
                  <div className={`flex items-center p-0.5 rounded-lg border ${
                    darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'
                  }`}>
                    <button
                      type="button"
                      onClick={() => handleSwitchAggregationMode("full")}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                        aggregationMode === "full" ? 'bg-blue-600 text-white shadow-xs' : darkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}
                    >
                      Aggregation
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchAggregationMode("band")}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                        aggregationMode === "band" ? 'bg-blue-600 text-white shadow-xs' : darkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}
                    >
                      Band
                    </button>
                  </div>
                </div>

                {/* Filter Band */}
                <div className="relative min-w-40" ref={bandDropdownRef}>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">
                    FILTER BAND
                  </label>
                  <button
                    type="button"
                    onClick={() => setBandDropdownOpen(!bandDropdownOpen)}
                    className={`w-full flex items-center justify-between border rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  >
                    <span>{selectedBands.length === ALL_BAND_IDS.length ? 'Semua Band' : `${selectedBands.length} Bands`}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  </button>

                  {bandDropdownOpen && (
                    <div className={`absolute top-full left-0 mt-1 w-56 border rounded-xl shadow-2xl z-50 p-2 text-xs space-y-1 ${
                      darkMode ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
                    }`}>
                      {BAND_OPTIONS.map(b => (
                        <div
                          key={b.id}
                          onClick={() => handleToggleBand(b.id)}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer ${
                            selectedBands.includes(b.id)
                              ? darkMode ? 'bg-blue-900/30 text-blue-300 font-bold' : 'bg-blue-50 text-blue-900 font-bold'
                              : darkMode ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <span>{b.label}</span>
                          {selectedBands.includes(b.id) && <Check className="w-3.5 h-3.5" />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Filter KPI */}
                <div className="relative min-w-44" ref={kpiDropdownRef}>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">
                    FILTER KPI
                  </label>
                  <button
                    type="button"
                    onClick={() => setKpiDropdownOpen(!kpiDropdownOpen)}
                    className={`w-full flex items-center justify-between border rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  >
                    <span>{activeSelectedKpiIds.length} KPI Terpilih</span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </button>

                  <KpiDropdownPopover
                    isOpen={kpiDropdownOpen}
                    onClose={() => setKpiDropdownOpen(false)}
                    allKpis={activeKpiCatalog}
                    selectedKpiIds={activeSelectedKpiIds}
                    onToggleKpi={handleToggleKpi}
                    onSelectAll={handleSelectAllKpis}
                    onSelectDefault={handleSelectDefaultKpis}
                    darkMode={darkMode}
                  />
                </div>

              </div>
            )}

          </div>

          {/* ========================================================================= */}
          {/* Main Chart Container                                                      */}
          {/* ========================================================================= */}
          <div className={`p-5 rounded-2xl border transition-all ${
            darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}>
            
            {/* Header: Dynamic per Scope */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-5 border-b border-slate-100 dark:border-slate-800">
              
              {/* Left Title: NE Name or Region Sulawesi (No siteId badge on the right - Gambar 1 Fix) */}
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold shrink-0 ${
                  darkMode ? 'bg-blue-900/40 text-blue-400' : 'bg-blue-50 text-blue-600'
                }`}>
                  {aggregationScope === 'sector' ? <Radio className="w-6 h-6" /> :
                   aggregationScope === 'regional' ? <Globe className="w-6 h-6" /> :
                   aggregationScope === 'nop' ? <Network className="w-6 h-6" /> :
                   aggregationScope === 'city' ? <Building2 className="w-6 h-6" /> :
                   aggregationScope === 'kecamatan' ? <MapPin className="w-6 h-6" /> :
                   <Radio className="w-6 h-6" />}
                </div>

                <div>
                  <div className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                    darkMode ? 'text-blue-400' : 'text-blue-600'
                  }`}>
                    <span>
                      {aggregationScope === 'sector' ? 'TARGET NETWORK ELEMENT (NE)' :
                       aggregationScope === 'regional' ? 'REGIONAL ANALYSIS' :
                       aggregationScope === 'nop' ? 'NOP CLUSTER ANALYSIS' :
                       aggregationScope === 'city' ? 'CITY / KABUPATEN ANALYSIS' :
                       aggregationScope === 'kecamatan' ? 'KECAMATAN ANALYSIS' :
                       'SITE AGGREGATED ANALYSIS'}
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  </div>

                  {/* Clean, Sleek Title: Based on Site ID and Site Name, not excessively bold (Gambar 1 Fix) */}
                  <div className={`text-lg sm:text-xl font-semibold tracking-tight flex items-center gap-2 ${
                    darkMode ? 'text-white' : 'text-slate-900'
                  }`}>
                    {aggregationScope === 'sector' ? (
                      <span>{resolvedNeName}</span>
                    ) : aggregationScope === 'regional' ? (
                      <span>Region Sulawesi</span>
                    ) : aggregationScope === 'nop' ? (
                      <span>NOP {selectedNops.join(', ')}</span>
                    ) : aggregationScope === 'city' ? (
                      <span>Kabupaten {selectedCities.join(', ')}</span>
                    ) : aggregationScope === 'kecamatan' ? (
                      <span>Kecamatan {selectedKecamatans.join(', ')}</span>
                    ) : (
                      <span>Site {selectedSites.map(s => siteNamesMap[s] ? `${s} - ${siteNamesMap[s]}` : s).join(', ')}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Mode Badge */}
              <div className="flex flex-wrap items-center gap-2">
                <span className={`px-3 py-1 rounded-lg text-xs font-bold border ${
                  darkMode ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200'
                }`}>
                  {aggregationScope === 'sector' ? `Sector ${selectedSector}` :
                   aggregationMode === 'full' ? 'Mode: Aggregation' : 'Mode: Band'}
                </span>
                <span className={`px-3 py-1 rounded-lg text-xs font-semibold border ${
                  darkMode ? 'bg-blue-950/60 text-blue-300 border-blue-900' : 'bg-blue-50 text-blue-700 border-blue-200'
                }`}>
                  {aggregationScope === 'regional' ? 'Sulawesi Region' : `${currentSiteMeta.nop} • ${currentSiteMeta.kabupaten}`}
                </span>
              </div>
            </div>

            {/* Error Banner */}
            {(aggregationScope === 'sector' ? data?.error : aggregationData?.error) && (
              <div className={`p-5 rounded-2xl border flex items-center gap-4 ${
                darkMode ? 'bg-rose-950/40 border-rose-800/80 text-rose-200' : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}>
                <AlertTriangle className="w-6 h-6 text-rose-500 shrink-0" />
                <div className="text-xs">
                  <div className="font-bold text-sm">Gagal memuat data grafik</div>
                  <p>{aggregationScope === 'sector' ? data?.error : aggregationData?.error}</p>
                </div>
              </div>
            )}

            {/* Render Multi-KPI Charts Grid */}
            <div className={`grid gap-4 transition-all duration-300 ${
              chartsPerRow === 1 
                ? "grid-cols-1" 
                : chartsPerRow === 2 
                  ? "grid-cols-1 md:grid-cols-2" 
                  : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
            }`}>
              
              {/* Sector Level Charts (4G Hourly, 4G Daily, 5G, or 2G Sector) */}
              {aggregationScope === 'sector' && currentSectorData && activeSelectedKpiIds.map(k_id => {
                const kpiData = currentKpis[k_id];
                if (!kpiData) return null;

                return (
                  <SectorPayloadChart
                    key={`${activeMenu}_sector_${selectedSector}_${k_id}`}
                    title={kpiData.title}
                    unit={kpiData.unit}
                    timestamps={currentSectorData.timestamps || data?.timestamps || []}
                    carrierSeries={kpiData.carrier_series}
                    totalSeries={kpiData.total_series}
                    carrierBands={kpiData.carrier_bands || {}}
                    hasTotal={kpiData.has_total || kpiData.has_tot}
                    bandFilter={selectedBands}
                    timeMode={timeMode}
                    minY={kpiData.min_y}
                    maxY={kpiData.max_y}
                    darkMode={darkMode}
                    chartsPerRow={chartsPerRow}
                  />
                );
              })}

              {/* Higher Scopes Charts (Regional, NOP, City, Kecamatan, Site) */}
              {aggregationScope !== 'sector' && aggregationData && aggregationData.kpis && activeSelectedKpiIds.map(k_id => {
                const kpiData = aggregationData.kpis[k_id];
                if (!kpiData) return null;

                return (
                  <SectorPayloadChart
                    key={`${aggregationScope}_${aggregationMode}_${k_id}`}
                    title={kpiData.title}
                    unit={kpiData.unit}
                    timestamps={aggregationData.timestamps}
                    carrierSeries={kpiData.carrier_series}
                    totalSeries={kpiData.total_series}
                    carrierBands={kpiData.carrier_bands || {}}
                    hasTotal={kpiData.has_total}
                    bandFilter={aggregationMode === 'band' ? selectedBands : 'all'}
                    timeMode="daily"
                    minY={kpiData.min_y}
                    maxY={kpiData.max_y}
                    darkMode={darkMode}
                    chartsPerRow={chartsPerRow}
                  />
                );
              })}

            </div>

          </div>

        </main>

        {/* Footer */}
        <footer className={`border-t px-6 py-2.5 flex flex-wrap items-center justify-between text-xs ${
          darkMode ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-500'
        }`}>
          <div className="flex items-center gap-4">
            <div>
              <span className="font-semibold">Database: </span>
              <span className="font-mono font-medium">
                {activeMenu === '2g' ? 'OneDb Live (measDy2g)' :
                 activeMenu === '5g' ? 'OneDb Live (measDy5g)' :
                 isDailyMode ? 'OneDb Live (measDy4g & measBdbh4g)' : 'TwoDb Live (measHy4g)'}
              </span>
            </div>
            {data?.enodeb_name && aggregationScope === 'sector' && (
              <div className={`hidden sm:inline px-2 py-0.5 rounded border font-mono text-[11px] ${
                darkMode ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-600'
              }`}>
                Target NE: {data.enodeb_name}
              </div>
            )}
          </div>
          <div>
            <span className="font-semibold">Scope: </span>
            <span className="font-bold uppercase tracking-wider text-blue-500">
              {aggregationScope === 'sector' ? `Sector ${selectedSector}` : `${aggregationScope} (${aggregationMode})`}
            </span>
          </div>
        </footer>

      </div>

      {/* Loading animation overlay */}
      {loading && <DataLoadingOverlay />}

    </div>
  );
}
