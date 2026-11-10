import time
import re
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from collections import defaultdict
from .db import get_onedb_connection, get_latest_data_date
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
        "title": "User DL Thp (Mbps) [BDBH]",
        "unit": "Mbps",
        "category": "Throughput & Speed",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": None
    },
    "user_ul_thp": {
        "title": "User UL Thp (Mbps) [BDBH]",
        "unit": "Mbps",
        "category": "Throughput & Speed",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": None
    },
    "cell_dl_thp": {
        "title": "Cell DL Thp (Mbps) [BDBH]",
        "unit": "Mbps",
        "category": "Throughput & Speed",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": None
    },
    "cell_ul_thp": {
        "title": "Cell UL Thp (Mbps) [BDBH]",
        "unit": "Mbps",
        "category": "Throughput & Speed",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": None
    },
    "spectrum_efficiency": {
        "title": "Spectrum Efficiency (bps/Hz) [BDBH]",
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
        "title": "DL PRB Utilization (%) [BDBH]",
        "unit": "%",
        "category": "Capacity & Utilization",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": 100
    },
    "ul_prb": {
        "title": "UL PRB Utilization (%) [BDBH]",
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

# =============================================================================
# 5G BDBH (measBdbh5g): one busy-hour row per cell per day. PRB, User/Cell Thp
# and Spectrum Efficiency charts read these values instead of the daily ones.
# =============================================================================
BDBH_5G_KPIS = ("dl_prb", "ul_prb", "user_dl_thp", "user_ul_thp", "cell_dl_thp", "cell_ul_thp", "spectrum_efficiency")


def _bdbh_5g_rows_sql(extra_where: str = "") -> str:
    """
    measBdbh5g limited to [%s, %s], one row per cell per day. A few cells report
    several tied busy hours; the one with the highest DL PRB is kept.
    """
    return f"""
        SELECT DISTINCT ON ("NRPhysicalCellDU Name", "Begin Time"::date) *
        FROM "measBdbh5g"
        WHERE "Begin Time" >= %s AND "Begin Time" <= %s {extra_where}
        ORDER BY "NRPhysicalCellDU Name", "Begin Time"::date,
                 "PRB_Utilization_DL(%%)_LW_Num" / NULLIF("PRB_Utilization_DL(%%)_LW_Denum", 0) DESC NULLS LAST
    """


def _fetch_bdbh_5g_by_cell(cur, start_str: str, end_str: str, site_like: str) -> Dict[tuple, Dict[str, float]]:
    """{(cell_name, 'YYYY-MM-DD'): {kpi_id: value}} for one site."""
    cur.execute(f"""
        SELECT
            b."NRPhysicalCellDU Name" AS cell_name,
            b."Begin Time"::date AS dt,
            ROUND((b."PRB_Utilization_DL(%%)_LW_Num" / NULLIF(b."PRB_Utilization_DL(%%)_LW_Denum", 0) * 100)::numeric, 2) AS dl_prb,
            ROUND((b."PRB_Utilization_UL(%%)_LW_Num" / NULLIF(b."PRB_Utilization_UL(%%)_LW_Denum", 0) * 100)::numeric, 2) AS ul_prb,
            ROUND(b."User_Throughput_DL(Mbps)_LW"::numeric, 2) AS user_dl_thp,
            ROUND(b."User_Throughput_UL(Mbps)_LW"::numeric, 2) AS user_ul_thp,
            ROUND(b."Cell_Throughput_DL(Mbps)_KML"::numeric, 2) AS cell_dl_thp,
            ROUND(b."Cell_Throughput_UL(Mbps)_KML"::numeric, 2) AS cell_ul_thp,
            ROUND((b."Num_Spectrum_Eff-xhj" / NULLIF(b."Denum_Spectrum_Eff-xhj", 0))::numeric, 2) AS spectrum_efficiency
        FROM ({_bdbh_5g_rows_sql('AND "NRPhysicalCellDU Name" LIKE %s')}) b
    """, (start_str, end_str, site_like))
    cols = [d[0] for d in cur.description]
    out = {}
    for r in cur.fetchall():
        row = dict(zip(cols, r))
        out[(row["cell_name"], row["dt"].strftime("%Y-%m-%d"))] = {k: row[k] for k in BDBH_5G_KPIS}
    return out


def _apply_bdbh_5g(row: Dict[str, Any], bdbh_by_cell: Dict[tuple, Dict[str, float]]) -> None:
    """Replace the BDBH KPIs of a measDy5g row with that cell/day's busy-hour values (None if missing)."""
    vals = bdbh_by_cell.get((row["cell_name"], row["begin_time"].strftime("%Y-%m-%d")), {})
    for k in BDBH_5G_KPIS:
        row[k] = vals.get(k)


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


def parse_5g_cell(cell_name: str, cell_id: Optional[float] = None):
    """
    Parses sector, carrier, band, and type from 5G cell name & cellId:
    - cellId ending with 4 -> NR2300 (NR 2300)
    - cellId ending with 6 -> NR2600 (NR 2600)
    - cellId ending with 3 -> NR2100 (NR 2100)
    """
    c_upper = cell_name.strip().upper()
    
    # Determine type (Indoor vs Macro)
    is_indoor = "QP" in c_upper or "_IND" in c_upper or "INB" in c_upper or "RRU" in c_upper
    cell_type = "Indoor" if is_indoor else "Macro"

    # Determine band based on rule: cellId akhiran 4 -> NR2300, akhiran 6 -> NR2600
    last_digit = None
    if cell_id is not None:
        try:
            last_digit = int(float(cell_id)) % 10
        except (ValueError, TypeError):
            pass

    if last_digit == 4:
        band = "NR2300"
    elif last_digit == 6:
        band = "NR2600"
    elif last_digit == 3:
        band = "NR2100"
    else:
        # Fallback by cell name / carrier token
        if "VQ" in c_upper or "2600" in c_upper or "EP" in c_upper:
            band = "NR2600"
        elif "MK" in c_upper or "2100" in c_upper or "EK" in c_upper:
            band = "NR2100"
        elif "NR3500" in c_upper or "3500" in c_upper:
            band = "NR3500"
        else:
            band = "NR2300"

    # Determine carrier and sector from suffix (e.g. _VP01, _VQ02, _MK03, _QP015)
    parts = c_upper.split('_')
    last_part = parts[-1] if len(parts) > 1 else ""
    
    sector = 1
    legacy_carrier = "VP1"

    # Match carrier token e.g. VP, VQ, MK, QP
    match_suffix = re.search(r'([A-Z]+)(\d+)$', last_part)
    if match_suffix:
        c_code = match_suffix.group(1)
        sec_num = int(match_suffix.group(2))
        sector = sec_num
        legacy_carrier = f"{c_code}1" if not c_code.endswith('1') else c_code
    else:
        # Check first token e.g. C_UPD012VP1
        if len(parts) >= 2:
            match_first = re.search(r'([A-Z]{2}\d*)$', parts[1])
            if match_first:
                legacy_carrier = match_first.group(1)

    cid_str = None
    if cell_id is not None:
        try:
            cid_str = str(int(float(cell_id)))
        except (ValueError, TypeError):
            cid_str = None

    carrier = cid_str if cid_str is not None else legacy_carrier

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
    max_known_db_date = get_latest_data_date("onedb", "measDy5g")
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
            "NRPhysicalCellDU ID" as cell_id,
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
    bdbh_by_cell = _fetch_bdbh_5g_by_cell(cur, start_str, end_str, f"%{site_clean}%")
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
    carrier_names_map = {}

    active_type_filter = cell_type.strip().lower() if cell_type else "all"

    for r_tuple in meas_rows:
        row = dict(zip(col_names, r_tuple))
        _apply_bdbh_5g(row, bdbh_by_cell)
        cname = row['cell_name']
        if cname not in cell_meta_cache:
            cell_meta_cache[cname] = parse_5g_cell(cname, cell_id=row.get('cell_id'))
        
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
        carrier_names_map[carrier] = cname

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
            _apply_bdbh_5g(row, bdbh_by_cell)
            cname = row['cell_name']
            if cname not in cell_meta_cache:
                cell_meta_cache[cname] = parse_5g_cell(cname, cell_id=row.get('cell_id'))
            meta = cell_meta_cache[cname]
            sec = meta['sector']
            carrier = meta['carrier']
            band = meta['band']
            found_sectors.add(sec)
            found_bands.add(band)
            carrier_bands_map[carrier] = band
            carrier_names_map[carrier] = cname
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
        # Collect and numerically sort all carriers present in this sector
        sec_carriers = set()
        for k_id in KPIS_5G_CONFIG.keys():
            sec_carriers.update(data_tree[sec][k_id].keys())
        c_list = sorted(list(sec_carriers), key=lambda x: (0, int(x)) if x.isdigit() else (1, x))

        for k_id, cfg in KPIS_5G_CONFIG.items():
            carriers_data = data_tree[sec][k_id]
            series_by_carrier = {}

            # Construct continuous time-series arrays for each carrier in sorted order
            for c_name in c_list:
                if c_name in carriers_data:
                    date_vals = carriers_data[c_name]
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
                "id": k_id,
                "title": cfg["title"],
                "unit": cfg["unit"],
                "category": cfg["category"],
                "has_tot": cfg.get("has_tot", False),
                "is_avg": cfg.get("is_avg", True),
                "min_y": cfg.get("min_y"),
                "max_y": cfg.get("max_y"),
                "carriers": c_list,
                "carrier_series": series_by_carrier,
                "total_series": total_arr,
                "carrier_bands": {c: carrier_bands_map.get(c, "NR2300") for c in c_list},
                "carrier_names": {c: carrier_names_map.get(c, c) for c in c_list}
            }

        sectors_output[f"sector{sec}"] = {
            "sector": sec,
            "sector_num": sec,
            "title": f"Sector {sec}",
            "timestamps": sorted_ts,
            "carriers": c_list,
            "carrier_bands": {c: carrier_bands_map.get(c, "NR2300") for c in c_list},
            "carrier_names": {c: carrier_names_map.get(c, c) for c in c_list},
            "carrier_series": sector_kpis.get("payload", {}).get("carrier_series", {}),
            "total_series": sector_kpis.get("payload", {}).get("total_series"),
            "kpis": sector_kpis
        }

    return {
        "site_id": site_clean,
        "site_name": get_site_name(site_clean),
        "enodeb_name": get_site_display_name(site_clean),
        "time_mode": "daily",
        "tech": "5G",
        "timestamps": sorted_ts,
        "default_sector": sorted_sectors[0] if sorted_sectors else 1,
        "available_sectors": sorted_sectors,
        "available_bands": sorted(list(found_bands)) if found_bands else ["NR2300"],
        "available_types": sorted(list(found_types)) if found_types else ["Macro"],
        "sectors": sectors_output,
        "query_duration_sec": round(time.time() - t0, 3)
    }


