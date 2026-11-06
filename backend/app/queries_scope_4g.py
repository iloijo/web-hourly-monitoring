"""
4G KPI aggregation above sector level (Regional / NOP / Kabupaten / Kecamatan / Site).

Daily  : measDy4g + measBdbh4g (onedb), same KPI set as the daily sector charts.
Hourly : measHy4g (twodb), Site scope only, same KPI set as the hourly sector charts.

Aggregation rules:
- volumes and user counts      -> SUM over the cells of the entity
- success / drop rates, thp, SE -> SUM(num) / SUM(denum)  (validated: equals the per-cell % column)
- availability                  -> average of per-cell availability (a fully down cell has denum 0,
                                   so SUM(num)/SUM(denum) would hide it)
- KPIs without num/denum (CQI, NI, RSSI, BLER, delay, latency) -> average over cells
- "Max Cell ... Thp" and "Maximum NI" -> MAX
"""
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from .bands import lte_band, lte_band_sql
from .db import get_latest_data_date, get_onedb_connection, get_twodb_connection
from .queries_daily import DAILY_KPIS_CONFIG

BAND_KEYS = ["L700", "L900", "L1800", "L2100", "L2300_1", "L2300_2", "L2300_3", "L2600"]


def _ratio(num: str, den: str, alias: str, scale: str = "* 100") -> str:
    return f'SUM({alias}."{num}") / NULLIF(SUM({alias}."{den}"), 0) {scale}'


def _col(fn: str, col: str, alias: str, scale: str = "") -> str:
    return f'{fn}({alias}."{col}") {scale}'


