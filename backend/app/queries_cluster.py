"""
Cluster Monitoring: Daily KPI trend plus Before vs After periods for a custom list of sites / site sectors.

Members are "SITE" (every sector) or "SITE_<sector>", e.g. "UPD012" or "UPD012_1". The same members apply to
every technology:
  4G  cells from CellListRCI (site_id / site_id_sector_id -> eNodeBId + cellId)
  2G  measDy2g "BTS Name" and 5G measDy5g "NRPhysicalCellDU Name": site = 6 chars after the optional "X_"
      prefix, sector = the number in the last "_" token (E_UPD012MG1_Divnet-DMT_MG02 -> UPD012, 2)

KPI formulas are the ones of the scope charts (queries_scope_4g / KPI_2G_SELECT / KPI_5G_SELECT).
Before / after values aggregate the whole window in one GROUP BY (ratio KPIs = SUM(num)/SUM(denum) of the
window); volume KPIs (plain SUM: payload, traffic, user counts) are divided by the days with data, so they
read as an average per day and windows of different length stay comparable.

Delta = after - before, Growth = Delta / |before| * 100. Remark follows the KPI polarity:
  up   (higher is better): growth > 3 improve, growth < -3 degrade, otherwise maintain
  down (lower is better) : growth < -3 improve, growth > 3 degrade, otherwise maintain
  neutral KPIs (PRB, user counts, equipment) get no remark.
"""
import re
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from .bands import lte_band_sql
from .db import get_latest_data_date, get_onedb_connection
from .queries_2g import KPI_2G_SELECT, KPIS_2G_CONFIG
from .queries_5g import KPI_5G_BDBH_SELECT, KPI_5G_SELECT, KPIS_5G_CONFIG, _bdbh_5g_rows_sql
from .queries_daily import DAILY_KPIS_CONFIG
from .queries_scope_4g import BAND_KEYS, DAILY_BDBH_AGG, DAILY_DY_AGG, _select_list

THRESHOLD = 3.0

# ---------------------------------------------------------------------------
# KPI polarity: "up" = higher is better, "down" = lower is better, absent = neutral (no remark)
# ---------------------------------------------------------------------------
_UP, _DOWN = "up", "down"
POLARITY = {
    "4g": {
        **dict.fromkeys([
            "payload", "dl_traffic", "ul_traffic", "ca_payload_total", "ca_payload_dl", "ca_payload_ul",
            "volte_payload_dl", "volte_payload_ul", "volte_traffic", "availability",
            "rrc_setup_sr", "erab_setup_sr", "cssr", "s1_conn_sr", "volte_rrc_sr", "volte_erab_qci1_sr",
            "volte_erab_qci5_sr", "volte_call_setup_sr", "csfb_sr",
            "user_dl_thp", "user_ul_thp", "spectrum_efficiency", "cell_dl_thp", "cell_ul_thp", "ca_dl_thp",
            "ca_ul_thp", "max_cell_dl_rlc_thp", "max_cell_ul_rlc_thp", "max_cell_dl_pdcp_thp", "max_cell_ul_pdcp_thp",
            "cqi", "cqi_rev", "cqi_ge_7",
            "ifho_sr", "inter_freq_ho_sr", "x2_ho_out_sr", "s1_ho_out_sr", "inter_freq_x2_ho_sr",
            "inter_freq_s1_ho_sr", "lte_gsm_ho_sr", "volte_intra_freq_hosr", "volte_inter_freq_hosr", "srvcc_gsm_hosr",
        ], _UP),
        **dict.fromkeys([
            "erab_drop_rate", "service_drop_rate", "volte_call_drop_rate", "avg_ni_dbm", "max_ni_dbm",
            "avg_cell_rssi", "dl_init_bler", "ul_init_bler", "dl_ip_packet_delay", "ip_latency", "pdcp_sdu_delay",
        ], _DOWN),
    },
    "2g": {
        **dict.fromkeys([
            "payload_total", "payload_gprs", "payload_edge", "tch_traffic", "availability", "sdsr", "sd_to_tch_sr",
            "tbf_dl_est_sr", "tbf_ul_est_sr", "tbf_comp_sr", "hosr", "edge_dl_thp", "gprs_dl_thp", "dl_qual", "ul_qual",
        ], _UP),
        **dict.fromkeys([
            "tch_block_rate", "sdcch_block_rate", "tch_drop_rate", "icm_interference", "dl_emi", "ul_emi",
        ], _DOWN),
    },
    "5g": {
        **dict.fromkeys([
            "payload", "payload_dl", "payload_ul", "user_dl_thp", "user_ul_thp", "cell_dl_thp", "cell_ul_thp",
            "spectrum_efficiency", "sn_setup_sr", "availability", "intra_ho_sr", "inter_ho_sr",
            "cqi", "cqi_256qam", "cqi_64qam",
        ], _UP),
        # NR_Retainability(%)_LW averages ~0.8 %: it is a drop rate
        **dict.fromkeys(["retainability", "packet_loss", "latency_dl", "latency_ul", "uplink_interference"], _DOWN),
    },
}

