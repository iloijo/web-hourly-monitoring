"""
Crowdsource query functions for OKR > Crowdsource (OpenSignal + Ookla).

Data sources:
  measONX          OpenSignal (lvl: 'Nation', 'Area', 'Region', 'Kabupaten')
  measOoklaRegion  Ookla (level: 'nation', 'area', 'region')
  measOoklaCity    Ookla (level: 'kabupaten')
  raw_desiqa       Centroids for Sulawesi sites
  netpulse_crowd_target & netpulse_crowd_manual (via crowd_store)
"""
import re
import time
from typing import Any, Dict, List, Optional, Set, Tuple

from .db import get_onedb_connection
from . import crowd_store

_KAB_ALIAS = {
    "PANGKAJENEDANKEPULAUAN": "PANGKAJENEKEPULAUAN",
    "MAMUJUUTARA": "PASANGKAYU",
    "POHUWATO": "PAHUWATO",
    "SIAUTAGULANDANGBIARO": "KEPULAUANSIAUTAGULANDANGBIARO",
}

def _conn():
    """onedb connection or a clear error (get_onedb_connection returns None when unreachable)."""
    conn = get_onedb_connection()
    if conn is None:
        raise RuntimeError("onedb is unreachable (connection failed)")
    return conn


# OpenSignal renamed 5G Availability: 'timeon_5g' up to 202641, 'availability_5g' from 202642.
# Rows of the old name are mapped to the new one so history counts 16 KPIs every week.
_ONX_METRIC_RENAME = {"timeon_5g": "availability_5g"}


def _normalize_onx(rows: List[tuple], metric_idx: int) -> List[tuple]:
    """Rename legacy ONX metrics; when both names exist for the same row key, keep the new one."""
    seen = set()
    for r in rows:
        if r[metric_idx] in _ONX_METRIC_RENAME.values():
            seen.add(r[:metric_idx] + r[metric_idx + 1:metric_idx + 2])
    out = []
    for r in rows:
        new = _ONX_METRIC_RENAME.get(r[metric_idx])
        if new is None:
            out.append(r)
            continue
        key = r[:metric_idx] + r[metric_idx + 1:metric_idx + 2]
        if key in seen:
            continue
        out.append(r[:metric_idx] + (new,) + r[metric_idx + 1:])
    return out


def kab_key(name: str) -> str:
    """Join key for kabupaten names: upper case, letters only, then alias."""
    k = re.sub(r"[^A-Z]", "", (name or "").upper())
    return _KAB_ALIAS.get(k, k)

COMPETITORS_ONX = {"Indosat": "IOH", "XL": "XLSMART"}
OPERATOR_LABEL = {
    "Telkomsel": "TSEL",
    "Indosat": "IOH",
    "IOH": "IOH",
    "IM3 Ooredoo": "IOH",
    "XL": "XLSMART",
    "XLSMART": "XLSMART",
    "3": "3",
    "Smartfren": "Smartfren",
}

KPI_CATALOG: List[Dict[str, Any]] = [
    # ---------------- OpenSignal (measONX.metric) ----------------
    {"key": "onx_video_all",  "source": "ONX", "tech": "overall", "label": "Video Experience",        "db": "videoexperience_overall",   "unit": "pts",  "in_target": True,  "manual": False},
    {"key": "onx_games_all",  "source": "ONX", "tech": "overall", "label": "Games Experience",        "db": "gamesexperience_overall",   "unit": "pts",  "in_target": True,  "manual": False},
    {"key": "onx_voice_all",  "source": "ONX", "tech": "overall", "label": "Voice App Experience",    "db": "voiceexperience_overall",   "unit": "pts",  "in_target": True,  "manual": False},
    {"key": "onx_dl_all",     "source": "ONX", "tech": "overall", "label": "Download Speed",          "db": "download_overall",          "unit": "Mbps", "in_target": True,  "manual": False},
    {"key": "onx_ul_all",     "source": "ONX", "tech": "overall", "label": "Upload Speed",            "db": "upload_overall",            "unit": "Mbps", "in_target": True,  "manual": False},
    {"key": "onx_cov_all",    "source": "ONX", "tech": "overall", "label": "Coverage Experience",     "db": "onxcoveragesim_overall",    "unit": "pts",  "in_target": True,  "manual": False},
    {"key": "onx_timeon_all", "source": "ONX", "tech": "overall", "label": "Time On",                 "db": "timeon_overall",            "unit": "%",    "in_target": True,  "manual": False},
    {"key": "onx_cq_all",     "source": "ONX", "tech": "overall", "label": "Consistent Quality",      "db": "consistentquality_overall", "unit": "%",    "in_target": True,  "manual": False},
    {"key": "onx_rel_all",    "source": "ONX", "tech": "overall", "label": "Reliability Experience",  "db": "reliability_overall",       "unit": "pts",  "in_target": True,  "manual": False},
    {"key": "onx_video_5g",   "source": "ONX", "tech": "5g",      "label": "5G Video Experience",      "db": "videoexperience_5g",        "unit": "pts",  "in_target": True,  "manual": False},
    {"key": "onx_games_5g",   "source": "ONX", "tech": "5g",      "label": "5G Games Experience",      "db": "gamesexperience_5g",        "unit": "pts",  "in_target": True,  "manual": False},
    {"key": "onx_voice_5g",   "source": "ONX", "tech": "5g",      "label": "5G Voice App Experience",  "db": "voiceexperience_5g",        "unit": "pts",  "in_target": True,  "manual": False},
    {"key": "onx_dl_5g",      "source": "ONX", "tech": "5g",      "label": "5G Download Speed",        "db": "download_5g",               "unit": "Mbps", "in_target": True,  "manual": False},
    {"key": "onx_ul_5g",      "source": "ONX", "tech": "5g",      "label": "5G Upload Speed",          "db": "upload_5g",                 "unit": "Mbps", "in_target": True,  "manual": False},
    {"key": "onx_avail_5g",   "source": "ONX", "tech": "5g",      "label": "5G Availability",          "db": "availability_5g",           "unit": "%",    "in_target": True,  "manual": False},
    {"key": "onx_cov_5g",     "source": "ONX", "tech": "5g",      "label": "5G Coverage Experience",   "db": "onxcoveragesim_5g",         "unit": "pts",  "in_target": True,  "manual": False},
    # ---------------- Ookla (measOokla*.<col>_score + rank_<col>) ----------------
    {"key": "ook_conn_all",      "source": "OOKLA", "tech": "ALL", "label": "Best Mobile Network",         "db": "connectivity", "unit": "pts",    "in_target": True,  "manual": False},
    {"key": "ook_speed_all",     "source": "OOKLA", "tech": "ALL", "label": "Fastest Mobile Network",      "db": "speed",        "unit": "pts",    "in_target": True,  "manual": False},
    {"key": "ook_video_all",     "source": "OOKLA", "tech": "ALL", "label": "Video Experience",            "db": "video",        "unit": "pts",    "in_target": True,  "manual": False},
    {"key": "ook_game_all",      "source": "OOKLA", "tech": "ALL", "label": "Gaming Experience",           "db": "game",         "unit": "pts",    "in_target": True,  "manual": False},
    {"key": "ook_coverage_all",  "source": "OOKLA", "tech": "ALL", "label": "Coverage",                 "db": None,           "unit": "pts",    "in_target": True,  "manual": True},
    {"key": "ook_toprated_all",  "source": "OOKLA", "tech": "ALL", "label": "Top Rated Mobile Network", "db": None,           "unit": "rating", "in_target": True,  "manual": True},
    {"key": "ook_conn_5g",       "source": "OOKLA", "tech": "5G",  "label": "Best 5G Mobile Network",       "db": "connectivity", "unit": "pts",    "in_target": True,  "manual": False},
    {"key": "ook_speed_5g",      "source": "OOKLA", "tech": "5G",  "label": "Fastest 5G Mobile Network",    "db": "speed",        "unit": "pts",    "in_target": True,  "manual": False},
    {"key": "ook_video_5g",      "source": "OOKLA", "tech": "5G",  "label": "Best 5G Video Experience",     "db": "video",        "unit": "pts",    "in_target": True,  "manual": False},
    {"key": "ook_game_5g",       "source": "OOKLA", "tech": "5G",  "label": "Best 5G Gaming Experience",    "db": "game",         "unit": "pts",    "in_target": True,  "manual": False},
    # Extra Ookla KPIs (not in target)
    {"key": "ook_web_all",       "source": "OOKLA", "tech": "ALL", "label": "Web Browsing",                "db": "web",          "unit": "pts",    "in_target": False, "manual": False},
    {"key": "ook_web_5g",        "source": "OOKLA", "tech": "5G",  "label": "5G Web Browsing",             "db": "web",          "unit": "pts",    "in_target": False, "manual": False},
    {"key": "ook_conn_4g",       "source": "OOKLA", "tech": "4G",  "label": "Best 4G Mobile Network",      "db": "connectivity", "unit": "pts",    "in_target": False, "manual": False},
    {"key": "ook_speed_4g",      "source": "OOKLA", "tech": "4G",  "label": "Fastest 4G Mobile Network",   "db": "speed",        "unit": "pts",    "in_target": False, "manual": False},
    {"key": "ook_video_4g",      "source": "OOKLA", "tech": "4G",  "label": "Best 4G Video Experience",    "db": "video",        "unit": "pts",    "in_target": False, "manual": False},
    {"key": "ook_game_4g",       "source": "OOKLA", "tech": "4G",  "label": "Best 4G Gaming Experience",   "db": "game",         "unit": "pts",    "in_target": False, "manual": False},
    {"key": "ook_web_4g",        "source": "OOKLA", "tech": "4G",  "label": "4G Web Browsing",             "db": "web",          "unit": "pts",    "in_target": False, "manual": False},
]

KPI_BY_KEY: Dict[str, Dict[str, Any]] = {k["key"]: k for k in KPI_CATALOG}

def status_of(tsel_rank: Optional[int], other_ranks: List[Optional[int]]) -> Optional[str]:
    """WIN / DRAW / LOSE from ranks. other_ranks = ranks of ranked competitors (None ignored)."""
    if tsel_rank is None:
        return None
    if tsel_rank == 1:
        return "DRAW" if any(r == 1 for r in other_ranks if r is not None) else "WIN"
    return "LOSE"

def needed_values(source: str, tsel: Dict[str, Any], leader: Dict[str, Any]) -> Tuple[Optional[float], Optional[float]]:
    """Value Telkomsel needs to WIN (and, for ONX, to at least DRAW).
    tsel / leader = dict(value, lci, uci). Returns (needed_win, needed_draw).
    """
    if not tsel or not leader or tsel.get("value") is None or leader.get("value") is None:
        return None, None
    if source == "ONX":
        # OpenSignal: clear win needs Tsel lower bound above leader upper bound
        tsel_val = tsel["value"]
        tsel_lci = tsel.get("lci") if tsel.get("lci") is not None else tsel_val
        tsel_uci = tsel.get("uci") if tsel.get("uci") is not None else tsel_val
        leader_uci = leader.get("uci") if leader.get("uci") is not None else leader["value"]
        leader_lci = leader.get("lci") if leader.get("lci") is not None else leader["value"]

        needed_win = leader_uci + (tsel_val - tsel_lci)
        needed_draw = leader_lci - (tsel_uci - tsel_val)
        return round(needed_win, 2), round(needed_draw, 2)
    # Ookla
    return round(leader["value"] + 0.01, 2), None

