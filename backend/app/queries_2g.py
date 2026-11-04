import time
import re
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from collections import defaultdict
from .db import get_onedb_connection
from .site_names import get_site_display_name, get_site_name

# =============================================================================
# 2G KPI Dictionary (measDy2g in OneDb)
# All chartable 2G GSM/GPRS/EDGE metrics grouped into intuitive categories
# =============================================================================
KPIS_2G_CONFIG = {
    # 1. Traffic & Payload
    "payload_total": {
        "title": "Total 2G Payload (GB)",
        "unit": "GB",
        "category": "Traffic & Payload",
        "has_tot": True,
        "is_avg": False,
        "min_y": 0,
        "max_y": None
    },
    "payload_gprs": {
        "title": "GPRS Payload (GB)",
        "unit": "GB",
        "category": "Traffic & Payload",
        "has_tot": True,
        "is_avg": False,
        "min_y": 0,
        "max_y": None
    },
    "payload_edge": {
        "title": "EDGE Payload (GB)",
        "unit": "GB",
        "category": "Traffic & Payload",
        "has_tot": True,
        "is_avg": False,
        "min_y": 0,
        "max_y": None
    },
    "tch_traffic": {
        "title": "TCH Traffic (Erlang)",
        "unit": "Erl",
        "category": "Traffic & Payload",
        "has_tot": True,
        "is_avg": False,
        "min_y": 0,
        "max_y": None
    },
    "sdcch_traffic": {
        "title": "SDCCH Traffic (Erlang)",
        "unit": "Erl",
        "category": "Traffic & Payload",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": None
    },
    "tch_hr_traffic": {
        "title": "TCH Half Rate Traffic (Erl)",
        "unit": "Erl",
        "category": "Traffic & Payload",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": None
    },
    "tch_fr_traffic": {
        "title": "TCH Full Rate Traffic (Erl)",
        "unit": "Erl",
        "category": "Traffic & Payload",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": None
    },

    # 2. Accessibility
    "availability": {
        "title": "TCH Availability (%)",
        "unit": "%",
        "category": "Accessibility",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": 100
    },
    "sdsr": {
        "title": "SDCCH Setup SR (%)",
        "unit": "%",
        "category": "Accessibility",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": 100
    },
    "sd_to_tch_sr": {
        "title": "SD to TCH Success Rate (%)",
        "unit": "%",
        "category": "Accessibility",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": 100
    },
    "tch_block_rate": {
        "title": "TCH Blocking Rate (%)",
        "unit": "%",
        "category": "Accessibility",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": None
    },
    "sdcch_block_rate": {
        "title": "SDCCH Blocking Rate (%)",
        "unit": "%",
        "category": "Accessibility",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": None
    },
    "tbf_dl_est_sr": {
        "title": "TBF DL Est SR (%)",
        "unit": "%",
        "category": "Accessibility",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": 100
    },
    "tbf_ul_est_sr": {
        "title": "TBF UL Est SR (%)",
        "unit": "%",
        "category": "Accessibility",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": 100
    },

    # 3. Retainability
    "tch_drop_rate": {
        "title": "TCH Drop Rate (%)",
        "unit": "%",
        "category": "Retainability",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": None
    },
    "tbf_comp_sr": {
        "title": "TBF Completion SR (%)",
        "unit": "%",
        "category": "Retainability",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": 100
    },

    # 4. Mobility
    "hosr": {
        "title": "Handover Success Rate (HOSR) (%)",
        "unit": "%",
        "category": "Mobility",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": 100
    },
    "fastreturn_lte": {
        "title": "Fast Return to LTE",
        "unit": "Events",
        "category": "Mobility",
        "has_tot": False,
        "is_avg": False,
        "min_y": 0,
        "max_y": None
    },
    "fastreturn_utran": {
        "title": "Fast Return to UTRAN",
        "unit": "Events",
        "category": "Mobility",
        "has_tot": False,
        "is_avg": False,
        "min_y": 0,
        "max_y": None
    },

    # 5. Throughput & Speed
    "edge_dl_thp": {
        "title": "EDGE DL Throughput (kbps)",
        "unit": "kbps",
        "category": "Throughput & Speed",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": None
    },
    "gprs_dl_thp": {
        "title": "GPRS DL Throughput (kbps)",
        "unit": "kbps",
        "category": "Throughput & Speed",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": None
    },

    # 6. Quality & Interference
    "dl_qual": {
        "title": "DL Qual 0-5 (%)",
        "unit": "%",
        "category": "Quality & Interference",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": 100
    },
    "ul_qual": {
        "title": "UL Qual 0-5 (%)",
        "unit": "%",
        "category": "Quality & Interference",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": 100
    },
    "icm_interference": {
        "title": "ICM Interference (%)",
        "unit": "%",
        "category": "Quality & Interference",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": 100
    },
    "dl_emi": {
        "title": "DL EMI",
        "unit": "",
        "category": "Quality & Interference",
        "has_tot": False,
        "is_avg": True,
        "min_y": None,
        "max_y": None
    },
    "ul_emi": {
        "title": "UL EMI",
        "unit": "",
        "category": "Quality & Interference",
        "has_tot": False,
        "is_avg": True,
        "min_y": None,
        "max_y": None
    },

    # 7. Equipment & Capacity
    "trx_count": {
        "title": "Number of TRX",
        "unit": "TRX",
        "category": "Equipment & Capacity",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": None
    },
    "tch_count": {
        "title": "Number of TCH Channels",
        "unit": "Channels",
        "category": "Equipment & Capacity",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": None
    },
    "sdcch_count": {
        "title": "Number of SDCCH Channels",
        "unit": "Channels",
        "category": "Equipment & Capacity",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": None
    },
    "pdtch_dynamic": {
        "title": "Dynamic PDTCH",
        "unit": "Channels",
        "category": "Equipment & Capacity",
        "has_tot": False,
        "is_avg": True,
        "min_y": 0,
        "max_y": None
    }
}