# ---------------------------------------------------------------------------
# Daily: kpi_id -> SQL aggregate on measDy4g (alias d) / measBdbh4g (alias b)
# ---------------------------------------------------------------------------
_D = "d"
DAILY_DY_AGG = {
    "payload": _col("SUM", "4G Payload (MByte) AMQ", _D, "/ 1024.0"),
    "dl_traffic": _col("SUM", "DL Traffic Volume (MByte) AMQ", _D, "/ 1024.0"),
    "ul_traffic": _col("SUM", "UL Traffic Volume (MByte) AMQ", _D, "/ 1024.0"),
    "ca_payload_total": _col("SUM", "Total Payload CA_(MByte) AMQ", _D, "/ 1024.0"),
    "ca_payload_dl": _col("SUM", "DL Payload CA_(MByte) AMQ", _D, "/ 1024.0"),
    "ca_payload_ul": _col("SUM", "UL Payload CA_(MByte) AMQ", _D, "/ 1024.0"),
    "volte_payload_dl": _col("SUM", "DL_Volume_VoLTE_QCI1_(MByte) AMQ", _D),
    "volte_payload_ul": _col("SUM", "UL_Volume_VoLTE_QCI1_(MByte) AMQ", _D),
    "volte_traffic": _col("SUM", "Traffic_VoLTE_(erl) AMQ", _D),

    "availability": 'AVG(COALESCE(d."Cell Availability Num 4G AMQ" / NULLIF(d."Cell Availability Denum 4G AMQ", 0), d."Cell Availability 4G_(%)")) * 100',
    "rrc_setup_sr": _ratio("Num RRC Setup SR AMQ", "Denum RRC Setup SR AMQ", _D),
    "erab_setup_sr": _ratio("Num E-RAB Setup SR AMQ", "Denum E-RAB Setup SR AMQ", _D),
    "cssr": _ratio("Num CSSR AMQ", "Denum CSSR AMQ", _D),
    "s1_conn_sr": _col("AVG", "S1-Signal Connection Establishment Success Rate(%)", _D),
    "volte_rrc_sr": _ratio("RRC_Establishment_VoLTE_Num AMQ", "RRC_Establishment_VoLTE_Denum AMQ", _D),
    "volte_erab_qci1_sr": _ratio("E-RAB_Setup_VoLTE_QCI1_Num AMQ", "E-RAB_Setup_VoLTE_QCI1_Denum AMQ", _D),
    "volte_erab_qci5_sr": _ratio("E-RAB_Setup_VoLTE_QCI5_Num AMQ", "E-RAB_Setup_VoLTE_QCI5_Denum AMQ", _D),
    "volte_call_setup_sr": _ratio("Call_Setup_VoLTE_Num AMQ", "Call_Setup_VoLTE_Denum AMQ", _D),
    "csfb_sr": _ratio("Num CSFB SR AMQ", "Denum CSFB SR AMQ", _D),

    "erab_drop_rate": _ratio("Num E-RAB Drop AMQ", "Denum E-RAB Drop AMQ", _D),
    "service_drop_rate": _ratio("Num Service Drop Rate AMQ", "Denum Service Drop Rate AMQ", _D),
    "volte_call_drop_rate": _ratio("Call_Drop_VoLTE_Num AMQ", "Call_Drop_VoLTE_Denum AMQ", _D),

    "cell_dl_thp": _ratio("Cell DL Throughput Num AMQ", "Cell DL Throughput Denum AMQ", _D, "/ 1000.0"),
    "cell_ul_thp": _ratio("Cell UL Throughput Num AMQ", "Cell UL Throughput Denum AMQ", _D, "/ 1000.0"),
    "ca_dl_thp": _ratio("DL Throughput CA Num AMQ", "DL Throughput CA Denum AMQ", _D, "/ 1000.0"),
    "ca_ul_thp": _ratio("UL Throughput CA Num AMQ", "UL Throughput CA Denum AMQ", _D, "/ 1000.0"),
    "max_cell_dl_rlc_thp": _col("MAX", "Maximum Cell DL RLC Throughput(Mbps)", _D),
    "max_cell_ul_rlc_thp": _col("MAX", "Maximum Cell UL RLC Throughput(Mbps)", _D),
    "max_cell_dl_pdcp_thp": _col("MAX", "Maximum Cell DL PDCP Throughput(Mbps)", _D),
    "max_cell_ul_pdcp_thp": _col("MAX", "Maximum Cell UL PDCP Throughput(Mbps)", _D),

    "max_rrc": _col("SUM", "Maximum Number of RRC Connection User(unit)", _D),
    "active_users": _col("SUM", "New Active Users rnp_Ono", _D),
    "avg_dl_active_users": _col("SUM", "Average DL Active User Number", _D),
    "max_dl_active_users_qci1": _col("SUM", "Max_DL_Active_User_Number_QCI1 AMQ", _D),
    "max_ul_active_users_qci1": _col("SUM", "Max_UL_Active_User_Number_QCI1 AMQ", _D),
    "max_user_volte": _col("SUM", "Max_User_VoLTE AMQ", _D),
    "simultaneous_ue_avg": _col("SUM", "Average Number of UE that can be simultaneously", _D),
    "simultaneous_ue_max": _col("SUM", "Maximum Number of UE that can be simultaneously", _D),
    "rrc_connected_mean": _col("SUM", "U31_[LTE]MeanRrcConnectedUserNUmber", _D),

    "cqi": _col("AVG", "CQI Average AMQ", _D),
    "cqi_rev": _ratio("Num Average CQI_Rev", "Denum Average CQI_Rev", _D, ""),
    "cqi_ge_7": _ratio("CQI>=7 Num AMQ", "CQI>=7 Denum AMQ", _D),
    "avg_ni_dbm": _col("AVG", "Average NI of Carrier(dBm)", _D),
    "max_ni_dbm": _col("MAX", "Maximum NI of Carrier(dBm)", _D),
    "avg_cell_rssi": _col("AVG", "Average Cell RSSI(dBm)", _D),
    "dl_init_bler": _col("AVG", "Cell Downlink Init BLER(%)", _D),
    "ul_init_bler": _col("AVG", "Cell Uplink Init BLER(%)", _D),
    "dl_ip_packet_delay": _col("AVG", "Average DL IP Packet Delay(ms)", _D),
    "ip_latency": _col("AVG", "U31_[LTE]IP Latency", _D),
    "pdcp_sdu_delay": _col("AVG", "U31_Average DL PDCP SDU Delay", _D),

    "ifho_sr": _ratio("Num IFHO SR AMQ", "Denum IFHO SR AMQ", _D),
    "inter_freq_ho_sr": _ratio("Inter Freq LTE HO Num AMQ", "Inter Freq LTE HO Denum AMQ", _D),
    "x2_ho_out_sr": _ratio("X2 HO Out Num AMQ", "X2 HO Out Denom AMQ", _D),
    "s1_ho_out_sr": _ratio("S1 HO Out Num AMQ", "S1 HO Out Denom AMQ", _D),
    "inter_freq_x2_ho_sr": _ratio("Inter Freq X2 HO Num AMQ", "Inter Freq X2 HO Denum AMQ", _D),
    "inter_freq_s1_ho_sr": _ratio("Inter Freq S1 HO Num AMQ", "Inter Freq S1 HO Denum AMQ", _D),
    "lte_gsm_ho_sr": _ratio("LTE-GSM HO Num AMQ", "LTE-GSM HO Denum AMQ", _D),
    "volte_intra_freq_hosr": _ratio("Intra_Freq_HOSR_VoLTE_Num AMQ", "Intra_Freq_HOSR_VoLTE_Denum AMQ", _D),
    "volte_inter_freq_hosr": _ratio("Inter_Freq_HOSR_VoLTE_Num AMQ", "Inter_Freq_HOSR_VoLTE_Denum AMQ", _D),
    "srvcc_gsm_hosr": _ratio("SRVCC_LTE-GSM_HOSR_VoLTE_Num AMQ", "SRVCC_LTE-GSM_HOSR_VoLTE_Denum AMQ", _D),
}