# ---------------------------------------------------------------------------
# Cell names -> site / sector (2G and 5G)
# ---------------------------------------------------------------------------
_SITE_SQL = r"substring({col} from '^(?:[A-Z]_)?([A-Z0-9]{{6}})')"
_SECTOR_SQL = r"substring({col} from '_[A-Z]*([0-9]+)[^_]*$')::int"
_MEMBER_RE = re.compile(r"^([A-Z0-9]{6})(?:_(\d{1,3}))?$")


def parse_members(members: List[str]):
    """["UPD012", "UPD003_2"] -> (whole sites, ["UPD003_2"], all sites)."""
    whole, sectors = set(), set()
    for raw in members or []:
        m = _MEMBER_RE.match(str(raw).strip().upper())
        if not m:
            raise ValueError(f"Invalid cluster member: {raw}")
        if m.group(2) is None:
            whole.add(m.group(1))
        else:
            sectors.add(f"{m.group(1)}_{int(m.group(2))}")
    sectors = {s for s in sectors if s.split("_")[0] not in whole}
    if not whole and not sectors:
        raise ValueError("The cluster has no sites yet.")
    return sorted(whole), sorted(sectors), sorted(whole | {s.split("_")[0] for s in sectors})


def _sum_aliases(select_sql: str) -> set:
    """Aliases of plain SUM KPIs (no ratio) in a KPI select list -> shown as average per day."""
    out = set()
    for line in select_sql.splitlines():
        line = line.strip()
        if " as " in line and line.startswith(("ROUND(SUM(", "ROUND((SUM(")) and "NULLIF" not in line:
            out.add(line.rsplit(" as ", 1)[1].strip(", "))
    return out


_PER_DAY = {
    "4g": {k for k, e in {**DAILY_DY_AGG, **DAILY_BDBH_AGG}.items() if e.startswith("SUM(") and "NULLIF" not in e},
    "2g": _sum_aliases(KPI_2G_SELECT),
    "5g": _sum_aliases(KPI_5G_SELECT),
}

_BAND_2G = "CASE WHEN m.\"BTS Name\" LIKE '%%MG%%' THEN 'DCS' ELSE 'GSM' END"
_BAND_5G = """CASE WHEN (m."NRPhysicalCellDU ID"::int %% 10) = 4 THEN 'NR2300'
                   WHEN (m."NRPhysicalCellDU ID"::int %% 10) = 6 THEN 'NR2600' ELSE 'NR2100' END"""