CACHED_2G_SITES: Optional[List[str]] = None

def get_2g_sites() -> List[str]:
    """Returns all unique 2G site IDs from CellList2G in OneDb."""
    global CACHED_2G_SITES
    if CACHED_2G_SITES:
        return CACHED_2G_SITES

    conn = get_onedb_connection(timeout=8)
    if not conn:
        return ["MRW002", "UPD012", "UPD183", "COI350", "UPD919", "TMH018"]

    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT DISTINCT "Site ID" 
            FROM "CellList2G" 
            WHERE "Site ID" IS NOT NULL AND "Site ID" != '' 
            ORDER BY "Site ID";
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        CACHED_2G_SITES = [r[0].strip().upper() for r in rows if r[0]]
        return CACHED_2G_SITES
    except Exception as e:
        return ["MRW002", "UPD012", "UPD183", "COI350", "UPD919", "TMH018"]


def parse_2g_cell(cell_name: str):
    """
    Parses sector, carrier, band, and type from 2G cell name e.g.:
    E_MRW002MD1_Bungku_MD01 -> sector: 1, carrier: 'MD1', band: 'GSM', type: 'Macro'
    E_MRW002MG1_Bungku_MG02 -> sector: 2, carrier: 'MG1', band: 'DCS', type: 'Macro'
    """
    c_upper = cell_name.strip().upper()

    # Determine type (Indoor vs Macro)
    is_indoor = "_IND" in c_upper or "INB" in c_upper or "RRU" in c_upper
    cell_type = "Indoor" if is_indoor else "Macro"

    # Determine band:
    # MD = GSM (900 MHz), MG = DCS (1800 MHz)
    band = "GSM"
    if "MG" in c_upper or "DCS" in c_upper or "1800" in c_upper:
        band = "DCS"
    elif "MD" in c_upper or "900" in c_upper:
        band = "GSM"

    # Determine sector and carrier
    parts = c_upper.split('_')
    last_part = parts[-1] if len(parts) > 1 else ""

    sector = 1
    carrier = "MD1" if band == "GSM" else "MG1"

    match_suffix = re.search(r'([A-Z]+)(\d+)$', last_part)
    if match_suffix:
        c_code = match_suffix.group(1)
        sec_num = int(match_suffix.group(2))
        sector = sec_num
        carrier = f"{c_code}1" if not c_code.endswith('1') else c_code
    else:
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


