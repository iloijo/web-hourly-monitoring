import psycopg2
import psycopg2.extras
import time
import re
from collections import defaultdict
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from .db import get_onedb_connection
from .queries import get_band_from_ci, normalize_cell_key, get_clean_carrier_label

# =============================================================================
# Comprehensive KPI Dictionary for 4G Daily
# Sources:
# - measBdbh4g: DL/UL PRB, User DL/UL Throughput, Spectrum Efficiency
# - measDy4g: All other chartable radio KPIs
# Exclusions:
# - Modulation scheme usage skipped
# - UMTS KPIs skipped
# - DL/UL PDCP SDU Loss QCI1 skipped
# =============================================================================
DAILY_KPIS_CONFIG = {
    # 1. Productivity (Traffic & Payload)
    "payload": {
        "title": "Payload (GB)",
        "unit": "GB",
        "category": "Productivity",
        "source": "measDy4g",
        "is_avg": False,
        "has_tot": True,
        "min_y": 0,
        "max_y": None
    },
    "dl_traffic": {
        "title": "DL Traffic Volume (GB)",
        "unit": "GB",
        "category": "Productivity",
        "source": "measDy4g",
        "is_avg": False,
        "has_tot": True,
        "min_y": 0,
        "max_y": None
    },
    "ul_traffic": {
        "title": "UL Traffic Volume (GB)",
        "unit": "GB",
        "category": "Productivity",
        "source": "measDy4g",
        "is_avg": False,
        "has_tot": True,
        "min_y": 0,
        "max_y": None
    },
    "ca_payload_total": {
        "title": "Total CA Payload (GB)",
        "unit": "GB",
        "category": "Productivity",
        "source": "measDy4g",
        "is_avg": False,
        "has_tot": True,
        "min_y": 0,
        "max_y": None
    },
    "ca_payload_dl": {
        "title": "DL CA Payload (GB)",
        "unit": "GB",
        "category": "Productivity",
        "source": "measDy4g",
        "is_avg": False,
        "has_tot": True,
        "min_y": 0,
        "max_y": None
    },
    "ca_payload_ul": {
        "title": "UL CA Payload (GB)",
        "unit": "GB",
        "category": "Productivity",
        "source": "measDy4g",
        "is_avg": False,
        "has_tot": True,
        "min_y": 0,
        "max_y": None
    },
    "volte_payload_dl": {
        "title": "VoLTE DL Volume (MB)",
        "unit": "MB",
        "category": "Productivity",
        "source": "measDy4g",
        "is_avg": False,
        "has_tot": True,
        "min_y": 0,
        "max_y": None
    },
    "volte_payload_ul": {
        "title": "VoLTE UL Volume (MB)",
        "unit": "MB",
        "category": "Productivity",
        "source": "measDy4g",
        "is_avg": False,
        "has_tot": True,
        "min_y": 0,
        "max_y": None
    },
    "volte_traffic": {
        "title": "VoLTE Traffic (Erlang)",
        "unit": "Erl",
        "category": "Productivity",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": None
    },

    # 2. Accessibility & Connection
    "availability": {
        "title": "Availability (%)",
        "unit": "%",
        "category": "Accessibility",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": 100
    },
    "rrc_setup_sr": {
        "title": "RRC Setup SR (%)",
        "unit": "%",
        "category": "Accessibility",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": 100
    },
    "erab_setup_sr": {
        "title": "E-RAB Setup SR (%)",
        "unit": "%",
        "category": "Accessibility",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": 100
    },
    "cssr": {
        "title": "CSSR (%)",
        "unit": "%",
        "category": "Accessibility",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": 100
    },
    "s1_conn_sr": {
        "title": "S1 Connection SR (%)",
        "unit": "%",
        "category": "Accessibility",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": 100
    },
    "volte_rrc_sr": {
        "title": "VoLTE RRC SR (%)",
        "unit": "%",
        "category": "Accessibility",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": 100
    },
    "volte_erab_qci1_sr": {
        "title": "VoLTE E-RAB QCI1 SR (%)",
        "unit": "%",
        "category": "Accessibility",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": 100
    },
    "volte_erab_qci5_sr": {
        "title": "VoLTE E-RAB QCI5 SR (%)",
        "unit": "%",
        "category": "Accessibility",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": 100
    },
    "volte_call_setup_sr": {
        "title": "VoLTE Call Setup SR (%)",
        "unit": "%",
        "category": "Accessibility",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": 100
    },
    "csfb_sr": {
        "title": "CSFB SR (%)",
        "unit": "%",
        "category": "Accessibility",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": 100
    },

    # 3. Retainability & Drop
    "erab_drop_rate": {
        "title": "E-RAB Drop Rate (%)",
        "unit": "%",
        "category": "Retainability",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": None
    },
    "service_drop_rate": {
        "title": "Service Drop Rate (%)",
        "unit": "%",
        "category": "Retainability",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": None
    },
    "volte_call_drop_rate": {
        "title": "VoLTE Call Drop Rate (%)",
        "unit": "%",
        "category": "Retainability",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": None
    },

    # 4. Capacity & Utilization (measBdbh4g)
    "dl_prb": {
        "title": "DL PRB (%) [BDBH]",
        "unit": "%",
        "category": "Capacity & Utilization",
        "source": "measBdbh4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": 100
    },
    "ul_prb": {
        "title": "UL PRB (%) [BDBH]",
        "unit": "%",
        "category": "Capacity & Utilization",
        "source": "measBdbh4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": 100
    },

    # 5. Throughput & Speed (measBdbh4g + measDy4g)
    "user_dl_thp": {
        "title": "User DL Thp (Mbps) [BDBH]",
        "unit": "Mbps",
        "category": "Throughput & Speed",
        "source": "measBdbh4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": None
    },
    "user_ul_thp": {
        "title": "User UL Thp (Mbps) [BDBH]",
        "unit": "Mbps",
        "category": "Throughput & Speed",
        "source": "measBdbh4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": None
    },
    "spectrum_efficiency": {
        "title": "Spectrum Efficiency [BDBH]",
        "unit": "",
        "category": "Throughput & Speed",
        "source": "measBdbh4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": None
    },
    "cell_dl_thp": {
        "title": "Cell DL Thp (Mbps)",
        "unit": "Mbps",
        "category": "Throughput & Speed",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": None
    },
    "cell_ul_thp": {
        "title": "Cell UL Thp (Mbps)",
        "unit": "Mbps",
        "category": "Throughput & Speed",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": None
    },
    "ca_dl_thp": {
        "title": "CA DL Thp (Mbps)",
        "unit": "Mbps",
        "category": "Throughput & Speed",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": None
    },
    "ca_ul_thp": {
        "title": "CA UL Thp (Mbps)",
        "unit": "Mbps",
        "category": "Throughput & Speed",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": None
    },
    "max_cell_dl_rlc_thp": {
        "title": "Max Cell DL RLC Thp (Mbps)",
        "unit": "Mbps",
        "category": "Throughput & Speed",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": None
    },
    "max_cell_ul_rlc_thp": {
        "title": "Max Cell UL RLC Thp (Mbps)",
        "unit": "Mbps",
        "category": "Throughput & Speed",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": None
    },
    "max_cell_dl_pdcp_thp": {
        "title": "Max Cell DL PDCP Thp (Mbps)",
        "unit": "Mbps",
        "category": "Throughput & Speed",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": None
    },
    "max_cell_ul_pdcp_thp": {
        "title": "Max Cell UL PDCP Thp (Mbps)",
        "unit": "Mbps",
        "category": "Throughput & Speed",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": None
    },

    # 6. User Numbers & Concurrency
    "max_rrc": {
        "title": "Max RRC User (Users)",
        "unit": "Users",
        "category": "User Concurrency",
        "source": "measDy4g",
        "is_avg": False,
        "has_tot": False,
        "min_y": 0,
        "max_y": None
    },
    "active_users": {
        "title": "Active Users",
        "unit": "Users",
        "category": "User Concurrency",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": None
    },
    "avg_dl_active_users": {
        "title": "Avg DL Active Users",
        "unit": "Users",
        "category": "User Concurrency",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": None
    },
    "max_dl_active_users_qci1": {
        "title": "Max DL Active Users QCI1",
        "unit": "Users",
        "category": "User Concurrency",
        "source": "measDy4g",
        "is_avg": False,
        "has_tot": False,
        "min_y": 0,
        "max_y": None
    },
    "max_ul_active_users_qci1": {
        "title": "Max UL Active Users QCI1",
        "unit": "Users",
        "category": "User Concurrency",
        "source": "measDy4g",
        "is_avg": False,
        "has_tot": False,
        "min_y": 0,
        "max_y": None
    },
    "max_user_volte": {
        "title": "Max VoLTE Users",
        "unit": "Users",
        "category": "User Concurrency",
        "source": "measDy4g",
        "is_avg": False,
        "has_tot": False,
        "min_y": 0,
        "max_y": None
    },
    "simultaneous_ue_avg": {
        "title": "Avg Simultaneous UE",
        "unit": "Users",
        "category": "User Concurrency",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": None
    },
    "simultaneous_ue_max": {
        "title": "Max Simultaneous UE",
        "unit": "Users",
        "category": "User Concurrency",
        "source": "measDy4g",
        "is_avg": False,
        "has_tot": False,
        "min_y": 0,
        "max_y": None
    },
    "rrc_connected_mean": {
        "title": "Mean RRC Connected Users",
        "unit": "Users",
        "category": "User Concurrency",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": None
    },

    # 7. Quality, RF & Latency
    "cqi": {
        "title": "CQI",
        "unit": "",
        "category": "Quality & Latency",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": 15
    },
    "cqi_rev": {
        "title": "CQI Rev",
        "unit": "",
        "category": "Quality & Latency",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": 15
    },
    "cqi_ge_7": {
        "title": "CQI >= 7 (%)",
        "unit": "%",
        "category": "Quality & Latency",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": 100
    },
    "avg_ni_dbm": {
        "title": "Average NI (dBm)",
        "unit": "dBm",
        "category": "Quality & Latency",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": None,
        "max_y": None
    },
    "max_ni_dbm": {
        "title": "Maximum NI (dBm)",
        "unit": "dBm",
        "category": "Quality & Latency",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": None,
        "max_y": None
    },
    "avg_cell_rssi": {
        "title": "Average Cell RSSI (dBm)",
        "unit": "dBm",
        "category": "Quality & Latency",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": None,
        "max_y": None
    },
    "dl_init_bler": {
        "title": "DL Init BLER (%)",
        "unit": "%",
        "category": "Quality & Latency",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": None
    },
    "ul_init_bler": {
        "title": "UL Init BLER (%)",
        "unit": "%",
        "category": "Quality & Latency",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": None
    },
    "dl_ip_packet_delay": {
        "title": "DL IP Packet Delay (ms)",
        "unit": "ms",
        "category": "Quality & Latency",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": None
    },
    "ip_latency": {
        "title": "IP Latency (ms)",
        "unit": "ms",
        "category": "Quality & Latency",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": None
    },
    "pdcp_sdu_delay": {
        "title": "Avg DL PDCP SDU Delay (ms)",
        "unit": "ms",
        "category": "Quality & Latency",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": None
    },

    # 8. Mobility
    "ifho_sr": {
        "title": "IFHO SR (%)",
        "unit": "%",
        "category": "Mobility",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": 100
    },
    "inter_freq_ho_sr": {
        "title": "Inter-Freq LTE HO SR (%)",
        "unit": "%",
        "category": "Mobility",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": 100
    },
    "x2_ho_out_sr": {
        "title": "X2 HO Out (%)",
        "unit": "%",
        "category": "Mobility",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": 100
    },
    "s1_ho_out_sr": {
        "title": "S1 HO Out (%)",
        "unit": "%",
        "category": "Mobility",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": 100
    },
    "inter_freq_x2_ho_sr": {
        "title": "Inter-Freq X2 HO SR (%)",
        "unit": "%",
        "category": "Mobility",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": 100
    },
    "inter_freq_s1_ho_sr": {
        "title": "Inter-Freq S1 HO SR (%)",
        "unit": "%",
        "category": "Mobility",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": 100
    },
    "lte_gsm_ho_sr": {
        "title": "LTE-GSM HO SR (%)",
        "unit": "%",
        "category": "Mobility",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": 100
    },
    "volte_intra_freq_hosr": {
        "title": "VoLTE Intra-Freq HO SR (%)",
        "unit": "%",
        "category": "Mobility",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": 100
    },
    "volte_inter_freq_hosr": {
        "title": "VoLTE Inter-Freq HO SR (%)",
        "unit": "%",
        "category": "Mobility",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": 100
    },
    "srvcc_gsm_hosr": {
        "title": "SRVCC LTE-GSM HO SR (%)",
        "unit": "%",
        "category": "Mobility",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": 100
    },

    # 9. Equipment & System
    "avg_cpu_util": {
        "title": "Avg CPU Util (%)",
        "unit": "%",
        "category": "Equipment & System",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": 100
    },
    "peak_cpu_util": {
        "title": "Peak CPU Util (%)",
        "unit": "%",
        "category": "Equipment & System",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": 100
    },
    "paging_congestion_rate": {
        "title": "Paging Congestion Rate (%)",
        "unit": "%",
        "category": "Equipment & System",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": None
    },
    "paging_sr": {
        "title": "Paging Success Rate (%)",
        "unit": "%",
        "category": "Equipment & System",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": 100
    },
    "rrc_reestablishment_ratio": {
        "title": "RRC Re-establishment Ratio (%)",
        "unit": "%",
        "category": "Equipment & System",
        "source": "measDy4g",
        "is_avg": True,
        "has_tot": False,
        "min_y": 0,
        "max_y": None
    }
}

