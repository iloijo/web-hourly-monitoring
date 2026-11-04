import psycopg2
import psycopg2.extras
import time
import re
from collections import defaultdict
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from .db import get_twodb_connection
from .site_names import get_site_display_name, get_site_name

def get_band_from_ci(ci, cell_name: str = "") -> str:
    """
    Standard LTE Band derivation compliant with Band_LTE and ConnectMeasHourly skills:
    ci / cellId last digit:
      1 -> L1800
      2 -> L900
      3 -> L2100
      4 -> L2300_1
      5 -> L2300_2
      6 -> L2300_3
      7 -> L700
      8 -> L2600_1 (or L2600_3 if len > 2)
      9 -> L2600_2 (or L2600_4 if len > 2)
    """
    try:
        if ci is not None:
            ci_int = int(ci)
            ci_str = str(ci_int)
            last_digit = ci_str[-1]
            if len(ci_str) > 2 and last_digit == '8':
                return 'L2600_3'
            if len(ci_str) > 2 and last_digit == '9':
                return 'L2600_4'
            mapping = {
                '1': 'L1800',
                '2': 'L900',
                '3': 'L2100',
                '4': 'L2300_1',
                '5': 'L2300_2',
                '6': 'L2300_3',
                '7': 'L700',
                '8': 'L2600_1',
                '9': 'L2600_2',
            }
            if last_digit in mapping:
                return mapping[last_digit]
    except Exception:
        pass

    upper = cell_name.upper()
    if 'SL' in upper or 'ML' in upper or 'QL' in upper or 'IL' in upper: return 'L1800'
    if 'MR' in upper or 'VR' in upper or 'QR' in upper or 'IR' in upper: return 'L2100'
    if 'MT' in upper: return 'L900'
    if 'ME' in upper or 'VE' in upper or 'QE' in upper or 'IE' in upper: return 'L2300_1'
    if 'MF' in upper or 'VF' in upper or 'QF' in upper or 'IF' in upper: return 'L2300_2'
    if 'VV' in upper or 'QV' in upper: return 'L2300_3'
    if 'MD' in upper or 'VD' in upper: return 'L700'
    if 'MG' in upper or 'VG' in upper: return 'L2600'
    return 'L1800'

def normalize_cell_key(name: str) -> str:
    n = name.strip()
    if (n.startswith("E_") or n.startswith("C_")) and len(n) > 2:
        n = n[2:]
    return re.sub(r'[^A-Z0-9]', '', n.upper())

def get_clean_carrier_label(cell_name: str, sector: int, band: str) -> str:
    parts = re.split(r'[-_]', cell_name.strip())
    suffix = parts[-1].upper() if parts else ""
    m = re.match(r'^([A-Z]{2})\d*(\d)$', suffix)
    if m:
        code = m.group(1)
        return f"{code}{sector}"
    m2 = re.search(r'([A-Z]{2})\d', cell_name)
    if m2:
        return f"{m2.group(1)}{sector}"
    return f"{band}_{sector}"

