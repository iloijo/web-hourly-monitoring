import logging
import re
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from collections import defaultdict
from .db import get_onedb_connection, get_latest_data_date
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
    """Derives 4G LTE band from cell identifier or name suffix according to Band_LTE rule."""
    if ci is not None:
        try:
            last_digit = int(float(ci)) % 10
            if last_digit == 1:
                return "L1800"
            elif last_digit == 2:
                return "L900"
            elif last_digit == 3:
                return "L2100"
            elif last_digit == 4:
                return "L2300_1"
            elif last_digit == 5:
                return "L2300_2"
            elif last_digit == 6:
                return "L2300_3"
            elif last_digit == 7:
                return "L700"
            elif last_digit in (8, 9):
                return "L2600"
        except (ValueError, TypeError):
            pass

    cn = (cell_name or "").upper()
    if any(k in cn for k in ("ML", "SL", "QL", "IL")):
        return "L1800"
    if any(k in cn for k in ("MR", "VR", "QR", "IR")):
        return "L2100"
    if "MT" in cn:
        return "L900"
    if any(k in cn for k in ("ME", "VE", "QE")):
        return "L2300_1"
    if any(k in cn for k in ("MF", "VF", "QF")):
        return "L2300_2"
    if any(k in cn for k in ("VV", "QV")):
        return "L2300_3"
    if any(k in cn for k in ("MD", "VD")):
        return "L700"
    if any(k in cn for k in ("MG", "VG")):
        return "L2600"
    return "L1800"


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

    # Data structures for aggregation
    # sector -> band -> [bin0_sum, bin1_sum, ... bin14_sum]
    sector_band_counts: Dict[str, Dict[str, List[float]]] = defaultdict(lambda: defaultdict(lambda: [0.0] * 15))
    all_sectors_set = set()
    all_bands_set = set()
    table_rows = []

    type_filter_clean = (cell_type or "all").lower()
    sector_filter_clean = str(sector_filter).strip() if sector_filter and sector_filter.lower() != "all" else None
    band_filter_clean = str(band_filter).strip().upper() if band_filter and band_filter.lower() != "all" else None

    for row in rows:
        b_time, s_id, sec_new_type, cell_name, ci = row[0], row[1], row[2], row[3], row[4]
        bin_vals = [float(x or 0) for x in row[5:20]]

        sec_num, c_type = derive_sector_and_type_4g(sec_new_type, ci, cell_name)
        band = derive_band_4g(ci, cell_name)

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

        # Add to sums
        counts_arr = sector_band_counts[sec_num][band]
        for i in range(15):
            counts_arr[i] += bin_vals[i]

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
