"""
OKR > CEI: weekly CEI (Customer Experience Index) report for Region Sulawesi.

Sources
  onedb "measCEIweekly"   1 row per 4G cell per CEI week (YYYYWW, Friday to Thursday), remark_cell Good_cell / Bad_cell
  onedb "LookupSITEID"    site_id -> NOP
  onedb "measBdbh4g"      busy-hour DL user throughput per cell (throughput distribution)
  twodb "ceiKQI_daily_site" daily KQI summary per site, built from "ceiKQI_v2" by the sync task
                            (Akses/Schedjuler/cei_kqi, thresholds below must match ceikqi_daily_site.sql)

Scope filter: All, or NOP / Kabupaten / Kecamatan resolved to a site_id list from the latest CEI week
(kecamatan values are "KABUPATEN|KECAMATAN" because kecamatan names repeat across kabupaten).

Definitions (checked against the W43 2026 weekly report)
  KQI fail (weekly)  bad cells whose latest_week_only_<kqi>_hit_count > 0
  Most KQI           KQI with the highest hit count of a bad cell, Game Jitter excluded; ties go to the first of
                     MOST_KQI_ORDER
  Demarcation        category_l2 grouped per team (DEMARCATION)
  Bad cell cohort    week the current run of consecutive bad weeks of the cell started
  Cell status        cells bad at least once this year, by status in the last 3 weeks (STATUS_RULES)
  KQI fail (daily)   cells over the busy-hour threshold (VoIP Qual: under the threshold); Web RTT is client side
"""
import time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from .cei_store import list_events, list_targets, target_for, week_start
from .db import get_onedb_connection, get_twodb_connection
from .queries_scope_4g import get_scope_aggregation_data

T = '"measCEIweekly"'

# key, label, unit, BH threshold, fail direction, weekly hit-count column
KQIS = [
    ("vdl", "VoIP DL Qual", "", 178.98, "below", "latest_week_only_voip_udp_downlink_jitter_ms_hit_count"),
    ("vul", "VoIP UL Qual", "", 179.67, "below", "latest_week_only_voip_udp_uplink_jitter_ms_hit_count"),
    ("gj", "Game UL Jitter", "ms", 85.26, "above", "latest_week_only_gamemax_udp_uplink_jitter_ms_hit_count"),
    ("vsd", "Video Start Delay", "s", 4.0, "above", "latest_week_only_streaming_video_streaming_xkb_start_delay_s_hi"),
    ("wrtt", "Web Browsing RTT", "ms", 526.6, "above", "latest_week_only_web_browsing_client_side_round_trip_time_ms_hi"),
    ("grtt", "Game RTT", "ms", 111.49, "above", "latest_week_only_gamemax_client_side_round_trip_time_ms_hit_cou"),
    ("wulr", "Web UL Retrans", "%", 10.46, "above", "latest_week_only_web_browsing_ul_retransmitted_packet_rate_hit_"),
]
KQI_COL = {k[0]: k[5] for k in KQIS}
MOST_KQI_ORDER = ["grtt", "wulr", "vsd", "vdl", "vul", "wrtt", "gj"]

# team, label, category_l2 values
DEMARCATION = [
    ("Engineering Team", "RCI Investment", ["RCI"]),
    ("Engineering Team", "RedCov Engineering", ["Red Coverage"]),
    ("Operational Team", "Packet Loss", ["TWAMP"]),
    ("Operational Team", "Availability", ["Self Flicker", "Face to Face Availability"]),
    ("Quality Team", "Capacity (non investment)", ["PRB Balance"]),
    ("Quality Team", "Weak Coverage", ["Weak Coverage"]),
    ("Quality Team", "Unbalance", ["PRB Imbalance"]),
    ("Quality Team", "HO Issue", ["Inter/Intra HO"]),
    ("Quality Team", "Strong Overlap", ["CQI", "CSSR", "SDR"]),
]
STATUS_ORDER = ["Consecutive Good", "Consecutive Bad", "New Bad", "New Good", "Flip Flop"]
STATUS_RULES = (
    "Cells bad at least once since week 1 of the year, by status in the last 3 weeks (missing = good): "
    "good-bad-good or bad-good-bad = Flip Flop; otherwise last 2 weeks bad-bad = Consecutive Bad, "
    "good-good = Consecutive Good, good-bad = New Bad, bad-good = New Good."
)
THP_BINS = [0.5, 1, 2, 3, 5, 7, 10, 20, 30]
THP_LABELS = ["0-0.5", "0.5-1", "1-2", "2-3", "3-5", "5-7", "7-10", "10-20", "20-30", ">30"]