_B = "b"
DAILY_BDBH_AGG = {
    "dl_prb": _ratio("DL PRB Utilization Num AMQ", "DL PRB Utilization Denum AMQ", _B),
    "ul_prb": _ratio("UL PRB Utilization Num AMQ", "UL PRB Utilization Denum AMQ", _B),
    "user_dl_thp": _ratio("User DL Throughput Num AMQ", "User DL Throughput Denum AMQ", _B, "/ 1000.0"),
    "user_ul_thp": _ratio("User UL Throughput Num AMQ", "User UL Throughput Denum AMQ", _B, "/ 1000.0"),
    "spectrum_efficiency": _ratio("spectrum efficiency num", "spectrum efficiency denum", _B, ""),
}

# ---------------------------------------------------------------------------
# Hourly: kpi_id -> (SQL aggregate on measHy4g alias m, title, unit, has_total, min_y, max_y)
# Titles/units match the hourly sector charts (queries.py).
# ---------------------------------------------------------------------------
_M = "m"
HOURLY_AGG = {
    "payload": (_col("SUM", "4G Payload (MByte) AMQ", _M, "/ 1024.0"), "Payload (GB)", "GB", True, 0, None),
    "max_rrc": (_col("SUM", "Maximum Number of RRC Connection User", _M), "Max RRC User (Users)", "Users", False, 0, None),
    "active_users": (_col("SUM", "New Active Users rnp_Ono", _M), "Active Users", "Users", False, 0, None),
    "availability": ('AVG(COALESCE(m."Cell Availability Num 4G AMQ" / NULLIF(m."Cell Availability Denum 4G AMQ", 0), 0)) * 100',
                     "Availability (%)", "%", False, 0, 100),
    "dl_prb": (_ratio("DL PRB Utilization Num AMQ", "DL PRB Utilization Denum AMQ", _M), "DL PRB (%)", "%", False, 0, 100),
    "ul_prb": (_ratio("UL PRB Utilization Num AMQ", "UL PRB Utilization Denum AMQ", _M), "UL PRB (%)", "%", False, 0, 100),
    "user_dl_thp": (_ratio("User DL Throughput Num AMQ", "User DL Throughput Denum AMQ", _M, "/ 1000.0"), "User DL Thp (Mbps)", "Mbps", False, 0, None),
    "user_ul_thp": (_ratio("User UL Throughput Num AMQ", "User UL Throughput Denum AMQ", _M, "/ 1000.0"), "User UL Thp (Mbps)", "Mbps", False, 0, None),
    "cqi": (_col("AVG", "CQI Average AMQ", _M), "CQI", "", False, None, None),
    "rrc_setup_sr": (_ratio("Num RRC Setup SR AMQ", "Denum RRC Setup SR AMQ", _M), "RRC Setup SR (%)", "%", False, 0, 100),
    "erab_setup_sr": (_ratio("Num E-RAB Setup SR AMQ", "Denum E-RAB Setup SR AMQ", _M), "E-RAB Setup SR (%)", "%", False, 0, 100),
    "cssr": (_ratio("Num CSSR AMQ", "Denum CSSR AMQ", _M), "CSSR (%)", "%", False, 0, 100),
    "erab_drop_rate": (_ratio("Num E-RAB Drop AMQ", "Denum E-RAB Drop AMQ", _M), "E-RAB Drop Rate (%)", "%", False, 0, None),
    "service_drop_rate": (_ratio("Num Service Drop Rate AMQ", "Denum Service Drop Rate AMQ", _M), "Service Drop Rate (%)", "%", False, 0, None),
    "ifho_sr": (_ratio("Num IFHO SR AMQ", "Denum IFHO SR AMQ", _M), "IFHO SR (%)", "%", False, 0, 100),
    "inter_freq_ho_sr": (_ratio("Inter Freq LTE HO Num AMQ", "Inter Freq LTE HO Denum AMQ", _M), "Inter-Freq HO SR (%)", "%", False, 0, 100),
    "avg_ni_dbm": (_col("AVG", "Average NI of Carrier(dBm)", _M), "Average NI (dBm)", "dBm", False, None, None),
    "spectrum_efficiency": (_ratio("spectrum efficiency num", "spectrum efficiency denum", _M, ""), "Spectrum Efficiency", "", False, 0, None),
}


