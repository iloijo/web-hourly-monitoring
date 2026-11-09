import logging
import re
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from collections import defaultdict
from .db import get_onedb_connection, get_latest_data_date
from .bands import lte_band
from .queries import get_clean_carrier_label
from .site_names import get_site_display_name, get_site_name

logger = logging.getLogger("timing_advance")

# 4G TA Distance Bins (Exact 15 bins matching LTE 16Ts steps & User Specification)
# Each bin sums both ZTE counter variants (Range 1-15 and Range 0to1..81to129)
TA_4G_BINS = [
    { "key": "b1", "col1": "Report Times of TA Value 1 (0-78m)", "col2": "Report Times of TA Value in the range of 0 to 1(times)", "label": "0-0.156" },
    { "key": "b2", "col1": "Report Times of TA Value 2 (78-234m)", "col2": "Report Times of TA Value in the range of 1 to 3(times)", "label": "0.156-0.312" },
    { "key": "b3", "col1": "Report Times of TA Value 3 (234-390m)", "col2": "Report Times of TA Value in the range of 3 to 5(times)", "label": "0.312-0.468" },
    { "key": "b4", "col1": "Report Times of TA Value 4 (390-546m)", "col2": "Report Times of TA Value in the range of 5 to 7(times)", "label": "0.468-0.624" },
    { "key": "b5", "col1": "Report Times of TA Value 5 (546-702m)", "col2": "Report Times of TA Value in the range of 7 to 9(times)", "label": "0.624-0.780" },
    { "key": "b6", "col1": "Report Times of TA Value 6 (702-858m)", "col2": "Report Times of TA Value in the range of 9 to 11(times)", "label": "0.780-0.936" },
    { "key": "b7", "col1": "Report Times of TA Value 7 (858-1014m)", "col2": "Report Times of TA Value in the range of 11 to 13(times)", "label": "0.936-1.092" },
    { "key": "b8", "col1": "Report Times of TA Value 8 (1014-1560m)", "col2": "Report Times of TA Value in the range of 13 to 20(times)", "label": "1.092-1.638" },
    { "key": "b9", "col1": "Report Times of TA Value 9 (1560-2106m)", "col2": "Report Times of TA Value in the range of 20 to 27(times)", "label": "1.638-2.184" },
    { "key": "b10", "col1": "Report Times of TA Value 10 (2106-2652m)", "col2": "Report Times of TA Value in the range of 27 to 34(times)", "label": "2.184-2.730" },
    { "key": "b11", "col1": "Report Times of TA Value 11 (2652-3198m)", "col2": "Report Times of TA Value in the range of 34 to 40(times)", "label": "2.730-3.196" },
    { "key": "b12", "col1": "Report Times of TA Value 12 (3198-4212m)", "col2": "Report Times of TA Value in the range of 40 to 50(times)", "label": "3.196-3.978" },
    { "key": "b13", "col1": "Report Times of TA Value 13 (4212-6708m)", "col2": "Report Times of TA Value in the range of 50 to 81(times)", "label": "3.978-6.396" },
    { "key": "b14", "col1": "Report Times of TA Value 14 (6708-10608m)", "col2": "Report Times of TA Value in the range of 81 to 129(times)", "label": "6.396-10.140" },
    { "key": "b15", "col1": "Report Times of TA Value 15 (> 10608m)", "col2": "TA > 10,140_km AMQ", "label": ">10.140" }
]

TA_4G_LABELS = [b["label"] for b in TA_4G_BINS]