# Daily KPI select list on measDy5g (alias m), shared by the scope and cluster aggregations
KPI_5G_SELECT = """
    -- KPIs
    ROUND(SUM(m."Payload(GB)_LW")::numeric, 2) as payload,
    ROUND(SUM(m."Payload_DL(GB)_LW")::numeric, 2) as payload_dl,
    ROUND(SUM(m."Payload_UL(GB)_LW")::numeric, 2) as payload_ul,
    ROUND(AVG(m."User_Throughput_DL(Mbps)_LW")::numeric, 2) as user_dl_thp,
    ROUND(AVG(m."User_Throughput_UL(Mbps)_LW")::numeric, 2) as user_ul_thp,
    ROUND(AVG(m."Cell_Throughput_DL(Mbps)_LW")::numeric, 2) as cell_dl_thp,
    ROUND(AVG(m."Cell_Throughput_UL(Mbps)_LW")::numeric, 2) as cell_ul_thp,
    ROUND(AVG(m."Spectrum_Eff-XHJ_1646720283375")::numeric, 2) as spectrum_efficiency,
    ROUND(AVG(m."SN_Setup_Success_Rate(%%)_LW" * 100)::numeric, 2) as sn_setup_sr,
    ROUND(AVG(m."Availability(%%)_LW" * 100)::numeric, 2) as availability,
    ROUND(AVG(m."NR_Retainability(%%)_LW" * 100)::numeric, 4) as retainability,
    ROUND(AVG(m."Packet_Loss(%%)_LW" * 100)::numeric, 4) as packet_loss,
    ROUND(AVG(m."Intra_Handover_Success_Rate(%%)_LW" * 100)::numeric, 2) as intra_ho_sr,
    ROUND(AVG(m."Inter_Handover_Success_Rate(%%)_LW" * 100)::numeric, 2) as inter_ho_sr,
    ROUND(AVG(m."PRB_Utilization_DL(%%)_LW" * 100)::numeric, 2) as dl_prb,
    ROUND(AVG(m."PRB_Utilization_UL(%%)_LW" * 100)::numeric, 2) as ul_prb,
    ROUND(AVG(m."Active_User_Number_LW")::numeric, 2) as active_users,
    ROUND(AVG(m."RRC_User_Number_LW")::numeric, 2) as rrc_users,
    ROUND(MAX(m."Max_RRC_User_Number-xhj")::numeric, 2) as max_rrc_users,
    ROUND(AVG(m."Average_CQI-XHJ_1646720281179")::numeric, 2) as cqi,
    ROUND(AVG(m."Average_CQI_256 QAM_LW")::numeric, 2) as cqi_256qam,
    ROUND(AVG(m."Average_CQI_64 QAM_LW")::numeric, 2) as cqi_64qam,
    ROUND(AVG(m."Latency_DL(ms)_LW")::numeric, 2) as latency_dl,
    ROUND(AVG(m."Latency_UL(ms)_LW")::numeric, 2) as latency_ul,
    ROUND(AVG(m."Uplink_Interference(dBm)_LW")::numeric, 2) as uplink_interference
"""