_BAD = "remark_cell = 'Bad_cell'"
_HITS = ", ".join(f"coalesce({col}, 0) AS h_{key}" for key, *_, col in KQIS)
_GREATEST = "greatest(" + ", ".join(f"h_{k}" for k in MOST_KQI_ORDER) + ")"
_MOST = "CASE " + " ".join(f"WHEN h_{k} = {_GREATEST} THEN '{k}'" for k in MOST_KQI_ORDER) + " END"
_DEMARC = "CASE " + " ".join(
    "WHEN category_l2 IN (" + ", ".join(f"'{v}'" for v in values) + f") THEN '{label}'"
    for _, label, values in DEMARCATION) + " ELSE 'Others' END"
_BASE = f"SELECT weeknum, cgisai, kabupaten, site_id, category_l2, {_BAD} AS bad, {_HITS} FROM {T}"


def _onedb(sql: str, params=()) -> List[tuple]:
    conn = get_onedb_connection(timeout=15)
    if not conn:
        raise RuntimeError("OneDb is not reachable.")
    try:
        cur = conn.cursor()
        cur.execute(sql, params)
        return cur.fetchall()
    finally:
        conn.close()


def _twodb(sql: str, params=()) -> List[tuple]:
    conn = get_twodb_connection(timeout=15)
    if not conn:
        raise RuntimeError("TwoDb is not reachable.")
    try:
        cur = conn.cursor()
        cur.execute(sql, params)
        return cur.fetchall()
    finally:
        conn.close()


_HIER_CACHE: Dict[str, Any] = {}
_HIER_TTL_SEC = 600


def _site_rows() -> List[tuple]:
    """(site_id, nop, kabupaten, kecamatan) of the latest CEI week, cached 10 minutes."""
    hit = _HIER_CACHE.get("rows")
    if hit and time.time() - hit[0] < _HIER_TTL_SEC:
        return hit[1]
    rows = _onedb(f"""
        WITH l AS (SELECT DISTINCT ON ("Prefix Site ID") "Prefix Site ID" AS p, "NOP" FROM "LookupSITEID" ORDER BY 1, 2)
        SELECT DISTINCT m.site_id, coalesce(l."NOP", 'UNIDENTIFIED'), coalesce(m.kabupaten, 'UNIDENTIFIED'),
               coalesce(m.kecamatan, 'UNIDENTIFIED')
        FROM {T} m LEFT JOIN l ON l.p = m.site_id
        WHERE m.weeknum = (SELECT max(weeknum) FROM {T}) AND m.site_id IS NOT NULL""")
    _HIER_CACHE["rows"] = (time.time(), rows)
    return rows


def get_cei_hierarchy() -> Dict[str, Any]:
    """NOP -> kabupaten -> kecamatan options taken from the CEI data itself."""
    kab_by_nop, kec_by_kab = defaultdict(set), defaultdict(set)
    for _, nop, kab, kec in _site_rows():
        kab_by_nop[nop].add(kab)
        kec_by_kab[kab].add(kec)
    return {
        "nops": sorted(kab_by_nop),
        "kabupaten_by_nop": {n: sorted(k) for n, k in kab_by_nop.items()},
        "kecamatan_by_kab": {k: sorted(v) for k, v in kec_by_kab.items()},
    }