# 5G TA Bins (Normal Distribution of TA values in MSG2 messages)
TA_5G_BINS = [
    { "key": "b1", "column": "Normal Distribution of TA values in MSG2 messages[0,1)", "label": "[0,1)" },
    { "key": "b2", "column": "Normal Distribution of TA values in MSG2 messages[1,3)", "label": "[1,3)" },
    { "key": "b3", "column": "Normal Distribution of TA values in MSG2 messages[3,5)", "label": "[3,5)" },
    { "key": "b4", "column": "Normal Distribution of TA values in MSG2 messages[5,7)", "label": "[5,7)" },
    { "key": "b5", "column": "Normal Distribution of TA values in MSG2 messages[7,9)", "label": "[7,9)" },
    { "key": "b6", "column": "Normal Distribution of TA values in MSG2 messages[9,11)", "label": "[9,11)" },
    { "key": "b7", "column": "Normal Distribution of TA values in MSG2 messages[11,13)", "label": "[11,13)" },
    { "key": "b8", "column": "Normal Distribution of TA values in MSG2 messages[13,20)", "label": "[13,20)" },
    { "key": "b9", "column": "Normal Distribution of TA values in MSG2 messages[20,27)", "label": "[20,27)" },
    { "key": "b10", "column": "Normal Distribution of TA values in MSG2 messages[27,34)", "label": "[27,34)" },
    { "key": "b11", "column": "Normal Distribution of TA values in MSG2 messages[34,40)", "label": "[34,40)" },
    { "key": "b12", "column": "Normal Distribution of TA values in MSG2 messages[40,50)", "label": "[40,50)" },
    { "key": "b13", "column": "Normal Distribution of TA values in MSG2 messages[50,81)", "label": "[50,81)" },
    { "key": "b14", "column": "Normal Distribution of TA values in MSG2 messages[81,129)", "label": "[81,129)" },
    { "key": "b15", "column": "Normal Distribution of TA values in MSG2 messages[129,179)", "label": "[129,179)" },
    { "key": "b16", "column": "Normal Distribution of TA values in MSG2 messages[179,256)", "label": "[179,256)" },
    { "key": "b17", "column": "Normal Distribution of TA values in MSG2 messages[256,384)", "label": "[256,384)" },
    { "key": "b18", "column": "Normal Distribution of TA values in MSG2 messages[384,512)", "label": "[384,512)" },
    { "key": "b19", "column": "Normal Distribution of TA values in MSG2 messages[512,640)", "label": "[512,640)" },
    { "key": "b20", "column": "Normal Distribution of TA values in MSG2 messages[640,769)", "label": "[640,769)" },
    { "key": "b21", "column": "Normal Distribution of TA values in MSG2 messages[769,897)", "label": "[769,897)" },
    { "key": "b22", "column": "Normal Distribution of TA values in MSG2 messages[897,1025)", "label": "[897,1025)" },
    { "key": "b23", "column": "Normal Distribution of TA values in MSG2 messages[1025,1153)", "label": "[1025,1153)" },
    { "key": "b24", "column": 'Normal Distribution of TA values in MSG2 messages[1153,+∞]', "label": ">1153" }
]

TA_5G_LABELS = [b["label"] for b in TA_5G_BINS]


def derive_band_4g(ci: Optional[float], cell_name: str = "") -> str:
    """LTE band for TA charts; L2600 carriers grouped (see bands.py)."""
    return lte_band(ci, cell_name, merge_l2600=True)