# ---------------------------------------------------------------------------
# In-memory Caches
# ---------------------------------------------------------------------------
_CENTROIDS_CACHE: Optional[Dict[str, Dict[str, Any]]] = None
_CENTROIDS_TIME = 0

_ONX_KAB_NAMES_CACHE: Optional[List[str]] = None
_ONX_KAB_NAMES_TIME = 0

_DISTINCT_WEEKS_CACHE: Dict[str, Tuple[float, List[int]]] = {}


def _load_centroids() -> Dict[str, Dict[str, Any]]:
    """Returns dict of kab_key -> {kab, lat, lon, n_sites} cached 24h."""
    global _CENTROIDS_CACHE, _CENTROIDS_TIME
    now = time.time()
    if _CENTROIDS_CACHE is not None and now - _CENTROIDS_TIME < 86400:
        return _CENTROIDS_CACHE

    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                WITH s AS (
                    SELECT DISTINCT ON (site_id) site_id, UPPER(TRIM(kota_kabupaten)) AS kab, site_lat, site_long
                    FROM raw_desiqa
                    WHERE weeknum = (SELECT MAX(weeknum) FROM raw_desiqa)
                      AND site_lat BETWEEN -12 AND 6 AND site_long BETWEEN 95 AND 142
                    ORDER BY site_id
                )
                SELECT kab, AVG(site_lat) AS lat, AVG(site_long) AS lon, COUNT(*) AS n_sites
                FROM s GROUP BY kab
            """)
            rows = cur.fetchall()
            res = {}
            for kab, lat, lon, n in rows:
                k = kab_key(kab)
                res[k] = {"kab": kab, "lat": round(float(lat), 6), "lon": round(float(lon), 6), "n_sites": int(n)}
            _CENTROIDS_CACHE = res
            _CENTROIDS_TIME = now
            return res
    finally:
        conn.close()


def _get_onx_kab_names() -> List[str]:
    global _ONX_KAB_NAMES_CACHE, _ONX_KAB_NAMES_TIME
    now = time.time()
    if _ONX_KAB_NAMES_CACHE is not None and now - _ONX_KAB_NAMES_TIME < 86400:
        return _ONX_KAB_NAMES_CACHE
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT location FROM \"measONX\" WHERE lvl = 'Kabupaten'")
            names = [r[0] for r in cur.fetchall() if r[0]]
            _ONX_KAB_NAMES_CACHE = names
            _ONX_KAB_NAMES_TIME = now
            return names
    finally:
        conn.close()


def _get_source_weeks(source: str) -> List[int]:
    now = time.time()
    cache_entry = _DISTINCT_WEEKS_CACHE.get(source)
    if cache_entry and now - cache_entry[0] < 600:
        return cache_entry[1]

    conn = _conn()
    try:
        with conn.cursor() as cur:
            if source == "ONX":
                cur.execute("SELECT DISTINCT yearweek FROM \"measONX\" WHERE lvl = 'Region' ORDER BY yearweek ASC")
            else:
                cur.execute("SELECT DISTINCT yearweek FROM \"measOoklaRegion\" WHERE level = 'region' ORDER BY yearweek ASC")
            wks = [int(r[0]) for r in cur.fetchall()]
            _DISTINCT_WEEKS_CACHE[source] = (now, wks)
            return wks
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Database Loaders
# ---------------------------------------------------------------------------
def _load_onx_region(region: str, w_from: int, w_to: int) -> List[tuple]:
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT yearweek, metric, provider, rank, final_value, lci, uci
                FROM "measONX"
                WHERE lvl = 'Region' AND UPPER(location) = UPPER(%s)
                  AND yearweek BETWEEN %s AND %s AND rank IS NOT NULL
                """,
                (region, w_from, w_to),
            )
            return _normalize_onx(cur.fetchall(), 1)
    finally:
        conn.close()


def _load_onx_kab(kab_names: List[str], weeks: List[int]) -> List[tuple]:
    if not kab_names or not weeks:
        return []
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT yearweek, location, metric, provider, rank, final_value, lci, uci
                FROM "measONX"
                WHERE lvl = 'Kabupaten' AND yearweek = ANY(%s) AND location = ANY(%s) AND rank IS NOT NULL
                """,
                (weeks, kab_names),
            )
            return _normalize_onx(cur.fetchall(), 2)
    finally:
        conn.close()


def _load_ookla_region(region: str, w_from: int, w_to: int) -> List[tuple]:
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT yearweek, tech, operator,
                       connectivity_score, rank_connectivity, speed_score, rank_speed,
                       video_score, rank_video, game_score, rank_game, web_score, rank_web,
                       page_load_time_percent, avg_val_web_page_load_time
                FROM "measOoklaRegion"
                WHERE level = 'region' AND UPPER(region) = UPPER(%s) AND yearweek BETWEEN %s AND %s
                """,
                (region, w_from, w_to),
            )
            return cur.fetchall()
    finally:
        conn.close()


def _load_ookla_kab(region: str, weeks: List[int], kabupaten_names: Optional[List[str]] = None) -> List[tuple]:
    if not weeks:
        return []
    conn = _conn()
    try:
        with conn.cursor() as cur:
            sql = """
                SELECT yearweek, kabupaten, tech, operator,
                       connectivity_score, rank_connectivity, speed_score, rank_speed,
                       video_score, rank_video, game_score, rank_game, web_score, rank_web,
                       page_load_time_percent, avg_val_web_page_load_time
                FROM "measOoklaCity"
                WHERE level = 'kabupaten' AND UPPER(region) = UPPER(%s)
                  AND kabupaten IS NOT NULL AND yearweek = ANY(%s)
            """
            params: List[Any] = [region, weeks]
            if kabupaten_names:
                sql += " AND UPPER(kabupaten) = ANY(%s)"
                params.append([k.upper() for k in kabupaten_names])
            cur.execute(sql, params)
            return cur.fetchall()
    finally:
        conn.close()


