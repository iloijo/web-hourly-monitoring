import time
import re
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from collections import defaultdict
from .db import get_onedb_connection
from .site_names import get_site_display_name, get_site_name

# =============================================================================
# 5G KPI Dictionary (measDy5g in OneDb)
# All chartable 5G radio metrics grouped into intuitive categories
# =============================================================================
KPIS_5G_CONFIG = {
    # 1. Productivity (Payload & Traffic)
    "payload": {
        "title": "Payload (GB)",
        "unit": "GB",
        "category": "Productivity",
        "has_tot": True,
        "is_avg": False,
        "min_y": 0,
        "max_y": None
    },
    "payload_dl": {
        "title": "DL Payload (GB)",
        "unit": "GB",
        "category": "Productivity",
        "has_tot": True,
        "is_avg": False,
        "min_y": 0,
        "max_y": None
    },
    "payload_ul": {
        "title": "UL Payload (GB)",
        "unit": "GB",
        "category": "Productivity",
        "has_tot": True,
        "is_avg": False,
        "min_y": 0,
        "max_y": None
    },

    # 2. Throughput & Speed
    "user_dl_thp": {
        "title": "User DL Thp (Mbps)",
        "unit": "Mbps",
        "category": "Throughput & Speed",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": None
    },
    "user_ul_thp": {
        "title": "User UL Thp (Mbps)",
        "unit": "Mbps",
        "category": "Throughput & Speed",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": None
    },
    "cell_dl_thp": {
        "title": "Cell DL Thp (Mbps)",
        "unit": "Mbps",
        "category": "Throughput & Speed",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": None
    },
    "cell_ul_thp": {
        "title": "Cell UL Thp (Mbps)",
        "unit": "Mbps",
        "category": "Throughput & Speed",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": None
    },
    "spectrum_efficiency": {
        "title": "Spectrum Efficiency (bps/Hz)",
        "unit": "bps/Hz",
        "category": "Throughput & Speed",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": None
    },

    # 3. Accessibility
    "sn_setup_sr": {
        "title": "SN Setup SR (%)",
        "unit": "%",
        "category": "Accessibility",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": 100
    },
    "availability": {
        "title": "Availability (%)",
        "unit": "%",
        "category": "Accessibility",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": 100
    },

    # 4. Retainability
    "retainability": {
        "title": "NR Retainability Rate (%)",
        "unit": "%",
        "category": "Retainability",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": 100
    },
    "packet_loss": {
        "title": "Packet Loss Rate (%)",
        "unit": "%",
        "category": "Retainability",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": None
    },

    # 5. Mobility
    "intra_ho_sr": {
        "title": "Intra-Freq HO SR (%)",
        "unit": "%",
        "category": "Mobility",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": 100
    },
    "inter_ho_sr": {
        "title": "Inter-Freq HO SR (%)",
        "unit": "%",
        "category": "Mobility",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": 100
    },

    # 6. Capacity & Utilization
    "dl_prb": {
        "title": "DL PRB Utilization (%)",
        "unit": "%",
        "category": "Capacity & Utilization",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": 100
    },
    "ul_prb": {
        "title": "UL PRB Utilization (%)",
        "unit": "%",
        "category": "Capacity & Utilization",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": 100
    },

    # 7. User Concurrency
    "active_users": {
        "title": "Active Users",
        "unit": "Users",
        "category": "User Concurrency",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": None
    },
    "rrc_users": {
        "title": "RRC Users",
        "unit": "Users",
        "category": "User Concurrency",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": None
    },
    "max_rrc_users": {
        "title": "Max RRC Users",
        "unit": "Users",
        "category": "User Concurrency",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": None
    },

    # 8. Quality & Latency
    "cqi": {
        "title": "CQI Average",
        "unit": "",
        "category": "Quality & Latency",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": 15
    },
    "cqi_256qam": {
        "title": "CQI 256 QAM",
        "unit": "",
        "category": "Quality & Latency",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": 15
    },
    "cqi_64qam": {
        "title": "CQI 64 QAM",
        "unit": "",
        "category": "Quality & Latency",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": 15
    },
    "latency_dl": {
        "title": "DL Latency (ms)",
        "unit": "ms",
        "category": "Quality & Latency",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": None
    },
    "latency_ul": {
        "title": "UL Latency (ms)",
        "unit": "ms",
        "category": "Quality & Latency",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": None
    },
    "uplink_interference": {
        "title": "UL Interference (dBm)",
        "unit": "dBm",
        "category": "Quality & Latency",
        "has_tot": False,
        "is_avg": True,
        "min_y": None,
        "max_y": None
    }
}