# In-memory caches
HIERARCHY_CACHE: Optional[Dict[str, Any]] = None

def get_hierarchy_data() -> Dict[str, Any]:
    """
    Returns the hierarchy tree of NOP, Kabupaten, Kecamatan, and Sites
    based on CellListRCI joined with LookupSITEID from OneDb.
    Cached in memory for instantaneous responses.
    """
    global HIERARCHY_CACHE
    if HIERARCHY_CACHE is not None:
        return HIERARCHY_CACHE

    conn = get_onedb_connection(timeout=10)
    if not conn:
        raise RuntimeError("OneDb is not reachable for hierarchy tree.")

    cur = conn.cursor()
    cur.execute("""
        SELECT DISTINCT 
            COALESCE(l."NOP", 'OTHER') as nop,
            COALESCE(r.kabupaten, 'UNKNOWN') as kabupaten,
            COALESCE(r.kecamatan, 'UNKNOWN') as kecamatan,
            r.site_id
        FROM "CellListRCI" r
        LEFT JOIN "LookupSITEID" l ON r.site_id = l."Prefix Site ID"
        WHERE r.site_id IS NOT NULL AND r.site_id != ''
        ORDER BY nop, kabupaten, kecamatan, r.site_id;
    """)
    rows = cur.fetchall()
    cur.close()
    conn.close()

    tree = {}
    site_map = {}
    nops = set()
    kabupaten_by_nop = defaultdict(set)
    kecamatan_by_kab = defaultdict(set)
    sites_by_kec = defaultdict(set)
    all_sites = []

    for nop, kab, kec, site in rows:
        nop_str = str(nop).strip()
        kab_str = str(kab).strip()
        kec_str = str(kec).strip()
        site_str = str(site).strip().upper()

        nops.add(nop_str)
        kabupaten_by_nop[nop_str].add(kab_str)
        kecamatan_by_kab[kab_str].add(kec_str)
        sites_by_kec[f"{kab_str}___{kec_str}"].add(site_str)

        if site_str not in site_map:
            site_map[site_str] = {
                "site_id": site_str,
                "nop": nop_str,
                "kabupaten": kab_str,
                "kecamatan": kec_str
            }
            all_sites.append(site_str)

        if nop_str not in tree:
            tree[nop_str] = {}
        if kab_str not in tree[nop_str]:
            tree[nop_str][kab_str] = {}
        if kec_str not in tree[nop_str][kab_str]:
            tree[nop_str][kab_str][kec_str] = []
        if site_str not in tree[nop_str][kab_str][kec_str]:
            tree[nop_str][kab_str][kec_str].append(site_str)

    HIERARCHY_CACHE = {
        "nops": sorted(list(nops)),
        "kabupaten_by_nop": {k: sorted(list(v)) for k, v in kabupaten_by_nop.items()},
        "kecamatan_by_kab": {k: sorted(list(v)) for k, v in kecamatan_by_kab.items()},
        "sites_by_kec": {k: sorted(list(v)) for k, v in sites_by_kec.items()},
        "site_map": site_map,
        "tree": tree,
        "total_sites": len(all_sites),
        "sites": sorted(all_sites)
    }
    return HIERARCHY_CACHE