def _select_list(agg: Dict[str, str]) -> str:
    # psycopg2 parameter style: a literal % in column names must be doubled
    return ",\n".join(f'ROUND(({expr})::numeric, 2) AS "{kid}"'.replace("%", "%%") for kid, expr in agg.items())


# ---------------------------------------------------------------------------
# Scope -> entities -> eNodeB ids (CellListRCI / LookupSITEID in onedb)
# ---------------------------------------------------------------------------
_SCOPE_DEFAULTS = {
    "nop": ["MAKASSAR", "BONE", "KENDARI"],
    "city": ["KOTA MAKASSAR", "GOWA"],
    "kecamatan": ["BUNGKU TENGAH", "BUNGKU BARAT"],
    "site": ["MRW002", "UPD919"],
}

_SCOPE_SQL = {
    "nop": """SELECT DISTINCT r.enodeb_id, l."NOP", r.ci, r.cell_name FROM "CellListRCI" r
              JOIN "LookupSITEID" l ON r.site_id = l."Prefix Site ID"
              WHERE l."NOP" = ANY(%s) AND r.enodeb_id IS NOT NULL""",
    "city": """SELECT DISTINCT enodeb_id, kabupaten, ci, cell_name FROM "CellListRCI"
               WHERE kabupaten = ANY(%s) AND enodeb_id IS NOT NULL""",
    "kecamatan": """SELECT DISTINCT enodeb_id, kecamatan, ci, cell_name FROM "CellListRCI"
                    WHERE kecamatan = ANY(%s) AND enodeb_id IS NOT NULL""",
    "site": """SELECT DISTINCT enodeb_id, site_id, ci, cell_name FROM "CellListRCI"
               WHERE site_id = ANY(%s) AND enodeb_id IS NOT NULL""",
}