CACHED_5G_SITES: Optional[List[str]] = None

def get_5g_sites() -> List[str]:
    """Returns all unique 5G site IDs from ref_cell_5g in OneDb."""
    global CACHED_5G_SITES
    if CACHED_5G_SITES:
        return CACHED_5G_SITES

    conn = get_onedb_connection(timeout=8)
    if not conn:
        return ["UPD012", "UPD003", "UPD076", "SSU136", "TER129", "UPD183", "COI344", "COI350"]

    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT DISTINCT siteid 
            FROM "ref_cell_5g" 
            WHERE siteid IS NOT NULL AND siteid != '' 
            ORDER BY siteid;
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        CACHED_5G_SITES = [r[0].strip().upper() for r in rows if r[0]]
        return CACHED_5G_SITES
    except Exception as e:
        return ["UPD012", "UPD003", "UPD076", "SSU136", "TER129", "UPD183", "COI344", "COI350"]


def parse_5g_cell(cell_name: str):
    """
    Parses sector, carrier, band, and type from 5G cell name e.g.:
    C_UPD012VP1_Divnet-DMT_VP01 -> sector: 1, carrier: 'VP1', band: 'NR2300', type: 'Macro'
    C_UPD183QP1_OldBuilding_QP015 -> sector: 15, carrier: 'QP1', band: 'NR2300', type: 'Indoor'
    """
    c_upper = cell_name.strip().upper()
    
    # Determine type (Indoor vs Macro)
    is_indoor = "QP" in c_upper or "_IND" in c_upper or "INB" in c_upper or "RRU" in c_upper
    cell_type = "Indoor" if is_indoor else "Macro"

    # Determine band
    band = "NR2300"
    if "NR2100" in c_upper or "2100" in c_upper:
        band = "NR2100"
    elif "NR3500" in c_upper or "3500" in c_upper:
        band = "NR3500"

    # Determine carrier and sector from suffix (e.g. _VP01, _VQ02, _MK03, _QP015)
    parts = c_upper.split('_')
    last_part = parts[-1] if len(parts) > 1 else ""
    
    sector = 1
    carrier = "VP1"

    # Match carrier token e.g. VP, VQ, MK, QP
    match_suffix = re.search(r'([A-Z]+)(\d+)$', last_part)
    if match_suffix:
        c_code = match_suffix.group(1)
        sec_num = int(match_suffix.group(2))
        sector = sec_num
        carrier = f"{c_code}1" if not c_code.endswith('1') else c_code
    else:
        # Check first token e.g. C_UPD012VP1
        if len(parts) >= 2:
            match_first = re.search(r'([A-Z]{2}\d*)$', parts[1])
            if match_first:
                carrier = match_first.group(1)

    return {
        "cell_name": cell_name,
        "sector": sector,
        "carrier": carrier,
        "band": band,
        "type": cell_type
    }