def get_site_payload_daily_data(
    site_id: str = "MRW002",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    sector_filter: Optional[str] = None,
    band_filter: Optional[str] = None,
    cell_type: Optional[str] = "macro",
    days_back: int = 14,
    selected_kpi_ids: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Queries real 4G Daily Multi-KPI from OneDb using measDy4g and measBdbh4g.
    - measBdbh4g: DL/UL PRB, User DL/UL Throughput, Spectrum Efficiency
    - measDy4g: All other radio KPIs
    - Excludes modulation schemes, UMTS, DL/UL PDCP SDU Loss QCI1
    """
    t0 = time.time()
    conn = get_onedb_connection(timeout=12)
    if not conn:
        raise RuntimeError("OneDb is not reachable. Check host 187.127.124.130:5432.")

    site_clean = site_id.strip().upper()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # 1. Query CellListRCI in OneDb for site topology, sectors, types, and eNodeB IDs
    cur.execute("""
        SELECT cell_name, enodeb_id, enodeb_name, "sec new type", site_id_sector_id, ci
        FROM "CellListRCI"
        WHERE site_id = %s;
    """, (site_clean,))
    cell_rows = cur.fetchall()

    if not cell_rows:
        cur.close()
        conn.close()
        raise ValueError(f"Site ID {site_clean} not found in CellListRCI.")

    enodeb_ids = set()
    enodeb_names = set()
    cell_map_by_name = {}
    cell_map_by_ci = {}
    found_sectors = set()
    found_bands = set()
    found_types = set()

    for r in cell_rows:
        sec_type = (r['sec new type'] or "").upper()
        if "_IND" in sec_type:
            found_types.add("Indoor")
        else:
            found_types.add("Macro")

    active_type_filter = cell_type.strip().lower() if cell_type else "all"

    for r in cell_rows:
        cname = r['cell_name'].strip()
        enb_id = r['enodeb_id']
        enb_name = r['enodeb_name'].strip() if r['enodeb_name'] else ""
        if enb_id:
            enodeb_ids.add(float(enb_id))
        if enb_name:
            enodeb_names.add(enb_name)

        sec_type = r['sec new type'] or ""
        is_indoor = "_IND" in sec_type.upper()
        row_type = "Indoor" if is_indoor else "Macro"

        if active_type_filter == "macro" and is_indoor:
            continue
        elif active_type_filter == "indoor" and not is_indoor:
            continue

        parts = sec_type.split('_')
        sector = 1
        if len(parts) >= 3:
            try:
                sector = int(parts[1])
            except ValueError:
                sector = 1
        elif r['site_id_sector_id']:
            p2 = r['site_id_sector_id'].split('_')
            if len(p2) >= 2 and p2[1].isdigit():
                sector = int(p2[1])

        band = get_band_from_ci(r['ci'], cname)
        carrier = get_clean_carrier_label(cname, sector, band)

        found_sectors.add(sector)
        found_bands.add(band)

        meta = {
            "cell_name": cname,
            "sector": sector,
            "band": band,
            "carrier": carrier,
            "ci": r['ci'],
            "type": row_type
        }
        cell_map_by_name[cname.upper()] = meta
        cell_map_by_name[normalize_cell_key(cname)] = meta
        if (cname.startswith("E_") or cname.startswith("C_")) and len(cname) > 2:
            cell_map_by_name[cname[2:].upper()] = meta
            cell_map_by_name[normalize_cell_key(cname[2:])] = meta

        if r['ci'] is not None:
            try:
                cell_map_by_ci[int(r['ci'])] = meta
            except Exception:
                pass

    # Fallback if cell_map is empty due to filter
    if not cell_map_by_name and cell_rows:
        for r in cell_rows:
            cname = r['cell_name'].strip()
            sec_type = r['sec new type'] or ""
            parts = sec_type.split('_')
            sector = 1
            if len(parts) >= 3:
                try:
                    sector = int(parts[1])
                except ValueError:
                    sector = 1
            band = get_band_from_ci(r['ci'], cname)
            carrier = get_clean_carrier_label(cname, sector, band)
            found_sectors.add(sector)
            found_bands.add(band)
            meta = {
                "cell_name": cname,
                "sector": sector,
                "band": band,
                "carrier": carrier,
                "ci": r['ci'],
                "type": "Macro"
            }
            cell_map_by_name[cname.upper()] = meta
            cell_map_by_name[normalize_cell_key(cname)] = meta
            if r['ci'] is not None:
                try:
                    cell_map_by_ci[int(r['ci'])] = meta
                except Exception:
                    pass

    # 2. Date ranges (Latest known data in measDy4g is 2026-11-02)
    max_known_db_date = datetime(2026, 11, 2)
    now = datetime.now()
    yesterday = now - timedelta(days=1)
    
    try:
        if end_date:
            dt_end = datetime.strptime(end_date.strip(), "%Y-%m-%d")
        else:
            dt_end = max_known_db_date if yesterday > max_known_db_date else yesterday
    except Exception:
        dt_end = max_known_db_date if yesterday > max_known_db_date else yesterday

    try:
        if start_date:
            dt_start = datetime.strptime(start_date.strip(), "%Y-%m-%d")
        else:
            dt_start = dt_end - timedelta(days=days_back)
    except Exception:
        dt_start = dt_end - timedelta(days=days_back)

    start_str = dt_start.strftime("%Y-%m-%d 00:00:00")
    end_str = dt_end.strftime("%Y-%m-%d 23:59:59")

    # Generate expected date strings
    expected_ts = []
    cur_t = dt_start
    while cur_t <= dt_end:
        expected_ts.append(cur_t.strftime("%Y-%m-%d"))
        cur_t += timedelta(days=1)
    sorted_ts = sorted(list(set(expected_ts)))

    # 3. Query measDy4g LEFT JOIN measBdbh4g on eNodeBId
    # If enodeb_ids is empty, fallback to searching by site prefix
    all_meas_rows = []
    if enodeb_ids:
        enb_list = list(enodeb_ids)
        sql = """
            SELECT 
                d."Begin Time" AS begin_time,
                d."Cell Name" AS cell_name,
                d."cellId" AS cell_id,
                -- Traffic
                ROUND((d."4G Payload (MByte) AMQ" / 1024.0)::numeric, 2) AS payload_gb,
                ROUND((d."DL Traffic Volume (MByte) AMQ" / 1024.0)::numeric, 2) AS dl_traffic_gb,
                ROUND((d."UL Traffic Volume (MByte) AMQ" / 1024.0)::numeric, 2) AS ul_traffic_gb,
                ROUND((d."Total Payload CA_(MByte) AMQ" / 1024.0)::numeric, 2) AS ca_payload_total_gb,
                ROUND((d."DL Payload CA_(MByte) AMQ" / 1024.0)::numeric, 2) AS ca_payload_dl_gb,
                ROUND((d."UL Payload CA_(MByte) AMQ" / 1024.0)::numeric, 2) AS ca_payload_ul_gb,
                ROUND(d."DL_Volume_VoLTE_QCI1_(MByte) AMQ"::numeric, 2) AS volte_payload_dl_mb,
                ROUND(d."UL_Volume_VoLTE_QCI1_(MByte) AMQ"::numeric, 2) AS volte_payload_ul_mb,
                ROUND(d."Traffic_VoLTE_(erl) AMQ"::numeric, 2) AS volte_traffic_erl,

                -- Accessibility & Connection
                ROUND((d."Cell Availability 4G_(%%)" * 100)::numeric, 2) AS availability_pct,
                ROUND((d."RRC Setup SR (%%) AMQ" * 100)::numeric, 2) AS rrc_setup_sr,
                ROUND((d."E-RAB Setup SR (%%) AMQ" * 100)::numeric, 2) AS erab_setup_sr,
                ROUND((d."CSSR (%%) AMQ" * 100)::numeric, 2) AS cssr,
                ROUND(d."S1-Signal Connection Establishment Success Rate(%%)"::numeric, 2) AS s1_conn_sr,
                ROUND((d."RRC_Establishment_VoLTE_SR_(%%) AMQ" * 100)::numeric, 2) AS volte_rrc_sr,
                ROUND((d."E-RAB_Setup_VoLTE_QCI1_SR_(%%) AMQ" * 100)::numeric, 2) AS volte_erab_qci1_sr,
                ROUND((d."E-RAB_Setup_VoLTE_QCI5_SR_(%%) AMQ" * 100)::numeric, 2) AS volte_erab_qci5_sr,
                ROUND((d."Call_Setup_VoLTE_SR_(%%) AMQ" * 100)::numeric, 2) AS volte_call_setup_sr,
                ROUND((d."CSFB SR (%%) AMQ" * 100)::numeric, 2) AS csfb_sr,

                -- Retainability
                ROUND((d."E-RAB Drop (%%) AMQ" * 100)::numeric, 4) AS erab_drop_rate,
                ROUND((d."Service Drop Rate (%%) AMQ" * 100)::numeric, 4) AS service_drop_rate,
                ROUND((d."Call_Drop_VoLTE_Rate_(%%) AMQ" * 100)::numeric, 4) AS volte_call_drop_rate,

                -- BDBH Metrics (measBdbh4g)
                ROUND((b."DL PRB Utilization Num AMQ" / NULLIF(b."DL PRB Utilization Denum AMQ", 0) * 100)::numeric, 2) AS dl_prb_pct,
                ROUND((b."UL PRB Utilization Num AMQ" / NULLIF(b."UL PRB Utilization Denum AMQ", 0) * 100)::numeric, 2) AS ul_prb_pct,
                ROUND((b."User DL Throughput Num AMQ" / NULLIF(b."User DL Throughput Denum AMQ", 0) / 1000.0)::numeric, 2) AS user_dl_thp_mbps,
                ROUND((b."User UL Throughput Num AMQ" / NULLIF(b."User UL Throughput Denum AMQ", 0) / 1000.0)::numeric, 2) AS user_ul_thp_mbps,
                ROUND((b."spectrum efficiency num" / NULLIF(b."spectrum efficiency denum", 0))::numeric, 2) AS spectrum_efficiency,

                -- Other Throughputs
                ROUND((d."Cell DL Throughput (Kbps) AMQ" / 1000.0)::numeric, 2) AS cell_dl_thp_mbps,
                ROUND((d."Cell UL Throughput (Kbps) AMQ" / 1000.0)::numeric, 2) AS cell_ul_thp_mbps,
                ROUND((d."DL Throughput CA_(kbps) AMQ" / 1000.0)::numeric, 2) AS ca_dl_thp_mbps,
                ROUND((d."UL Throughput CA_(kbps) AMQ" / 1000.0)::numeric, 2) AS ca_ul_thp_mbps,
                ROUND(d."Maximum Cell DL RLC Throughput(Mbps)"::numeric, 2) AS max_cell_dl_rlc_thp_mbps,
                ROUND(d."Maximum Cell UL RLC Throughput(Mbps)"::numeric, 2) AS max_cell_ul_rlc_thp_mbps,
                ROUND(d."Maximum Cell DL PDCP Throughput(Mbps)"::numeric, 2) AS max_cell_dl_pdcp_thp_mbps,
                ROUND(d."Maximum Cell UL PDCP Throughput(Mbps)"::numeric, 2) AS max_cell_ul_pdcp_thp_mbps,

                -- User Numbers
                d."Maximum Number of RRC Connection User(unit)" AS max_rrc_user,
                d."New Active Users rnp_Ono" AS active_users,
                ROUND(d."Average DL Active User Number"::numeric, 2) AS avg_dl_active_users,
                d."Max_DL_Active_User_Number_QCI1 AMQ" AS max_dl_active_users_qci1,
                d."Max_UL_Active_User_Number_QCI1 AMQ" AS max_ul_active_users_qci1,
                ROUND(d."Avg_DL_Active_User_Number_QCI1 AMQ"::numeric, 2) AS avg_dl_active_users_qci1,
                ROUND(d."Avg_UL_Active_User_Number_QCI1 AMQ"::numeric, 2) AS avg_ul_active_users_qci1,
                d."Max_User_VoLTE AMQ" AS max_user_volte,
                ROUND(d."Average Number of UE that can be simultaneously"::numeric, 2) AS simultaneous_ue_avg,
                d."Maximum Number of UE that can be simultaneously" AS simultaneous_ue_max,
                ROUND(d."U31_[LTE]MeanRrcConnectedUserNUmber"::numeric, 2) AS rrc_connected_mean,

                -- Quality & RF & Latency
                ROUND(d."CQI Average AMQ"::numeric, 2) AS cqi,
                ROUND(d."Average CQI_Rev"::numeric, 2) AS cqi_rev,
                ROUND((d."CQI>=7_(%%) AMQ" * 100)::numeric, 2) AS cqi_ge_7_pct,
                ROUND(d."Average NI of Carrier(dBm)"::numeric, 2) AS avg_ni_dbm,
                ROUND(d."Maximum NI of Carrier(dBm)"::numeric, 2) AS max_ni_dbm,
                ROUND(d."Average Cell RSSI(dBm)"::numeric, 2) AS avg_cell_rssi,
                ROUND(d."Cell Downlink Init BLER(%%)"::numeric, 2) AS dl_init_bler_pct,
                ROUND(d."Cell Uplink Init BLER(%%)"::numeric, 2) AS ul_init_bler_pct,
                ROUND(d."Average DL IP Packet Delay(ms)"::numeric, 2) AS dl_ip_packet_delay_ms,
                ROUND(d."U31_[LTE]IP Latency"::numeric, 2) AS ip_latency_ms,
                ROUND(d."U31_Average DL PDCP SDU Delay"::numeric, 2) AS pdcp_sdu_delay_ms,

                -- Mobility & Handover
                ROUND((d."IFHO SR (%%) AMQ" * 100)::numeric, 2) AS ifho_sr,
                ROUND((d."Inter Freq LTE HO SR_(%%) AMQ" * 100)::numeric, 2) AS inter_freq_ho_sr,
                ROUND((d."X2 HO Out (%%) AMQ" * 100)::numeric, 2) AS x2_ho_out_sr,
                ROUND((d."S1 HO Out (%%) AMQ" * 100)::numeric, 2) AS s1_ho_out_sr,
                ROUND((d."Inter Freq X2 HO SR_(%%) AMQ" * 100)::numeric, 2) AS inter_freq_x2_ho_sr,
                ROUND((d."Inter Freq S1 HO SR_(%%) AMQ" * 100)::numeric, 2) AS inter_freq_s1_ho_sr,
                ROUND((d."LTE-GSM HO SR_(%%) AMQ" * 100)::numeric, 2) AS lte_gsm_ho_sr,
                ROUND((d."Intra_Freq_HOSR_VoLTE_SR_(%%) AMQ" * 100)::numeric, 2) AS volte_intra_freq_hosr,
                ROUND((d."Inter_Freq_HOSR_VoLTE_SR_(%%) AMQ" * 100)::numeric, 2) AS volte_inter_freq_hosr,
                ROUND((d."SRVCC_LTE-GSM_HOSR_VoLTE_SR_(%%) AMQ" * 100)::numeric, 2) AS srvcc_gsm_hosr,

                -- Equipment & System
                ROUND(d."Average CPU Utilization Rate of the Baseband Control-Plane(%%)"::numeric, 2) AS avg_cpu_util_pct,
                ROUND(d."Peak CPU Utilization Rate of the Baseband Control-Plane(%%)"::numeric, 2) AS peak_cpu_util_pct,
                ROUND(d."Paging Congestion Rate(%%)"::numeric, 2) AS paging_congestion_rate_pct,
                ROUND(d."KPI Paging Success Rate (%%)"::numeric, 2) AS paging_sr,
                ROUND(d."U31_Ratio of RRC Re-establishment "::numeric, 2) AS rrc_reestablishment_ratio
            FROM "measDy4g" d
            LEFT JOIN "measBdbh4g" b 
              ON d."Begin Time" = b."Begin Time" 
             AND d."SubnetWork ID" = b."SubnetWork ID"
             AND d."ManagedElement ID" = b."ManagedElement ID"
             AND d."eNodeBId" = b."eNodeBId" 
             AND d."cellId" = b."cellId"
            WHERE d."Begin Time" >= %s::timestamp AND d."Begin Time" <= %s::timestamp
              AND d."eNodeBId" = ANY(%s)
            ORDER BY d."Begin Time", d."Cell Name";
        """
        cur.execute(sql, (start_str, end_str, enb_list))
        all_meas_rows = cur.fetchall()

    cur.close()
    conn.close()

    # 4. Bucketing per sector & carrier
    sector_buckets = defaultdict(lambda: {
        "kpi_values": defaultdict(lambda: defaultdict(lambda: defaultdict(list))),
        "bands": {}
    })

    # Pre-populate bands for carriers from cell_map
    for meta in cell_map_by_name.values():
        sec = meta['sector']
        carrier = meta['carrier']
        band = meta['band']
        sector_buckets[sec]["bands"][carrier] = band

    for r in all_meas_rows:
        ts = r['begin_time']
        t_key = ts.strftime("%Y-%m-%d")
        cname = r['cell_name'].strip() if r['cell_name'] else ""
        cid = int(r['cell_id']) if r['cell_id'] is not None else None

        meta = cell_map_by_ci.get(cid) or cell_map_by_name.get(cname.upper()) or cell_map_by_name.get(normalize_cell_key(cname))
        if not meta and (cname.startswith("E_") or cname.startswith("C_")):
            stripped = cname[2:]
            meta = cell_map_by_name.get(stripped.upper()) or cell_map_by_name.get(normalize_cell_key(stripped))

        if meta:
            sec = meta['sector']
            carrier = meta['carrier']
            band = meta['band']
        else:
            sec = 1
            band = get_band_from_ci(cid, cname)
            carrier = get_clean_carrier_label(cname, sec, band)

        sb = sector_buckets[sec]
        sb["bands"][carrier] = band

        # Store raw row values mapped to our KPI IDs
        mapping = {
            "payload": r.get('payload_gb'),
            "dl_traffic": r.get('dl_traffic_gb'),
            "ul_traffic": r.get('ul_traffic_gb'),
            "ca_payload_total": r.get('ca_payload_total_gb'),
            "ca_payload_dl": r.get('ca_payload_dl_gb'),
            "ca_payload_ul": r.get('ca_payload_ul_gb'),
            "volte_payload_dl": r.get('volte_payload_dl_mb'),
            "volte_payload_ul": r.get('volte_payload_ul_mb'),
            "volte_traffic": r.get('volte_traffic_erl'),

            "availability": r.get('availability_pct'),
            "rrc_setup_sr": r.get('rrc_setup_sr'),
            "erab_setup_sr": r.get('erab_setup_sr'),
            "cssr": r.get('cssr'),
            "s1_conn_sr": r.get('s1_conn_sr'),
            "volte_rrc_sr": r.get('volte_rrc_sr'),
            "volte_erab_qci1_sr": r.get('volte_erab_qci1_sr'),
            "volte_erab_qci5_sr": r.get('volte_erab_qci5_sr'),
            "volte_call_setup_sr": r.get('volte_call_setup_sr'),
            "csfb_sr": r.get('csfb_sr'),

            "erab_drop_rate": r.get('erab_drop_rate'),
            "service_drop_rate": r.get('service_drop_rate'),
            "volte_call_drop_rate": r.get('volte_call_drop_rate'),

            "dl_prb": r.get('dl_prb_pct'),
            "ul_prb": r.get('ul_prb_pct'),
            "user_dl_thp": r.get('user_dl_thp_mbps'),
            "user_ul_thp": r.get('user_ul_thp_mbps'),
            "spectrum_efficiency": r.get('spectrum_efficiency'),

            "cell_dl_thp": r.get('cell_dl_thp_mbps'),
            "cell_ul_thp": r.get('cell_ul_thp_mbps'),
            "ca_dl_thp": r.get('ca_dl_thp_mbps'),
            "ca_ul_thp": r.get('ca_ul_thp_mbps'),
            "max_cell_dl_rlc_thp": r.get('max_cell_dl_rlc_thp_mbps'),
            "max_cell_ul_rlc_thp": r.get('max_cell_ul_rlc_thp_mbps'),
            "max_cell_dl_pdcp_thp": r.get('max_cell_dl_pdcp_thp_mbps'),
            "max_cell_ul_pdcp_thp": r.get('max_cell_ul_pdcp_thp_mbps'),

            "max_rrc": r.get('max_rrc_user'),
            "active_users": r.get('active_users'),
            "avg_dl_active_users": r.get('avg_dl_active_users'),
            "max_dl_active_users_qci1": r.get('max_dl_active_users_qci1'),
            "max_ul_active_users_qci1": r.get('max_ul_active_users_qci1'),
            "avg_dl_active_users_qci1": r.get('avg_dl_active_users_qci1'),
            "avg_ul_active_users_qci1": r.get('avg_ul_active_users_qci1'),
            "max_user_volte": r.get('max_user_volte'),
            "simultaneous_ue_avg": r.get('simultaneous_ue_avg'),
            "simultaneous_ue_max": r.get('simultaneous_ue_max'),
            "rrc_connected_mean": r.get('rrc_connected_mean'),

            "cqi": r.get('cqi'),
            "cqi_rev": r.get('cqi_rev'),
            "cqi_ge_7": r.get('cqi_ge_7_pct'),
            "avg_ni_dbm": r.get('avg_ni_dbm'),
            "max_ni_dbm": r.get('max_ni_dbm'),
            "avg_cell_rssi": r.get('avg_cell_rssi'),
            "dl_init_bler": r.get('dl_init_bler_pct'),
            "ul_init_bler": r.get('ul_init_bler_pct'),
            "dl_ip_packet_delay": r.get('dl_ip_packet_delay_ms'),
            "ip_latency": r.get('ip_latency_ms'),
            "pdcp_sdu_delay": r.get('pdcp_sdu_delay_ms'),

            "ifho_sr": r.get('ifho_sr'),
            "inter_freq_ho_sr": r.get('inter_freq_ho_sr'),
            "x2_ho_out_sr": r.get('x2_ho_out_sr'),
            "s1_ho_out_sr": r.get('s1_ho_out_sr'),
            "inter_freq_x2_ho_sr": r.get('inter_freq_x2_ho_sr'),
            "inter_freq_s1_ho_sr": r.get('inter_freq_s1_ho_sr'),
            "lte_gsm_ho_sr": r.get('lte_gsm_ho_sr'),
            "volte_intra_freq_hosr": r.get('volte_intra_freq_hosr'),
            "volte_inter_freq_hosr": r.get('volte_inter_freq_hosr'),
            "srvcc_gsm_hosr": r.get('srvcc_gsm_hosr'),

            "avg_cpu_util": r.get('avg_cpu_util_pct'),
            "peak_cpu_util": r.get('peak_cpu_util_pct'),
            "paging_congestion_rate": r.get('paging_congestion_rate_pct'),
            "paging_sr": r.get('paging_sr'),
            "rrc_reestablishment_ratio": r.get('rrc_reestablishment_ratio')
        }

        for kpi_id, val in mapping.items():
            if val is not None:
                sb["kpi_values"][kpi_id][carrier][t_key].append(float(val))

        found_sectors.add(sec)
        found_bands.add(band)

    sorted_sectors = sorted(list(sector_buckets.keys()))
    if not sorted_sectors:
        sorted_sectors = [1, 2, 3]

    # 5. Format results per sector
    result_sectors = {}
    for sec in sorted_sectors:
        s_data = sector_buckets[sec]
        c_names = sorted(list(s_data["bands"].keys()))

        kpis_out = {}
        for k_id, cfg in DAILY_KPIS_CONFIG.items():
            is_avg = cfg["is_avg"]
            has_tot = cfg["has_tot"]

            s_dict = {}
            for c in c_names:
                vals = []
                for t in sorted_ts:
                    raw_list = s_data["kpi_values"][k_id][c].get(t, [])
                    if raw_list:
                        if is_avg:
                            vals.append(round(sum(raw_list) / len(raw_list), 2))
                        else:
                            vals.append(round(sum(raw_list), 2))
                    else:
                        vals.append(0.0)
                s_dict[c] = vals

            tot_list = []
            if has_tot:
                for i in range(len(sorted_ts)):
                    tot = sum(s_dict[c][i] for c in c_names if i < len(s_dict[c]))
                    tot_list.append(round(tot, 2))

            kpis_out[k_id] = {
                "id": k_id,
                "title": cfg["title"],
                "unit": cfg["unit"],
                "category": cfg["category"],
                "source": cfg["source"],
                "carriers": c_names,
                "carrier_bands": s_data["bands"],
                "carrier_series": s_dict,
                "total_series": tot_list if has_tot else None,
                "has_total": has_tot,
                "min_y": cfg["min_y"],
                "max_y": cfg["max_y"]
            }

        result_sectors[f"sector{sec}"] = {
            "sector_num": sec,
            "title": f"Sector {sec}",
            "timestamps": sorted_ts,
            "carriers": c_names,
            "carrier_bands": s_data["bands"],
            "carrier_series": kpis_out["payload"]["carrier_series"] if "payload" in kpis_out else {},
            "total_series": kpis_out["payload"]["total_series"] if "payload" in kpis_out else None,
            "kpis": kpis_out
        }

    # Hierarchy site info
    h_data = get_hierarchy_data()
    site_meta = h_data.get("site_map", {}).get(site_clean, {
        "site_id": site_clean,
        "nop": "UNKNOWN",
        "kabupaten": "UNKNOWN",
        "kecamatan": "UNKNOWN"
    })

    t1 = time.time()
    return {
        "site_id": site_clean,
        "site_info": site_meta,
        "enodeb_name": ", ".join(sorted(list(enodeb_names))),
        "enodeb_names": sorted(list(enodeb_names)),
        "time_mode": "daily",
        "start_date": dt_start.strftime("%Y-%m-%d"),
        "end_date": dt_end.strftime("%Y-%m-%d"),
        "available_sectors": sorted_sectors,
        "available_bands": sorted(list(found_bands)),
        "available_types": sorted(list(found_types)) if found_types else ["Macro"],
        "cell_type": active_type_filter,
        "sectors": result_sectors,
        "total_records": len(all_meas_rows),
        "execution_time_sec": round(t1 - t0, 3),
        "source": "OneDb Live (187.127.124.130:5432: measDy4g & measBdbh4g)",
        "latest_db_date": "2026-11-02"
    }

BAND_CASE_SQL = """
    CASE 
        WHEN (d."cellId"::int %% 256) BETWEEN 70 AND 79 OR d."Cell Name" LIKE '%%VE%%' THEN 'L700'
        WHEN (d."cellId"::int %% 256) BETWEEN 20 AND 29 OR d."Cell Name" LIKE '%%MT%%' THEN 'L900'
        WHEN (d."cellId"::int %% 256) BETWEEN 10 AND 19 OR d."Cell Name" LIKE '%%MR%%' THEN 'L1800'
        WHEN (d."cellId"::int %% 256) BETWEEN 0 AND 9   OR d."Cell Name" LIKE '%%SL%%' THEN 'L2100'
        WHEN (d."cellId"::int %% 256) BETWEEN 40 AND 49 OR d."Cell Name" LIKE '%%MF%%' THEN 'L2300_2'
        WHEN (d."cellId"::int %% 256) BETWEEN 30 AND 39 OR d."Cell Name" LIKE '%%ME%%' THEN 'L2300_1'
        ELSE 'L1800'
    END
"""

BAND_CASE_BDBH_SQL = """
    CASE 
        WHEN (b."cellId"::int %% 256) BETWEEN 70 AND 79 THEN 'L700'
        WHEN (b."cellId"::int %% 256) BETWEEN 20 AND 29 THEN 'L900'
        WHEN (b."cellId"::int %% 256) BETWEEN 10 AND 19 THEN 'L1800'
        WHEN (b."cellId"::int %% 256) BETWEEN 0 AND 9   THEN 'L2100'
        WHEN (b."cellId"::int %% 256) BETWEEN 40 AND 49 THEN 'L2300_2'
        WHEN (b."cellId"::int %% 256) BETWEEN 30 AND 39 THEN 'L2300_1'
        ELSE 'L1800'
    END
"""

def get_scope_aggregation_data(
    scope: str = "regional",
    mode: str = "full",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    nops: Optional[List[str]] = None,
    cities: Optional[List[str]] = None,
    kecamatans: Optional[List[str]] = None,
    sites: Optional[List[str]] = None,
    bands: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Returns time-series KPI charts aggregated across Regional, NOP, City/Kabupaten,
    Kecamatan, or Site levels with either Full Aggregation (entity curves) or Mode Band (band curves).
    Uses measDy4g and measBdbh4g from OneDb.
    """
    t0 = time.time()
    conn = get_onedb_connection(timeout=15)
    if not conn:
        raise RuntimeError("OneDb is not reachable for scope aggregation.")

    cur = conn.cursor()

    max_known_db_date = datetime(2026, 11, 2)
    now = datetime.now()
    yesterday = now - timedelta(days=1)
    
    try:
        dt_end = datetime.strptime(end_date.strip(), "%Y-%m-%d") if end_date else max_known_db_date
    except Exception:
        dt_end = max_known_db_date

    try:
        dt_start = datetime.strptime(start_date.strip(), "%Y-%m-%d") if start_date else (dt_end - timedelta(days=7))
    except Exception:
        dt_start = dt_end - timedelta(days=7)

    start_str = dt_start.strftime("%Y-%m-%d 00:00:00")
    end_str = dt_end.strftime("%Y-%m-%d 23:59:59")

    # Generate expected date strings
    expected_ts = []
    cur_t = dt_start
    while cur_t <= dt_end:
        expected_ts.append(cur_t.strftime("%Y-%m-%d"))
        cur_t += timedelta(days=1)
    sorted_ts = sorted(list(set(expected_ts)))

    scope_clean = (scope or "regional").lower()
    mode_clean = (mode or "full").lower()

    # 1. Resolve active entities and eNodeBs
    enb_to_entity: Dict[float, str] = {}
    active_entities: List[str] = []

    if scope_clean == "regional":
        active_entities = ["Region Sulawesi"]
    elif scope_clean == "nop":
        if mode_clean == "band":
            active_entities = [nops[0] if (nops and len(nops) > 0) else "MAKASSAR"]
        else:
            active_entities = nops if (nops and len(nops) > 0) else ["MAKASSAR", "BONE", "KENDARI"]
        
        cur.execute("""
            SELECT DISTINCT r.enodeb_id, l."NOP"
            FROM "CellListRCI" r
            JOIN "LookupSITEID" l ON r.site_id = l."Prefix Site ID"
            WHERE l."NOP" = ANY(%s) AND r.enodeb_id IS NOT NULL;
        """, (active_entities,))
        for enb, nop in cur.fetchall():
            if enb:
                enb_to_entity[float(enb)] = nop

    elif scope_clean == "city":
        if mode_clean == "band":
            active_entities = [cities[0] if (cities and len(cities) > 0) else "KOTA MAKASSAR"]
        else:
            active_entities = cities if (cities and len(cities) > 0) else ["KOTA MAKASSAR", "GOWA"]
        
        cur.execute("""
            SELECT DISTINCT r.enodeb_id, r.kabupaten
            FROM "CellListRCI" r
            WHERE r.kabupaten = ANY(%s) AND r.enodeb_id IS NOT NULL;
        """, (active_entities,))
        for enb, kab in cur.fetchall():
            if enb:
                enb_to_entity[float(enb)] = kab

    elif scope_clean == "kecamatan":
        if mode_clean == "band":
            active_entities = [kecamatans[0] if (kecamatans and len(kecamatans) > 0) else "BUNGKU TENGAH"]
        else:
            active_entities = kecamatans if (kecamatans and len(kecamatans) > 0) else ["BUNGKU TENGAH", "BUNGKU BARAT"]

        cur.execute("""
            SELECT DISTINCT r.enodeb_id, r.kecamatan
            FROM "CellListRCI" r
            WHERE r.kecamatan = ANY(%s) AND r.enodeb_id IS NOT NULL;
        """, (active_entities,))
        for enb, kec in cur.fetchall():
            if enb:
                enb_to_entity[float(enb)] = kec

    elif scope_clean == "site":
        if mode_clean == "band":
            active_entities = [sites[0].strip().upper() if (sites and len(sites) > 0) else "MRW002"]
        else:
            active_entities = [s.strip().upper() for s in sites] if (sites and len(sites) > 0) else ["MRW002", "UPD919"]

        cur.execute("""
            SELECT DISTINCT r.enodeb_id, r.site_id
            FROM "CellListRCI" r
            WHERE r.site_id = ANY(%s) AND r.enodeb_id IS NOT NULL;
        """, (active_entities,))
        for enb, site in cur.fetchall():
            if enb:
                enb_to_entity[float(enb)] = site

    enb_list = list(enb_to_entity.keys())

    # Build SQL queries
    if mode_clean == "band":
        carrier_keys = ["L700", "L900", "L1800", "L2100", "L2300_1", "L2300_2"]
        carrier_bands = {b: b for b in carrier_keys}

        where_enb_dy = "AND d.\"eNodeBId\" = ANY(%s)" if enb_list else ""
        where_enb_bdbh = "AND b.\"eNodeBId\" = ANY(%s)" if enb_list else ""
        sql_dy_params = (start_str, end_str, enb_list) if enb_list else (start_str, end_str)
        sql_bdbh_params = (start_str, end_str, enb_list) if enb_list else (start_str, end_str)

        sql_dy = f"""
            SELECT 
                d."Begin Time"::date as dt,
                {BAND_CASE_SQL} as series_key,
                ROUND((SUM(d."4G Payload (MByte) AMQ") / 1024.0)::numeric, 2) as payload,
                ROUND((SUM(d."DL Traffic Volume (MByte) AMQ") / 1024.0)::numeric, 2) as dl_traffic,
                ROUND((SUM(d."UL Traffic Volume (MByte) AMQ") / 1024.0)::numeric, 2) as ul_traffic,
                ROUND(SUM(d."DL_Volume_VoLTE_QCI1_(MByte) AMQ")::numeric, 2) as volte_payload_dl,
                ROUND(MAX(d."Maximum Number of RRC Connection User(unit)")::numeric, 0) as max_rrc,
                ROUND(AVG(d."New Active Users rnp_Ono")::numeric, 0) as active_users,
                ROUND(AVG(d."Cell Availability 4G_(%%)" * 100)::numeric, 2) as availability,
                ROUND(AVG(d."RRC Setup SR (%%) AMQ" * 100)::numeric, 2) as rrc_setup_sr,
                ROUND(AVG(d."E-RAB Setup SR (%%) AMQ" * 100)::numeric, 2) as erab_setup_sr,
                ROUND(AVG(d."CSSR (%%) AMQ" * 100)::numeric, 2) as cssr,
                ROUND(AVG(d."IFHO SR (%%) AMQ" * 100)::numeric, 2) as ifho_sr,
                ROUND(AVG(d."Inter Freq LTE HO SR_(%%) AMQ" * 100)::numeric, 2) as inter_freq_ho_sr,
                ROUND(AVG(d."CQI Average AMQ")::numeric, 2) as cqi,
                ROUND(AVG(d."CSFB SR (%%) AMQ" * 100)::numeric, 2) as csfb_sr,
                ROUND(AVG(d."Average DL IP Packet Delay(ms)")::numeric, 2) as ip_delay
            FROM "measDy4g" d
            WHERE d."Begin Time" >= %s::timestamp AND d."Begin Time" <= %s::timestamp
              {where_enb_dy}
            GROUP BY dt, series_key
            ORDER BY dt, series_key;
        """

        sql_bdbh = f"""
            SELECT 
                b."Begin Time"::date as dt,
                {BAND_CASE_BDBH_SQL} as series_key,
                ROUND((SUM(b."DL PRB Utilization Num AMQ") / NULLIF(SUM(b."DL PRB Utilization Denum AMQ"), 0) * 100)::numeric, 2) as dl_prb,
                ROUND((SUM(b."UL PRB Utilization Num AMQ") / NULLIF(SUM(b."UL PRB Utilization Denum AMQ"), 0) * 100)::numeric, 2) as ul_prb,
                ROUND((SUM(b."User DL Throughput Num AMQ") / NULLIF(SUM(b."User DL Throughput Denum AMQ"), 0) / 1000.0)::numeric, 2) as user_dl_thp,
                ROUND((SUM(b."User UL Throughput Num AMQ") / NULLIF(SUM(b."User UL Throughput Denum AMQ"), 0) / 1000.0)::numeric, 2) as user_ul_thp,
                ROUND((SUM(b."spectrum efficiency num") / NULLIF(SUM(b."spectrum efficiency denum"), 0))::numeric, 2) as spectrum_efficiency
            FROM "measBdbh4g" b
            WHERE b."Begin Time" >= %s::timestamp AND b."Begin Time" <= %s::timestamp
              {where_enb_bdbh}
            GROUP BY dt, series_key
            ORDER BY dt, series_key;
        """
    else:
        # Full aggregation mode: entities
        carrier_keys = active_entities
        carrier_bands = {ent: "ENTITY" for ent in carrier_keys}

        if scope_clean == "regional":
            case_sql_dy = "'Region Sulawesi'"
            case_sql_bdbh = "'Region Sulawesi'"
            where_enb_dy = ""
            where_enb_bdbh = ""
            sql_dy_params = (start_str, end_str)
            sql_bdbh_params = (start_str, end_str)
        else:
            case_parts_dy = []
            case_parts_bdbh = []
            for ent in active_entities:
                enbs = [k for k, v in enb_to_entity.items() if v == ent]
                if enbs:
                    enb_str = ",".join(str(e) for e in enbs)
                    case_parts_dy.append(f"WHEN d.\"eNodeBId\" IN ({enb_str}) THEN '{ent}'")
                    case_parts_bdbh.append(f"WHEN b.\"eNodeBId\" IN ({enb_str}) THEN '{ent}'")
            case_sql_dy = "CASE " + " ".join(case_parts_dy) + " ELSE 'OTHER' END" if case_parts_dy else "'OTHER'"
            case_sql_bdbh = "CASE " + " ".join(case_parts_bdbh) + " ELSE 'OTHER' END" if case_parts_bdbh else "'OTHER'"
            where_enb_dy = "AND d.\"eNodeBId\" = ANY(%s)" if enb_list else ""
            where_enb_bdbh = "AND b.\"eNodeBId\" = ANY(%s)" if enb_list else ""
            sql_dy_params = (start_str, end_str, enb_list) if enb_list else (start_str, end_str)
            sql_bdbh_params = (start_str, end_str, enb_list) if enb_list else (start_str, end_str)

        sql_dy = f"""
            SELECT 
                d."Begin Time"::date as dt,
                {case_sql_dy} as series_key,
                ROUND((SUM(d."4G Payload (MByte) AMQ") / 1024.0)::numeric, 2) as payload,
                ROUND((SUM(d."DL Traffic Volume (MByte) AMQ") / 1024.0)::numeric, 2) as dl_traffic,
                ROUND((SUM(d."UL Traffic Volume (MByte) AMQ") / 1024.0)::numeric, 2) as ul_traffic,
                ROUND(SUM(d."DL_Volume_VoLTE_QCI1_(MByte) AMQ")::numeric, 2) as volte_payload_dl,
                ROUND(MAX(d."Maximum Number of RRC Connection User(unit)")::numeric, 0) as max_rrc,
                ROUND(AVG(d."New Active Users rnp_Ono")::numeric, 0) as active_users,
                ROUND(AVG(d."Cell Availability 4G_(%%)" * 100)::numeric, 2) as availability,
                ROUND(AVG(d."RRC Setup SR (%%) AMQ" * 100)::numeric, 2) as rrc_setup_sr,
                ROUND(AVG(d."E-RAB Setup SR (%%) AMQ" * 100)::numeric, 2) as erab_setup_sr,
                ROUND(AVG(d."CSSR (%%) AMQ" * 100)::numeric, 2) as cssr,
                ROUND(AVG(d."IFHO SR (%%) AMQ" * 100)::numeric, 2) as ifho_sr,
                ROUND(AVG(d."Inter Freq LTE HO SR_(%%) AMQ" * 100)::numeric, 2) as inter_freq_ho_sr,
                ROUND(AVG(d."CQI Average AMQ")::numeric, 2) as cqi,
                ROUND(AVG(d."CSFB SR (%%) AMQ" * 100)::numeric, 2) as csfb_sr,
                ROUND(AVG(d."Average DL IP Packet Delay(ms)")::numeric, 2) as ip_delay
            FROM "measDy4g" d
            WHERE d."Begin Time" >= %s::timestamp AND d."Begin Time" <= %s::timestamp
              {where_enb_dy}
            GROUP BY dt, series_key
            ORDER BY dt, series_key;
        """

        sql_bdbh = f"""
            SELECT 
                b."Begin Time"::date as dt,
                {case_sql_bdbh} as series_key,
                ROUND((SUM(b."DL PRB Utilization Num AMQ") / NULLIF(SUM(b."DL PRB Utilization Denum AMQ"), 0) * 100)::numeric, 2) as dl_prb,
                ROUND((SUM(b."UL PRB Utilization Num AMQ") / NULLIF(SUM(b."UL PRB Utilization Denum AMQ"), 0) * 100)::numeric, 2) as ul_prb,
                ROUND((SUM(b."User DL Throughput Num AMQ") / NULLIF(SUM(b."User DL Throughput Denum AMQ"), 0) / 1000.0)::numeric, 2) as user_dl_thp,
                ROUND((SUM(b."User UL Throughput Num AMQ") / NULLIF(SUM(b."User UL Throughput Denum AMQ"), 0) / 1000.0)::numeric, 2) as user_ul_thp,
                ROUND((SUM(b."spectrum efficiency num") / NULLIF(SUM(b."spectrum efficiency denum"), 0))::numeric, 2) as spectrum_efficiency
            FROM "measBdbh4g" b
            WHERE b."Begin Time" >= %s::timestamp AND b."Begin Time" <= %s::timestamp
              {where_enb_bdbh}
            GROUP BY dt, series_key
            ORDER BY dt, series_key;
        """

    cur.execute(sql_dy, sql_dy_params)
    dy_rows = cur.fetchall()

    cur.execute(sql_bdbh, sql_bdbh_params)
    bdbh_rows = cur.fetchall()

    cur.close()
    conn.close()

    # Map rows to structure: data_map[kpi_id][series_key][dt_str] = val
    from collections import defaultdict
    data_map = defaultdict(lambda: defaultdict(dict))

    dy_cols = [
        "payload", "dl_traffic", "ul_traffic", "volte_payload_dl",
        "max_rrc", "active_users", "availability", "rrc_setup_sr",
        "erab_setup_sr", "cssr", "ifho_sr", "inter_freq_ho_sr",
        "cqi", "csfb_sr", "ip_delay"
    ]

    for r in dy_rows:
        dt_str = str(r[0])
        s_key = str(r[1])
        if s_key == 'OTHER':
            continue
        for idx, col in enumerate(dy_cols):
            val = float(r[2 + idx]) if r[2 + idx] is not None else 0.0
            data_map[col][s_key][dt_str] = val

    bdbh_cols = ["dl_prb", "ul_prb", "user_dl_thp", "user_ul_thp", "spectrum_efficiency"]
    for r in bdbh_rows:
        dt_str = str(r[0])
        s_key = str(r[1])
        if s_key == 'OTHER':
            continue
        for idx, col in enumerate(bdbh_cols):
            val = float(r[2 + idx]) if r[2 + idx] is not None else 0.0
            data_map[col][s_key][dt_str] = val

    # Build response KPIs dictionary matching SectorPayloadChart expectations
    KPI_METAS = {
        "payload": {"title": "Payload (GB)", "unit": "GB", "category": "Productivity", "is_avg": False, "has_tot": True, "min_y": 0, "max_y": None},
        "dl_traffic": {"title": "DL Traffic Volume (GB)", "unit": "GB", "category": "Productivity", "is_avg": False, "has_tot": True, "min_y": 0, "max_y": None},
        "ul_traffic": {"title": "UL Traffic Volume (GB)", "unit": "GB", "category": "Productivity", "is_avg": False, "has_tot": True, "min_y": 0, "max_y": None},
        "volte_payload_dl": {"title": "VoLTE DL Volume (MB)", "unit": "MB", "category": "Productivity", "is_avg": False, "has_tot": True, "min_y": 0, "max_y": None},
        "max_rrc": {"title": "Max RRC User (Users)", "unit": "Users", "category": "User Concurrency", "is_avg": False, "has_tot": False, "min_y": 0, "max_y": None},
        "active_users": {"title": "Active Users", "unit": "Users", "category": "User Concurrency", "is_avg": True, "has_tot": False, "min_y": 0, "max_y": None},
        "availability": {"title": "Availability (%)", "unit": "%", "category": "Accessibility", "is_avg": True, "has_tot": False, "min_y": 0, "max_y": 100},
        "rrc_setup_sr": {"title": "RRC Setup SR (%)", "unit": "%", "category": "Accessibility", "is_avg": True, "has_tot": False, "min_y": 0, "max_y": 100},
        "erab_setup_sr": {"title": "E-RAB Setup SR (%)", "unit": "%", "category": "Accessibility", "is_avg": True, "has_tot": False, "min_y": 0, "max_y": 100},
        "cssr": {"title": "CSSR (%)", "unit": "%", "category": "Accessibility", "is_avg": True, "has_tot": False, "min_y": 0, "max_y": 100},
        "ifho_sr": {"title": "IFHO SR (%)", "unit": "%", "category": "Mobility", "is_avg": True, "has_tot": False, "min_y": 0, "max_y": 100},
        "inter_freq_ho_sr": {"title": "Inter-Freq HO SR (%)", "unit": "%", "category": "Mobility", "is_avg": True, "has_tot": False, "min_y": 0, "max_y": 100},
        "csfb_sr": {"title": "CSFB SR (%)", "unit": "%", "category": "Accessibility", "is_avg": True, "has_tot": False, "min_y": 0, "max_y": 100},
        "cqi": {"title": "Average CQI", "unit": "", "category": "Quality & Latency", "is_avg": True, "has_tot": False, "min_y": 0, "max_y": 15},
        "ip_delay": {"title": "DL IP Packet Delay (ms)", "unit": "ms", "category": "Quality & Latency", "is_avg": True, "has_tot": False, "min_y": 0, "max_y": None},
        "dl_prb": {"title": "DL PRB Utilization (%) (BDBH)", "unit": "%", "category": "Capacity & Utilization", "is_avg": True, "has_tot": False, "min_y": 0, "max_y": 100},
        "ul_prb": {"title": "UL PRB Utilization (%) (BDBH)", "unit": "%", "category": "Capacity & Utilization", "is_avg": True, "has_tot": False, "min_y": 0, "max_y": 100},
        "user_dl_thp": {"title": "User DL Throughput (Mbps) (BDBH)", "unit": "Mbps", "category": "Throughput & Speed", "is_avg": True, "has_tot": False, "min_y": 0, "max_y": None},
        "user_ul_thp": {"title": "User UL Throughput (Mbps) (BDBH)", "unit": "Mbps", "category": "Throughput & Speed", "is_avg": True, "has_tot": False, "min_y": 0, "max_y": None},
        "spectrum_efficiency": {"title": "Spectrum Efficiency (BDBH)", "unit": "", "category": "Throughput & Speed", "is_avg": True, "has_tot": False, "min_y": 0, "max_y": None}
    }

    result_kpis = {}
    for k_id, meta in KPI_METAS.items():
        carrier_series = {}
        for c_key in carrier_keys:
            series_vals = [data_map[k_id][c_key].get(t, 0.0) for t in sorted_ts]
            carrier_series[c_key] = series_vals

        tot_list = None
        if meta["has_tot"]:
            tot_list = []
            for i in range(len(sorted_ts)):
                tot = sum(carrier_series[c][i] for c in carrier_keys if i < len(carrier_series[c]))
                tot_list.append(round(tot, 2))

        result_kpis[k_id] = {
            "id": k_id,
            "title": meta["title"],
            "unit": meta["unit"],
            "category": meta["category"],
            "carriers": carrier_keys,
            "carrier_bands": carrier_bands,
            "carrier_series": carrier_series,
            "total_series": tot_list,
            "has_total": meta["has_tot"],
            "min_y": meta["min_y"],
            "max_y": meta["max_y"]
        }

    t1 = time.time()
    return {
        "scope": scope_clean,
        "mode": mode_clean,
        "start_date": dt_start.strftime("%Y-%m-%d"),
        "end_date": dt_end.strftime("%Y-%m-%d"),
        "timestamps": sorted_ts,
        "active_entities": active_entities,
        "available_bands": ["L700", "L900", "L1800", "L2100", "L2300_1", "L2300_2"],
        "carrier_bands": carrier_bands,
        "carriers": carrier_keys,
        "kpis": result_kpis,
        "execution_time_sec": round(t1 - t0, 3),
        "source": "OneDb Live (measDy4g & measBdbh4g)"
    }