def derive_sector_and_type_4g(sec_new_type: Optional[str], ci: Optional[float], cell_name: str = "") -> tuple:
    """
    Returns (sector_str, type_str)
    e.g. ('1', 'macro'), ('2', 'indoor')
    """
    sector = "1"
    cell_type = "macro"

    if sec_new_type:
        parts = sec_new_type.split("_")
        if len(parts) >= 2 and parts[1].isdigit():
            sector = str(int(parts[1]))
        if len(parts) >= 3:
            raw_t = parts[2].upper()
            if "IND" in raw_t:
                cell_type = "indoor"
            elif "MAC" in raw_t:
                cell_type = "macro"
    else:
        # Fallback from ci: tens digit
        if ci is not None:
            try:
                sector = str(max(1, int(float(ci)) // 10))
            except (ValueError, TypeError):
                pass
        if "IND" in cell_name.upper():
            cell_type = "indoor"

    return sector, cell_type


def get_ta_4g_data(
    site_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    sector_filter: Optional[str] = None,
    band_filter: Optional[str] = None,
    cell_type: Optional[str] = "all"
) -> Dict[str, Any]:
    """
    Queries measTa4g in onedb for site_id across [start_date, end_date].
    Aggregates the 15 TA distance bins per sector and per band.
    Calculates cumulative percentages and distribution metrics.
    """
    site_clean = str(site_id).strip().upper()
    latest_dt = get_latest_data_date("onedb", "measTa4g")
    
    if not end_date:
        end_date = latest_dt.strftime("%Y-%m-%d")
    if not start_date:
        # default to 6 days window (e.g. start = end - 6 days)
        start_date = (datetime.strptime(end_date, "%Y-%m-%d") - timedelta(days=6)).strftime("%Y-%m-%d")

    conn = get_onedb_connection(timeout=10)
    if not conn:
        return {
            "status": "error",
            "message": "OneDb unreachable",
            "site_id": site_clean,
            "sectors": [],
            "bands": [],
            "bins": TA_4G_LABELS,
            "data_by_sector": {},
            "table_rows": []
        }

    try:
        cur = conn.cursor()

        # Build column selections for the 15 bins (summing col1 and col2)
        bin_cols = ", ".join([f'(COALESCE(t."{b["col1"]}", 0) + COALESCE(t."{b["col2"]}", 0))' for b in TA_4G_BINS])

        # Step 1: Query CellListRCI joined with measTa4g for site_id
        # Note: joining on eNodeBId = c.enodeb_id AND cellId = c.ci uses indexes
        query = f"""
            SELECT 
                t."Begin Time",
                c.site_id,
                c."sec new type",
                c.cell_name,
                c.ci,
                {bin_cols}
            FROM "CellListRCI" c
            JOIN "measTa4g" t ON t."eNodeBId" = c.enodeb_id AND t."cellId" = c.ci
            WHERE c.site_id = %s
              AND t."Begin Time" >= %s::date
              AND t."Begin Time" <= (%s::date + interval '1 day')
            ORDER BY t."Begin Time", c.ci;
        """
        cur.execute(query, (site_clean, start_date, end_date))
        rows = cur.fetchall()

        # Fallback if 0 rows: maybe measTa4g has eNodeB Name or Cell Name matching site_clean
        if not rows:
            query_fb = f"""
                SELECT 
                    t."Begin Time",
                    %s as site_id,
                    NULL as "sec new type",
                    t."E-UTRAN\xa0FDD\xa0Cell Name" as cell_name,
                    t."cellId" as ci,
                    {bin_cols}
                FROM "measTa4g" t
                WHERE t."eNodeB Name" ILIKE %s
                  AND t."Begin Time" >= %s::date
                  AND t."Begin Time" <= (%s::date + interval '1 day')
                ORDER BY t."Begin Time", t."cellId";
            """
            cur.execute(query_fb, (site_clean, f"%{site_clean}%", start_date, end_date))
            rows = cur.fetchall()

        cur.close()
    except Exception as e:
        logger.error(f"Error querying TA 4G for {site_clean}: {e}")
        conn.rollback()
        conn.close()
        return {
            "status": "error",
            "message": str(e),
            "site_id": site_clean,
            "sectors": [],
            "bands": [],
            "bins": TA_4G_LABELS,
            "data_by_sector": {},
            "table_rows": []
        }
    finally:
        conn.close()

    # Pass 1: Build collision-safe carrier labels per (sector, ci)
    distinct_cells = {}
    for r in rows:
        sec_new_type, cname, ci = r[2], (r[3] or "").strip(), r[4]
        sec_num, c_type = derive_sector_and_type_4g(sec_new_type, ci, cname)
        ci_val = int(float(ci)) if ci is not None else None
        if (sec_num, ci_val) not in distinct_cells:
            band = derive_band_4g(ci, cname)
            sec_int = int(sec_num) if str(sec_num).isdigit() else 1
            label = get_clean_carrier_label(cname, sec_int, band, ci_val)
            distinct_cells[(sec_num, ci_val)] = {
                "sec_num": sec_num,
                "ci": ci_val,
                "band": band,
                "cell_name": cname,
                "label": label,
                "c_type": c_type
            }

    # Disambiguate duplicate carrier labels within the same sector
    sec_label_counts = defaultdict(int)
    for (sec_num, _), d in distinct_cells.items():
        sec_label_counts[(sec_num, d["label"])] += 1

    cell_key_map = {}
    for (sec_num, ci_val), d in distinct_cells.items():
        lbl = d["label"]
        if sec_label_counts[(sec_num, lbl)] > 1 and ci_val is not None:
            lbl = f"{lbl}_{ci_val}"
        cell_key_map[(sec_num, ci_val)] = lbl

    # Data structures for aggregation
    # sector -> carrier_key -> [bin0_sum, bin1_sum, ... bin14_sum]
    sector_ci_counts: Dict[str, Dict[str, List[float]]] = defaultdict(lambda: defaultdict(lambda: [0.0] * 15))
    sector_ci_meta: Dict[str, Dict[str, Dict[str, Any]]] = defaultdict(dict)
    all_sectors_set = set()
    all_bands_set = set()
    table_rows = []

    type_filter_clean = (cell_type or "all").lower()
    sector_filter_clean = str(sector_filter).strip() if sector_filter and sector_filter.lower() != "all" else None
    band_filter_clean = str(band_filter).strip().upper() if band_filter and band_filter.lower() != "all" else None

    for row in rows:
        b_time, s_id, sec_new_type, cell_name, ci = row[0], row[1], row[2], (row[3] or "").strip(), row[4]
        bin_vals = [float(x or 0) for x in row[5:20]]

        sec_num, c_type = derive_sector_and_type_4g(sec_new_type, ci, cell_name)
        band = derive_band_4g(ci, cell_name)
        ci_val = int(float(ci)) if ci is not None else None

        # Apply Type Filter
        if type_filter_clean == "macro" and c_type != "macro":
            continue
        if type_filter_clean == "indoor" and c_type != "indoor":
            continue

        # Collect options for dropdowns
        all_sectors_set.add(sec_num)
        all_bands_set.add(band)

        # Apply Sector Filter
        if sector_filter_clean:
            # normalize "S1" or "1"
            clean_s = sector_filter_clean.replace("S", "").replace("s", "")
            if sec_num != clean_s:
                continue

        # Apply Band Filter
        if band_filter_clean and band.upper() != band_filter_clean:
            continue

        carrier_key = cell_key_map.get((sec_num, ci_val))
        if not carrier_key:
            sec_int = int(sec_num) if str(sec_num).isdigit() else 1
            carrier_key = get_clean_carrier_label(cell_name, sec_int, band, ci_val)

        # Add to sums
        counts_arr = sector_ci_counts[sec_num][carrier_key]
        for i in range(15):
            counts_arr[i] += bin_vals[i]

        sector_ci_meta[sec_num][carrier_key] = {
            "band": band,
            "ci": ci_val,
            "cell_name": cell_name
        }

        # Row for detailed table
        date_str = b_time.strftime("%Y-%m-%d") if isinstance(b_time, datetime) else str(b_time)[:10]
        row_dict = {
            "date": date_str,
            "site_id": site_clean,
            "cell_name": cell_name,
            "sector": f"S{sec_num}",
            "band": band,
            "type": c_type.capitalize(),
            "total_samples": sum(bin_vals)
        }
        for idx, b_info in enumerate(TA_4G_BINS):
            row_dict[b_info["label"]] = round(bin_vals[idx], 0)
        table_rows.append(row_dict)

    # Sort sectors numerically: 1, 2, 3...
    sorted_sectors = sorted(list(all_sectors_set), key=lambda x: int(x) if x.isdigit() else 999)
    # Sort bands logically: L700, L900, L1800, L2100, L2300_1, L2300_2, L2300_3, L2600
    band_order = { "L700": 1, "L900": 2, "L1800": 3, "L2100": 4, "L2300_1": 5, "L2300_2": 6, "L2300_3": 7, "L2600": 8 }
    sorted_bands = sorted(list(all_bands_set), key=lambda b: band_order.get(b, 99))

    # Build final data by sector: distribution counts & cumulative percentages
    data_by_sector = {}
    for sec in sorted(sector_ci_counts.keys(), key=lambda x: int(x) if x.isdigit() else 999):
        sec_dict = {}
        sorted_keys = sorted(
            sector_ci_counts[sec].keys(),
            key=lambda k: (
                band_order.get(sector_ci_meta[sec][k]["band"], 99),
                sector_ci_meta[sec][k]["ci"] if sector_ci_meta[sec][k]["ci"] is not None else 999
            )
        )
        for k in sorted_keys:
            counts = sector_ci_counts[sec][k]
            meta = sector_ci_meta[sec][k]
            tot = sum(counts)
            cum_pct = []
            cum_sum = 0.0
            for val in counts:
                cum_sum += val
                pct = round((cum_sum / tot) * 100.0, 2) if tot > 0 else 0.0
                cum_pct.append(pct)

            sec_dict[k] = {
                "site_id": site_clean,
                "counts": [round(c, 0) for c in counts],
                "cumulative": cum_pct,
                "total": round(tot, 0),
                "band": meta["band"],
                "ci": meta["ci"],
                "cell_name": meta["cell_name"]
            }
        data_by_sector[sec] = sec_dict

    site_display = get_site_display_name(site_clean)

    return {
        "status": "success",
        "site_id": site_clean,
        "site_name": site_display,
        "start_date": start_date,
        "end_date": end_date,
        "sectors": sorted_sectors,
        "bands": sorted_bands,
        "bins": TA_4G_LABELS,
        "data_by_sector": data_by_sector,
        "table_rows": table_rows
    }


def get_ta_5g_data(
    site_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    sector_filter: Optional[str] = None,
    band_filter: Optional[str] = None,
    cell_type: Optional[str] = "all"
) -> Dict[str, Any]:
    """
    Queries measTa5g in onedb for site_id across [start_date, end_date].
    Aggregates the 24 5G TA normal distribution bins per sector and band.
    """
    site_clean = str(site_id).strip().upper()
    latest_dt = get_latest_data_date("onedb", "measTa5g")
    
    if not end_date:
        end_date = latest_dt.strftime("%Y-%m-%d")
    if not start_date:
        start_date = (datetime.strptime(end_date, "%Y-%m-%d") - timedelta(days=6)).strftime("%Y-%m-%d")

    conn = get_onedb_connection(timeout=10)
    if not conn:
        return {
            "status": "error",
            "message": "OneDb unreachable",
            "site_id": site_clean,
            "sectors": [],
            "bands": [],
            "bins": TA_5G_LABELS,
            "data_by_sector": {},
            "table_rows": []
        }

    try:
        cur = conn.cursor()
        bin_cols = ", ".join([f'COALESCE(t."{b["column"]}", 0)' for b in TA_5G_BINS])

        query = f"""
            SELECT 
                t."Begin Time",
                t."NRPhysicalCellDU Name" as cell_name,
                t."Managed Element" as enodeb,
                {bin_cols}
            FROM "measTa5g" t
            WHERE (t."NRPhysicalCellDU Name" ILIKE %s OR t."Managed Element" ILIKE %s)
              AND t."Begin Time" >= %s::date
              AND t."Begin Time" <= (%s::date + interval '1 day')
            ORDER BY t."Begin Time";
        """
        cur.execute(query, (f"%{site_clean}%", f"%{site_clean}%", start_date, end_date))
        rows = cur.fetchall()
        cur.close()
    except Exception as e:
        logger.error(f"Error querying TA 5G for {site_clean}: {e}")
        conn.rollback()
        conn.close()
        return {
            "status": "error",
            "message": str(e),
            "site_id": site_clean,
            "sectors": [],
            "bands": [],
            "bins": TA_5G_LABELS,
            "data_by_sector": {},
            "table_rows": []
        }
    finally:
        conn.close()

    sector_band_counts: Dict[str, Dict[str, List[float]]] = defaultdict(lambda: defaultdict(lambda: [0.0] * 24))
    all_sectors_set = set()
    all_bands_set = set()
    table_rows = []

    type_filter_clean = (cell_type or "all").lower()
    sector_filter_clean = str(sector_filter).strip() if sector_filter and sector_filter.lower() != "all" else None
    band_filter_clean = str(band_filter).strip().upper() if band_filter and band_filter.lower() != "all" else None

    for row in rows:
        b_time, cell_name, me = row[0], row[1] or "", row[2] or ""
        bin_vals = [float(x or 0) for x in row[3:27]]

        # Determine sector and band from cell name (e.g. C_UPD364VP1_Kopertis-TBG_VP01)
        cn_upper = cell_name.upper()
        sec_num = "1"
        match_sec = re.search(r'([A-Z]+)(\d+)$', cn_upper)
        if match_sec:
            sec_num = str(int(match_sec.group(2)))

        band = "NR2300"
        if "VQ" in cn_upper or "2600" in cn_upper:
            band = "NR2600"
        elif "MK" in cn_upper or "2100" in cn_upper:
            band = "NR2100"
        elif "3500" in cn_upper:
            band = "NR3500"

        c_type = "indoor" if "IND" in cn_upper else "macro"

        if type_filter_clean == "macro" and c_type != "macro":
            continue
        if type_filter_clean == "indoor" and c_type != "indoor":
            continue

        all_sectors_set.add(sec_num)
        all_bands_set.add(band)

        if sector_filter_clean:
            clean_s = sector_filter_clean.replace("S", "").replace("s", "")
            if sec_num != clean_s:
                continue

        if band_filter_clean and band.upper() != band_filter_clean:
            continue

        counts_arr = sector_band_counts[sec_num][band]
        for i in range(24):
            counts_arr[i] += bin_vals[i]

        date_str = b_time.strftime("%Y-%m-%d") if isinstance(b_time, datetime) else str(b_time)[:10]
        row_dict = {
            "date": date_str,
            "site_id": site_clean,
            "cell_name": cell_name,
            "sector": f"S{sec_num}",
            "band": band,
            "type": c_type.capitalize(),
            "total_samples": sum(bin_vals)
        }
        for idx, b_info in enumerate(TA_5G_BINS):
            row_dict[b_info["label"]] = round(bin_vals[idx], 0)
        table_rows.append(row_dict)

    sorted_sectors = sorted(list(all_sectors_set), key=lambda x: int(x) if x.isdigit() else 999)
    sorted_bands = sorted(list(all_bands_set))

    data_by_sector = {}
    for sec in sorted(sector_band_counts.keys(), key=lambda x: int(x) if x.isdigit() else 999):
        sec_dict = {}
        for b, counts in sector_band_counts[sec].items():
            tot = sum(counts)
            cum_pct = []
            cum_sum = 0.0
            for val in counts:
                cum_sum += val
                pct = round((cum_sum / tot) * 100.0, 2) if tot > 0 else 0.0
                cum_pct.append(pct)

            sec_dict[b] = {
                "counts": [round(c, 0) for c in counts],
                "cumulative": cum_pct,
                "total": round(tot, 0)
            }
        data_by_sector[sec] = sec_dict

    site_display = get_site_display_name(site_clean)

    return {
        "status": "success",
        "site_id": site_clean,
        "site_name": site_display,
        "start_date": start_date,
        "end_date": end_date,
        "sectors": sorted_sectors,
        "bands": sorted_bands,
        "bins": TA_5G_LABELS,
        "data_by_sector": data_by_sector,
        "table_rows": table_rows
    }


def get_ta_compare_data(
    tech: str = "4g",
    site_id: str = "BUO028",
    before_start: Optional[str] = None,
    before_end: Optional[str] = None,
    after_start: Optional[str] = None,
    after_end: Optional[str] = None,
    sector_filter: Optional[str] = None,
    band_filter: Optional[str] = None,
    cell_type: Optional[str] = "all"
) -> Dict[str, Any]:
    """
    Compares Timing Advance distribution and cumulative % between Before and After date ranges.
    Calculates deltas per bin, total sample change, and % within 1km comparison.
    """
    fn = get_ta_4g_data if str(tech).lower() == "4g" else get_ta_5g_data
    before = fn(site_id, before_start, before_end, sector_filter, band_filter, cell_type)
    after = fn(site_id, after_start, after_end, sector_filter, band_filter, cell_type)

    if before.get("status") == "error":
        return before
    if after.get("status") == "error":
        return after

    all_sectors = sorted(list(set(before.get("sectors", []) + after.get("sectors", []))), key=lambda x: int(x) if x.isdigit() else 999)
    all_bands = sorted(list(set(before.get("bands", []) + after.get("bands", []))))
    bins = before.get("bins", [])

    data_by_sector = {}
    band_order = { "L700": 1, "L900": 2, "L1800": 3, "L2100": 4, "L2300_1": 5, "L2300_2": 6, "L2300_3": 7, "L2600": 8 }
    for sec in all_sectors:
        sec_dict = {}
        b_sec = before.get("data_by_sector", {}).get(sec, {})
        a_sec = after.get("data_by_sector", {}).get(sec, {})
        all_keys = list(set(list(b_sec.keys()) + list(a_sec.keys())))

        def key_sort_tuple(k):
            m = a_sec.get(k) or b_sec.get(k) or {}
            b = m.get("band", k)
            c = m.get("ci")
            return (band_order.get(b, 99), c if c is not None else 999)

        sec_keys = sorted(all_keys, key=key_sort_tuple)

        for key in sec_keys:
            meta_src = a_sec.get(key) or b_sec.get(key) or {}
            band_val = meta_src.get("band", key)
            ci_val = meta_src.get("ci")
            cname_val = meta_src.get("cell_name", "")

            b_counts = b_sec.get(key, {}).get("counts", [0.0] * len(bins))
            a_counts = a_sec.get(key, {}).get("counts", [0.0] * len(bins))
            b_cum = b_sec.get(key, {}).get("cumulative", [0.0] * len(bins))
            a_cum = a_sec.get(key, {}).get("cumulative", [0.0] * len(bins))
            b_tot = b_sec.get(key, {}).get("total", 0.0)
            a_tot = a_sec.get(key, {}).get("total", 0.0)

            delta_counts = [round(a - b, 0) for a, b in zip(a_counts, b_counts)]
            delta_cum = [round(a - b, 2) for a, b in zip(a_cum, b_cum)]

            k1_idx = 7 if len(bins) >= 7 else len(bins)
            pct_1k_before = b_cum[k1_idx - 1] if len(b_cum) >= k1_idx else 0.0
            pct_1k_after = a_cum[k1_idx - 1] if len(a_cum) >= k1_idx else 0.0

            sec_dict[key] = {
                "band": band_val,
                "ci": ci_val,
                "cell_name": cname_val,
                "before_counts": b_counts,
                "after_counts": a_counts,
                "delta_counts": delta_counts,
                "before_cumulative": b_cum,
                "after_cumulative": a_cum,
                "delta_cumulative": delta_cum,
                "before_total": b_tot,
                "after_total": a_tot,
                "delta_total": round(a_tot - b_tot, 0),
                "pct_1k_before": pct_1k_before,
                "pct_1k_after": pct_1k_after,
                "delta_1k": round(pct_1k_after - pct_1k_before, 2)
            }
        data_by_sector[sec] = sec_dict

    table_rows = []
    for r in before.get("table_rows", []):
        r_copy = dict(r)
        r_copy["period"] = "Before"
        table_rows.append(r_copy)
    for r in after.get("table_rows", []):
        r_copy = dict(r)
        r_copy["period"] = "After"
        table_rows.append(r_copy)

    return {
        "status": "success",
        "site_id": site_id.strip().upper(),
        "site_name": before.get("site_name", site_id),
        "tech": tech,
        "before_range": { "start": before.get("start_date"), "end": before.get("end_date") },
        "after_range": { "start": after.get("start_date"), "end": after.get("end_date") },
        "sectors": all_sectors,
        "bands": all_bands,
        "bins": bins,
        "data_by_sector": data_by_sector,
        "table_rows": table_rows
    }