def _get_region_kabupaten_dict(region: str = "SULAWESI") -> Dict[str, str]:
    """Returns canonical Ookla kabupaten list for the region: {kab_key: canonical_name}."""
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT DISTINCT kabupaten
                FROM "measOoklaCity"
                WHERE UPPER(region) = UPPER(%s) AND kabupaten IS NOT NULL
                ORDER BY kabupaten ASC
                """,
                (region,),
            )
            rows = [r[0] for r in cur.fetchall()]
            return {kab_key(r): r for r in rows}
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Public Functions
# ---------------------------------------------------------------------------
def get_crowd_meta() -> Dict[str, Any]:
    """Metadata for dropdowns, catalog, available weeks and regions."""
    onx_weeks = _get_source_weeks("ONX")
    ook_weeks = _get_source_weeks("OOKLA")
    all_weeks = sorted(set(onx_weeks + ook_weeks))
    latest = all_weeks[-1] if all_weeks else 202644

    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT region FROM \"measOoklaRegion\" WHERE level = 'region' AND region IS NOT NULL ORDER BY region ASC")
            regions = [r[0] for r in cur.fetchall()]
    finally:
        conn.close()

    if "SULAWESI" not in regions:
        regions.insert(0, "SULAWESI")

    sulawesi_kabs = list(_get_region_kabupaten_dict("SULAWESI").values())

    return {
        "weeks": {"ONX": onx_weeks, "OOKLA": ook_weeks},
        "latest_week": latest,
        "regions": regions,
        "default_region": "SULAWESI",
        "kabupaten": {"SULAWESI": sulawesi_kabs},
        "techs": [
            {"id": "overall", "label": "Overall"},
            {"id": "5g", "label": "5G"},
            {"id": "4g", "label": "4G (Ookla only)"},
        ],
        "competitors": ["IOH", "XLSMART"],
        "catalog": [
            {
                "key": k["key"],
                "source": k["source"],
                "tech": k["tech"],
                "label": k["label"],
                "unit": k["unit"],
                "in_target": k["in_target"],
                "manual": k["manual"],
            }
            for k in KPI_CATALOG
        ],
    }


def get_crowd_summary(week: Optional[int] = None, region: str = "SULAWESI") -> Dict[str, Any]:
    """Summary tiles and 26-week WIN/LOSE trend with target lines."""
    region = (region if isinstance(region, str) else "SULAWESI").strip().upper()
    onx_weeks = _get_source_weeks("ONX")
    ook_weeks = _get_source_weeks("OOKLA")
    all_weeks = sorted(set(onx_weeks + ook_weeks))

    if not all_weeks:
        return {"error": "No data found"}

    if week is None or week not in all_weeks:
        sel_week = all_weeks[-1]
    else:
        sel_week = int(week)

    # Cut up to 26 weeks <= sel_week
    eligible_weeks = [w for w in all_weeks if w <= sel_week]
    trend_weeks = eligible_weeks[-26:] if len(eligible_weeks) >= 26 else eligible_weeks
    w_min = trend_weeks[0]
    w_max = trend_weeks[-1]

    # Data week
    onx_avail = [w for w in onx_weeks if w <= sel_week]
    ook_avail = [w for w in ook_weeks if w <= sel_week]
    data_week_onx = onx_avail[-1] if onx_avail else sel_week
    data_week_ook = ook_avail[-1] if ook_avail else sel_week

    # Fetch ONX & Ookla region data for trend_weeks
    onx_raw = _load_onx_region(region, w_min, w_max)
    ook_raw = _load_ookla_region(region, w_min, w_max)
    all_targets = crowd_store.list_targets(region)
    all_manual = crowd_store.list_manual(region)

    # Process ONX: data_onx[yearweek][metric][provider] = {rank, value, lci, uci}
    data_onx: Dict[int, Dict[str, Dict[str, Dict[str, Any]]]] = {}
    for yw, metric, prov, rk, val, lci, uci in onx_raw:
        data_onx.setdefault(yw, {}).setdefault(metric, {})[prov] = {
            "rank": rk, "value": val, "lci": lci, "uci": uci
        }

    # Process Ookla: data_ook[yearweek][tech][metric_db][operator] = {rank, value}
    data_ook: Dict[int, Dict[str, Dict[str, Dict[str, Any]]]] = {}
    for r in ook_raw:
        yw, tech, op = r[0], r[1], r[2]
        metrics = {
            "connectivity": (r[3], r[4]),
            "speed": (r[5], r[6]),
            "video": (r[7], r[8]),
            "game": (r[9], r[10]),
            "web": (r[11], r[12]),
        }
        for mp, (sc, rk) in metrics.items():
            if sc is not None or rk is not None:
                data_ook.setdefault(yw, {}).setdefault(tech, {}).setdefault(mp, {})[op] = {
                    "rank": int(rk) if rk is not None else None,
                    "value": float(sc) if sc is not None else None,
                }

    # Calculate weekly wins for trend
    trend: List[Dict[str, Any]] = []
    weekly_wins_map: Dict[int, Dict[str, int]] = {}

    for yw in trend_weeks:
        onx_target_row = crowd_store.target_for("ONX", region, yw, all_targets)
        ook_target_row = crowd_store.target_for("OOKLA", region, yw, all_targets)

        onx_tgt = onx_target_row["target_win"] if onx_target_row else 8
        ook_tgt = ook_target_row["target_win"] if ook_target_row else 4

        onx_line = onx_tgt if (onx_target_row and onx_target_row.get("show_on_chart")) else None
        ook_line = ook_tgt if (ook_target_row and ook_target_row.get("show_on_chart")) else None

        onx_win = 0
        onx_lose = 0
        ook_win = 0
        ook_lose = 0

        # ONX metrics in target
        yw_onx = data_onx.get(yw, {})
        for item in KPI_CATALOG:
            if item["source"] == "ONX" and item["in_target"]:
                m = item["db"]
                provs = yw_onx.get(m, {})
                tsel = provs.get("Telkomsel")
                if tsel and tsel["rank"] is not None:
                    other_ranks = [v["rank"] for k, v in provs.items() if k != "Telkomsel"]
                    stat = status_of(tsel["rank"], other_ranks)
                    if stat in ("WIN", "DRAW"):
                        onx_win += 1
                    elif stat == "LOSE":
                        onx_lose += 1

        # Ookla metrics in target
        yw_ook = data_ook.get(yw, {})
        for item in KPI_CATALOG:
            if item["source"] == "OOKLA" and item["in_target"]:
                if item["manual"]:
                    m_val = crowd_store.manual_for(region, yw, item["key"], all_manual)
                    if m_val:
                        if m_val["status"] in ("WIN", "DRAW"):
                            ook_win += 1
                        elif m_val["status"] == "LOSE":
                            ook_lose += 1
                else:
                    tech = item["tech"]
                    mp = item["db"]
                    ops = yw_ook.get(tech, {}).get(mp, {})
                    tsel = ops.get("Telkomsel")
                    if tsel and tsel["rank"] is not None:
                        other_ranks = [v["rank"] for k, v in ops.items() if k != "Telkomsel"]
                        stat = status_of(tsel["rank"], other_ranks)
                        if stat in ("WIN", "DRAW"):
                            ook_win += 1
                        elif stat == "LOSE":
                            ook_lose += 1

        tot_wins = onx_win + ook_win
        tot_tgt = onx_tgt + ook_tgt
        ach = "ACH" if tot_wins >= tot_tgt else "NOT ACH"

        weekly_wins_map[yw] = {"ONX": onx_win, "OOKLA": ook_win, "TOTAL": tot_wins}

        trend.append({
            "week": yw,
            "onx_win": onx_win,
            "onx_lose": onx_lose,
            "onx_target": onx_tgt,
            "onx_target_line": onx_line,
            "ook_win": ook_win,
            "ook_lose": ook_lose,
            "ook_target": ook_tgt,
            "ook_target_line": ook_line,
            "total_wins": tot_wins,
            "total_target": tot_tgt,
            "achievement": ach,
        })

    # Tiles for current week (using data_week_onx and data_week_ook)
    # 1. ONX tile
    yw_onx_cur = data_onx.get(data_week_onx, {})
    onx_win_cnt = 0
    onx_draw_cnt = 0
    onx_lose_cnt = 0
    onx_at_risk = 0
    for item in KPI_CATALOG:
        if item["source"] == "ONX" and item["in_target"]:
            provs = yw_onx_cur.get(item["db"], {})
            tsel = provs.get("Telkomsel")
            if tsel and tsel["rank"] is not None:
                other_ranks = [v["rank"] for k, v in provs.items() if k != "Telkomsel"]
                stat = status_of(tsel["rank"], other_ranks)
                if stat == "WIN":
                    onx_win_cnt += 1
                    # check at risk: CI overlap with runner up
                    others = [v for k, v in provs.items() if k != "Telkomsel" and v.get("rank") is not None]
                    if others:
                        others_sorted = sorted(others, key=lambda x: (x["rank"], -(x["value"] or 0)))
                        runner_up = others_sorted[0]
                        if tsel.get("lci") is not None and runner_up.get("uci") is not None and tsel["lci"] <= runner_up["uci"]:
                            onx_at_risk += 1
                elif stat == "DRAW":
                    onx_draw_cnt += 1
                    onx_at_risk += 1  # DRAW is always at risk
                elif stat == "LOSE":
                    onx_lose_cnt += 1

    cur_onx_target_row = crowd_store.target_for("ONX", region, data_week_onx, all_targets)
    cur_onx_tgt = cur_onx_target_row["target_win"] if cur_onx_target_row else 8
    onx_total_wins = onx_win_cnt + onx_draw_cnt

    # WoW ONX wins
    prev_onx_weeks = [w for w in onx_weeks if w < data_week_onx]
    wow_onx_wins = 0
    if prev_onx_weeks:
        w_prev_onx = prev_onx_weeks[-1]
        prev_wins = weekly_wins_map.get(w_prev_onx, {}).get("ONX")
        if prev_wins is not None:
            wow_onx_wins = onx_total_wins - prev_wins

    # 2. Ookla tile
    yw_ook_cur = data_ook.get(data_week_ook, {})
    ook_win_cnt = 0
    ook_draw_cnt = 0
    ook_lose_cnt = 0
    ook_at_risk = 0
    ook_manual_cnt = 0

    for item in KPI_CATALOG:
        if item["source"] == "OOKLA" and item["in_target"]:
            if item["manual"]:
                m_val = crowd_store.manual_for(region, data_week_ook, item["key"], all_manual)
                if m_val:
                    ook_manual_cnt += 1
                    if m_val["status"] in ("WIN", "DRAW"):
                        ook_win_cnt += 1
                    elif m_val["status"] == "LOSE":
                        ook_lose_cnt += 1
            else:
                ops = yw_ook_cur.get(item["tech"], {}).get(item["db"], {})
                tsel = ops.get("Telkomsel")
                if tsel and tsel["rank"] is not None:
                    other_ranks = [v["rank"] for k, v in ops.items() if k != "Telkomsel"]
                    stat = status_of(tsel["rank"], other_ranks)
                    if stat == "WIN":
                        ook_win_cnt += 1
                        others = [v for k, v in ops.items() if k != "Telkomsel" and v.get("rank") is not None]
                        if others:
                            others_sorted = sorted(others, key=lambda x: (x["rank"], -(x["value"] or 0)))
                            runner_up = others_sorted[0]
                            margin = (tsel["value"] or 0) - (runner_up["value"] or 0)
                            if tsel["value"] and (margin / tsel["value"]) < 0.01:
                                ook_at_risk += 1
                    elif stat == "DRAW":
                        ook_draw_cnt += 1
                        ook_at_risk += 1
                    elif stat == "LOSE":
                        ook_lose_cnt += 1

    cur_ook_target_row = crowd_store.target_for("OOKLA", region, data_week_ook, all_targets)
    cur_ook_tgt = cur_ook_target_row["target_win"] if cur_ook_target_row else 4
    ook_total_wins = ook_win_cnt + ook_draw_cnt

    # WoW Ookla wins
    prev_ook_weeks = [w for w in ook_weeks if w < data_week_ook]
    wow_ook_wins = 0
    if prev_ook_weeks:
        w_prev_ook = prev_ook_weeks[-1]
        prev_wins = weekly_wins_map.get(w_prev_ook, {}).get("OOKLA")
        if prev_wins is not None:
            wow_ook_wins = ook_total_wins - prev_wins

    # TOTAL tile
    tot_wins_cur = onx_total_wins + ook_total_wins
    tot_tgt_cur = cur_onx_tgt + cur_ook_tgt
    wins_needed_cur = max(0, tot_tgt_cur - tot_wins_cur)
    ach_cur = "ACH" if tot_wins_cur >= tot_tgt_cur else "NOT ACH"

    return {
        "week": sel_week,
        "region": region,
        "data_week": {"ONX": data_week_onx, "OOKLA": data_week_ook},
        "tiles": {
            "ONX": {
                "total": onx_win_cnt + onx_draw_cnt + onx_lose_cnt,
                "win": onx_win_cnt,
                "draw": onx_draw_cnt,
                "lose": onx_lose_cnt,
                "wins": onx_total_wins,
                "target": cur_onx_tgt,
                "wins_needed": max(0, cur_onx_tgt - onx_total_wins),
                "wow_wins": wow_onx_wins,
                "at_risk": onx_at_risk,
            },
            "OOKLA": {
                "total": ook_win_cnt + ook_draw_cnt + ook_lose_cnt,
                "win": ook_win_cnt,
                "draw": ook_draw_cnt,
                "lose": ook_lose_cnt,
                "wins": ook_total_wins,
                "target": cur_ook_tgt,
                "wins_needed": max(0, cur_ook_tgt - ook_total_wins),
                "wow_wins": wow_ook_wins,
                "at_risk": ook_at_risk,
                "manual": ook_manual_cnt,
            },
            "TOTAL": {
                "total": (onx_win_cnt + onx_draw_cnt + onx_lose_cnt) + (ook_win_cnt + ook_draw_cnt + ook_lose_cnt),
                "wins": tot_wins_cur,
                "target": tot_tgt_cur,
                "wins_needed": wins_needed_cur,
                "achievement": ach_cur,
            },
        },
        "trend": trend,
    }


def get_crowd_achievement(
    week: Optional[int] = None,
    weeks: int = 8,
    region: str = "SULAWESI",
    level: str = "region",
    kabupaten: Optional[List[str]] = None,
    source: str = "all",
    tech: str = "all",
    competitor: str = "all",
) -> Dict[str, Any]:
    """Achievement table week-to-week, targets, path-to-target."""
    region = (region if isinstance(region, str) else "SULAWESI").strip().upper()
    level = (level if isinstance(level, str) else "region").strip().lower()
    source_flt = (source if isinstance(source, str) else "all").strip().upper()
    tech_flt = (tech if isinstance(tech, str) else "all").strip().lower()
    comp_flt = (competitor if isinstance(competitor, str) else "all").strip().upper()
    try:
        weeks_cnt = max(1, min(26, int(weeks)))
    except (ValueError, TypeError):
        weeks_cnt = 8

    onx_weeks = _get_source_weeks("ONX")
    ook_weeks = _get_source_weeks("OOKLA")
    all_weeks = sorted(set(onx_weeks + ook_weeks))
    if not all_weeks:
        return {"error": "No data found"}

    sel_week = int(week) if week and int(week) in all_weeks else all_weeks[-1]
    eligible_weeks = [w for w in all_weeks if w <= sel_week]
    table_weeks = eligible_weeks[-weeks_cnt:] if len(eligible_weeks) >= weeks_cnt else eligible_weeks
    w_min = table_weeks[0]
    w_max = table_weeks[-1]

    all_targets = crowd_store.list_targets(region)
    all_manual = crowd_store.list_manual(region)

    # Handle Level = Kabupaten
    if level == "kabupaten":
        clean_kabs = sorted({k.strip().upper() for k in kabupaten or [] if k and k.strip()})
        if not clean_kabs or len(clean_kabs) > 10:
            raise ValueError("Pick 1–10 kabupaten for kabupaten-level view")

        # Map clean_kabs to ONX names via kab_key
        all_onx_kabs = _get_onx_kab_names()
        onx_key_map = {kab_key(k): k for k in all_onx_kabs}
        needed_onx_names = [onx_key_map[kab_key(k)] for k in clean_kabs if kab_key(k) in onx_key_map]

        onx_raw = _load_onx_kab(needed_onx_names, table_weeks) if source_flt in ("ALL", "ONX") else []
        ook_raw = _load_ookla_kab(region, table_weeks, clean_kabs) if source_flt in ("ALL", "OOKLA") else []
    else:
        clean_kabs = [None]
        onx_raw = _load_onx_region(region, w_min, w_max) if source_flt in ("ALL", "ONX") else []
        ook_raw = _load_ookla_region(region, w_min, w_max) if source_flt in ("ALL", "OOKLA") else []

    # Map ONX: data_onx[kab_key][metric][yearweek][provider] = {rank, value, lci, uci}
    data_onx: Dict[str, Dict[str, Dict[int, Dict[str, Dict[str, Any]]]]] = {}
    if level == "kabupaten":
        for yw, loc, metric, prov, rk, val, lci, uci in onx_raw:
            kk = kab_key(loc)
            data_onx.setdefault(kk, {}).setdefault(metric, {}).setdefault(yw, {})[prov] = {
                "rank": rk, "value": val, "lci": lci, "uci": uci
            }
    else:
        for yw, metric, prov, rk, val, lci, uci in onx_raw:
            data_onx.setdefault("__REGION__", {}).setdefault(metric, {}).setdefault(yw, {})[prov] = {
                "rank": rk, "value": val, "lci": lci, "uci": uci
            }

    # Map Ookla: data_ook[kab_key][tech][metric_db][yearweek][operator] = {rank, value}
    data_ook: Dict[str, Dict[str, Dict[str, Dict[int, Dict[str, Any]]]]] = {}
    if level == "kabupaten":
        for r in ook_raw:
            yw, kab, tech_val, op = r[0], r[1], r[2], r[3]
            kk = kab_key(kab)
            metrics = {
                "connectivity": (r[4], r[5]),
                "speed": (r[6], r[7]),
                "video": (r[8], r[9]),
                "game": (r[10], r[11]),
                "web": (r[12], r[13]),
            }
            for mp, (sc, rk) in metrics.items():
                if sc is not None or rk is not None:
                    data_ook.setdefault(kk, {}).setdefault(tech_val, {}).setdefault(mp, {}).setdefault(yw, {})[op] = {
                        "rank": int(rk) if rk is not None else None,
                        "value": float(sc) if sc is not None else None,
                    }
    else:
        for r in ook_raw:
            yw, tech_val, op = r[0], r[1], r[2]
            metrics = {
                "connectivity": (r[3], r[4]),
                "speed": (r[5], r[6]),
                "video": (r[7], r[8]),
                "game": (r[9], r[10]),
                "web": (r[11], r[12]),
            }
            for mp, (sc, rk) in metrics.items():
                if sc is not None or rk is not None:
                    data_ook.setdefault("__REGION__", {}).setdefault(tech_val, {}).setdefault(mp, {}).setdefault(yw, {})[op] = {
                        "rank": int(rk) if rk is not None else None,
                        "value": float(sc) if sc is not None else None,
                    }

    # Week summary calculation (for region level, or overall)
    # week_summary: list of {week, source, wins, target, [achievement]}
    week_summary: List[Dict[str, Any]] = []
    reg_onx = data_onx.get("__REGION__", {})
    reg_ook = data_ook.get("__REGION__", {})

    for yw in table_weeks:
        onx_target_row = crowd_store.target_for("ONX", region, yw, all_targets)
        ook_target_row = crowd_store.target_for("OOKLA", region, yw, all_targets)
        onx_tgt = onx_target_row["target_win"] if onx_target_row else 8
        ook_tgt = ook_target_row["target_win"] if ook_target_row else 4

        w_onx_win = 0
        w_ook_win = 0

        # Calculate ONX wins
        for item in KPI_CATALOG:
            if item["source"] == "ONX" and item["in_target"]:
                m = item["db"]
                provs = reg_onx.get(m, {}).get(yw, {})
                tsel = provs.get("Telkomsel")
                if tsel and tsel["rank"] is not None:
                    other_ranks = [v["rank"] for k, v in provs.items() if k != "Telkomsel"]
                    stat = status_of(tsel["rank"], other_ranks)
                    if stat in ("WIN", "DRAW"):
                        w_onx_win += 1

        # Calculate Ookla wins
        for item in KPI_CATALOG:
            if item["source"] == "OOKLA" and item["in_target"]:
                if item["manual"]:
                    m_val = crowd_store.manual_for(region, yw, item["key"], all_manual)
                    if m_val and m_val["status"] in ("WIN", "DRAW"):
                        w_ook_win += 1
                else:
                    tech_val = item["tech"]
                    mp = item["db"]
                    ops = reg_ook.get(tech_val, {}).get(mp, {}).get(yw, {})
                    tsel = ops.get("Telkomsel")
                    if tsel and tsel["rank"] is not None:
                        other_ranks = [v["rank"] for k, v in ops.items() if k != "Telkomsel"]
                        stat = status_of(tsel["rank"], other_ranks)
                        if stat in ("WIN", "DRAW"):
                            w_ook_win += 1

        tot_wins = w_onx_win + w_ook_win
        tot_tgt = onx_tgt + ook_tgt
        ach = "ACH" if tot_wins >= tot_tgt else "NOT ACH"

        week_summary.append({"week": yw, "source": "ONX", "wins": w_onx_win, "target": onx_tgt})
        week_summary.append({"week": yw, "source": "OOKLA", "wins": w_ook_win, "target": ook_tgt})
        week_summary.append({"week": yw, "source": "TOTAL", "wins": tot_wins, "target": tot_tgt, "achievement": ach})

    # Build KPI Rows
    rows: List[Dict[str, Any]] = []

    for kab_name in clean_kabs:
        k_key = kab_key(kab_name) if kab_name else "__REGION__"
        kab_onx_data = data_onx.get(k_key, {})
        kab_ook_data = data_ook.get(k_key, {})

        for item in KPI_CATALOG:
            # Filters
            if source_flt != "ALL" and item["source"] != source_flt:
                continue
            if tech_flt != "all":
                item_tech = item["tech"].lower()
                # Map tech: 'all' -> 'overall', '5g' -> '5g', '4g' -> '4g'
                if tech_flt == "overall" and item_tech not in ("overall", "all"):
                    continue
                elif tech_flt == "5g" and item_tech != "5g":
                    continue
                elif tech_flt == "4g" and item_tech != "4g":
                    continue

            # Manual KPIs only exist at region level
            if level == "kabupaten" and item["manual"]:
                continue

            # Build cells
            cells: List[Dict[str, Any]] = []
            prev_cell_val = None

            for yw in table_weeks:
                cell_tsel_val = None
                cell_rank = None
                cell_status = None

                if item["source"] == "ONX":
                    m = item["db"]
                    provs = kab_onx_data.get(m, {}).get(yw, {})
                    tsel = provs.get("Telkomsel")
                    if tsel and tsel["rank"] is not None:
                        cell_tsel_val = tsel["value"]
                        cell_rank = tsel["rank"]
                        if comp_flt in ("IOH", "XLSMART"):
                            comp_prov = "Indosat" if comp_flt == "IOH" else "XL"
                            comp_data = provs.get(comp_prov)
                            if comp_data and comp_data.get("rank") is not None:
                                c_rk = comp_data["rank"]
                                if cell_rank < c_rk: cell_status = "WIN"
                                elif cell_rank == c_rk: cell_status = "DRAW"
                                else: cell_status = "LOSE"
                        else:
                            other_ranks = [v["rank"] for k, v in provs.items() if k != "Telkomsel"]
                            cell_status = status_of(cell_rank, other_ranks)

                elif item["source"] == "OOKLA":
                    if item["manual"]:
                        m_val = crowd_store.manual_for(region, yw, item["key"], all_manual)
                        if m_val:
                            cell_tsel_val = m_val["tsel_value"]
                            cell_status = m_val["status"]
                    else:
                        ops = kab_ook_data.get(item["tech"], {}).get(item["db"], {}).get(yw, {})
                        tsel = ops.get("Telkomsel")
                        if tsel and tsel["rank"] is not None:
                            cell_tsel_val = tsel["value"]
                            cell_rank = tsel["rank"]
                            if comp_flt in ("IOH", "XLSMART"):
                                # match IOH or XL/XLSMART
                                comp_data = None
                                for op_k, op_v in ops.items():
                                    if OPERATOR_LABEL.get(op_k) == comp_flt:
                                        comp_data = op_v
                                        break
                                if comp_data and comp_data.get("rank") is not None:
                                    c_rk = comp_data["rank"]
                                    if cell_rank < c_rk: cell_status = "WIN"
                                    elif cell_rank == c_rk: cell_status = "DRAW"
                                    else: cell_status = "LOSE"
                            else:
                                other_ranks = [v["rank"] for k, v in ops.items() if k != "Telkomsel"]
                                cell_status = status_of(cell_rank, other_ranks)

                cells.append({
                    "week": yw,
                    "tsel": round(cell_tsel_val, 2) if cell_tsel_val is not None else None,
                    "rank": cell_rank,
                    "status": cell_status,
                })

            # Latest week metrics
            latest_cell = cells[-1] if cells else {}
            cur_tsel_val = latest_cell.get("tsel")
            cur_rank = latest_cell.get("rank")
            cur_stat = latest_cell.get("status")

            # WoW calculation: compare with cell right before latest with non-null value
            wow = None
            if len(cells) >= 2 and cur_tsel_val is not None:
                for c in reversed(cells[:-1]):
                    if c["tsel"] is not None:
                        wow = round(cur_tsel_val - c["tsel"], 2)
                        break

            # Find Leader, Runner Up, CI for latest week
            cur_yw = table_weeks[-1]
            leader_label = None
            leader_val = None
            leader_dict = None
            runner_up_dict = None
            tsel_dict = None
            at_risk = False
            margin = None
            gap = None
            gap_pct = None
            need_win = None
            need_draw = None

            if item["source"] == "ONX":
                m = item["db"]
                provs = kab_onx_data.get(m, {}).get(cur_yw, {})
                tsel = provs.get("Telkomsel")
                if tsel and tsel["rank"] is not None:
                    tsel_dict = tsel
                    others = [
                        (k, v) for k, v in provs.items()
                        if k != "Telkomsel" and v.get("rank") is not None
                    ]
                    if comp_flt in ("IOH", "XLSMART"):
                        comp_prov = "Indosat" if comp_flt == "IOH" else "XL"
                        others = [(k, v) for k, v in others if k == comp_prov]

                    if others:
                        others_sorted = sorted(others, key=lambda x: (x[1]["rank"], -(x[1]["value"] or 0)))
                        top_other_prov, top_other_data = others_sorted[0]
                        leader_label = OPERATOR_LABEL.get(top_other_prov, top_other_prov)
                        leader_val = top_other_data["value"]
                        leader_dict = top_other_data
                        runner_up_dict = top_other_data

            elif item["source"] == "OOKLA":
                if not item["manual"]:
                    ops = kab_ook_data.get(item["tech"], {}).get(item["db"], {}).get(cur_yw, {})
                    tsel = ops.get("Telkomsel")
                    if tsel and tsel["rank"] is not None:
                        tsel_dict = tsel
                        others = [
                            (k, v) for k, v in ops.items()
                            if k != "Telkomsel" and v.get("rank") is not None
                        ]
                        if comp_flt in ("IOH", "XLSMART"):
                            others = [(k, v) for k, v in others if OPERATOR_LABEL.get(k) == comp_flt]

                        if others:
                            others_sorted = sorted(others, key=lambda x: (x[1]["rank"], -(x[1]["value"] or 0)))
                            top_other_prov, top_other_data = others_sorted[0]
                            leader_label = OPERATOR_LABEL.get(top_other_prov, top_other_prov)
                            leader_val = top_other_data["value"]
                            leader_dict = top_other_data
                            runner_up_dict = top_other_data

            # Calculations
            if cur_stat in ("WIN", "DRAW"):
                if tsel_dict and runner_up_dict and tsel_dict.get("value") is not None and runner_up_dict.get("value") is not None:
                    margin = round(tsel_dict["value"] - runner_up_dict["value"], 2)
                    if item["source"] == "ONX":
                        if cur_stat == "DRAW" or (tsel_dict.get("lci") is not None and runner_up_dict.get("uci") is not None and tsel_dict["lci"] <= runner_up_dict["uci"]):
                            at_risk = True
                    else:
                        if cur_stat == "DRAW" or (tsel_dict["value"] > 0 and (margin / tsel_dict["value"]) < 0.01):
                            at_risk = True
            elif cur_stat == "LOSE":
                if tsel_dict and leader_dict and tsel_dict.get("value") is not None and leader_dict.get("value") is not None:
                    gap = round(leader_dict["value"] - tsel_dict["value"], 2)
                    gap_pct = round((gap / leader_dict["value"]) * 100, 2) if leader_dict["value"] else 0.0
                    need_win, need_draw = needed_values(item["source"], tsel_dict, leader_dict)

            rows.append({
                "key": item["key"],
                "source": item["source"],
                "tech": item["tech"],
                "label": item["label"],
                "unit": item["unit"],
                "in_target": item["in_target"],
                "manual": item["manual"],
                "kabupaten": kab_name,
                "cells": cells,
                "tsel": round(cur_tsel_val, 2) if cur_tsel_val is not None else None,
                "tsel_lci": round(tsel_dict["lci"], 2) if tsel_dict and tsel_dict.get("lci") is not None else None,
                "tsel_uci": round(tsel_dict["uci"], 2) if tsel_dict and tsel_dict.get("uci") is not None else None,
                "rank": cur_rank,
                "status": cur_stat,
                "wow": wow,
                "leader": leader_label if cur_stat != "WIN" else None,
                "leader_value": round(leader_val, 2) if cur_stat != "WIN" and leader_val is not None else None,
                "gap": gap,
                "gap_pct": gap_pct,
                "needed_win": need_win,
                "needed_draw": need_draw,
                "margin": margin,
                "at_risk": at_risk,
            })

    # Path to target
    # Calculated from LOSE items in target across the region (when level='region')
    path_to_target: List[Dict[str, Any]] = []
    lose_target_rows = [
        r for r in rows
        if r["in_target"] and r.get("status") == "LOSE" and (r.get("kabupaten") is None or level != "kabupaten")
    ]
    lose_target_rows.sort(key=lambda x: (x["gap_pct"] if x["gap_pct"] is not None else 9999))

    # Determine wins_needed from week_summary for latest week
    cur_tot_summary = next((s for s in week_summary if s["week"] == table_weeks[-1] and s["source"] == "TOTAL"), None)
    wins_needed = max(0, cur_tot_summary["target"] - cur_tot_summary["wins"]) if cur_tot_summary else 0

    for idx, r in enumerate(lose_target_rows):
        path_to_target.append({
            "key": r["key"],
            "label": r["label"],
            "source": r["source"],
            "tech": r["tech"],
            "tsel": r["tsel"],
            "leader": r["leader"],
            "leader_value": r["leader_value"],
            "gap": r["gap"],
            "gap_pct": r["gap_pct"],
            "needed_win": r["needed_win"],
            "focus": idx < wins_needed,
        })

    return {
        "weeks": table_weeks,
        "week_summary": week_summary,
        "rows": rows,
        "path_to_target": path_to_target,
    }


def get_crowd_trend(
    key: str,
    region: str = "SULAWESI",
    kabupaten: Optional[str] = None,
    weeks: int = 26,
) -> Dict[str, Any]:
    """Operator series trend for a selected KPI."""
    if not key or key not in KPI_BY_KEY:
        raise ValueError(f"Invalid KPI key: {key}")

    item = KPI_BY_KEY[key]
    region = (region if isinstance(region, str) else "SULAWESI").strip().upper()
    kabupaten = kabupaten.strip() if isinstance(kabupaten, str) and kabupaten.strip() else None
    try:
        weeks_cnt = max(4, min(104, int(weeks)))
    except (ValueError, TypeError):
        weeks_cnt = 26

    source_weeks = _get_source_weeks(item["source"])
    if not source_weeks:
        return {"error": "No weeks found"}

    trend_weeks = source_weeks[-weeks_cnt:]
    w_min = trend_weeks[0]
    w_max = trend_weeks[-1]

    needed_win = None
    series_map: Dict[str, List[Dict[str, Any]]] = {}

    if item["source"] == "ONX":
        if kabupaten:
            all_onx_kabs = _get_onx_kab_names()
            onx_key_map = {kab_key(k): k for k in all_onx_kabs}
            onx_kab_name = onx_key_map.get(kab_key(kabupaten), kabupaten.upper())
            raw = _load_onx_kab([onx_kab_name], trend_weeks)
        else:
            raw = _load_onx_region(region, w_min, w_max)

        # raw: yearweek, [location], metric, provider, rank, final_value, lci, uci
        for r in raw:
            if kabupaten:
                yw, loc, metric, prov, rk, val, lci, uci = r
            else:
                yw, metric, prov, rk, val, lci, uci = r

            if metric != item["db"] or yw not in trend_weeks:
                continue

            op_label = OPERATOR_LABEL.get(prov, prov)
            if op_label not in series_map:
                series_map[op_label] = []

            series_map[op_label].append({
                "week": yw,
                "value": round(val, 2) if val is not None else None,
                "lci": round(lci, 2) if lci is not None else None,
                "uci": round(uci, 2) if uci is not None else None,
                "rank": rk,
            })

    elif item["source"] == "OOKLA":
        if item["manual"]:
            manual_list = crowd_store.list_manual(region)
            tsel_data = []
            for yw in trend_weeks:
                m_row = crowd_store.manual_for(region, yw, item["key"], manual_list)
                if m_row and m_row.get("tsel_value") is not None:
                    tsel_data.append({
                        "week": yw,
                        "value": round(m_row["tsel_value"], 2),
                        "rank": 1 if m_row["status"] == "WIN" else None,
                    })
            series_map["TSEL"] = tsel_data
        else:
            if kabupaten:
                raw = _load_ookla_kab(region, trend_weeks, [kabupaten])
            else:
                raw = _load_ookla_region(region, w_min, w_max)

            # raw columns: yearweek, [kabupaten], tech, operator, connectivity..., etc.
            metric_cols = {
                "connectivity": (3, 4) if not kabupaten else (4, 5),
                "speed": (5, 6) if not kabupaten else (6, 7),
                "video": (7, 8) if not kabupaten else (8, 9),
                "game": (9, 10) if not kabupaten else (10, 11),
                "web": (11, 12) if not kabupaten else (12, 13),
            }
            sc_idx, rk_idx = metric_cols.get(item["db"], (3, 4))

            for r in raw:
                yw = r[0]
                tech_val = r[1] if not kabupaten else r[2]
                op = r[2] if not kabupaten else r[3]

                if tech_val != item["tech"] or yw not in trend_weeks:
                    continue

                val = r[sc_idx]
                rk = r[rk_idx]

                op_label = OPERATOR_LABEL.get(op, op)
                if op_label not in series_map:
                    series_map[op_label] = []

                series_map[op_label].append({
                    "week": yw,
                    "value": round(float(val), 2) if val is not None else None,
                    "rank": int(rk) if rk is not None else None,
                })

    # Calculate needed_win for latest week
    cur_yw = trend_weeks[-1]
    tsel_cur = next((d for d in series_map.get("TSEL", []) if d["week"] == cur_yw), None)
    if tsel_cur and (tsel_cur.get("rank") != 1 or any(s.get("rank") == 1 for k, s_list in series_map.items() if k != "TSEL" for s in s_list if s["week"] == cur_yw)):
        # Tsel is not a sole winner
        other_latest = [
            (k, d) for k, s_list in series_map.items() if k != "TSEL"
            for d in s_list if d["week"] == cur_yw and d.get("value") is not None
        ]
        if other_latest:
            other_latest.sort(key=lambda x: (x[1].get("rank") if x[1].get("rank") is not None else 999, -(x[1]["value"] or 0)))
            leader_label, leader_data = other_latest[0]
            needed_win, _ = needed_values(item["source"], tsel_cur, leader_data)

    # Format series list
    series_list = []
    # Primary order: TSEL, IOH, XLSMART, then others
    order = ["TSEL", "IOH", "XLSMART", "3", "Smartfren"]
    for op in order:
        if op in series_map:
            # Sort by week
            data_pts = sorted(series_map.pop(op), key=lambda x: x["week"])
            entry = {"name": op, "data": data_pts}
            if op in ("3", "Smartfren"):
                entry["muted"] = True
            series_list.append(entry)

    # Any remaining
    for op, data_pts in series_map.items():
        data_pts_sorted = sorted(data_pts, key=lambda x: x["week"])
        series_list.append({"name": op, "data": data_pts_sorted})

    return {
        "key": key,
        "label": item["label"],
        "unit": item["unit"],
        "source": item["source"],
        "series": series_list,
        "needed_win": needed_win,
    }


def get_crowd_contributors(
    week: Optional[int] = None,
    region: str = "SULAWESI",
    source: str = "all",
    tech: str = "all",
    key: Optional[str] = None,
) -> Dict[str, Any]:
    """KPI degradation for region and kabupaten contributors for selected KPI."""
    region = (region if isinstance(region, str) else "SULAWESI").strip().upper()
    source_flt = (source if isinstance(source, str) else "all").strip().upper()
    tech_flt = (tech if isinstance(tech, str) else "all").strip().lower()
    key_clean = key if isinstance(key, str) else None

    onx_weeks = _get_source_weeks("ONX")
    ook_weeks = _get_source_weeks("OOKLA")
    all_weeks = sorted(set(onx_weeks + ook_weeks))
    if not all_weeks:
        return {"error": "No data found"}

    sel_week = int(week) if week and int(week) in all_weeks else all_weeks[-1]
    eligible_weeks = [w for w in all_weeks if w <= sel_week]
    if len(eligible_weeks) < 2:
        return {"kpi_degrade": [], "selected_key": None, "kabupaten": []}

    cur_week = eligible_weeks[-1]
    prev_week = eligible_weeks[-2]

    # Fetch 2 weeks region data
    onx_raw = _load_onx_region(region, prev_week, cur_week)
    ook_raw = _load_ookla_region(region, prev_week, cur_week)

    # Map ONX: data_onx[metric][yearweek][provider] = {rank, value}
    data_onx: Dict[str, Dict[int, Dict[str, Dict[str, Any]]]] = {}
    for yw, metric, prov, rk, val, lci, uci in onx_raw:
        data_onx.setdefault(metric, {}).setdefault(yw, {})[prov] = {
            "rank": rk, "value": val, "lci": lci, "uci": uci
        }

    # Map Ookla: data_ook[tech][metric_db][yearweek][operator] = {rank, value}
    data_ook: Dict[str, Dict[str, Dict[int, Dict[str, Any]]]] = {}
    for r in ook_raw:
        yw, tech_val, op = r[0], r[1], r[2]
        metrics = {
            "connectivity": (r[3], r[4]),
            "speed": (r[5], r[6]),
            "video": (r[7], r[8]),
            "game": (r[9], r[10]),
            "web": (r[11], r[12]),
        }
        for mp, (sc, rk) in metrics.items():
            if sc is not None or rk is not None:
                data_ook.setdefault(tech_val, {}).setdefault(mp, {}).setdefault(yw, {})[op] = {
                    "rank": int(rk) if rk is not None else None,
                    "value": float(sc) if sc is not None else None,
                }

    # Evaluate KPI degradation across region
    kpi_degrade = []
    for item in KPI_CATALOG:
        if source_flt != "ALL" and item["source"] != source_flt:
            continue
        if tech_flt != "all":
            item_tech = item["tech"].lower()
            if tech_flt == "overall" and item_tech not in ("overall", "all"):
                continue
            elif tech_flt == "5g" and item_tech != "5g":
                continue
            elif tech_flt == "4g" and item_tech != "4g":
                continue

        if item["manual"]:
            continue

        tsel_prev = None
        tsel_cur = None
        stat_prev = None
        stat_cur = None
        rk_prev = None
        rk_cur = None
        leader = None
        gap = None

        if item["source"] == "ONX":
            m = item["db"]
            provs_cur = data_onx.get(m, {}).get(cur_week, {})
            provs_prev = data_onx.get(m, {}).get(prev_week, {})
            tp = provs_prev.get("Telkomsel")
            tc = provs_cur.get("Telkomsel")
            if tc and tc.get("value") is not None:
                tsel_cur = tc["value"]
                rk_cur = tc["rank"]
                stat_cur = status_of(rk_cur, [v["rank"] for k, v in provs_cur.items() if k != "Telkomsel"])
                others_cur = [(k, v) for k, v in provs_cur.items() if k != "Telkomsel" and v.get("rank") is not None]
                if others_cur:
                    others_cur.sort(key=lambda x: (x[1]["rank"], -(x[1]["value"] or 0)))
                    top_prov, top_data = others_cur[0]
                    leader = OPERATOR_LABEL.get(top_prov, top_prov)
                    if top_data.get("value") is not None and tsel_cur is not None:
                        gap = round(top_data["value"] - tsel_cur, 2)
            if tp and tp.get("value") is not None:
                tsel_prev = tp["value"]
                rk_prev = tp["rank"]
                stat_prev = status_of(rk_prev, [v["rank"] for k, v in provs_prev.items() if k != "Telkomsel"])

        elif item["source"] == "OOKLA":
            ops_cur = data_ook.get(item["tech"], {}).get(item["db"], {}).get(cur_week, {})
            ops_prev = data_ook.get(item["tech"], {}).get(item["db"], {}).get(prev_week, {})
            tp = ops_prev.get("Telkomsel")
            tc = ops_cur.get("Telkomsel")
            if tc and tc.get("value") is not None:
                tsel_cur = tc["value"]
                rk_cur = tc["rank"]
                stat_cur = status_of(rk_cur, [v["rank"] for k, v in ops_cur.items() if k != "Telkomsel"])
                others_cur = [(k, v) for k, v in ops_cur.items() if k != "Telkomsel" and v.get("rank") is not None]
                if others_cur:
                    others_cur.sort(key=lambda x: (x[1]["rank"], -(x[1]["value"] or 0)))
                    top_prov, top_data = others_cur[0]
                    leader = OPERATOR_LABEL.get(top_prov, top_prov)
                    if top_data.get("value") is not None and tsel_cur is not None:
                        gap = round(top_data["value"] - tsel_cur, 2)
            if tp and tp.get("value") is not None:
                tsel_prev = tp["value"]
                rk_prev = tp["rank"]
                stat_prev = status_of(rk_prev, [v["rank"] for k, v in ops_prev.items() if k != "Telkomsel"])

        if tsel_cur is not None and tsel_prev is not None:
            delta = round(tsel_cur - tsel_prev, 2)
            delta_pct = round((delta / abs(tsel_prev)) * 100, 2) if abs(tsel_prev) > 0.0001 else 0.0
            flip = stat_prev in ("WIN", "DRAW") and stat_cur == "LOSE"  # draw counts as win

            if delta < -0.0001 or flip:
                kpi_degrade.append({
                    "key": item["key"],
                    "label": item["label"],
                    "source": item["source"],
                    "tech": item["tech"],
                    "prev": round(tsel_prev, 2),
                    "cur": round(tsel_cur, 2),
                    "delta": delta,
                    "delta_pct": delta_pct,
                    "status_prev": stat_prev,
                    "status_cur": stat_cur,
                    "rank_prev": rk_prev,
                    "rank_cur": rk_cur,
                    "leader": leader,
                    "gap": gap if stat_cur == "LOSE" else None,  # distance to leader, LOSE only
                    "flip": flip,
                })

    # Sort kpi_degrade: flip first, then delta_pct most negative
    kpi_degrade.sort(key=lambda x: (not x["flip"], x["delta_pct"]))
    kpi_degrade = kpi_degrade[:15]

    selected_key = key if key and key in KPI_BY_KEY else (kpi_degrade[0]["key"] if kpi_degrade else "onx_video_5g")
    target_kpi = KPI_BY_KEY.get(selected_key)

    # Now get kabupaten contributors for target_kpi
    kabupaten_contributors = []
    if target_kpi and not target_kpi["manual"]:
        region_kabs = _get_region_kabupaten_dict(region)
        if target_kpi["source"] == "ONX":
            all_onx_kabs = _get_onx_kab_names()
            onx_key_map = {kab_key(k): k for k in all_onx_kabs}
            needed_onx = [onx_key_map[kk] for kk in region_kabs if kk in onx_key_map]
            kab_raw = _load_onx_kab(needed_onx, [prev_week, cur_week])

            # kab_data[kab_key][yearweek][provider] = {rank, value}
            k_data: Dict[str, Dict[int, Dict[str, Dict[str, Any]]]] = {}
            for yw, loc, metric, prov, rk, val, lci, uci in kab_raw:
                if metric == target_kpi["db"]:
                    k_data.setdefault(kab_key(loc), {}).setdefault(yw, {})[prov] = {
                        "rank": rk, "value": val
                    }

            for kk, c_name in region_kabs.items():
                yw_dict = k_data.get(kk, {})
                tc = yw_dict.get(cur_week, {}).get("Telkomsel")
                tp = yw_dict.get(prev_week, {}).get("Telkomsel")
                if tc and tp and tc.get("value") is not None and tp.get("value") is not None:
                    val_cur = tc["value"]
                    val_prev = tp["value"]
                    rk_cur = tc["rank"]
                    rk_prev = tp["rank"]
                    st_cur = status_of(rk_cur, [v["rank"] for k, v in yw_dict.get(cur_week, {}).items() if k != "Telkomsel"])
                    st_prev = status_of(rk_prev, [v["rank"] for k, v in yw_dict.get(prev_week, {}).items() if k != "Telkomsel"])
                    delta = round(val_cur - val_prev, 2)
                    delta_pct = round((delta / abs(val_prev)) * 100, 2) if abs(val_prev) > 0.0001 else 0.0
                    flip = st_prev in ("WIN", "DRAW") and st_cur == "LOSE"  # draw counts as win

                    others = [(k, v) for k, v in yw_dict.get(cur_week, {}).items() if k != "Telkomsel" and v.get("rank") is not None]
                    leader_label = None
                    leader_val = None
                    gap = None
                    if others:
                        others.sort(key=lambda x: (x[1]["rank"], -(x[1]["value"] or 0)))
                        top_prov, top_data = others[0]
                        leader_label = OPERATOR_LABEL.get(top_prov, top_prov)
                        leader_val = top_data["value"]
                        if leader_val is not None and val_cur is not None:
                            gap = round(leader_val - val_cur, 2)

                    kabupaten_contributors.append({
                        "kabupaten": c_name,
                        "prev": round(val_prev, 2),
                        "cur": round(val_cur, 2),
                        "delta": delta,
                        "delta_pct": delta_pct,
                        "status_prev": st_prev,
                        "status_cur": st_cur,
                        "leader": leader_label,
                        "leader_value": round(leader_val, 2) if leader_val is not None else None,
                        "gap": gap if st_cur == "LOSE" else None,  # distance to leader, LOSE only
                        "flip": flip,
                    })

        elif target_kpi["source"] == "OOKLA":
            kab_raw = _load_ookla_kab(region, [prev_week, cur_week])
            metric_cols = {
                "connectivity": (4, 5),
                "speed": (6, 7),
                "video": (8, 9),
                "game": (10, 11),
                "web": (12, 13),
            }
            sc_idx, rk_idx = metric_cols.get(target_kpi["db"], (4, 5))

            k_data: Dict[str, Dict[int, Dict[str, Dict[str, Any]]]] = {}
            for r in kab_raw:
                yw, kab, tech_val, op = r[0], r[1], r[2], r[3]
                if tech_val == target_kpi["tech"]:
                    sc, rk = r[sc_idx], r[rk_idx]
                    if sc is not None or rk is not None:
                        k_data.setdefault(kab_key(kab), {}).setdefault(yw, {})[op] = {
                            "rank": int(rk) if rk is not None else None,
                            "value": float(sc) if sc is not None else None,
                        }

            for kk, c_name in region_kabs.items():
                yw_dict = k_data.get(kk, {})
                tc = yw_dict.get(cur_week, {}).get("Telkomsel")
                tp = yw_dict.get(prev_week, {}).get("Telkomsel")
                if tc and tp and tc.get("value") is not None and tp.get("value") is not None:
                    val_cur = tc["value"]
                    val_prev = tp["value"]
                    rk_cur = tc["rank"]
                    rk_prev = tp["rank"]
                    st_cur = status_of(rk_cur, [v["rank"] for k, v in yw_dict.get(cur_week, {}).items() if k != "Telkomsel"])
                    st_prev = status_of(rk_prev, [v["rank"] for k, v in yw_dict.get(prev_week, {}).items() if k != "Telkomsel"])
                    delta = round(val_cur - val_prev, 2)
                    delta_pct = round((delta / abs(val_prev)) * 100, 2) if abs(val_prev) > 0.0001 else 0.0
                    flip = st_prev in ("WIN", "DRAW") and st_cur == "LOSE"  # draw counts as win

                    others = [(k, v) for k, v in yw_dict.get(cur_week, {}).items() if k != "Telkomsel" and v.get("rank") is not None]
                    leader_label = None
                    leader_val = None
                    gap = None
                    if others:
                        others.sort(key=lambda x: (x[1]["rank"], -(x[1]["value"] or 0)))
                        top_prov, top_data = others[0]
                        leader_label = OPERATOR_LABEL.get(top_prov, top_prov)
                        leader_val = top_data["value"]
                        if leader_val is not None and val_cur is not None:
                            gap = round(leader_val - val_cur, 2)

                    kabupaten_contributors.append({
                        "kabupaten": c_name,
                        "prev": round(val_prev, 2),
                        "cur": round(val_cur, 2),
                        "delta": delta,
                        "delta_pct": delta_pct,
                        "status_prev": st_prev,
                        "status_cur": st_cur,
                        "leader": leader_label,
                        "leader_value": round(leader_val, 2) if leader_val is not None else None,
                        "gap": gap if st_cur == "LOSE" else None,  # distance to leader, LOSE only
                        "flip": flip,
                    })

    kabupaten_contributors.sort(key=lambda x: (not x["flip"], x["delta_pct"]))
    kabupaten_contributors = kabupaten_contributors[:15]

    return {
        "week": cur_week,
        "prev_week": prev_week,
        "kpi_degrade": kpi_degrade,
        "selected_key": selected_key,
        "kabupaten": kabupaten_contributors,
    }


def get_crowd_map(
    week: Optional[int] = None,
    region: str = "SULAWESI",
    source: str = "ONX",
    tech: str = "overall",
    key: str = "all",
) -> Dict[str, Any]:
    """Centroid map data for kabupaten in SULAWESI."""
    region_clean = (region if isinstance(region, str) else "SULAWESI").strip().upper()
    if region_clean != "SULAWESI":
        return {
            "week": week,
            "key": key,
            "points": [],
            "message": "Map available for SULAWESI only",
        }

    source_clean = (source if isinstance(source, str) else "ONX").strip().upper()
    tech_clean = (tech if isinstance(tech, str) else "overall").strip().lower()
    key_clean = (key if isinstance(key, str) else "all").strip()

    source_weeks = _get_source_weeks(source_clean)
    if not source_weeks:
        return {"error": "No data found"}

    sel_week = int(week) if week and int(week) in source_weeks else source_weeks[-1]

    centroids = _load_centroids()
    region_kabs = _get_region_kabupaten_dict(region_clean)

    points: List[Dict[str, Any]] = []
    no_data: List[str] = []
    win_cnt = 0
    draw_cnt = 0
    lose_cnt = 0

    if key_clean == "all":
        # Mode count
        # Load all in_target KPIs for this source and tech
        target_kpis = [
            k for k in KPI_CATALOG
            if k["source"] == source_clean and not k["manual"] and k["in_target"]
            and (
                tech_clean == "all"
                or (tech_clean == "overall" and k["tech"].lower() in ("overall", "all"))
                or (tech_clean == "5g" and k["tech"].lower() == "5g")
                or (tech_clean == "4g" and k["tech"].lower() == "4g")
            )
        ]

        if source_clean == "ONX":
            all_onx_kabs = _get_onx_kab_names()
            onx_key_map = {kab_key(k): k for k in all_onx_kabs}
            needed_onx = [onx_key_map[kk] for kk in region_kabs if kk in onx_key_map]
            kab_raw = _load_onx_kab(needed_onx, [sel_week])

            kab_data: Dict[str, Dict[str, Dict[str, Any]]] = {}
            for yw, loc, metric, prov, rk, val, lci, uci in kab_raw:
                kab_data.setdefault(kab_key(loc), {}).setdefault(metric, {})[prov] = {
                    "rank": rk, "value": val
                }

            for kk, c_name in region_kabs.items():
                cent = centroids.get(kk)
                if not cent:
                    continue

                m_dict = kab_data.get(kk, {})
                if not m_dict:
                    no_data.append(c_name)
                    points.append({
                        "kabupaten": c_name, "lat": cent["lat"], "lon": cent["lon"], "n_sites": cent["n_sites"],
                        "status": None, "win_count": 0, "draw_count": 0, "lose_count": 0, "lose_kpis": [], "has_data": False,
                    })
                    continue

                k_win = 0
                k_draw = 0
                k_lose = 0
                lose_kpis = []

                for kpi in target_kpis:
                    provs = m_dict.get(kpi["db"], {})
                    tc = provs.get("Telkomsel")
                    if tc and tc.get("rank") is not None:
                        st = status_of(tc["rank"], [v["rank"] for k, v in provs.items() if k != "Telkomsel"])
                        if st == "WIN": k_win += 1
                        elif st == "DRAW": k_draw += 1
                        elif st == "LOSE":
                            k_lose += 1
                            lose_kpis.append(kpi["label"])

                total_evaluated = k_win + k_draw + k_lose
                if total_evaluated == 0:
                    no_data.append(c_name)
                    points.append({
                        "kabupaten": c_name, "lat": cent["lat"], "lon": cent["lon"], "n_sites": cent["n_sites"],
                        "status": None, "win_count": 0, "draw_count": 0, "lose_count": 0, "lose_kpis": [], "has_data": False,
                    })
                else:
                    win_cnt += k_win
                    draw_cnt += k_draw
                    lose_cnt += k_lose
                    points.append({
                        "kabupaten": c_name,
                        "lat": cent["lat"],
                        "lon": cent["lon"],
                        "n_sites": cent["n_sites"],
                        "status": None,
                        "tsel": None, "leader": None, "leader_value": None, "gap": None, "gap_pct": None, "rank": None,
                        "win_count": k_win,
                        "draw_count": k_draw,
                        "lose_count": k_lose,
                        "lose_kpis": lose_kpis,
                        "has_data": True,
                    })

        elif source_clean == "OOKLA":
            kab_raw = _load_ookla_kab(region_clean, [sel_week])
            metric_cols = {
                "connectivity": (4, 5),
                "speed": (6, 7),
                "video": (8, 9),
                "game": (10, 11),
                "web": (12, 13),
            }

            kab_data: Dict[str, Dict[str, Dict[str, Dict[str, Any]]]] = {}
            for r in kab_raw:
                kab, tech_val, op = r[1], r[2], r[3]
                kk = kab_key(kab)
                for mp, (sc_idx, rk_idx) in metric_cols.items():
                    sc, rk = r[sc_idx], r[rk_idx]
                    if sc is not None or rk is not None:
                        kab_data.setdefault(kk, {}).setdefault(tech_val, {}).setdefault(mp, {})[op] = {
                            "rank": int(rk) if rk is not None else None,
                            "value": float(sc) if sc is not None else None,
                        }

            for kk, c_name in region_kabs.items():
                cent = centroids.get(kk)
                if not cent:
                    continue

                m_dict = kab_data.get(kk, {})
                if not m_dict:
                    no_data.append(c_name)
                    points.append({
                        "kabupaten": c_name, "lat": cent["lat"], "lon": cent["lon"], "n_sites": cent["n_sites"],
                        "status": None, "win_count": 0, "draw_count": 0, "lose_count": 0, "lose_kpis": [], "has_data": False,
                    })
                    continue

                k_win = 0
                k_draw = 0
                k_lose = 0
                lose_kpis = []

                for kpi in target_kpis:
                    ops = m_dict.get(kpi["tech"], {}).get(kpi["db"], {})
                    tc = ops.get("Telkomsel")
                    if tc and tc.get("rank") is not None:
                        st = status_of(tc["rank"], [v["rank"] for k, v in ops.items() if k != "Telkomsel"])
                        if st == "WIN": k_win += 1
                        elif st == "DRAW": k_draw += 1
                        elif st == "LOSE":
                            k_lose += 1
                            lose_kpis.append(kpi["label"])

                total_evaluated = k_win + k_draw + k_lose
                if total_evaluated == 0:
                    no_data.append(c_name)
                    points.append({
                        "kabupaten": c_name, "lat": cent["lat"], "lon": cent["lon"], "n_sites": cent["n_sites"],
                        "status": None, "win_count": 0, "draw_count": 0, "lose_count": 0, "lose_kpis": [], "has_data": False,
                    })
                else:
                    win_cnt += k_win
                    draw_cnt += k_draw
                    lose_cnt += k_lose
                    points.append({
                        "kabupaten": c_name,
                        "lat": cent["lat"],
                        "lon": cent["lon"],
                        "n_sites": cent["n_sites"],
                        "status": None,
                        "tsel": None, "leader": None, "leader_value": None, "gap": None, "gap_pct": None, "rank": None,
                        "win_count": k_win,
                        "draw_count": k_draw,
                        "lose_count": k_lose,
                        "lose_kpis": lose_kpis,
                        "has_data": True,
                    })

        return {
            "week": sel_week,
            "key": "all",
            "mode": "count",
            "points": points,
            "no_data": no_data,
            "counts": {"WIN": win_cnt, "DRAW": draw_cnt, "LOSE": lose_cnt},
        }

    else:
        # Mode status for a single KPI
        target_kpi = KPI_BY_KEY.get(key_clean)
        if not target_kpi:
            raise ValueError(f"Unknown KPI: {key_clean}")

        if target_kpi["manual"]:
            return {
                "week": sel_week,
                "key": key_clean,
                "mode": "status",
                "points": [],
                "message": "Manual KPI is only available at region level",
            }

        if target_kpi["source"] == "ONX":
            all_onx_kabs = _get_onx_kab_names()
            onx_key_map = {kab_key(k): k for k in all_onx_kabs}
            needed_onx = [onx_key_map[kk] for kk in region_kabs if kk in onx_key_map]
            kab_raw = _load_onx_kab(needed_onx, [sel_week])

            kab_data: Dict[str, Dict[str, Dict[str, Any]]] = {}
            for yw, loc, metric, prov, rk, val, lci, uci in kab_raw:
                if metric == target_kpi["db"]:
                    kab_data.setdefault(kab_key(loc), {})[prov] = {
                        "rank": rk, "value": val, "lci": lci, "uci": uci
                    }

            for kk, c_name in region_kabs.items():
                cent = centroids.get(kk)
                if not cent:
                    continue

                provs = kab_data.get(kk, {})
                tc = provs.get("Telkomsel")
                if not tc or tc.get("rank") is None:
                    no_data.append(c_name)
                    points.append({
                        "kabupaten": c_name, "lat": cent["lat"], "lon": cent["lon"], "n_sites": cent["n_sites"],
                        "status": None, "tsel": None, "leader": None, "leader_value": None, "gap": None, "gap_pct": None, "rank": None,
                        "has_data": False,
                    })
                    continue

                rk = tc["rank"]
                val = tc["value"]
                st = status_of(rk, [v["rank"] for k, v in provs.items() if k != "Telkomsel"])
                if st == "WIN": win_cnt += 1
                elif st == "DRAW": draw_cnt += 1
                elif st == "LOSE": lose_cnt += 1

                others = [(k, v) for k, v in provs.items() if k != "Telkomsel" and v.get("rank") is not None]
                leader_label = None
                leader_val = None
                gap = None
                gap_pct = None

                if others:
                    others.sort(key=lambda x: (x[1]["rank"], -(x[1]["value"] or 0)))
                    top_prov, top_data = others[0]
                    leader_label = OPERATOR_LABEL.get(top_prov, top_prov)
                    leader_val = top_data["value"]
                    if st != "WIN" and leader_val is not None and val is not None:
                        gap = round(leader_val - val, 2)
                        gap_pct = round((gap / leader_val) * 100, 2) if leader_val else 0.0
                    elif st == "WIN" and leader_val is not None and val is not None:
                        # margin
                        gap = round(val - leader_val, 2)
                        gap_pct = round((gap / val) * 100, 2) if val else 0.0

                points.append({
                    "kabupaten": c_name,
                    "lat": cent["lat"],
                    "lon": cent["lon"],
                    "n_sites": cent["n_sites"],
                    "status": st,
                    "tsel": round(val, 2) if val is not None else None,
                    "leader": leader_label,
                    "leader_value": round(leader_val, 2) if leader_val is not None else None,
                    "gap": gap,
                    "gap_pct": gap_pct,
                    "rank": rk,
                    "has_data": True,
                })

        elif target_kpi["source"] == "OOKLA":
            kab_raw = _load_ookla_kab(region_clean, [sel_week])
            metric_cols = {
                "connectivity": (4, 5),
                "speed": (6, 7),
                "video": (8, 9),
                "game": (10, 11),
                "web": (12, 13),
            }
            sc_idx, rk_idx = metric_cols.get(target_kpi["db"], (4, 5))

            kab_data: Dict[str, Dict[str, Dict[str, Any]]] = {}
            for r in kab_raw:
                kab, tech_val, op = r[1], r[2], r[3]
                if tech_val == target_kpi["tech"]:
                    sc, rk = r[sc_idx], r[rk_idx]
                    if sc is not None or rk is not None:
                        kab_data.setdefault(kab_key(kab), {})[op] = {
                            "rank": int(rk) if rk is not None else None,
                            "value": float(sc) if sc is not None else None,
                        }

            for kk, c_name in region_kabs.items():
                cent = centroids.get(kk)
                if not cent:
                    continue

                ops = kab_data.get(kk, {})
                tc = ops.get("Telkomsel")
                if not tc or tc.get("rank") is None:
                    no_data.append(c_name)
                    points.append({
                        "kabupaten": c_name, "lat": cent["lat"], "lon": cent["lon"], "n_sites": cent["n_sites"],
                        "status": None, "tsel": None, "leader": None, "leader_value": None, "gap": None, "gap_pct": None, "rank": None,
                        "has_data": False,
                    })
                    continue

                rk = tc["rank"]
                val = tc["value"]
                st = status_of(rk, [v["rank"] for k, v in ops.items() if k != "Telkomsel"])
                if st == "WIN": win_cnt += 1
                elif st == "DRAW": draw_cnt += 1
                elif st == "LOSE": lose_cnt += 1

                others = [(k, v) for k, v in ops.items() if k != "Telkomsel" and v.get("rank") is not None]
                leader_label = None
                leader_val = None
                gap = None
                gap_pct = None

                if others:
                    others.sort(key=lambda x: (x[1]["rank"], -(x[1]["value"] or 0)))
                    top_prov, top_data = others[0]
                    leader_label = OPERATOR_LABEL.get(top_prov, top_prov)
                    leader_val = top_data["value"]
                    if st != "WIN" and leader_val is not None and val is not None:
                        gap = round(leader_val - val, 2)
                        gap_pct = round((gap / leader_val) * 100, 2) if leader_val else 0.0
                    elif st == "WIN" and leader_val is not None and val is not None:
                        gap = round(val - leader_val, 2)
                        gap_pct = round((gap / val) * 100, 2) if val else 0.0

                points.append({
                    "kabupaten": c_name,
                    "lat": cent["lat"],
                    "lon": cent["lon"],
                    "n_sites": cent["n_sites"],
                    "status": st,
                    "tsel": round(val, 2) if val is not None else None,
                    "leader": leader_label,
                    "leader_value": round(leader_val, 2) if leader_val is not None else None,
                    "gap": gap,
                    "gap_pct": gap_pct,
                    "rank": rk,
                    "has_data": True,
                })

        return {
            "week": sel_week,
            "key": key_clean,
            "mode": "status",
            "points": points,
            "no_data": no_data,
            "counts": {"WIN": win_cnt, "DRAW": draw_cnt, "LOSE": lose_cnt},
        }


# ---------------------------------------------------------------------------
# KPI trend grid (PPT "TREND ACHIEVEMENT" slides: one small chart per KPI)
# ---------------------------------------------------------------------------
TREND_GROUPS: Dict[str, Dict[str, Any]] = {
    "onx_overall": {"label": "OpenSignal Overall", "source": "ONX", "keys": [
        "onx_video_all", "onx_voice_all", "onx_games_all", "onx_timeon_all", "onx_cq_all",
        "onx_dl_all", "onx_rel_all", "onx_cov_all", "onx_ul_all"]},
    "onx_5g": {"label": "OpenSignal 5G", "source": "ONX", "keys": [
        "onx_video_5g", "onx_dl_5g", "onx_avail_5g", "onx_cov_5g", "onx_voice_5g", "onx_games_5g", "onx_ul_5g"]},
    "ookla_all": {"label": "Ookla Overall", "source": "OOKLA", "tech": "ALL", "keys": [
        "ook_conn_all", "ook_speed_all", "ook_video_all", "ook_game_all", "ook_web_all"]},
    "ookla_5g": {"label": "Ookla 5G", "source": "OOKLA", "tech": "5G", "keys": [
        "ook_conn_5g", "ook_speed_5g", "ook_video_5g", "ook_game_5g", "ook_web_5g"]},
    "ookla_4g": {"label": "Ookla 4G", "source": "OOKLA", "tech": "4G", "keys": [
        "ook_conn_4g", "ook_speed_4g", "ook_video_4g", "ook_game_4g", "ook_web_4g"]},
}

_OOKLA_COLS = {"connectivity": (3, 4), "speed": (5, 6), "video": (7, 8), "game": (9, 10), "web": (11, 12)}


def get_crowd_trend_grid(
    group: str = "onx_overall",
    region: str = "SULAWESI",
    week: Optional[int] = None,
    weeks: int = 0,
) -> Dict[str, Any]:
    """All KPIs of one group as operator trend lines up to `week`.
    weeks = 0 means year to date (from week 01 of the end week's year)."""
    if group not in TREND_GROUPS:
        raise ValueError(f"Invalid group: {group}")
    grp = TREND_GROUPS[group]
    region = (region if isinstance(region, str) else "SULAWESI").strip().upper()
    try:
        weeks_cnt = int(weeks)
    except (TypeError, ValueError):
        weeks_cnt = 0

    source_weeks = _get_source_weeks(grp["source"])
    if not source_weeks:
        return {"error": "No weeks found"}
    end = week if week in source_weeks else source_weeks[-1]
    upto = [w for w in source_weeks if w <= end]
    if weeks_cnt <= 0:
        trend_weeks = [w for w in upto if w // 100 == end // 100]
    else:
        trend_weeks = upto[-max(4, min(104, weeks_cnt)):]
    w_min, w_max = trend_weeks[0], trend_weeks[-1]
    wk_set = set(trend_weeks)

    items = [KPI_BY_KEY[k] for k in grp["keys"]]
    # pts[key][op][week] = {value, rank, lci, uci}
    pts: Dict[str, Dict[str, Dict[int, Dict[str, Any]]]] = {k["key"]: {} for k in items}

    if grp["source"] == "ONX":
        by_db = {k["db"]: k["key"] for k in items}
        for yw, metric, prov, rk, val, lci, uci in _load_onx_region(region, w_min, w_max):
            key = by_db.get(metric)
            if key is None or yw not in wk_set:
                continue
            op = OPERATOR_LABEL.get(prov, prov)
            pts[key].setdefault(op, {})[yw] = {"value": val, "rank": rk, "lci": lci, "uci": uci}
    else:
        for r in _load_ookla_region(region, w_min, w_max):
            yw, tech, oper = r[0], r[1], r[2]
            if tech != grp["tech"] or yw not in wk_set:
                continue
            op = OPERATOR_LABEL.get(oper, oper)
            for k in items:
                sc, rc = _OOKLA_COLS[k["db"]]
                pts[k["key"]].setdefault(op, {})[yw] = {"value": r[sc], "rank": r[rc]}

    order = ["TSEL", "IOH", "XLSMART"]
    r2 = lambda v: round(float(v), 2) if v is not None else None  # noqa: E731
    charts = []
    for k in items:
        ops = pts[k["key"]]
        tsel = ops.get("TSEL", {})
        series = [
            {"name": op, "data": [r2(ops[op][w]["value"]) if w in ops[op] else None for w in trend_weeks]}
            for op in order if op in ops
        ]

        # Telkomsel rank and WIN / DRAW / LOSE per week (draw counts as win)
        rank_hist, status_hist = [], []
        for w in trend_weeks:
            t = tsel.get(w)
            rk = int(t["rank"]) if t and t.get("rank") is not None else None
            others = [v[w]["rank"] for o, v in ops.items() if o != "TSEL" and w in v]
            rank_hist.append(rk)
            status_hist.append(status_of(rk, others))

        last, prev = trend_weeks[-1], (trend_weeks[-2] if len(trend_weeks) > 1 else None)
        t_last = tsel.get(last)
        t_prev = tsel.get(prev) if prev else None
        wow = None
        if t_last and t_prev and t_last["value"] is not None and t_prev["value"] is not None:
            wow = r2(t_last["value"] - t_prev["value"])

        # Best competitor in the last week (lowest rank, then highest value)
        rivals = [(o, v[last]) for o, v in ops.items() if o != "TSEL" and last in v and v[last]["value"] is not None]
        rivals.sort(key=lambda x: (x[1]["rank"] if x[1]["rank"] is not None else 99, -x[1]["value"]))
        leader, leader_value, gap, needed_win = None, None, None, None
        if rivals and t_last and t_last["value"] is not None:
            leader, ld = rivals[0]
            leader_value = r2(ld["value"])
            gap = r2(t_last["value"] - ld["value"])  # >0 Telkomsel ahead, <0 behind
            if status_hist[-1] == "LOSE":
                needed_win, _ = needed_values(grp["source"], t_last, ld)

        charts.append({
            "key": k["key"],
            "label": k["label"],
            "unit": k["unit"],
            "in_target": k["in_target"],
            "rank": rank_hist[-1],
            "status": status_hist[-1],
            "rank_hist": rank_hist,
            "status_hist": status_hist,
            "value": r2(t_last["value"]) if t_last else None,
            "wow": wow,
            "leader": leader,
            "leader_value": leader_value,
            "gap": gap,
            "needed_win": needed_win,
            "series": series,
        })

    return {
        "group": group,
        "label": grp["label"],
        "region": region,
        "weeks": trend_weeks,
        "end_week": trend_weeks[-1],
        "charts": charts,
    }