def resolve_scope(scope: str, mode: str, nops, cities, kecamatans, sites):
    """Returns (entities, {enodeb_id: entity}, [scope_bands]). Band mode keeps only the first entity."""
    if scope == "regional":
        return ["Region Sulawesi"], {}, BAND_KEYS
    chosen = {"nop": nops, "city": cities, "kecamatan": kecamatans, "site": sites}.get(scope)
    if scope not in _SCOPE_SQL:
        raise ValueError(f"Unknown scope: {scope}")
    entities = [str(x).strip() for x in (chosen or []) if str(x).strip()] or _SCOPE_DEFAULTS[scope]
    if scope == "site":
        entities = [e.upper() for e in entities]
    if mode == "band":
        entities = entities[:1]

    conn = get_onedb_connection(timeout=15)
    if not conn:
        raise RuntimeError("OneDb is not reachable to resolve the scope.")
    try:
        cur = conn.cursor()
        cur.execute(_SCOPE_SQL[scope], (entities,))
        rows = cur.fetchall()
        enb_to_entity = {int(r[0]): r[1] for r in rows if r[0] is not None}
        found_bands = set(lte_band(r[2], r[3]) for r in rows if len(r) > 3 and (r[2] or r[3]))
        scope_bands = [b for b in BAND_KEYS if b in found_bands]
        cur.close()
    finally:
        conn.close()
    return entities, enb_to_entity, scope_bands


def _series_key_sql(alias: str, mode: str, scope: str, entities: List[str], enb_to_entity: Dict[int, str]) -> str:
    if mode == "band":
        return lte_band_sql(alias)
    if scope == "regional":
        return "'Region Sulawesi'"
    parts = []
    for ent in entities:
        enbs = [str(k) for k, v in enb_to_entity.items() if v == ent]
        if enbs:
            safe = ent.replace("'", "''")
            parts.append(f'WHEN {alias}."eNodeBId" IN ({",".join(enbs)}) THEN \'{safe}\'')
    return ("CASE " + " ".join(parts) + " ELSE 'OTHER' END") if parts else "'OTHER'"


def _where_enb(alias: str, scope: str, enb_list: List[int]) -> str:
    return "" if scope == "regional" else f'AND {alias}."eNodeBId" = ANY(%s)'


def _params(start: str, end: str, scope: str, enb_list: List[int]):
    return (start, end) if scope == "regional" else (start, end, enb_list)


def _run(get_conn, db_label: str, sql: str, params) -> list:
    conn = get_conn(timeout=15)
    if not conn:
        time.sleep(0.5)
        conn = get_conn(timeout=15)
    if not conn:
        raise RuntimeError(f"{db_label} is not reachable for scope aggregation.")
    try:
        cur = conn.cursor()
        cur.execute(sql, params)
        rows = cur.fetchall()
        cur.close()
        return rows
    finally:
        conn.close()


def _build_kpis(rows_by_kpi, kpi_meta, series_keys, carrier_bands, timestamps) -> Dict[str, Any]:
    out = {}
    for kid, meta in kpi_meta.items():
        carrier_series = {k: [rows_by_kpi[kid][k].get(t, 0.0) for t in timestamps] for k in series_keys}
        total = None
        if meta["has_total"]:
            total = [round(sum(carrier_series[k][i] for k in series_keys), 2) for i in range(len(timestamps))]
        out[kid] = {
            "id": kid,
            "title": meta["title"],
            "unit": meta["unit"],
            "category": meta.get("category"),
            "carriers": series_keys,
            "carrier_bands": carrier_bands,
            "carrier_series": carrier_series,
            "total_series": total,
            "has_total": meta["has_total"],
            "min_y": meta["min_y"],
            "max_y": meta["max_y"],
        }
    return out