def scope_sites(scope: Optional[str], values: Optional[List[str]]) -> Optional[List[str]]:
    """Site ids of the chosen NOP / Kabupaten / Kecamatan, or None for All."""
    scope = (scope or "all").lower()
    if scope == "all":
        return None
    if scope not in ("nop", "kabupaten", "kecamatan"):
        raise ValueError(f"Unknown scope: {scope}")
    wanted = {str(v).strip().upper() for v in values or [] if str(v).strip()}
    if not wanted:
        raise ValueError(f"Choose at least one {scope}.")
    key = {"nop": lambda r: r[1], "kabupaten": lambda r: r[2], "kecamatan": lambda r: f"{r[2]}|{r[3]}"}[scope]
    sites = sorted({r[0] for r in _site_rows() if str(key(r)).upper() in wanted})
    if not sites:
        raise ValueError(f"No CEI site found for {scope}: {', '.join(sorted(wanted))}")
    return sites


def _sf(sites: Optional[List[str]], alias: str = ""):
    """SQL filter and params for a site list (nothing for All)."""
    return (f" AND {alias}site_id = ANY(%s)", [sites]) if sites else ("", [])


def _shift(week: int, n: int) -> int:
    """Week n weeks before/after `week`, staying inside the same year (CEI data is per year)."""
    year, num = divmod(week, 100)
    return year * 100 + max(1, num + n)


def kqi_meta() -> List[Dict[str, Any]]:
    return [{"key": k, "label": l, "unit": u, "threshold": th, "direction": d} for k, l, u, th, d, _ in KQIS]


def get_cei_weeks() -> Dict[str, Any]:
    rows = _onedb(f"""
        WITH RECURSIVE w AS (
            SELECT min(weeknum) AS v FROM {T}
            UNION ALL SELECT (SELECT min(weeknum) FROM {T} WHERE weeknum > w.v) FROM w WHERE w.v IS NOT NULL)
        SELECT v FROM w WHERE v IS NOT NULL ORDER BY v""")
    weeks = [r[0] for r in rows]
    return {"weeks": weeks, "latest": weeks[-1] if weeks else None}


