"""4G cell map: last-day KPI, TA percentiles and weekly status per cell, keyed by siteid_ci.

KPI   : onedb measBdbh4g (PRB, user throughput) + measDy4g (max RRC user, active user), latest day
TA    : onedb measTa4g latest day, 70/80/90% distance interpolated inside the 15 distance bins
Status: twodb measRCIcell.remark_status_rci (cell), onedb measCEIweekly.remark_cell (cell),
        twodb measRCIsector."Status Final Regional" (sector, joined through the cell's "site sec type")
Each source uses its own latest date/week, which is returned so the map can label it.
"""
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, List, Optional

from .db import get_latest_data_date, get_onedb_connection, get_twodb_connection
from .queries_ta import TA_4G_BINS

logger = logging.getLogger("map_kpi")

# Distance edges (m) of the 15 measTa4g bins; the open last bin (> 10608 m) is capped for interpolation
TA_EDGES_M = [0, 78, 234, 390, 546, 702, 858, 1014, 1560, 2106, 2652, 3198, 4212, 6708, 10608, 15000]
TA_PERCENTILES = (70, 80, 90)


def _f(v) -> Optional[float]:
    try:
        return None if v is None else float(v)
    except (TypeError, ValueError):
        return None


def _r(v, nd=2) -> Optional[float]:
    v = _f(v)
    return None if v is None else round(v, nd)


def ta_percentile_m(counts: List[float], pct: float) -> Optional[float]:
    """Distance (m) under which `pct`% of the TA samples fall, linear inside the bin that crosses it."""
    total = sum(counts)
    if total <= 0:
        return None
    target = total * pct / 100.0
    cum = 0.0
    for i, c in enumerate(counts):
        if c > 0 and cum + c >= target:
            lo, hi = TA_EDGES_M[i], TA_EDGES_M[i + 1]
            return round(lo + (hi - lo) * (target - cum) / c)
        cum += c
    return float(TA_EDGES_M[-1])


def _onedb_kpi(site_ids: List[str]) -> Dict[str, Any]:
    out: Dict[str, Any] = {"kpi": {}, "ta": {}, "cei": {}, "kpi_date": None, "ta_date": None, "cei_week": None}
    conn = get_onedb_connection(timeout=15)
    if not conn:
        out["error"] = "OneDb is not reachable."
        return out
    kpi_day = get_latest_data_date("onedb", "measBdbh4g")
    ta_day = get_latest_data_date("onedb", "measTa4g")
    out["kpi_date"] = kpi_day.strftime("%Y-%m-%d")
    out["ta_date"] = ta_day.strftime("%Y-%m-%d")
    bins = ", ".join(f'(COALESCE(t."{b["col1"]}", 0) + COALESCE(t."{b["col2"]}", 0))' for b in TA_4G_BINS)
    try:
        cur = conn.cursor()
        # Cells of the requested sites: siteid_ci <-> (eNodeBId, cellId)
        cur.execute("""
            SELECT DISTINCT ON (siteid_ci) siteid_ci, enodeb_id, ci
            FROM "CellListRCI" WHERE site_id = ANY(%s) AND enodeb_id IS NOT NULL AND ci IS NOT NULL
        """, (site_ids,))
        cell_rows = cur.fetchall()
        key_of = {(int(e), int(c)): sc for sc, e, c in cell_rows}
        enbs = sorted({int(e) for _, e, _ in cell_rows})

        if enbs:
            cur.execute("""
                SELECT b."eNodeBId", b."cellId",
                       b."DL PRB Utilization Num AMQ" / NULLIF(b."DL PRB Utilization Denum AMQ", 0) * 100,
                       b."UL PRB Utilization Num AMQ" / NULLIF(b."UL PRB Utilization Denum AMQ", 0) * 100,
                       b."User DL Throughput Num AMQ" / NULLIF(b."User DL Throughput Denum AMQ", 0) / 1000.0,
                       b."User UL Throughput Num AMQ" / NULLIF(b."User UL Throughput Denum AMQ", 0) / 1000.0
                FROM "measBdbh4g" b
                WHERE b."Begin Time" = %s AND b."eNodeBId" = ANY(%s)
            """, (kpi_day, enbs))
            for e, c, dl_prb, ul_prb, dl_thp, ul_thp in cur.fetchall():
                key = key_of.get((int(e), int(c)))
                if key:
                    out["kpi"][key] = {"dl_prb": _r(dl_prb), "ul_prb": _r(ul_prb),
                                       "dl_thp": _r(dl_thp), "ul_thp": _r(ul_thp)}

            cur.execute("""
                SELECT d."eNodeBId", d."cellId", d."Maximum Number of RRC Connection User(unit)",
                       d."New Active Users rnp_Ono"
                FROM "measDy4g" d
                WHERE d."Begin Time" = %s AND d."eNodeBId" = ANY(%s)
            """, (kpi_day, enbs))
            for e, c, rrc, active in cur.fetchall():
                key = key_of.get((int(e), int(c)))
                if key:
                    out["kpi"].setdefault(key, {}).update(max_rrc=_r(rrc, 0), active_user=_r(active, 1))

            cur.execute(f"""
                SELECT t."eNodeBId", t."cellId", {bins}
                FROM "measTa4g" t
                WHERE t."Begin Time" = %s AND t."eNodeBId" = ANY(%s)
            """, (ta_day, enbs))
            for row in cur.fetchall():
                key = key_of.get((int(row[0]), int(row[1])))
                if not key:
                    continue
                counts = [_f(x) or 0.0 for x in row[2:17]]
                out["ta"][key] = {f"ta{p}": ta_percentile_m(counts, p) for p in TA_PERCENTILES}
                out["ta"][key]["samples"] = int(sum(counts))

        # CEI: latest week of these sites (site_id is indexed, weeknum is not)
        cur.execute("""
            WITH s AS (SELECT weeknum, "SiteID_CI", remark_cell FROM "measCEIweekly" WHERE site_id = ANY(%s))
            SELECT weeknum, "SiteID_CI", remark_cell FROM s WHERE weeknum = (SELECT MAX(weeknum) FROM s)
        """, (site_ids,))
        for week, sc, remark in cur.fetchall():
            out["cei_week"] = int(week) if week is not None else None
            out["cei"][sc] = remark
        cur.close()
    except Exception as e:
        logger.error(f"map kpi onedb error: {e}")
        out["error"] = str(e)
    finally:
        conn.close()
    return out