def get_site_payload_2g_data(
    site_id: str = "MRW002",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    sector_filter: Optional[str] = None,
    band_filter: Optional[str] = None,
    cell_type: Optional[str] = "macro",
    days_back: int = 14
) -> Dict[str, Any]:
    """
    Queries real 2G Daily Multi-KPI from OneDb (measDy2g).
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

    # Query measDy2g
    cur.execute("""
        SELECT 
            "Begin Time" as begin_time,
            "BTS Name" as cell_name,
            -- KPIs
            ROUND((("GPRS Payload (Mbyte)_ono" + "EDGE Payload (Mbyte)_ono") / 1024.0)::numeric, 3) as payload_total,
            ROUND(("GPRS Payload (Mbyte)_ono" / 1024.0)::numeric, 3) as payload_gprs,
            ROUND(("EDGE Payload (Mbyte)_ono" / 1024.0)::numeric, 3) as payload_edge,
            ROUND("TCH Traffic (Erl)_ono"::numeric, 2) as tch_traffic,
            ROUND("SDCCH Traffic (Erl)_ono"::numeric, 2) as sdcch_traffic,
            ROUND("TCH HR Traffic (Erl)_ono"::numeric, 2) as tch_hr_traffic,
            ROUND("TCH FR Traffic (Erl)_ono"::numeric, 2) as tch_fr_traffic,
            ROUND(("TCH Availability (%%)_Ono" * 100)::numeric, 2) as availability,
            ROUND(("SDSR (%%)_ono" * 100)::numeric, 2) as sdsr,
            ROUND(("TCH Blocking Rate (%%)_ono" * 100)::numeric, 2) as tch_block_rate,
            ROUND(("SDCCH Blocking Rate (%%)_ono" * 100)::numeric, 2) as sdcch_block_rate,
            ROUND(("SD to TCH Success Rate (%%)" * 100)::numeric, 2) as sd_to_tch_sr,
            ROUND(("TBF_DL Est_SR (%%)_ono" * 100)::numeric, 2) as tbf_dl_est_sr,
            ROUND(("TBF_UL Est_SR (%%)_ono" * 100)::numeric, 2) as tbf_ul_est_sr,
            ROUND(("TCH Drop Rate (%%)_ono" * 100)::numeric, 4) as tch_drop_rate,
            ROUND(("TBF Completion_SR (%%)_ono" * 100)::numeric, 2) as tbf_comp_sr,
            ROUND(("HOSR (%%)_ono" * 100)::numeric, 2) as hosr,
            ROUND("Number of fastreturn to LTE"::numeric, 0) as fastreturn_lte,
            ROUND("Number of fastreturn to UTRAN"::numeric, 0) as fastreturn_utran,
            ROUND("EDGE DL_Throughput (kbps)_ono"::numeric, 2) as edge_dl_thp,
            ROUND("GPRS DL_Throughput (kbps)_ono"::numeric, 2) as gprs_dl_thp,
            ROUND(("DL Qual 0-5 (%%)_Ono" * 100)::numeric, 2) as dl_qual,
            ROUND(("UL Qual 0-5 (%%)_Ono" * 100)::numeric, 2) as ul_qual,
            ROUND(("ICM_INTERFERENCE (%%)_Ono" * 100)::numeric, 2) as icm_interference,
            ROUND("DL_EMI_Ono"::numeric, 2) as dl_emi,
            ROUND("UL_EMI_Ono"::numeric, 2) as ul_emi,
            ROUND("Number of TRX"::numeric, 0) as trx_count,
            ROUND("Number of TCH"::numeric, 0) as tch_count,
            ROUND("Number of SDCCH"::numeric, 0) as sdcch_count,
            ROUND("Number of dynamic PDTCH"::numeric, 0) as pdtch_dynamic
        FROM "measDy2g"
        WHERE "Begin Time" >= %s AND "Begin Time" <= %s
          AND ("SITE Name" LIKE %s OR "BTS Name" LIKE %s)
        ORDER BY "Begin Time", "BTS Name";
    """, (start_str, end_str, f"%{site_clean}%", f"%{site_clean}%"))

    meas_rows = cur.fetchall()
    col_names = [d[0] for d in cur.description]
    cur.close()
    conn.close()

    # Organize data by sector, carrier, and date
    found_sectors = set()
    found_bands = set()
    found_types = set()
    cell_meta_cache = {}

    data_tree = defaultdict(lambda: defaultdict(lambda: defaultdict(dict)))
    carrier_bands_map = {}

    active_type_filter = cell_type.strip().lower() if cell_type else "all"

    for r_tuple in meas_rows:
        row = dict(zip(col_names, r_tuple))
        cname = row['cell_name']
        if not cname:
            continue
        if cname not in cell_meta_cache:
            cell_meta_cache[cname] = parse_2g_cell(cname)

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

        for k_id in KPIS_2G_CONFIG.keys():
            val = row.get(k_id)
            if val is not None:
                try:
                    data_tree[sec][k_id][carrier][d_str] = float(val)
                except (ValueError, TypeError):
                    pass

    # Fallback to all types if no sectors found with filter
    if not found_sectors and meas_rows:
        for r_tuple in meas_rows:
            row = dict(zip(col_names, r_tuple))
            cname = row['cell_name']
            if not cname:
                continue
            if cname not in cell_meta_cache:
                cell_meta_cache[cname] = parse_2g_cell(cname)
            meta = cell_meta_cache[cname]
            sec = meta['sector']
            carrier = meta['carrier']
            band = meta['band']
            found_sectors.add(sec)
            found_bands.add(band)
            carrier_bands_map[carrier] = band
            d_str = row['begin_time'].strftime("%Y-%m-%d")
            for k_id in KPIS_2G_CONFIG.keys():
                val = row.get(k_id)
                if val is not None:
                    try:
                        data_tree[sec][k_id][carrier][d_str] = float(val)
                    except (ValueError, TypeError):
                        pass

    sorted_sectors = sorted(list(found_sectors)) if found_sectors else [1, 2, 3]
    sectors_output = {}

    for sec in sorted_sectors:
        sector_kpis = {}
        for k_id, cfg in KPIS_2G_CONFIG.items():
            carriers_data = data_tree[sec][k_id]
            series_by_carrier = {}

            for c_name, date_vals in carriers_data.items():
                arr = [date_vals.get(d, None) for d in sorted_ts]
                series_by_carrier[c_name] = arr

            total_arr = None
            if cfg.get("has_tot", False) and series_by_carrier:
                total_arr = []
                for idx in range(len(sorted_ts)):
                    valid_vals = [
                        s[idx] for s in series_by_carrier.values() 
                        if s[idx] is not None
                    ]
                    if valid_vals:
                        total_arr.append(round(sum(valid_vals), 3))
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
                "carrier_bands": {c: carrier_bands_map.get(c, "GSM") for c in series_by_carrier.keys()}
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
        "tech": "2G",
        "timestamps": sorted_ts,
        "available_sectors": sorted_sectors,
        "available_bands": sorted(list(found_bands)) if found_bands else ["GSM", "DCS"],
        "available_types": sorted(list(found_types)) if found_types else ["Macro"],
        "sectors": sectors_output,
        "query_duration_sec": round(time.time() - t0, 3)
    }


def get_scope_aggregation_2g_data(
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
    Kecamatan, or Site levels for 2G (measDy2g) in OneDb.
    Supports Full Aggregation (entity curves) and Mode Band (GSM, DCS curves).
    """
    t0 = time.time()
    conn = get_onedb_connection(timeout=15)
    if not conn:
        raise RuntimeError("OneDb is not reachable for 2G scope aggregation.")

    cur = conn.cursor()

    max_known_db_date = datetime(2026, 11, 3)
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
    kec_join = ""
    where_entity = ""
    params: List[Any] = [start_str, end_str]

    if mode_clean == "band":
        # Mode Band: only 1 entity is selected, and curves are the bands: GSM, DCS
        carrier_keys = ["GSM", "DCS"]
        if bands and len(bands) > 0 and len(bands) < len(carrier_keys):
            carrier_keys = [b for b in bands if b in carrier_keys]
        carrier_bands = {b: b for b in carrier_keys}
        series_key_sql = "CASE WHEN m.\"BTS Name\" LIKE '%%MG%%' THEN 'DCS' ELSE 'GSM' END"

        if scope_clean == "regional":
            active_entities = ["Region Sulawesi"]
        elif scope_clean == "nop":
            ent = nops[0] if (nops and len(nops) > 0) else "MAKASSAR"
            active_entities = [ent]
            where_entity = "AND c.\"NOP\" = %s"
            params.append(ent)
        elif scope_clean == "city":
            ent = cities[0] if (cities and len(cities) > 0) else "KOTA MAKASSAR"
            active_entities = [ent]
            where_entity = "AND c.\"KABUPATEN\" = %s"
            params.append(ent)
        elif scope_clean == "kecamatan":
            ent = kecamatans[0] if (kecamatans and len(kecamatans) > 0) else "TAMALATE"
            active_entities = [ent]
            kec_join = "LEFT JOIN \"CellListRCI\" r ON c.\"Site ID\" = r.site_id"
            where_entity = "AND r.kecamatan = %s"
            params.append(ent)
        elif scope_clean == "site":
            ent = sites[0].strip().upper() if (sites and len(sites) > 0) else "COI350"
            active_entities = [ent]
            where_entity = "AND c.\"Site ID\" = %s"
            params.append(ent)

    else:
        # Mode Full: curves are entities (Regional, NOPs, Cities, Kecamatans, Sites)
        if scope_clean == "regional":
            active_entities = ["Region Sulawesi"]
            series_key_sql = "'Region Sulawesi'"
        elif scope_clean == "nop":
            active_entities = nops if (nops and len(nops) > 0) else ["MAKASSAR", "MANADO", "BONE"]
            series_key_sql = "c.\"NOP\""
            where_entity = "AND c.\"NOP\" = ANY(%s)"
            params.append(active_entities)
        elif scope_clean == "city":
            active_entities = cities if (cities and len(cities) > 0) else ["KOTA MAKASSAR", "MINAHASA"]
            series_key_sql = "c.\"KABUPATEN\""
            where_entity = "AND c.\"KABUPATEN\" = ANY(%s)"
            params.append(active_entities)
        elif scope_clean == "kecamatan":
            active_entities = kecamatans if (kecamatans and len(kecamatans) > 0) else ["TAMALATE"]
            kec_join = "LEFT JOIN \"CellListRCI\" r ON c.\"Site ID\" = r.site_id"
            series_key_sql = "COALESCE(r.kecamatan, 'OTHER')"
            where_entity = "AND r.kecamatan = ANY(%s)"
            params.append(active_entities)
        elif scope_clean == "site":
            active_entities = [s.strip().upper() for s in sites] if (sites and len(sites) > 0) else ["COI350", "TMH018"]
            series_key_sql = "c.\"Site ID\""
            where_entity = "AND c.\"Site ID\" = ANY(%s)"
            params.append(active_entities)

        carrier_keys = active_entities
        carrier_bands = {e: "ENTITY" for e in carrier_keys}

    # Optional band filtering in full mode
    where_band = ""
    if mode_clean == "full" and bands and len(bands) == 1:
        if bands[0] == "DCS":
            where_band = "AND m.\"BTS Name\" LIKE '%%MG%%'"
        elif bands[0] == "GSM":
            where_band = "AND m.\"BTS Name\" NOT LIKE '%%MG%%'"

    sql = f"""
        SELECT 
            m."Begin Time"::date as dt,
            {series_key_sql} as series_key,
            -- 1. Traffic & Payload
            ROUND((SUM(m."GPRS Payload (Mbyte)_ono" + m."EDGE Payload (Mbyte)_ono") / 1024.0)::numeric, 3) as payload_total,
            ROUND((SUM(m."GPRS Payload (Mbyte)_ono") / 1024.0)::numeric, 3) as payload_gprs,
            ROUND((SUM(m."EDGE Payload (Mbyte)_ono") / 1024.0)::numeric, 3) as payload_edge,
            ROUND(SUM(m."TCH Traffic (Erl)_ono")::numeric, 2) as tch_traffic,
            ROUND(AVG(m."SDCCH Traffic (Erl)_ono")::numeric, 2) as sdcch_traffic,
            ROUND(AVG(m."TCH HR Traffic (Erl)_ono")::numeric, 2) as tch_hr_traffic,
            ROUND(AVG(m."TCH FR Traffic (Erl)_ono")::numeric, 2) as tch_fr_traffic,
            -- 2. Accessibility
            ROUND(AVG(m."TCH Availability (%%)_Ono" * 100)::numeric, 2) as availability,
            ROUND(AVG(m."SDSR (%%)_ono" * 100)::numeric, 2) as sdsr,
            ROUND(AVG(m."SD to TCH Success Rate (%%)" * 100)::numeric, 2) as sd_to_tch_sr,
            ROUND(AVG(m."TCH Blocking Rate (%%)_ono" * 100)::numeric, 2) as tch_block_rate,
            ROUND(AVG(m."SDCCH Blocking Rate (%%)_ono" * 100)::numeric, 2) as sdcch_block_rate,
            ROUND(AVG(m."TBF_DL Est_SR (%%)_ono" * 100)::numeric, 2) as tbf_dl_est_sr,
            ROUND(AVG(m."TBF_UL Est_SR (%%)_ono" * 100)::numeric, 2) as tbf_ul_est_sr,
            -- 3. Retainability
            ROUND(AVG(m."TCH Drop Rate (%%)_ono" * 100)::numeric, 4) as tch_drop_rate,
            ROUND(AVG(m."TBF Completion_SR (%%)_ono" * 100)::numeric, 2) as tbf_comp_sr,
            -- 4. Mobility
            ROUND(AVG(m."HOSR (%%)_ono" * 100)::numeric, 2) as hosr,
            ROUND(SUM(m."Number of fastreturn to LTE")::numeric, 0) as fastreturn_lte,
            ROUND(SUM(m."Number of fastreturn to UTRAN")::numeric, 0) as fastreturn_utran,
            -- 5. Throughput
            ROUND(AVG(m."EDGE DL_Throughput (kbps)_ono")::numeric, 2) as edge_dl_thp,
            ROUND(AVG(m."GPRS DL_Throughput (kbps)_ono")::numeric, 2) as gprs_dl_thp,
            -- 6. Quality & Interference
            ROUND(AVG(m."DL Qual 0-5 (%%)_Ono" * 100)::numeric, 2) as dl_qual,
            ROUND(AVG(m."UL Qual 0-5 (%%)_Ono" * 100)::numeric, 2) as ul_qual,
            ROUND(AVG(m."ICM_INTERFERENCE (%%)_Ono" * 100)::numeric, 2) as icm_interference,
            ROUND(AVG(m."DL_EMI_Ono")::numeric, 2) as dl_emi,
            ROUND(AVG(m."UL_EMI_Ono")::numeric, 2) as ul_emi,
            -- 7. Capacity
            ROUND(AVG(m."Number of TRX")::numeric, 0) as trx_count,
            ROUND(AVG(m."Number of TCH")::numeric, 0) as tch_count,
            ROUND(AVG(m."Number of SDCCH")::numeric, 0) as sdcch_count,
            ROUND(AVG(m."Number of dynamic PDTCH")::numeric, 0) as pdtch_dynamic
        FROM "measDy2g" m
        JOIN "CellList2G" c ON m."SITE Name" = c."SITE Name"
        {kec_join}
        WHERE m."Begin Time" >= %s AND m."Begin Time" <= %s
        {where_entity}
        {where_band}
        GROUP BY dt, series_key
        ORDER BY dt, series_key;
    """

    cur.execute(sql, tuple(params))
    rows = cur.fetchall()
    col_names = [d[0] for d in cur.description]
    cur.close()
    conn.close()

    # Organize data into data_map[kpi_id][entity_key][date_str] = float
    data_map = defaultdict(lambda: defaultdict(dict))

    for r_tuple in rows:
        row = dict(zip(col_names, r_tuple))
        d_str = row['dt'].strftime("%Y-%m-%d") if hasattr(row['dt'], 'strftime') else str(row['dt'])
        series_k = str(row['series_key']).strip() if row.get('series_key') is not None else "Other"

        for k_id in KPIS_2G_CONFIG.keys():
            val = row.get(k_id)
            if val is not None:
                try:
                    data_map[k_id][series_k][d_str] = float(val)
                except (ValueError, TypeError):
                    pass

    # Construct result kpis dictionary
    result_kpis = {}
    for k_id, cfg in KPIS_2G_CONFIG.items():
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
        "tech": "2G",
        "start_date": dt_start.strftime("%Y-%m-%d"),
        "end_date": dt_end.strftime("%Y-%m-%d"),
        "timestamps": sorted_ts,
        "active_entities": active_entities,
        "available_bands": ["GSM", "DCS"],
        "carrier_bands": carrier_bands,
        "carriers": carrier_keys,
        "kpis": result_kpis,
        "execution_time_sec": round(t1 - t0, 3),
        "source": "OneDb Live (measDy2g)"
    }