# ---------------------------------------------------------------------------
# Weekly report (slides 1-3)
# ---------------------------------------------------------------------------
def _trend(week: int, sites=None) -> List[Dict[str, Any]]:
    first = (week // 100) * 100 + 1
    f, p = _sf(sites)
    fails = ", ".join(f"count(*) FILTER (WHERE bad AND h_{k} > 0)" for k, *_ in KQIS)
    most = ", ".join(f"count(*) FILTER (WHERE bad AND most = '{k}')" for k in MOST_KQI_ORDER)
    rows = _onedb(f"""
        SELECT weeknum, count(*), count(*) FILTER (WHERE bad), {fails}, {most}
        FROM (SELECT b.*, {_MOST} AS most FROM ({_BASE} WHERE weeknum BETWEEN %s AND %s{f}) b) s
        GROUP BY 1 ORDER BY 1""", (first, week, *p))
    out = []
    n = len(KQIS)
    for r in rows:
        total, bad = r[1], r[2]
        out.append({
            "week": r[0], "total": total, "bad": bad, "good": total - bad,
            "good_pct": round(100.0 * (total - bad) / total, 3) if total else None,
            "kqi_fail": {k: r[3 + i] for i, (k, *_) in enumerate(KQIS)},
            "most_kqi": {k: r[3 + n + i] for i, k in enumerate(MOST_KQI_ORDER)},
        })
    return out


def _nop(week: int, sites=None) -> List[Dict[str, Any]]:
    f, p = _sf(sites, "m.")
    rows = _onedb(f"""
        WITH l AS (SELECT DISTINCT ON ("Prefix Site ID") "Prefix Site ID" AS p, "NOP" FROM "LookupSITEID" ORDER BY 1, 2)
        SELECT coalesce(l."NOP", 'UNIDENTIFIED'), count(*) FILTER (WHERE m.{_BAD}), count(*)
        FROM {T} m LEFT JOIN l ON l.p = m.site_id WHERE m.weeknum = %s{f} GROUP BY 1 ORDER BY 1""", (week, *p))
    return [{"nop": r[0], "bad": r[1], "good": r[2] - r[1], "total": r[2],
             "bad_pct": round(100.0 * r[1] / r[2], 2) if r[2] else None} for r in rows]


def _profiling(week: int, sites=None) -> List[Dict[str, Any]]:
    f, p = _sf(sites)
    n_fail = " + ".join(f"(h_{k} > 0)::int" for k, *_ in KQIS)
    rows = _onedb(f"SELECT {n_fail}, count(*) FROM ({_BASE} WHERE weeknum = %s AND {_BAD}{f}) b GROUP BY 1 ORDER BY 1",
                  (week, *p))
    return [{"kqi_count": r[0], "cells": r[1]} for r in rows]


def _bad_cells_by_kab(prev: int, week: int, sites=None) -> List[tuple]:
    f, p = _sf(sites)
    return _onedb(f"""
        SELECT weeknum, coalesce(kabupaten, 'UNIDENTIFIED'), most, demarc, count(*)
        FROM (SELECT b.*, {_MOST} AS most, {_DEMARC} AS demarc FROM ({_BASE} WHERE weeknum IN (%s, %s) AND {_BAD}{f}) b) s
        GROUP BY 1, 2, 3, 4""", (prev, week, *p))


def _kab_and_demarcation(prev: int, week: int, sites=None):
    rows = _bad_cells_by_kab(prev, week, sites)
    bad = defaultdict(lambda: [0, 0])
    most = defaultdict(Counter)
    demarc_kab = defaultdict(Counter)
    demarc = defaultdict(lambda: [0, 0])
    for wk, kab, mk, dm, n in rows:
        i = 1 if wk == week else 0
        bad[kab][i] += n
        demarc[dm][i] += n
        if i:
            most[kab][mk] += n
            demarc_kab[kab][dm] += n
    label = {k: l for k, l, *_ in KQIS}
    kabs = []
    for kab, (b0, b1) in bad.items():
        kabs.append({
            "kabupaten": kab, "bad_prev": b0, "bad": b1, "delta": b1 - b0,
            "growth_pct": round(100.0 * (b1 - b0) / b0, 2) if b0 else None,
            "most_kqi": label.get(most[kab].most_common(1)[0][0]) if most[kab] else None,
            "top_demarcation": demarc_kab[kab].most_common(1)[0][0] if demarc_kab[kab] else None,
            "demarcations": dict(demarc_kab[kab]),
        })
    kabs.sort(key=lambda r: (-r["delta"], -r["bad"]))
    demarcation = [{"team": team, "label": lab, "prev": demarc[lab][0], "cur": demarc[lab][1]}
                   for team, lab, _ in DEMARCATION]
    if demarc.get("Others") and any(demarc["Others"]):
        demarcation.append({"team": "Others", "label": "Others", "prev": demarc["Others"][0], "cur": demarc["Others"][1]})
    return kabs, demarcation


def _cohort(week: int, sites=None) -> Dict[str, Any]:
    """Bad cells of the last 15 weeks stacked by the week their current bad run started."""
    first = (week // 100) * 100 + 1
    show_from, base = _shift(week, -14), _shift(week, -10)
    f, p = _sf(sites)
    rows = _onedb(f"""
        WITH b AS (SELECT cgisai, weeknum AS w, weeknum - row_number() OVER (PARTITION BY cgisai ORDER BY weeknum) AS g
                   FROM {T} WHERE {_BAD} AND weeknum BETWEEN %s AND %s{f}),
             s AS (SELECT w, min(w) OVER (PARTITION BY cgisai, g) AS st FROM b)
        SELECT w, CASE WHEN st < %s THEN 0 ELSE st END, count(*) FROM s WHERE w >= %s GROUP BY 1, 2 ORDER BY 1, 2""",
                   (first, week, *p, base, show_from))
    weeks = sorted({r[0] for r in rows})
    starts = sorted({r[1] for r in rows})
    cells = {(r[0], r[1]): r[2] for r in rows}
    series = [{"start": s, "label": f"<{base}" if s == 0 else str(s),
               "values": [cells.get((w, s), 0) for w in weeks]} for s in starts]
    return {"weeks": weeks, "series": series, "carry_over_label": f"<{base}"}


def _status(week: int, sites=None) -> Dict[str, Any]:
    first = (week // 100) * 100 + 1
    w0, w1 = _shift(week, -2), _shift(week, -1)
    f, p = _sf(sites)
    rows = _onedb(f"""
        SELECT a, b, c, count(*) FROM (
            SELECT cgisai,
                   bool_or(weeknum = %s AND {_BAD}) AS a, bool_or(weeknum = %s AND {_BAD}) AS b,
                   bool_or(weeknum = %s AND {_BAD}) AS c, bool_or(weeknum = %s) AS has_c
            FROM {T} WHERE weeknum BETWEEN %s AND %s{f} GROUP BY 1 HAVING bool_or({_BAD})) x
        WHERE has_c GROUP BY 1, 2, 3""", (w0, w1, week, week, first, week, *p))
    counts = Counter()
    for a, b, c, n in rows:
        if (a, b, c) in ((False, True, False), (True, False, True)):
            counts["Flip Flop"] += n
        elif b and c:
            counts["Consecutive Bad"] += n
        elif not b and not c:
            counts["Consecutive Good"] += n
        elif c:
            counts["New Bad"] += n
        else:
            counts["New Good"] += n
    total = sum(counts.values())
    return {"weeks": [w0, w1, week], "total": total, "rules": STATUS_RULES,
            "items": [{"status": s, "cells": counts[s], "pct": round(100.0 * counts[s] / total, 1) if total else 0}
                      for s in STATUS_ORDER]}


def get_cei_weekly(week: Optional[int] = None, scope: str = "all", values: Optional[List[str]] = None) -> Dict[str, Any]:
    t0 = time.time()
    week = int(week or get_cei_weeks()["latest"])
    prev = _shift(week, -1)
    sites = scope_sites(scope, values)
    with ThreadPoolExecutor(max_workers=6) as pool:
        f_trend = pool.submit(_trend, week, sites)
        f_nop = pool.submit(_nop, week, sites)
        f_prof = pool.submit(_profiling, week, sites)
        f_kab = pool.submit(_kab_and_demarcation, prev, week, sites)
        f_cohort = pool.submit(_cohort, week, sites)
        f_status = pool.submit(_status, week, sites)
        targets = list_targets()
        events = [e for e in list_events() if e["kind"] == "weekly"]
        trend = f_trend.result()
        kabs, demarcation = f_kab.result()
        result = {
            "week": week, "prev_week": prev, "scope": scope, "values": values or [],
            "week_start": week_start(week).isoformat(), "week_end": (week_start(week) + timedelta(days=6)).isoformat(),
            "kqis": kqi_meta(), "most_kqi_order": MOST_KQI_ORDER,
            "trend": trend, "nop": f_nop.result(), "profiling": f_prof.result(),
            "kabupaten": kabs, "demarcation": demarcation,
            "cohort": f_cohort.result(), "status": f_status.result(),
            "targets": targets, "events": events,
        }
    for t in trend:
        t["target_pct"] = target_for(t["week"], targets)
    result["execution_time_sec"] = round(time.time() - t0, 2)
    return result


def get_cei_throughput(week: int, scope: str = "all", values: Optional[List[str]] = None) -> Dict[str, Any]:
    """DL user throughput of the week (busy hour, Σnum/Σdenum per cell) binned, Bad vs Good cells."""
    t0 = time.time()
    week = int(week)
    start = week_start(week)
    f, p = _sf(scope_sites(scope, values), "m.")
    rows = _onedb(f"""
        WITH t AS (SELECT "eNodeBId" AS e, "cellId" AS c,
                          sum("User DL Throughput Num AMQ") / nullif(sum("User DL Throughput Denum AMQ"), 0) / 1000.0 AS thp
                   FROM "measBdbh4g" WHERE "Begin Time" >= %s AND "Begin Time" < %s GROUP BY 1, 2)
        SELECT width_bucket(t.thp, %s::float8[]), count(*) FILTER (WHERE m.{_BAD}), count(*) FILTER (WHERE NOT m.{_BAD})
        FROM {T} m JOIN t ON t.e = m."EnodeB ID" AND t.c = m."CI"
        WHERE m.weeknum = %s AND t.thp IS NOT NULL{f} GROUP BY 1""",
                   (start, start + timedelta(days=7), THP_BINS, week, *p))
    bins = {r[0]: (r[1], r[2]) for r in rows}
    return {
        "week": week, "start": start.isoformat(), "end": (start + timedelta(days=6)).isoformat(),
        "bins": THP_LABELS,
        "bad": [bins.get(i, (0, 0))[0] for i in range(len(THP_LABELS))],
        "good": [bins.get(i, (0, 0))[1] for i in range(len(THP_LABELS))],
        "execution_time_sec": round(time.time() - t0, 2),
    }


# ---------------------------------------------------------------------------
# Daily KQI (slide 4) and contributor trends (slide 3)
# ---------------------------------------------------------------------------
def _daily_rows(start: str, end: str, sites=None, kabupatens: Optional[List[str]] = None) -> List[tuple]:
    """Daily KQI sums per kabupaten (when given) or for the whole scope (entity 'ALL')."""
    sums = ", ".join(f"sum({k}_n), sum({k}_sum), sum({k}_fail)" for k, *_ in KQIS)
    f, p = _sf(sites)
    key, kf, kp = ("kabupaten", " AND kabupaten = ANY(%s)", [kabupatens]) if kabupatens else ("'ALL'", "", [])
    return _twodb(f"""SELECT datedd, {key}, sum(cells), {sums} FROM "ceiKQI_daily_site"
                      WHERE datedd BETWEEN %s AND %s{kf}{f} GROUP BY 1, 2 ORDER BY 1""", (start, end, *kp, *p))


def _daily_series(rows: List[tuple], dates: List[str]):
    """{entity: {kqi: {'avg': [...], 'fail': [...]}}} aligned to `dates`."""
    by = defaultdict(dict)
    for r in rows:
        by[r[1]][r[0].isoformat()] = r
    out = {}
    for ent, per_day in by.items():
        out[ent] = {}
        for i, (k, *_) in enumerate(KQIS):
            avg, fail = [], []
            for d in dates:
                r = per_day.get(d)
                n, s, f = (r[3 + 3 * i], r[4 + 3 * i], r[5 + 3 * i]) if r else (None, None, None)
                avg.append(round(s / n, 3) if n else None)
                fail.append(f if r else None)
            out[ent][k] = {"avg": avg, "fail": fail}
    return out


def _latest_daily() -> date:
    return _twodb('SELECT max(datedd) FROM "ceiKQI_daily_site"')[0][0]


def get_cei_daily(start_date: Optional[str] = None, end_date: Optional[str] = None,
                  scope: str = "all", values: Optional[List[str]] = None) -> Dict[str, Any]:
    t0 = time.time()
    sites = scope_sites(scope, values)
    latest = _latest_daily()
    end = date.fromisoformat(end_date) if end_date else latest
    start = date.fromisoformat(start_date) if start_date else end - timedelta(days=183)
    dates = [(start + timedelta(days=i)).isoformat() for i in range((end - start).days + 1)]
    series = _daily_series(_daily_rows(start.isoformat(), end.isoformat(), sites), dates)
    return {
        "start_date": start.isoformat(), "end_date": end.isoformat(), "latest": latest.isoformat(),
        "dates": dates, "kqis": kqi_meta(), "series": series.get("ALL", {}), "scope": scope, "values": values or [],
        "events": [e for e in list_events() if e["kind"] == "daily"],
        "execution_time_sec": round(time.time() - t0, 2),
    }


def get_cei_contributors(week: int, top_n: int = 5, scope: str = "all",
                         values: Optional[List[str]] = None) -> Dict[str, Any]:
    """WoW comparison tables: 7 KQI Comparison Table & Kabupaten Level Comparison Table."""
    t0 = time.time()
    week = int(week)
    prev = _shift(week, -1)
    target = target_for(week, list_targets())
    sites = scope_sites(scope, values)
    f, p = _sf(sites, "m.")

    sql = f"""
    WITH l AS (SELECT DISTINCT ON ("Prefix Site ID") "Prefix Site ID" AS p, coalesce("Branch", 'UNIDENTIFIED') as branch
               FROM "LookupSITEID" ORDER BY 1, 2)
    SELECT 
        coalesce(l.branch, 'UNIDENTIFIED') as branch,
        coalesce(m.kabupaten, 'UNIDENTIFIED') as kab,
        coalesce(m.kecamatan, 'UNIDENTIFIED') as kec,
        m.weeknum,
        count(*) as total,
        count(*) FILTER (WHERE m.remark_cell = 'Good_cell') as good,
        count(*) FILTER (WHERE coalesce(m.latest_week_only_web_browsing_client_side_round_trip_time_ms_hi, 0) > 0) as wrtt,
        count(*) FILTER (WHERE coalesce(m.latest_week_only_web_browsing_ul_retransmitted_packet_rate_hit_, 0) > 0) as wulr,
        count(*) FILTER (WHERE coalesce(m.latest_week_only_streaming_video_streaming_xkb_start_delay_s_hi, 0) > 0) as vsd,
        count(*) FILTER (WHERE coalesce(m.latest_week_only_voip_udp_uplink_jitter_ms_hit_count, 0) > 0) as vul,
        count(*) FILTER (WHERE coalesce(m.latest_week_only_voip_udp_downlink_jitter_ms_hit_count, 0) > 0) as vdl,
        count(*) FILTER (WHERE coalesce(m.latest_week_only_gamemax_client_side_round_trip_time_ms_hit_cou, 0) > 0) as grtt,
        count(*) FILTER (WHERE coalesce(m.latest_week_only_gamemax_udp_uplink_jitter_ms_hit_count, 0) > 0) as gj
    FROM "measCEIweekly" m
    LEFT JOIN l ON l.p = m.site_id
    WHERE m.weeknum IN (%s, %s){f}
    GROUP BY 1, 2, 3, 4
    """
    rows = _onedb(sql, (prev, week, *p))

    kab_by_branch = defaultdict(set)
    kec_by_kab = defaultdict(set)
    row_dicts = []
    for r in rows:
        b, kab, kec = r[0], r[1], r[2]
        if b != "UNIDENTIFIED":
            kab_by_branch[b].add(kab)
        if kab != "UNIDENTIFIED":
            kec_by_kab[kab].add(kec)
        row_dicts.append({
            "branch": b, "kabupaten": kab, "kecamatan": kec, "week": r[3],
            "total": r[4], "good": r[5],
            "wrtt": r[6], "wulr": r[7], "vsd": r[8], "vul": r[9], "vdl": r[10], "grtt": r[11], "gj": r[12]
        })

    branches = sorted(kab_by_branch.keys())
    return {
        "week": week,
        "prev_week": prev,
        "target": target,
        "branches": branches,
        "kabupaten_by_branch": {b: sorted(ks) for b, ks in sorted(kab_by_branch.items())},
        "kecamatan_by_kabupaten": {k: sorted(ks) for k, ks in sorted(kec_by_kab.items())},
        "rows": row_dicts,
        "execution_time_sec": round(time.time() - t0, 2),
    }