def _resolve_4g_cells(whole: List[str], sectors: List[str]):
    """(eNodeBIds, cellIds, site per cell) of the members from CellListRCI."""
    sites = sorted(set(whole) | {s.split("_")[0] for s in sectors})
    conn = get_onedb_connection(timeout=15)
    if not conn:
        raise RuntimeError("OneDb is not reachable to resolve the cluster cells.")
    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT DISTINCT enodeb_id, ci, site_id FROM "CellListRCI"
               WHERE enodeb_id IS NOT NULL AND ci IS NOT NULL
                 AND (site_id = ANY(%s) OR site_id_sector_id = ANY(%s))""",
            (list(whole), list(sectors)),
        )
        rows = cur.fetchall()
        cur.close()
    finally:
        conn.close()
    rows = [r for r in rows if r[2] in sites]
    return [float(r[0]) for r in rows], [float(r[1]) for r in rows], [r[2] for r in rows]


_MEMBER_WHERE = "(m._site = ANY(%s) OR (m._site || '_' || m._sector) = ANY(%s))"


def _named_source(col: str, inner: str) -> str:
    """Measurement rows of `inner` as alias m with _site / _sector from cell name `col`, cluster members only."""
    site, sector = _SITE_SQL.format(col="x." + col), _SECTOR_SQL.format(col="x." + col)
    return f"(SELECT x.*, {site} AS _site, {sector} AS _sector FROM ({inner}) x) m WHERE {_MEMBER_WHERE}"


def _sources(tech: str, whole, sectors, start: str, end: str):
    """[(select_list, from_sql, params, band_sql)] for the technology; from_sql exposes alias m with _site."""
    if tech == "4g":
        enbs, cis, sites = _resolve_4g_cells(whole, sectors)
        if not enbs:
            return []
        out = []
        for table, agg in (("measDy4g", DAILY_DY_AGG), ("measBdbh4g", DAILY_BDBH_AGG)):
            sql = (f'(SELECT d.*, f.site AS _site FROM "{table}" d '
                   f'JOIN unnest(%s::float8[], %s::float8[], %s::text[]) AS f(enb, ci, site) '
                   f'ON d."eNodeBId" = f.enb AND d."cellId" = f.ci '
                   f'WHERE d."Begin Time" >= %s::timestamp AND d."Begin Time" <= %s::timestamp '
                   f'AND d."eNodeBId" = ANY(%s)) m WHERE TRUE')
            # the 4G KPI expressions use alias d / b
            alias = "d" if table == "measDy4g" else "b"
            select = _select_list(agg).replace(f'{alias}."', 'm."')
            out.append((select, sql, [enbs, cis, sites, start, end, sorted(set(enbs))], lte_band_sql("m").replace("%", "%%")))
        return out

    if tech == "2g":
        inner = 'SELECT * FROM "measDy2g" WHERE "Begin Time" >= %s AND "Begin Time" <= %s'
        return [(KPI_2G_SELECT, _named_source('"BTS Name"', inner), [start, end, list(whole), list(sectors)], _BAND_2G)]

    name = '"NRPhysicalCellDU Name"'
    dy = _named_source(name, 'SELECT * FROM "measDy5g" WHERE "Begin Time" >= %s AND "Begin Time" <= %s')
    bdbh = _named_source(name, _bdbh_5g_rows_sql())
    params = [start, end, list(whole), list(sectors)]
    return [(KPI_5G_SELECT, dy, params, _BAND_5G), (KPI_5G_BDBH_SELECT, bdbh, params, _BAND_5G)]


def _query(sql: str, params) -> List[Dict[str, Any]]:
    conn = get_onedb_connection(timeout=15)
    if not conn:
        raise RuntimeError("OneDb is not reachable for the cluster aggregation.")
    try:
        cur = conn.cursor()
        cur.execute(sql, params)
        cols = [d[0] for d in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        cur.close()
        return rows
    finally:
        conn.close()


_SITE_SECTORS: Optional[Dict[str, List[int]]] = None


def get_site_sectors() -> Dict[str, List[int]]:
    """{site_id: [sector numbers]} from the 4G reference (CellListRCI site_id_sector_id), cached."""
    global _SITE_SECTORS
    if _SITE_SECTORS is None:
        out = defaultdict(set)
        for r in _query('SELECT DISTINCT site_id, site_id_sector_id FROM "CellListRCI" WHERE site_id_sector_id LIKE %s', ["%\_%"]):
            site, _, sec = str(r["site_id_sector_id"]).partition("_")
            if site == r["site_id"] and sec.isdigit():
                out[site].add(int(sec))
        _SITE_SECTORS = {k: sorted(v) for k, v in sorted(out.items())}
    return _SITE_SECTORS


def _remark(polarity: Optional[str], growth: Optional[float]) -> str:
    if polarity is None:
        return "-"
    if growth is None:
        return "N/A"
    if polarity == _DOWN:
        growth = -growth
    return "Improve" if growth > THRESHOLD else "Degrade" if growth < -THRESHOLD else "Maintain"


def _compare(before: Optional[float], after: Optional[float], polarity: Optional[str]) -> Dict[str, Any]:
    delta = round(after - before, 4) if before is not None and after is not None else None
    growth = round(delta / abs(before) * 100, 2) if delta is not None and before not in (None, 0) else None
    return {"before": before, "after": after, "delta": delta, "growth": growth, "remark": _remark(polarity, growth)}


MAX_CHART_DAYS = 180


def _day(value: Optional[str], name: str) -> date:
    try:
        return date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        raise ValueError(f"Invalid {name}: {value!r}")


def get_cluster_compare(tech: str = "4g", members: Optional[List[str]] = None,
                        start_date: Optional[str] = None, end_date: Optional[str] = None,
                        before_start: Optional[str] = None, before_end: Optional[str] = None,
                        after_start: Optional[str] = None, after_end: Optional[str] = None) -> Dict[str, Any]:
    """Daily trend over [start_date, end_date] plus Before / After aggregates over their own date ranges."""
    t0 = time.time()
    tech = (tech or "4g").lower()
    if tech not in POLARITY:
        raise ValueError(f"Unknown technology: {tech}")
    whole, sectors, sites = parse_members(members)

    table = {"4g": "measDy4g", "2g": "measDy2g", "5g": "measDy5g"}[tech]
    latest = get_latest_data_date("onedb", table).date()
    c_end = min(_day(end_date, "end date"), latest) if end_date else latest
    c_start = _day(start_date, "start date") if start_date else c_end - timedelta(days=29)
    b_start, b_end = _day(before_start, "before start"), _day(before_end, "before end")
    a_start, a_end = _day(after_start, "after start"), min(_day(after_end, "after end"), latest)
    if c_start > c_end:
        raise ValueError("Start date must be on or before the end date.")
    if (c_end - c_start).days + 1 > MAX_CHART_DAYS:
        raise ValueError(f"Chart range is limited to {MAX_CHART_DAYS} days.")
    if b_start > b_end:
        raise ValueError("Before start must be on or before before end.")
    if a_start > latest:
        raise ValueError(f"No data yet for the After period (latest data {latest}).")
    if a_start > a_end:
        raise ValueError("After start must be on or before after end.")
    if b_end >= a_start:
        raise ValueError("The Before period must end before the After period starts.")
    if max((b_end - b_start).days, (a_end - a_start).days) + 1 > MAX_CHART_DAYS:
        raise ValueError(f"Before / After periods are limited to {MAX_CHART_DAYS} days each.")

    q_start, q_end = min(c_start, b_start), max(c_end, a_end)
    start, end = f"{q_start} 00:00:00", f"{q_end} 23:59:59"
    timestamps = [(c_start + timedelta(days=i)).isoformat() for i in range((c_end - c_start).days + 1)]

    sources = _sources(tech, whole, sectors, start, end)
    day_sql = 'm."Begin Time"::date'
    period_sql = (f"CASE WHEN {day_sql} BETWEEN '{b_start}' AND '{b_end}' THEN 'before' "
                  f"WHEN {day_sql} BETWEEN '{a_start}' AND '{a_end}' THEN 'after' END")
    # every from_sql ends with a WHERE clause, so extra conditions are appended with AND
    jobs = []
    for select, from_sql, params, band_sql in sources:
        jobs.append(("daily", f"""
            SELECT {day_sql} AS dt, {band_sql} AS band, {select}
            FROM {from_sql} AND {day_sql} BETWEEN '{c_start}' AND '{c_end}'
            GROUP BY GROUPING SETS (({day_sql}), ({day_sql}, {band_sql}))""", params))
        jobs.append(("period", f"""
            SELECT {period_sql} AS period, m._site AS site, COUNT(DISTINCT {day_sql}) AS n_days, {select}
            FROM {from_sql} AND ({day_sql} BETWEEN '{b_start}' AND '{b_end}' OR {day_sql} BETWEEN '{a_start}' AND '{a_end}')
            GROUP BY GROUPING SETS (({period_sql}), ({period_sql}, m._site))""", params))

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda j: (j[0], _query(j[1], j[2])), jobs))

    cfg_all = {"4g": DAILY_KPIS_CONFIG, "2g": KPIS_2G_CONFIG, "5g": KPIS_5G_CONFIG}[tech]
    per_day = _PER_DAY[tech]
    polarity = POLARITY[tech]

    # daily[kpi][band or "Cluster"][date] ; period[(period, site or None)] = {kpi: value, "_days": n}
    daily = defaultdict(lambda: defaultdict(dict))
    period = defaultdict(dict)
    for kind, rows in results:
        for r in rows:
            kpis = {k: float(v) for k, v in r.items() if k in cfg_all and v is not None}
            if kind == "daily":
                key = r["band"] if r["band"] is not None else "Cluster"
                for k, v in kpis.items():
                    daily[k][key][r["dt"].isoformat()] = v
            elif r["period"] is not None:
                slot = period[(r["period"], r["site"])]
                days = max(int(r["n_days"] or 0), slot.get("_days", 0))
                slot["_days"] = days
                for k, v in kpis.items():
                    slot[k] = round(v / days, 3) if k in per_day and days else v

    bands_found = sorted({b for k in daily for b in daily[k] if b != "Cluster"})
    if tech == "4g":
        bands_found = [b for b in BAND_KEYS if b in bands_found] + (["L2600"] if "L2600" in bands_found else [])
        bands_found = list(dict.fromkeys(bands_found))
    sites_with_data = sorted({s for (_, s) in period if s})

    kpis_out, site_rows = {}, {}
    for kid, cfg in cfg_all.items():
        if kid not in daily and kid not in period.get(("before", None), {}) and kid not in period.get(("after", None), {}):
            continue
        pol = polarity.get(kid)
        kpis_out[kid] = {
            "id": kid, "title": cfg["title"], "unit": cfg["unit"], "category": cfg["category"],
            "polarity": pol or "neutral", "per_day": kid in per_day,
            "has_total": cfg.get("has_tot", False), "min_y": cfg.get("min_y"), "max_y": cfg.get("max_y"),
            "cluster_series": [daily[kid]["Cluster"].get(t) for t in timestamps],
            "band_series": {b: [daily[kid][b].get(t) for t in timestamps] for b in bands_found},
            **_compare(period[("before", None)].get(kid), period[("after", None)].get(kid), pol),
        }
        site_rows[kid] = [
            {"site": s, **_compare(period[("before", s)].get(kid), period[("after", s)].get(kid), pol)}
            for s in sites_with_data
        ]

    return {
        "tech": tech,
        "start_date": c_start.isoformat(),
        "end_date": c_end.isoformat(),
        "before": {"start": b_start.isoformat(), "end": b_end.isoformat(), "days_with_data": period[("before", None)].get("_days", 0)},
        "after": {"start": a_start.isoformat(), "end": a_end.isoformat(), "days_with_data": period[("after", None)].get("_days", 0)},
        "latest_date": latest.isoformat(),
        "threshold": THRESHOLD,
        "timestamps": timestamps,
        "bands": bands_found,
        "member_sites": sites,
        "sites_with_data": sites_with_data,
        "sites_without_data": [s for s in sites if s not in sites_with_data],
        "kpis": kpis_out,
        "site_rows": site_rows,
        "execution_time_sec": round(time.time() - t0, 3),
        "source": {"4g": "OneDb Live (measDy4g & measBdbh4g)", "2g": "OneDb Live (measDy2g)",
                   "5g": "OneDb Live (measDy5g & measBdbh5g)"}[tech],
    }