# BDBH KPI select list on the one-row-per-cell measBdbh5g rows (alias m)
KPI_5G_BDBH_SELECT = """
    ROUND((SUM(m."PRB_Utilization_DL(%%)_LW_Num") / NULLIF(SUM(m."PRB_Utilization_DL(%%)_LW_Denum"), 0) * 100)::numeric, 2) as dl_prb,
    ROUND((SUM(m."PRB_Utilization_UL(%%)_LW_Num") / NULLIF(SUM(m."PRB_Utilization_UL(%%)_LW_Denum"), 0) * 100)::numeric, 2) as ul_prb,
    ROUND(AVG(m."User_Throughput_DL(Mbps)_LW")::numeric, 2) as user_dl_thp,
    ROUND(AVG(m."User_Throughput_UL(Mbps)_LW")::numeric, 2) as user_ul_thp,
    ROUND(AVG(m."Cell_Throughput_DL(Mbps)_KML")::numeric, 2) as cell_dl_thp,
    ROUND(AVG(m."Cell_Throughput_UL(Mbps)_KML")::numeric, 2) as cell_ul_thp,
    ROUND((SUM(m."Num_Spectrum_Eff-xhj") / NULLIF(SUM(m."Denum_Spectrum_Eff-xhj"), 0))::numeric, 2) as spectrum_efficiency
"""