def _twodb_status(site_ids: List[str]) -> Dict[str, Any]:
    out: Dict[str, Any] = {"rci": {}, "unbalance": {}, "rci_week": None, "unbalance_week": None}
    conn = get_twodb_connection(timeout=15)
    if not conn:
        out["error"] = "TwoDb is not reachable."
        return out
    try:
        cur = conn.cursor()
        cur.execute("""
            WITH s AS (SELECT week, "site ci", "site sec type", remark_status_rci
                       FROM "measRCIcell" WHERE site_id = ANY(%s))
            SELECT week, "site ci", "site sec type", remark_status_rci FROM s WHERE week = (SELECT MAX(week) FROM s)
        """, (site_ids,))
        sec_type_of = {}
        for week, sc, sec_type, status in cur.fetchall():
            out["rci_week"] = int(week) if week is not None else None
            out["rci"][sc] = status
            sec_type_of[sc] = sec_type

        cur.execute("""
            WITH s AS (SELECT week, "site sec type", "Status Final Regional"
                       FROM "measRCIsector" WHERE site_id = ANY(%s))
            SELECT week, "site sec type", "Status Final Regional" FROM s WHERE week = (SELECT MAX(week) FROM s)
        """, (site_ids,))
        by_sector = {}
        for week, sec_type, status in cur.fetchall():
            out["unbalance_week"] = int(week) if week is not None else None
            by_sector[sec_type] = status
        # Sector status is copied to each of its cells so the map can look it up by siteid_ci
        out["unbalance"] = {sc: by_sector[st] for sc, st in sec_type_of.items() if st in by_sector}
        cur.close()
    except Exception as e:
        logger.error(f"map status twodb error: {e}")
        out["error"] = str(e)
    finally:
        conn.close()
    return out


def get_map_kpi(site_ids: List[str]) -> Dict[str, Any]:
    ids = sorted({s.strip().upper() for s in site_ids if s and s.strip()})[:20]
    with ThreadPoolExecutor(max_workers=2) as pool:  # the two databases are independent
        f_one, f_two = pool.submit(_onedb_kpi, ids), pool.submit(_twodb_status, ids)
        one, two = f_one.result(), f_two.result()
    cells: Dict[str, Dict[str, Any]] = {}
    for src in (one["kpi"], one["ta"]):
        for sc, vals in src.items():
            cells.setdefault(sc, {}).update(vals)
    for name, src in (("cei", one["cei"]), ("rci", two["rci"]), ("unbalance", two["unbalance"])):
        for sc, v in src.items():
            cells.setdefault(sc, {})[name] = v
    errors = [e for e in (one.get("error"), two.get("error")) if e]
    result = {
        "site_ids": ids,
        "kpi_date": one["kpi_date"],
        "ta_date": one["ta_date"],
        "cei_week": one["cei_week"],
        "rci_week": two["rci_week"],
        "unbalance_week": two["unbalance_week"],
        "cells": cells,
    }
    if errors:  # partial data is still returned, but the result cache skips responses with an error
        result["error"] = "; ".join(errors)
    return result