def get_site_payload_5g_data(
    site_id: str = "UPD012",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    sector_filter: Optional[str] = None,
    band_filter: Optional[str] = None,
    cell_type: Optional[str] = "macro",
    days_back: int = 14
) -> Dict[str, Any]:
    """
    Queries real 5G Daily Multi-KPI from OneDb (measDy5g).
    Returns sector-level time series data formatted for SectorPayloadChart.
    """
    t0 = time.time()
    conn = get_onedb_connection(timeout=10)
    if not conn:
        raise RuntimeError("OneDb is not reachable. Check host 187.127.124.130:5432.")

    site_clean = site_id.strip().upper()
    cur = conn.cursor()

    # Determine date range
    max_known_db_date = datetime(2026, 11, 3)
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

    # Query measDy5g
    cur.execute("""
        SELECT 
            "Begin Time" as begin_time,
            "NRPhysicalCellDU Name" as cell_name,
            -- KPIs
            ROUND("Payload(GB)_LW"::numeric, 2) as payload,
            ROUND("Payload_DL(GB)_LW"::numeric, 2) as payload_dl,
            ROUND("Payload_UL(GB)_LW"::numeric, 2) as payload_ul,
            ROUND("User_Throughput_DL(Mbps)_LW"::numeric, 2) as user_dl_thp,
            ROUND("User_Throughput_UL(Mbps)_LW"::numeric, 2) as user_ul_thp,
            ROUND("Cell_Throughput_DL(Mbps)_LW"::numeric, 2) as cell_dl_thp,
            ROUND("Cell_Throughput_UL(Mbps)_LW"::numeric, 2) as cell_ul_thp,
            ROUND("Spectrum_Eff-XHJ_1646720283375"::numeric, 2) as spectrum_efficiency,
            ROUND(("SN_Setup_Success_Rate(%%)_LW" * 100)::numeric, 2) as sn_setup_sr,
            ROUND(("Availability(%%)_LW" * 100)::numeric, 2) as availability,
            ROUND(("NR_Retainability(%%)_LW" * 100)::numeric, 4) as retainability,
            ROUND(("Packet_Loss(%%)_LW" * 100)::numeric, 4) as packet_loss,
            ROUND(("Intra_Handover_Success_Rate(%%)_LW" * 100)::numeric, 2) as intra_ho_sr,
            ROUND(("Inter_Handover_Success_Rate(%%)_LW" * 100)::numeric, 2) as inter_ho_sr,
            ROUND(("PRB_Utilization_DL(%%)_LW" * 100)::numeric, 2) as dl_prb,
            ROUND(("PRB_Utilization_UL(%%)_LW" * 100)::numeric, 2) as ul_prb,
            ROUND("Active_User_Number_LW"::numeric, 2) as active_users,
            ROUND("RRC_User_Number_LW"::numeric, 2) as rrc_users,
            ROUND("Max_RRC_User_Number-xhj"::numeric, 2) as max_rrc_users,
            ROUND("Average_CQI-XHJ_1646720281179"::numeric, 2) as cqi,
            ROUND("Average_CQI_256 QAM_LW"::numeric, 2) as cqi_256qam,
            ROUND("Average_CQI_64 QAM_LW"::numeric, 2) as cqi_64qam,
            ROUND("Latency_DL(ms)_LW"::numeric, 2) as latency_dl,
            ROUND("Latency_UL(ms)_LW"::numeric, 2) as latency_ul,
            ROUND("Uplink_Interference(dBm)_LW"::numeric, 2) as uplink_interference
        FROM "measDy5g"
        WHERE "Begin Time" >= %s AND "Begin Time" <= %s
          AND "NRPhysicalCellDU Name" LIKE %s
        ORDER BY "Begin Time", "NRPhysicalCellDU Name";
    """, (start_str, end_str, f"%{site_clean}%"))

    meas_rows = cur.fetchall()
    col_names = [d[0] for d in cur.description]
    cur.close()
    conn.close()

    # Organize data by sector, carrier, and date
    found_sectors = set()
    found_bands = set()
    found_types = set()
    cell_meta_cache = {}

    # Temporary storage: data_tree[sector][kpi_id][carrier][date_str] = val
    data_tree = defaultdict(lambda: defaultdict(lambda: defaultdict(dict)))
    carrier_bands_map = {}

    active_type_filter = cell_type.strip().lower() if cell_type else "all"

    for r_tuple in meas_rows:
        row = dict(zip(col_names, r_tuple))
        cname = row['cell_name']
        if cname not in cell_meta_cache:
            cell_meta_cache[cname] = parse_5g_cell(cname)
        
        meta = cell_meta_cache[cname]
        c_type = meta['type']
        found_types.add(c_type)

        if active_type_filter == "macro" and c_type != "Macro":
            continue
        elif active_type_filter == "indoor" and c_type != "Indoor":
            continue

        sec = meta['sector']
        carrier = meta['carrier']
        band = meta['band']

        found_sectors.add(sec)
        found_bands.add(band)
        carrier_bands_map[carrier] = band

        # Filter by sector if specified
        if sector_filter and sector_filter != "all":
            try:
                if sec != int(sector_filter):
                    continue
            except ValueError:
                pass

        # Filter by band if specified
        if band_filter and band_filter != "all":
            if band != band_filter:
                continue

        d_str = row['begin_time'].strftime("%Y-%m-%d")

        for k_id in KPIS_5G_CONFIG.keys():
            val = row.get(k_id)
            if val is not None:
                try:
                    data_tree[sec][k_id][carrier][d_str] = float(val)
                except (ValueError, TypeError):
                    pass

    # If no data found with strict type filter, try fallback to all types
    if not found_sectors and meas_rows:
        for r_tuple in meas_rows:
            row = dict(zip(col_names, r_tuple))
            cname = row['cell_name']
            if cname not in cell_meta_cache:
                cell_meta_cache[cname] = parse_5g_cell(cname)
            meta = cell_meta_cache[cname]
            sec = meta['sector']
            carrier = meta['carrier']
            band = meta['band']
            found_sectors.add(sec)
            found_bands.add(band)
            carrier_bands_map[carrier] = band
            d_str = row['begin_time'].strftime("%Y-%m-%d")
            for k_id in KPIS_5G_CONFIG.keys():
                val = row.get(k_id)
                if val is not None:
                    try:
                        data_tree[sec][k_id][carrier][d_str] = float(val)
                    except (ValueError, TypeError):
                        pass

    # Build response structure
    sorted_sectors = sorted(list(found_sectors)) if found_sectors else [1, 2, 3]
    sectors_output = {}

    for sec in sorted_sectors:
        sector_kpis = {}
        for k_id, cfg in KPIS_5G_CONFIG.items():
            carriers_data = data_tree[sec][k_id]
            series_by_carrier = {}

            # Construct continuous time-series arrays for each carrier
            for c_name, date_vals in carriers_data.items():
                arr = [date_vals.get(d, None) for d in sorted_ts]
                series_by_carrier[c_name] = arr

            # Calculate total series if KPI has_tot (e.g. Payload)
            total_arr = None
            if cfg.get("has_tot", False) and series_by_carrier:
                total_arr = []
                for idx in range(len(sorted_ts)):
                    valid_vals = [
                        s[idx] for s in series_by_carrier.values() 
                        if s[idx] is not None
                    ]
                    if valid_vals:
                        total_arr.append(round(sum(valid_vals), 2))
                    else:
                        total_arr.append(None)

            sector_kpis[k_id] = {
                "title": cfg["title"],
                "unit": cfg["unit"],
                "category": cfg["category"],
                "has_tot": cfg.get("has_tot", False),
                "is_avg": cfg.get("is_avg", True),
                "min_y": cfg.get("min_y"),
                "max_y": cfg.get("max_y"),
                "carrier_series": series_by_carrier,
                "total_series": total_arr,
                "carrier_bands": {c: carrier_bands_map.get(c, "NR2300") for c in series_by_carrier.keys()}
            }

        sectors_output[f"sector{sec}"] = {
            "sector": sec,
            "kpis": sector_kpis
        }

    return {
        "site_id": site_clean,
        "site_name": get_site_name(site_clean),
        "enodeb_name": get_site_display_name(site_clean),
        "time_mode": "daily",
        "tech": "5G",
        "timestamps": sorted_ts,
        "available_sectors": sorted_sectors,
        "available_bands": sorted(list(found_bands)) if found_bands else ["NR2300"],
        "available_types": sorted(list(found_types)) if found_types else ["Macro"],
        "sectors": sectors_output,
        "query_duration_sec": round(time.time() - t0, 3)
    }