def get_scope_aggregation_5g_data(
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
    Kecamatan, or Site levels for 5G (measDy5g) in OneDb.
    Supports Full Aggregation (entity curves) and Mode Band (NR2300, NR2600, NR2100).
    Band rule: cellId ending in 4 -> NR2300, ending in 6 -> NR2600.
    """
    t0 = time.time()
    conn = get_onedb_connection(timeout=15)
    if not conn:
        raise RuntimeError("OneDb is not reachable for 5G scope aggregation.")

    cur = conn.cursor()

    max_known_db_date = get_latest_data_date("onedb", "measDy5g")
    try:
        dt_end = datetime.strptime(end_date.strip(), "%Y-%m-%d") if end_date else max_known_db_date
    except Exception:
        dt_end = max_known_db_date

    try:
        dt_start = datetime.strptime(start_date.strip(), "%Y-%m-%d") if start_date else (dt_end - timedelta(days=9))
    except Exception:
        dt_start = dt_end - timedelta(days=9)

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

    active_entities: List[str] = []
    join_sql = ""
    where_entity = ""
    params: List[Any] = [start_str, end_str]

    band_case_sql = """
        CASE 
            WHEN ("NRPhysicalCellDU ID"::int %% 10) = 4 THEN 'NR2300'
            WHEN ("NRPhysicalCellDU ID"::int %% 10) = 6 THEN 'NR2600'
            ELSE 'NR2100'
        END
    """

    if mode_clean == "band":
        # Mode Band: only 1 entity is selected, and curves are the bands: NR2300, NR2600, NR2100
        carrier_keys = ["NR2300", "NR2600", "NR2100"]
        if bands and len(bands) > 0 and len(bands) < len(carrier_keys):
            carrier_keys = [b for b in bands if b in carrier_keys]
        carrier_bands = {b: b for b in carrier_keys}
        series_key_sql = band_case_sql

        if scope_clean == "regional":
            active_entities = ["Region Sulawesi"]
        elif scope_clean == "nop":
            ent = nops[0] if (nops and len(nops) > 0) else "MAKASSAR"
            active_entities = [ent]
            join_sql = """
                JOIN "CellListRCI" r ON substring(m."NRPhysicalCellDU Name" from '^[A-Z]_([A-Z0-9]{6})') = r.site_id
                JOIN "LookupSITEID" l ON r.site_id = l."Prefix Site ID"
            """
            where_entity = "AND l.\"NOP\" = %s"
            params.append(ent)
        elif scope_clean == "city":
            ent = cities[0] if (cities and len(cities) > 0) else "KOTA MAKASSAR"
            active_entities = [ent]
            join_sql = """JOIN "CellListRCI" r ON substring(m."NRPhysicalCellDU Name" from '^[A-Z]_([A-Z0-9]{6})') = r.site_id"""
            where_entity = "AND r.kabupaten = %s"
            params.append(ent)
        elif scope_clean == "kecamatan":
            ent = kecamatans[0] if (kecamatans and len(kecamatans) > 0) else "TAMALATE"
            active_entities = [ent]
            join_sql = """JOIN "CellListRCI" r ON substring(m."NRPhysicalCellDU Name" from '^[A-Z]_([A-Z0-9]{6})') = r.site_id"""
            where_entity = "AND r.kecamatan = %s"
            params.append(ent)
        elif scope_clean == "site":
            ent = sites[0].strip().upper() if (sites and len(sites) > 0) else "UPD012"
            active_entities = [ent]
            where_entity = "AND substring(m.\"NRPhysicalCellDU Name\" from '^[A-Z]_([A-Z0-9]{6})') = %s"
            params.append(ent)

    else:
        # Mode Full: curves are entities (Regional, NOPs, Cities, Kecamatans, Sites)
        if scope_clean == "regional":
            active_entities = ["Region Sulawesi"]
            series_key_sql = "'Region Sulawesi'"
        elif scope_clean == "nop":
            active_entities = nops if (nops and len(nops) > 0) else ["MAKASSAR", "MANADO", "BONE"]
            series_key_sql = "l.\"NOP\""
            join_sql = """
                JOIN "CellListRCI" r ON substring(m."NRPhysicalCellDU Name" from '^[A-Z]_([A-Z0-9]{6})') = r.site_id
                JOIN "LookupSITEID" l ON r.site_id = l."Prefix Site ID"
            """
            where_entity = "AND l.\"NOP\" = ANY(%s)"
            params.append(active_entities)
        elif scope_clean == "city":
            active_entities = cities if (cities and len(cities) > 0) else ["KOTA MAKASSAR", "MINAHASA"]
            series_key_sql = "r.kabupaten"
            join_sql = """JOIN "CellListRCI" r ON substring(m."NRPhysicalCellDU Name" from '^[A-Z]_([A-Z0-9]{6})') = r.site_id"""
            where_entity = "AND r.kabupaten = ANY(%s)"
            params.append(active_entities)
        elif scope_clean == "kecamatan":
            active_entities = kecamatans if (kecamatans and len(kecamatans) > 0) else ["TAMALATE"]
            series_key_sql = "r.kecamatan"
            join_sql = """JOIN "CellListRCI" r ON substring(m."NRPhysicalCellDU Name" from '^[A-Z]_([A-Z0-9]{6})') = r.site_id"""
            where_entity = "AND r.kecamatan = ANY(%s)"
            params.append(active_entities)
        elif scope_clean == "site":
            active_entities = [s.strip().upper() for s in sites] if (sites and len(sites) > 0) else ["UPD012", "UPD003"]
            series_key_sql = "substring(m.\"NRPhysicalCellDU Name\" from '^[A-Z]_([A-Z0-9]{6})')"
            where_entity = "AND substring(m.\"NRPhysicalCellDU Name\" from '^[A-Z]_([A-Z0-9]{6})') = ANY(%s)"
            params.append(active_entities)

        carrier_keys = active_entities
        carrier_bands = {e: "ENTITY" for e in carrier_keys}

    # Optional band filter in full mode
    where_band = ""
    if mode_clean == "full" and bands and len(bands) < 3:
        band_clauses = []
        if "NR2300" in bands:
            band_clauses.append("(\"NRPhysicalCellDU ID\"::int %% 10) = 4")
        if "NR2600" in bands:
            band_clauses.append("(\"NRPhysicalCellDU ID\"::int %% 10) = 6")
        if "NR2100" in bands:
            band_clauses.append("(\"NRPhysicalCellDU ID\"::int %% 10) = 3")
        if band_clauses:
            where_band = f"AND ({' OR '.join(band_clauses)})"

    sql = f"""
        SELECT 
            m."Begin Time"::date as dt,
            {series_key_sql} as series_key,
            {KPI_5G_SELECT}
        FROM "measDy5g" m
        {join_sql}
        WHERE m."Begin Time" >= %s AND m."Begin Time" <= %s
        {where_entity}
        {where_band}
        GROUP BY dt, series_key
        ORDER BY dt, series_key;
    """

    cur.execute(sql, tuple(params))
    rows = cur.fetchall()
    col_names = [d[0] for d in cur.description]

    bdbh_sql = f"""
        SELECT
            m."Begin Time"::date as dt,
            {series_key_sql} as series_key,
            {KPI_5G_BDBH_SELECT}
        FROM ({_bdbh_5g_rows_sql()}) m
        {join_sql}
        WHERE TRUE
        {where_entity}
        {where_band}
        GROUP BY dt, series_key
    """
    cur.execute(bdbh_sql, tuple(params))
    bdbh_rows = cur.fetchall()
    bdbh_cols = [d[0] for d in cur.description]
    cur.close()
    conn.close()

    # Organize data into data_map[kpi_id][entity_key][date_str] = float
    data_map = defaultdict(lambda: defaultdict(dict))

    for r_tuple in rows:
        row = dict(zip(col_names, r_tuple))
        d_str = row['dt'].strftime("%Y-%m-%d") if hasattr(row['dt'], 'strftime') else str(row['dt'])
        series_k = str(row['series_key']).strip() if row.get('series_key') is not None else "Other"

        for k_id in KPIS_5G_CONFIG.keys():
            if k_id in BDBH_5G_KPIS:
                continue
            val = row.get(k_id)
            if val is not None:
                try:
                    data_map[k_id][series_k][d_str] = float(val)
                except (ValueError, TypeError):
                    pass

    for r_tuple in bdbh_rows:
        row = dict(zip(bdbh_cols, r_tuple))
        d_str = row['dt'].strftime("%Y-%m-%d")
        series_k = str(row['series_key']).strip() if row.get('series_key') is not None else "Other"
        for k_id in BDBH_5G_KPIS:
            if row.get(k_id) is not None:
                data_map[k_id][series_k][d_str] = float(row[k_id])

    # Construct result kpis dictionary
    result_kpis = {}
    for k_id, cfg in KPIS_5G_CONFIG.items():
        carrier_series = {}
        for c_key in carrier_keys:
            series_vals = [data_map[k_id][c_key].get(t, None) for t in sorted_ts]
            carrier_series[c_key] = series_vals

        tot_list = None
        if cfg.get("has_tot", False) and carrier_series:
            tot_list = []
            for i in range(len(sorted_ts)):
                valid = [carrier_series[c][i] for c in carrier_keys if i < len(carrier_series[c]) and carrier_series[c][i] is not None]
                if valid:
                    tot_list.append(round(sum(valid), 3))
                else:
                    tot_list.append(None)

        result_kpis[k_id] = {
            "id": k_id,
            "title": cfg["title"],
            "unit": cfg["unit"],
            "category": cfg["category"],
            "carriers": carrier_keys,
            "carrier_bands": carrier_bands,
            "carrier_series": carrier_series,
            "total_series": tot_list,
            "has_total": cfg.get("has_tot", False),
            "is_avg": cfg.get("is_avg", True),
            "min_y": cfg.get("min_y"),
            "max_y": cfg.get("max_y")
        }

    t1 = time.time()
    return {
        "scope": scope_clean,
        "mode": mode_clean,
        "tech": "5G",
        "start_date": dt_start.strftime("%Y-%m-%d"),
        "end_date": dt_end.strftime("%Y-%m-%d"),
        "timestamps": sorted_ts,
        "active_entities": active_entities,
        "available_bands": ["NR2300", "NR2600", "NR2100"],
        "carrier_bands": carrier_bands,
        "carriers": carrier_keys,
        "kpis": result_kpis,
        "execution_time_sec": round(t1 - t0, 3),
        "source": "OneDb Live (measDy5g & measBdbh5g)"
    }