def _collect(rows, kpi_ids, rows_by_kpi, ts_fmt):
    for r in rows:
        t, key = r[0], str(r[1])
        if key == "OTHER":
            continue
        t_key = t.strftime(ts_fmt) if hasattr(t, "strftime") else str(t)
        for i, kid in enumerate(kpi_ids):
            v = r[2 + i]
            rows_by_kpi[kid][key][t_key] = float(v) if v is not None else 0.0


def _parse_range_lazy(start_date, end_date, default_days: int, fallback_db: str, fallback_table: str):
    dt_end = None
    if end_date and str(end_date).strip():
        try:
            dt_end = datetime.strptime(str(end_date).strip(), "%Y-%m-%d")
        except ValueError:
            pass
    if dt_end is None:
        try:
            dt_end = get_latest_data_date(fallback_db, fallback_table)
        except Exception:
            dt_end = (datetime.now() - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)

    dt_start = None
    if start_date and str(start_date).strip():
        try:
            dt_start = datetime.strptime(str(start_date).strip(), "%Y-%m-%d")
        except ValueError:
            pass
    if dt_start is None:
        dt_start = dt_end - timedelta(days=default_days)
    return dt_start, dt_end


def _layout(scope, mode, entities):
    if mode == "band":
        return BAND_KEYS, {b: b for b in BAND_KEYS}
    return entities, {e: "ENTITY" for e in entities}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def get_scope_aggregation_data(scope="regional", mode="full", start_date=None, end_date=None,
                               nops=None, cities=None, kecamatans=None, sites=None, bands=None) -> Dict[str, Any]:
    """4G Daily charts for Regional/NOP/Kabupaten/Kecamatan/Site, same KPI set as the daily sector charts."""
    t0 = time.time()
    scope = (scope or "regional").lower()
    mode = (mode or "full").lower()
    dt_start, dt_end = _parse_range_lazy(start_date, end_date, 7, "onedb", "measDy4g")
    start_str, end_str = dt_start.strftime("%Y-%m-%d 00:00:00"), dt_end.strftime("%Y-%m-%d 23:59:59")
    timestamps = [(dt_start + timedelta(days=i)).strftime("%Y-%m-%d") for i in range((dt_end - dt_start).days + 1)]

    entities, enb_to_entity, scope_bands = resolve_scope(scope, mode, nops, cities, kecamatans, sites)
    enb_list = list(enb_to_entity)
    if scope != "regional" and not enb_list:
        raise RuntimeError(f"Tidak ada eNodeB untuk {scope}: {', '.join(entities)}")

    sql_dy = f"""
        SELECT d."Begin Time"::date AS dt, {_series_key_sql('d', mode, scope, entities, enb_to_entity)} AS series_key,
        {_select_list(DAILY_DY_AGG)}
        FROM "measDy4g" d
        WHERE d."Begin Time" >= %s::timestamp AND d."Begin Time" <= %s::timestamp {_where_enb('d', scope, enb_list)}
        GROUP BY 1, 2"""
    sql_bdbh = f"""
        SELECT b."Begin Time"::date AS dt, {_series_key_sql('b', mode, scope, entities, enb_to_entity)} AS series_key,
        {_select_list(DAILY_BDBH_AGG)}
        FROM "measBdbh4g" b
        WHERE b."Begin Time" >= %s::timestamp AND b."Begin Time" <= %s::timestamp {_where_enb('b', scope, enb_list)}
        GROUP BY 1, 2"""
    params = _params(start_str, end_str, scope, enb_list)

    with ThreadPoolExecutor(max_workers=2) as pool:
        fut_dy = pool.submit(_run, get_onedb_connection, "OneDb", sql_dy, params)
        fut_bdbh = pool.submit(_run, get_onedb_connection, "OneDb", sql_bdbh, params)
        dy_rows, bdbh_rows = fut_dy.result(), fut_bdbh.result()

    rows_by_kpi = defaultdict(lambda: defaultdict(dict))
    _collect(dy_rows, list(DAILY_DY_AGG), rows_by_kpi, "%Y-%m-%d")
    _collect(bdbh_rows, list(DAILY_BDBH_AGG), rows_by_kpi, "%Y-%m-%d")

    meta = {
        kid: {
            "title": cfg["title"], "unit": cfg["unit"], "category": cfg["category"],
            "has_total": cfg["has_tot"], "min_y": cfg["min_y"], "max_y": cfg["max_y"],
        }
        for kid, cfg in DAILY_KPIS_CONFIG.items() if kid in DAILY_DY_AGG or kid in DAILY_BDBH_AGG
    }
    if mode == "band":
        present_in_rows = {b for k in rows_by_kpi for b in rows_by_kpi[k]}
        active_bands = [b for b in scope_bands if b in present_in_rows] if present_in_rows else scope_bands
        series_keys = active_bands if active_bands else BAND_KEYS
        carrier_bands = {b: b for b in series_keys}
    else:
        series_keys, carrier_bands = _layout(scope, mode, entities)

    available_bands = series_keys if mode == "band" else (scope_bands if scope_bands else BAND_KEYS)
    return {
        "scope": scope,
        "mode": mode,
        "start_date": dt_start.strftime("%Y-%m-%d"),
        "end_date": dt_end.strftime("%Y-%m-%d"),
        "timestamps": timestamps,
        "active_entities": entities,
        "available_bands": available_bands,
        "carrier_bands": carrier_bands,
        "carriers": series_keys,
        "kpis": _build_kpis(rows_by_kpi, meta, series_keys, carrier_bands, timestamps),
        "execution_time_sec": round(time.time() - t0, 3),
        "source": "OneDb Live (measDy4g & measBdbh4g)",
    }