def get_site_payload_data(
    site_id: str = "MRW002",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    time_mode: str = "hourly",
    sector_filter: Optional[str] = None,
    band_filter: Optional[str] = None,
    cell_type: Optional[str] = "macro",
    days_back: int = 6
) -> Dict[str, Any]:
    """
    Queries real 4G Multi-KPI from measHy4g in TwoDb.
    Sector grouping and cell references are derived strictly from CellListRCI!
    Default end_date is today - 1.
    """
    t0 = time.time()
    conn = get_twodb_connection(timeout=12)
    if not conn:
        raise RuntimeError("TwoDb is not reachable. Check LAN IP 192.168.1.231:5432 or Tunnel 127.0.0.1:5434.")

    site_clean = site_id.strip().upper()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # 1. Query CellListRCI for this site to get topology, sectors, types, and eNodeBs
    cur.execute("""
        SELECT cell_name, enodeb_name, "sec new type", site_id_sector_id, ci
        FROM "CellListRCI"
        WHERE site_id = %s;
    """, (site_clean,))
    cell_rows = cur.fetchall()

    cell_map = {}
    enodebs = set()
    found_sectors = set()
    found_bands = set()
    found_types = set()

    # Pre-scan types
    for r in cell_rows:
        sec_type = (r['sec new type'] or "").upper()
        if "_IND" in sec_type:
            found_types.add("Indoor")
        else:
            found_types.add("Macro")

    # If user filters by cell_type (macro/indoor)
    active_type_filter = cell_type.strip().lower() if cell_type else "all"

    for r in cell_rows:
        cname = r['cell_name'].strip()
        enb = r['enodeb_name'].strip() if r['enodeb_name'] else None
        if enb:
            enodebs.add(enb)

        sec_type = r['sec new type'] or ""
        is_indoor = "_IND" in sec_type.upper()
        row_type = "Indoor" if is_indoor else "Macro"

        # Apply cell_type filter if not "all"
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
        cell_map[cname.upper()] = meta
        cell_map[normalize_cell_key(cname)] = meta
        if (cname.startswith("E_") or cname.startswith("C_")) and len(cname) > 2:
            cell_map[cname[2:].upper()] = meta
            cell_map[normalize_cell_key(cname[2:])] = meta

    # Fallback if filter resulted in 0 cells
    if not cell_map and cell_rows:
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
            cell_map[cname.upper()] = meta
            cell_map[normalize_cell_key(cname)] = meta

    if not enodebs:
        enodebs.add(f"E_{site_clean}M41")

    # 2. Date ranges: Default end_date is today - 1 per Gambar 3 instruction
    # If today is past the known latest data in TwoDb (2026-10-27), cap default to 2026-10-27
    now = datetime.now()
    yesterday = now - timedelta(days=1)
    max_known_db_date = datetime(2026, 10, 27)
    
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
    end_str = dt_end.strftime("%Y-%m-%d 23:00:00")

    # Generate complete list of expected timestamps between start_date and end_date
    expected_ts = []
    cur_t = dt_start
    while cur_t <= dt_end:
        if time_mode == "daily":
            expected_ts.append(cur_t.strftime("%Y-%m-%d"))
        else:
            for h in range(24):
                expected_ts.append(f"{cur_t.strftime('%Y-%m-%d')} {h:02d}:00")
        cur_t += timedelta(days=1)
    sorted_ts = sorted(list(set(expected_ts)))

    # 3. Query all radio KPIs from measHy4g for all eNodeBs
    all_meas_rows = []
    for enb in sorted(list(enodebs)):
        sql = """
            SELECT 
                t.ts AS begin_time,
                m."Cell Name",
                ROUND((m."4G Payload (MByte) AMQ" / 1024.0)::numeric, 2) AS payload_gb,
                m."Maximum Number of RRC Connection User" AS max_rrc_user,
                ROUND((m."Cell Availability Num 4G AMQ" / NULLIF(m."Cell Availability Denum 4G AMQ", 0) * 100)::numeric, 2) AS availability_pct,
                ROUND((m."DL PRB Utilization Num AMQ" / NULLIF(m."DL PRB Utilization Denum AMQ", 0) * 100)::numeric, 2) AS dl_prb_pct,
                ROUND((m."UL PRB Utilization Num AMQ" / NULLIF(m."UL PRB Utilization Denum AMQ", 0) * 100)::numeric, 2) AS ul_prb_pct,
                ROUND((m."User DL Throughput Num AMQ" / NULLIF(m."User DL Throughput Denum AMQ", 0) / 1000.0)::numeric, 2) AS user_dl_thp_mbps,
                ROUND((m."User UL Throughput Num AMQ" / NULLIF(m."User UL Throughput Denum AMQ", 0) / 1000.0)::numeric, 2) AS user_ul_thp_mbps,
                ROUND(m."CQI Average AMQ"::numeric, 2) AS cqi,
                ROUND((m."Num RRC Setup SR AMQ" / NULLIF(m."Denum RRC Setup SR AMQ", 0) * 100)::numeric, 2) AS rrc_setup_sr,
                ROUND((m."Num E-RAB Setup SR AMQ" / NULLIF(m."Denum E-RAB Setup SR AMQ", 0) * 100)::numeric, 2) AS erab_setup_sr,
                ROUND((m."Num CSSR AMQ" / NULLIF(m."Denum CSSR AMQ", 0) * 100)::numeric, 2) AS cssr,
                ROUND((m."Num E-RAB Drop AMQ" / NULLIF(m."Denum E-RAB Drop AMQ", 0) * 100)::numeric, 2) AS erab_drop_rate,
                ROUND((m."Num Service Drop Rate AMQ" / NULLIF(m."Denum Service Drop Rate AMQ", 0) * 100)::numeric, 2) AS service_drop_rate,
                ROUND((m."Num IFHO SR AMQ" / NULLIF(m."Denum IFHO SR AMQ", 0) * 100)::numeric, 2) AS ifho_sr,
                ROUND((m."Inter Freq LTE HO Num AMQ" / NULLIF(m."Inter Freq LTE HO Denum AMQ", 0) * 100)::numeric, 2) AS inter_freq_ho_sr,
                ROUND(m."Average NI of Carrier(dBm)"::numeric, 2) AS avg_ni_dbm,
                m."New Active Users rnp_Ono" AS active_users,
                ROUND((m."spectrum efficiency num" / NULLIF(m."spectrum efficiency denum", 0))::numeric, 2) AS spectrum_efficiency
            FROM generate_series(%s::timestamp, %s::timestamp, '1 hour'::interval) AS t(ts)
            CROSS JOIN LATERAL (
                SELECT 
                    "Cell Name",
                    "4G Payload (MByte) AMQ",
                    "Maximum Number of RRC Connection User",
                    "Cell Availability Num 4G AMQ",
                    "Cell Availability Denum 4G AMQ",
                    "DL PRB Utilization Num AMQ",
                    "DL PRB Utilization Denum AMQ",
                    "UL PRB Utilization Num AMQ",
                    "UL PRB Utilization Denum AMQ",
                    "User DL Throughput Num AMQ",
                    "User DL Throughput Denum AMQ",
                    "User UL Throughput Num AMQ",
                    "User UL Throughput Denum AMQ",
                    "CQI Average AMQ",
                    "Num RRC Setup SR AMQ",
                    "Denum RRC Setup SR AMQ",
                    "Num E-RAB Setup SR AMQ",
                    "Denum E-RAB Setup SR AMQ",
                    "Num CSSR AMQ",
                    "Denum CSSR AMQ",
                    "Num E-RAB Drop AMQ",
                    "Denum E-RAB Drop AMQ",
                    "Num Service Drop Rate AMQ",
                    "Denum Service Drop Rate AMQ",
                    "Num IFHO SR AMQ",
                    "Denum IFHO SR AMQ",
                    "Inter Freq LTE HO Num AMQ",
                    "Inter Freq LTE HO Denum AMQ",
                    "Average NI of Carrier(dBm)",
                    "New Active Users rnp_Ono",
                    "spectrum efficiency num",
                    "spectrum efficiency denum"
                FROM "measHy4g"
                WHERE "Begin Time" = t.ts
                  AND "eNodeB Name" = %s
            ) m
            ORDER BY t.ts, m."Cell Name";
        """
        cur.execute(sql, (start_str, end_str, enb))
        rows = cur.fetchall()
        all_meas_rows.extend(rows)

    cur.close()
    conn.close()

    # 4. Initialize buckets per sector using CellListRCI metadata
    sector_buckets = defaultdict(lambda: {
        "payload": defaultdict(lambda: defaultdict(float)),
        "max_rrc": defaultdict(lambda: defaultdict(float)),
        "availability": defaultdict(lambda: defaultdict(list)),
        "dl_prb": defaultdict(lambda: defaultdict(list)),
        "ul_prb": defaultdict(lambda: defaultdict(list)),
        "user_dl_thp": defaultdict(lambda: defaultdict(list)),
        "user_ul_thp": defaultdict(lambda: defaultdict(list)),
        "cqi": defaultdict(lambda: defaultdict(list)),
        "rrc_setup_sr": defaultdict(lambda: defaultdict(list)),
        "erab_setup_sr": defaultdict(lambda: defaultdict(list)),
        "cssr": defaultdict(lambda: defaultdict(list)),
        "erab_drop_rate": defaultdict(lambda: defaultdict(list)),
        "service_drop_rate": defaultdict(lambda: defaultdict(list)),
        "ifho_sr": defaultdict(lambda: defaultdict(list)),
        "inter_freq_ho_sr": defaultdict(lambda: defaultdict(list)),
        "avg_ni_dbm": defaultdict(lambda: defaultdict(list)),
        "active_users": defaultdict(lambda: defaultdict(list)),
        "spectrum_efficiency": defaultdict(lambda: defaultdict(list)),
        "bands": {}
    })

    # Pre-populate all carriers and bands from CellListRCI so every sector has its carriers
    for cname, meta in cell_map.items():
        sec = meta['sector']
        carrier = meta['carrier']
        band = meta['band']
        sector_buckets[sec]["bands"][carrier] = band

    for r in all_meas_rows:
        ts = r['begin_time']
        t_key = ts.strftime("%Y-%m-%d") if time_mode == "daily" else ts.strftime("%Y-%m-%d %H:00")
        cname = r['Cell Name'].strip()

        meta = cell_map.get(cname.upper()) or cell_map.get(normalize_cell_key(cname))
        if not meta and (cname.startswith("E_") or cname.startswith("C_")):
            stripped = cname[2:]
            meta = cell_map.get(stripped.upper()) or cell_map.get(normalize_cell_key(stripped))

        if meta:
            sec = meta['sector']
            carrier = meta['carrier']
            band = meta['band']
        else:
            sec = 1
            band = get_band_from_ci(None, cname)
            carrier = get_clean_carrier_label(cname, sec, band)

        sb = sector_buckets[sec]
        sb["bands"][carrier] = band

        # Core additive / peak KPIs
        sb["payload"][carrier][t_key] += float(r['payload_gb'] or 0)
        p_rrc = float(r['max_rrc_user'] or 0)
        sb["max_rrc"][carrier][t_key] = max(sb["max_rrc"][carrier][t_key], p_rrc)

        def append_metric(key, col):
            if r[col] is not None:
                sb[key][carrier][t_key].append(float(r[col]))

        append_metric("availability", "availability_pct")
        append_metric("dl_prb", "dl_prb_pct")
        append_metric("ul_prb", "ul_prb_pct")
        append_metric("user_dl_thp", "user_dl_thp_mbps")
        append_metric("user_ul_thp", "user_ul_thp_mbps")
        append_metric("cqi", "cqi")
        append_metric("rrc_setup_sr", "rrc_setup_sr")
        append_metric("erab_setup_sr", "erab_setup_sr")
        append_metric("cssr", "cssr")
        append_metric("erab_drop_rate", "erab_drop_rate")
        append_metric("service_drop_rate", "service_drop_rate")
        append_metric("ifho_sr", "ifho_sr")
        append_metric("inter_freq_ho_sr", "inter_freq_ho_sr")
        append_metric("avg_ni_dbm", "avg_ni_dbm")
        append_metric("active_users", "active_users")
        append_metric("spectrum_efficiency", "spectrum_efficiency")

        found_sectors.add(sec)
        found_bands.add(band)

    sorted_sectors = sorted(list(sector_buckets.keys()))
    if not sorted_sectors:
        sorted_sectors = [1, 2, 3]

    # Format multi-KPI payload charts
    result_sectors = {}
    for sec in sorted_sectors:
        s_data = sector_buckets[sec]
        c_names = sorted(list(s_data["bands"].keys()))

        def build_kpi_series(kpi_key, is_avg=False):
            series_dict = {}
            for c in c_names:
                vals = []
                for t in sorted_ts:
                    raw = s_data[kpi_key][c].get(t, 0)
                    if is_avg:
                        if isinstance(raw, list) and len(raw) > 0:
                            vals.append(round(sum(raw) / len(raw), 2))
                        else:
                            vals.append(0.0)
                    else:
                        vals.append(round(raw if isinstance(raw, (int, float)) else 0.0, 2))
                series_dict[c] = vals
            return series_dict

        # Build series for all 18 KPIs
        kpi_map = {
            "payload": ("Payload (GB)", "GB", False, True, None, None),
            "max_rrc": ("Max RRC User (Users)", "Users", False, False, 0, None),
            "active_users": ("Active Users", "Users", True, False, 0, None),
            "availability": ("Availability (%)", "%", True, False, 0, 100),
            "dl_prb": ("DL PRB (%)", "%", True, False, 0, 100),
            "ul_prb": ("UL PRB (%)", "%", True, False, 0, 100),
            "user_dl_thp": ("User DL Thp (Mbps)", "Mbps", True, False, 0, None),
            "user_ul_thp": ("User UL Thp (Mbps)", "Mbps", True, False, 0, None),
            "cqi": ("CQI", "", True, False, None, None),
            "rrc_setup_sr": ("RRC Setup SR (%)", "%", True, False, 0, 100),
            "erab_setup_sr": ("E-RAB Setup SR (%)", "%", True, False, 0, 100),
            "cssr": ("CSSR (%)", "%", True, False, 0, 100),
            "erab_drop_rate": ("E-RAB Drop Rate (%)", "%", True, False, 0, None),
            "service_drop_rate": ("Service Drop Rate (%)", "%", True, False, 0, None),
            "ifho_sr": ("IFHO SR (%)", "%", True, False, 0, 100),
            "inter_freq_ho_sr": ("Inter-Freq HO SR (%)", "%", True, False, 0, 100),
            "avg_ni_dbm": ("Average NI (dBm)", "dBm", True, False, None, None),
            "spectrum_efficiency": ("Spectrum Efficiency", "", True, False, 0, None),
        }

        kpis_out = {}
        for k_id, (k_title, k_unit, is_avg, has_tot, min_y, max_y) in kpi_map.items():
            s_dict = build_kpi_series(k_id, is_avg=is_avg)
            tot_list = []
            if has_tot:
                for i in range(len(sorted_ts)):
                    tot = sum(s_dict[c][i] for c in c_names if i < len(s_dict[c]))
                    tot_list.append(round(tot, 2))

            kpis_out[k_id] = {
                "id": k_id,
                "title": k_title,
                "unit": k_unit,
                "carriers": c_names,
                "carrier_bands": s_data["bands"],
                "carrier_series": s_dict,
                "total_series": tot_list if has_tot else None,
                "has_total": has_tot,
                "min_y": min_y,
                "max_y": max_y
            }

        result_sectors[f"sector{sec}"] = {
            "sector_num": sec,
            "title": f"Sector {sec}",
            "timestamps": sorted_ts,
            "carriers": c_names,
            "carrier_bands": s_data["bands"],
            "carrier_series": kpis_out["payload"]["carrier_series"],
            "total_series": kpis_out["payload"]["total_series"],
            "kpis": kpis_out
        }

    t1 = time.time()
    return {
        "site_id": site_clean,
        "site_name": get_site_name(site_clean),
        "enodeb_name": get_site_display_name(site_clean),
        "enodeb_names": sorted(list(enodebs)),
        "time_mode": time_mode,
        "start_date": dt_start.strftime("%Y-%m-%d"),
        "end_date": dt_end.strftime("%Y-%m-%d"),
        "available_sectors": sorted_sectors,
        "available_bands": sorted(list(found_bands)),
        "available_types": sorted(list(found_types)) if found_types else ["Macro"],
        "cell_type": active_type_filter,
        "sectors": result_sectors,
        "total_records": len(all_meas_rows),
        "execution_time_sec": round(t1 - t0, 3),
        "source": "TwoDb Live (127.0.0.1:5434)",
        "latest_db_date": "2026-10-27"
    }