def _site_enodeb_names(sites: List[str]):
    """Returns ({eNodeB Name: site_id}, [site_bands]) from CellListRCI in OneDb (fast, pooled) with fallback to TwoDb."""
    conn = get_onedb_connection(timeout=10)
    if conn:
        try:
            cur = conn.cursor()
            cur.execute(
                'SELECT DISTINCT enodeb_name, site_id, ci, cell_name FROM "CellListRCI" WHERE site_id = ANY(%s) AND enodeb_name IS NOT NULL',
                (sites,),
            )
            rows = cur.fetchall()
            names = {r[0].strip(): r[1] for r in rows if r[0] and r[0].strip()}
            found_bands = set(lte_band(r[2], r[3]) for r in rows if r[2] or r[3])
            site_bands = [b for b in BAND_KEYS if b in found_bands]
            cur.close()
            conn.close()
            if names:
                return names, site_bands
        except Exception:
            try:
                conn.close()
            except Exception:
                pass

    conn2 = get_twodb_connection(timeout=10)
    if not conn2:
        raise RuntimeError("TwoDb is not reachable.")
    try:
        cur2 = conn2.cursor()
        cur2.execute(
            'SELECT DISTINCT enodeb_name, site_id, ci, cell_name FROM "CellListRCI" WHERE site_id = ANY(%s) AND enodeb_name IS NOT NULL',
            (sites,),
        )
        rows2 = cur2.fetchall()
        names = {r[0].strip(): r[1] for r in rows2 if r[0] and r[0].strip()}
        found_bands = set(lte_band(r[2], r[3]) for r in rows2 if r[2] or r[3])
        site_bands = [b for b in BAND_KEYS if b in found_bands]
        cur2.close()
        return names, site_bands
    finally:
        conn2.close()


def get_hourly_scope_aggregation_data(scope="site", mode="full", start_date=None, end_date=None,
                                      nops=None, cities=None, kecamatans=None, sites=None, bands=None) -> Dict[str, Any]:
    """
    4G Hourly charts per Site (aggregated cells of the site, or per band) from measHy4g,
    same KPIs as the hourly sector charts.
    Only Site scope: measHy4g is 55 GB and Regional/NOP/Kabupaten/Kecamatan need a full table scan.
    """
    t0 = time.time()
    scope = (scope or "site").lower()
    mode = (mode or "full").lower()
    if scope != "site":
        raise ValueError("4G Hourly hanya mendukung scope Sector dan Site.")
    dt_start, dt_end = _parse_range_lazy(start_date, end_date, 6, "twodb", "measHy4g")
    start_str, end_str = dt_start.strftime("%Y-%m-%d 00:00:00"), dt_end.strftime("%Y-%m-%d 23:00:00")
    timestamps = [
        (dt_start + timedelta(hours=h)).strftime("%Y-%m-%d %H:00")
        for h in range(((dt_end - dt_start).days + 1) * 24)
    ]

    entities = [str(x).strip().upper() for x in (sites or []) if str(x).strip()] or ["MRW002"]
    if mode == "band":
        entities = entities[:1]
    name_to_site, site_bands = _site_enodeb_names(entities)
    if not name_to_site:
        raise RuntimeError(f"Tidak ada eNodeB untuk site: {', '.join(entities)}")

    if mode == "band":
        series_key = lte_band_sql("m")
    else:
        whens = " ".join(
            f"WHEN m.\"eNodeB Name\" = '{n.replace(chr(39), chr(39) * 2)}' THEN '{site}'" for n, site in name_to_site.items()
        )
        series_key = f"CASE {whens} ELSE 'OTHER' END"

    agg = {kid: v[0] for kid, v in HOURLY_AGG.items()}
    sql = f"""
        SELECT m."Begin Time" AS ts, {series_key.replace('%', '%%')} AS series_key,
        {_select_list(agg)}
        FROM "measHy4g" m
        WHERE m."Begin Time" >= %s::timestamp AND m."Begin Time" <= %s::timestamp
          AND m."eNodeB Name" = ANY(%s)
        GROUP BY 1, 2"""
    rows = _run(get_twodb_connection, "TwoDb", sql, (start_str, end_str, list(name_to_site)))

    rows_by_kpi = defaultdict(lambda: defaultdict(dict))
    _collect(rows, list(agg), rows_by_kpi, "%Y-%m-%d %H:00")

    meta = {
        kid: {"title": title, "unit": unit, "has_total": has_tot, "min_y": min_y, "max_y": max_y}
        for kid, (_, title, unit, has_tot, min_y, max_y) in HOURLY_AGG.items()
    }
    if mode == "band":
        present_in_rows = {b for k in rows_by_kpi for b in rows_by_kpi[k]}
        active_bands = [b for b in site_bands if b in present_in_rows] if present_in_rows else site_bands
        series_keys = active_bands if active_bands else BAND_KEYS
        carrier_bands = {b: b for b in series_keys}
    else:
        series_keys, carrier_bands = _layout(scope, mode, entities)

    available_bands = series_keys if mode == "band" else (site_bands if site_bands else BAND_KEYS)
    return {
        "scope": scope,
        "mode": mode,
        "start_date": dt_start.strftime("%Y-%m-%d"),
        "end_date": dt_end.strftime("%Y-%m-%d"),
        "timestamps": timestamps,
        "active_entities": entities,
        "available_bands": available_bands,
        "carrier_bands": carrier_bands,
        "carriers": series_keys,
        "kpis": _build_kpis(rows_by_kpi, meta, series_keys, carrier_bands, timestamps),
        "execution_time_sec": round(time.time() - t0, 3),
        "source": "TwoDb Live (measHy4g)",
    }
