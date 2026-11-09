import logging
import time
from datetime import datetime, date, timedelta
from typing import Optional, Dict, Any, List, Tuple
from collections import OrderedDict
from .db import get_onedb_connection

logger = logging.getLogger(__name__)

# Cache for latest date
_LATEST_DATE_CACHE: Optional[str] = None
_LATEST_DATE_CACHE_TIME: float = 0
_LATEST_DATE_TTL_SEC: int = 600

# Cache for dataset: (year, latest_date) -> dataset_dict
_DATASET_CACHE: Dict[Tuple[int, str], Dict[str, Any]] = {}

# Cache for inventory: week -> inventory_dict
_INVENTORY_CACHE: Dict[str, Dict[str, Any]] = {}

# LRU Cache for drill and top_decline
_LRU_CACHE: "OrderedDict[Tuple, Any]" = OrderedDict()
_LRU_MAX_ENTRIES = 200

def get_latest_overview_date() -> str:
    """Returns the latest date (YYYY-MM-DD) from measDailyTrafficPayload, cached for 10 min."""
    global _LATEST_DATE_CACHE, _LATEST_DATE_CACHE_TIME
    now = time.time()
    if _LATEST_DATE_CACHE and (now - _LATEST_DATE_CACHE_TIME < _LATEST_DATE_TTL_SEC):
        return _LATEST_DATE_CACHE

    conn = get_onedb_connection()
    if not conn:
        return (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

    try:
        cur = conn.cursor()
        cur.execute('SELECT MAX(date) FROM "measDailyTrafficPayload"')
        max_d = cur.fetchone()[0]
        cur.close()
        if max_d:
            _LATEST_DATE_CACHE = max_d.strftime("%Y-%m-%d")
            _LATEST_DATE_CACHE_TIME = now
            return _LATEST_DATE_CACHE
    except Exception as e:
        logger.warning(f"Failed to fetch latest date from measDailyTrafficPayload: {e}")
    finally:
        conn.close()

    return (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")


def safe_shift_year(d: date, delta_years: int = -1) -> date:
    """Safely shift year, converting Feb 29 to Feb 28 on non-leap years."""
    try:
        return d.replace(year=d.year + delta_years)
    except ValueError:
        return d.replace(year=d.year + delta_years, day=28)


def get_overview_dataset(year: int = 2026, refresh: bool = False) -> Dict[str, Any]:
    """
    Returns daily aggregate x NOP for `year` and `year - 1`.
    Columns: date, nop, payload_2g, payload_4g, payload_5g, total_payload, traffic_2g, traffic_volte, total_traffic.
    Cached in-memory by (year, latest_date).
    """
    latest_date = get_latest_overview_date()
    cache_key = (year, latest_date)

    if not refresh and cache_key in _DATASET_CACHE:
        return _DATASET_CACHE[cache_key]

    conn = get_onedb_connection()
    if not conn:
        raise RuntimeError("Could not connect to OneDb database")

    try:
        cur = conn.cursor()
        query = '''
            WITH lk AS (
                SELECT DISTINCT ON ("Prefix Site ID") "Prefix Site ID" AS p, "NOP" AS nop
                FROM "LookupSITEID" ORDER BY "Prefix Site ID"
            )
            SELECT 
                m.date,
                COALESCE(lk.nop, 'Unmapped') as nop,
                ROUND(SUM(m.payload_2g_tb)::numeric, 4) as payload_2g,
                ROUND(SUM(m.payload_4g_tb)::numeric, 4) as payload_4g,
                ROUND(SUM(m.payload_5g_tb)::numeric, 4) as payload_5g,
                ROUND(SUM(m.total_payload_tb)::numeric, 4) as total_payload,
                ROUND((SUM(m.traffic_2g_mio_erl) * 1000)::numeric, 4) as traffic_2g,
                ROUND((SUM(m.traffic_volte_mio_erl) * 1000)::numeric, 4) as traffic_volte,
                ROUND((SUM(m.total_traffic_mio_erl) * 1000)::numeric, 4) as total_traffic
            FROM "measDailyTrafficPayload" m
            LEFT JOIN lk ON lk.p = m.prefix_site_id
            WHERE m.date >= make_date(%s - 1, 1, 1) AND m.date <= make_date(%s, 12, 31)
            GROUP BY m.date, COALESCE(lk.nop, 'Unmapped')
            ORDER BY m.date ASC, nop ASC
        '''
        cur.execute(query, (year, year))
        rows = cur.fetchall()
        cur.close()

        items = []
        for r in rows:
            items.append({
                "date": r[0].strftime("%Y-%m-%d"),
                "nop": str(r[1]),
                "p2g": float(r[2]),
                "p4g": float(r[3]),
                "p5g": float(r[4]),
                "ptot": float(r[5]),
                "t2g": float(r[6]),
                "tvolte": float(r[7]),
                "ttot": float(r[8]),
            })

        result = {
            "year": year,
            "latest_date": latest_date,
            "total_rows": len(items),
            "rows": items
        }

        # Save to cache
        _DATASET_CACHE[cache_key] = result
        return result
    finally:
        conn.close()


def get_overview_inventory(refresh: bool = False) -> Dict[str, Any]:
    """
    Returns registered site inventory counts for ALL NOPs at once.
    Keys: NOP name -> { sites_2g, sites_4g, sites_5g }.
    Includes "All" key representing total unique sites across the entire network.
    """
    conn = get_onedb_connection()
    if not conn:
        raise RuntimeError("Could not connect to OneDb database")

    try:
        cur = conn.cursor()
        cur.execute('SELECT MAX("Week") FROM "CellList4G"')
        max_week_row = cur.fetchone()
        latest_week = max_week_row[0] if max_week_row and max_week_row[0] else "Unknown"

        if not refresh and latest_week in _INVENTORY_CACHE:
            cur.close()
            return _INVENTORY_CACHE[latest_week]

        # 1. 2G per NOP
        cur.execute('''
            WITH lk AS (
                SELECT DISTINCT ON ("Prefix Site ID") "Prefix Site ID" AS p, "NOP" AS nop
                FROM "LookupSITEID" ORDER BY "Prefix Site ID"
            )
            SELECT COALESCE(lk.nop, 'Unmapped') as nop, COUNT(DISTINCT c."Site ID")
            FROM "CellList2G" c
            LEFT JOIN lk ON lk.p = LEFT(c."Site ID", 6)
            WHERE c."Week" = %s
            GROUP BY COALESCE(lk.nop, 'Unmapped')
        ''', (latest_week,))
        dict_2g = {r[0]: int(r[1]) for r in cur.fetchall()}

        # Total 2G All
        cur.execute('SELECT COUNT(DISTINCT "Site ID") FROM "CellList2G" WHERE "Week" = %s', (latest_week,))
        tot_2g = int(cur.fetchone()[0] or 0)

        # 2. 4G per NOP
        cur.execute('''
            WITH lk AS (
                SELECT DISTINCT ON ("Prefix Site ID") "Prefix Site ID" AS p, "NOP" AS nop
                FROM "LookupSITEID" ORDER BY "Prefix Site ID"
            )
            SELECT COALESCE(lk.nop, 'Unmapped') as nop, COUNT(DISTINCT c."Site ID")
            FROM "CellList4G" c
            LEFT JOIN lk ON lk.p = LEFT(c."Site ID", 6)
            WHERE c."Week" = %s
            GROUP BY COALESCE(lk.nop, 'Unmapped')
        ''', (latest_week,))
        dict_4g = {r[0]: int(r[1]) for r in cur.fetchall()}

        # Total 4G All
        cur.execute('SELECT COUNT(DISTINCT "Site ID") FROM "CellList4G" WHERE "Week" = %s', (latest_week,))
        tot_4g = int(cur.fetchone()[0] or 0)

        # 3. 5G per NOP
        cur.execute('''
            WITH lk AS (
                SELECT DISTINCT ON ("Prefix Site ID") "Prefix Site ID" AS p, "NOP" AS nop
                FROM "LookupSITEID" ORDER BY "Prefix Site ID"
            )
            SELECT COALESCE(lk.nop, 'Unmapped') as nop, COUNT(DISTINCT r.siteid)
            FROM ref_cell_5g r
            LEFT JOIN lk ON lk.p = LEFT(r.siteid, 6)
            GROUP BY COALESCE(lk.nop, 'Unmapped')
        ''')
        dict_5g = {r[0]: int(r[1]) for r in cur.fetchall()}

        # Total 5G All
        cur.execute('SELECT COUNT(DISTINCT siteid) FROM ref_cell_5g')
        tot_5g = int(cur.fetchone()[0] or 0)

        cur.close()

        all_nops = set(list(dict_2g.keys()) + list(dict_4g.keys()) + list(dict_5g.keys()))
        all_nops.add("All")

        nops_data = {}
        for n in all_nops:
            if n == "All":
                nops_data["All"] = {
                    "sites_2g": tot_2g,
                    "sites_4g": tot_4g,
                    "sites_5g": tot_5g
                }
            else:
                nops_data[n] = {
                    "sites_2g": dict_2g.get(n, 0),
                    "sites_4g": dict_4g.get(n, 0),
                    "sites_5g": dict_5g.get(n, 0)
                }

        res = {
            "week": latest_week,
            "nops": nops_data
        }
        _INVENTORY_CACHE[latest_week] = res
        return res
    finally:
        conn.close()


def _get_mode_ranges(date_str: str, mode: str) -> Tuple[date, date, date, date]:
    """Returns (cur_start, cur_end, yoy_start, yoy_end) for given mode and date."""
    target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    m = mode.upper().strip()

    if m == "MTD":
        cur_start = target_date.replace(day=1)
        cur_end = target_date
        yoy_start = safe_shift_year(cur_start, -1)
        yoy_end = safe_shift_year(cur_end, -1)
    elif m == "YTD":
        cur_start = target_date.replace(month=1, day=1)
        cur_end = target_date
        yoy_start = safe_shift_year(cur_start, -1)
        yoy_end = safe_shift_year(cur_end, -1)
    else:  # YoY (single day)
        cur_start = target_date
        cur_end = target_date
        yoy_start = safe_shift_year(target_date, -1)
        yoy_end = yoy_start

    return cur_start, cur_end, yoy_start, yoy_end


def get_overview_drill(
    date: str,
    mode: str = "YTD",
    level: str = "kabupaten",
    parent: Optional[str] = None,
    nop: Optional[str] = None
) -> Dict[str, Any]:
    """
    Drill-down ranking: NOP -> Kabupaten -> Kecamatan.
    Level: 'kabupaten' (parent is NOP) or 'kecamatan' (parent is Kabupaten).
    """
    latest_date = get_latest_overview_date()
    target_date_str = date.strip() if date and date.strip() else latest_date
    lvl = level.lower().strip() if level else "kabupaten"
    if lvl not in ("kabupaten", "kecamatan"):
        lvl = "kabupaten"

    cur_start, cur_end, yoy_start, yoy_end = _get_mode_ranges(target_date_str, mode)

    cache_key = ("drill", target_date_str, mode, lvl, parent or "", nop or "", latest_date)
    if cache_key in _LRU_CACHE:
        _LRU_CACHE.move_to_end(cache_key)
        return _LRU_CACHE[cache_key]

    conn = get_onedb_connection()
    if not conn:
        raise RuntimeError("Could not connect to OneDb database")

    try:
        cur = conn.cursor()

        col_expr = "lk.kab" if lvl == "kabupaten" else "lk.kec"
        filter_clause = ""
        params_filter: List[Any] = []

        if lvl == "kabupaten":
            # Parent is NOP (or nop parameter)
            active_nop = parent or nop
            if active_nop and active_nop.strip().lower() not in ("all", "all branch", "all nop", ""):
                if active_nop.strip().lower() == "unmapped":
                    filter_clause = "WHERE lk.nop IS NULL OR lk.nop = 'Unmapped'"
                else:
                    filter_clause = "WHERE lk.nop = %s"
                    params_filter.append(active_nop.strip())
        else:
            # Level is kecamatan: parent is Kabupaten
            if parent:
                if parent.strip().lower() == "unmapped":
                    filter_clause = "WHERE lk.kab IS NULL OR lk.kab = 'Unmapped'"
                else:
                    filter_clause = "WHERE lk.kab = %s"
                    params_filter.append(parent.strip())

        query = f'''
            WITH lk AS (
                SELECT DISTINCT ON ("Prefix Site ID") "Prefix Site ID" AS p, "NOP" AS nop,
                       "Kota/Kabupaten" AS kab, "Kecamatan" AS kec
                FROM "LookupSITEID" ORDER BY "Prefix Site ID"
            ),
            target_lk AS (
                SELECT p, nop, kab, kec FROM lk {filter_clause}
            ),
            cur_agg AS (
                SELECT 
                    COALESCE({col_expr}, 'Unmapped') as name,
                    COUNT(DISTINCT m.prefix_site_id) as site_count,
                    COALESCE(SUM(m.total_payload_tb), 0) as payload,
                    COALESCE(SUM(m.total_traffic_mio_erl) * 1000, 0) as traffic
                FROM target_lk lk
                JOIN "measDailyTrafficPayload" m ON m.prefix_site_id = lk.p
                WHERE m.date BETWEEN %s AND %s
                GROUP BY COALESCE({col_expr}, 'Unmapped')
            ),
            yoy_agg AS (
                SELECT 
                    COALESCE({col_expr}, 'Unmapped') as name,
                    COALESCE(SUM(m.total_payload_tb), 0) as payload_yoy,
                    COALESCE(SUM(m.total_traffic_mio_erl) * 1000, 0) as traffic_yoy
                FROM target_lk lk
                JOIN "measDailyTrafficPayload" m ON m.prefix_site_id = lk.p
                WHERE m.date BETWEEN %s AND %s
                GROUP BY COALESCE({col_expr}, 'Unmapped')
            )
            SELECT 
                cur.name,
                cur.payload,
                CASE WHEN yoy.payload_yoy > 0 THEN ((cur.payload - yoy.payload_yoy) / yoy.payload_yoy) * 100.0 ELSE NULL END as payload_yoy_pct,
                cur.traffic,
                CASE WHEN yoy.traffic_yoy > 0 THEN ((cur.traffic - yoy.traffic_yoy) / yoy.traffic_yoy) * 100.0 ELSE NULL END as traffic_yoy_pct,
                cur.site_count
            FROM cur_agg cur
            LEFT JOIN yoy_agg yoy ON cur.name = yoy.name
            ORDER BY cur.payload DESC
        '''

        all_params = tuple(params_filter) + (cur_start, cur_end, yoy_start, yoy_end)
        cur.execute(query, all_params)
        rows = cur.fetchall()
        cur.close()

        items = []
        for r in rows:
            items.append({
                "name": str(r[0]),
                "payload": round(float(r[1]), 2),
                "payload_yoy_pct": round(float(r[2]), 2) if r[2] is not None else None,
                "traffic": round(float(r[3]), 2),
                "traffic_yoy_pct": round(float(r[4]), 2) if r[4] is not None else None,
                "site_count": int(r[5])
            })

        res = {
            "date": target_date_str,
            "mode": mode,
            "level": lvl,
            "parent": parent,
            "items": items
        }

        _LRU_CACHE[cache_key] = res
        while len(_LRU_CACHE) > _LRU_MAX_ENTRIES:
            _LRU_CACHE.popitem(last=False)

        return res
    finally:
        conn.close()


def get_overview_top_decline(
    date: str,
    mode: str = "YTD",
    nop: Optional[str] = None,
    top_n: int = 10
) -> Dict[str, Any]:
    """
    Top-N sites with the largest negative difference in payload vs same period last year.
    For MTD/YTD, decline is computed from total payload in that period.
    """
    latest_date = get_latest_overview_date()
    target_date_str = date.strip() if date and date.strip() else latest_date
    safe_top_n = max(1, min(top_n, 50))

    cur_start, cur_end, yoy_start, yoy_end = _get_mode_ranges(target_date_str, mode)

    cache_key = ("top_decline", target_date_str, mode, nop or "", safe_top_n, latest_date)
    if cache_key in _LRU_CACHE:
        _LRU_CACHE.move_to_end(cache_key)
        return _LRU_CACHE[cache_key]

    conn = get_onedb_connection()
    if not conn:
        raise RuntimeError("Could not connect to OneDb database")

    try:
        cur = conn.cursor()

        nop_clause = ""
        nop_params: List[Any] = []
        if nop and nop.strip().lower() not in ("all", "all branch", "all nop", ""):
            if nop.strip().lower() == "unmapped":
                nop_clause = "WHERE lk.nop IS NULL OR lk.nop = 'Unmapped'"
            else:
                nop_clause = "WHERE lk.nop = %s"
                nop_params.append(nop.strip())

        query = f'''
            WITH lk AS (
                SELECT DISTINCT ON ("Prefix Site ID") "Prefix Site ID" AS p, "NOP" AS nop,
                       "Kota/Kabupaten" AS kab
                FROM "LookupSITEID" ORDER BY "Prefix Site ID"
            ),
            target_sites AS (
                SELECT p, nop, kab FROM lk {nop_clause}
            ),
            site_cur AS (
                SELECT m.prefix_site_id, SUM(m.total_payload_tb) as p_cur
                FROM "measDailyTrafficPayload" m
                JOIN target_sites t ON t.p = m.prefix_site_id
                WHERE m.date BETWEEN %s AND %s
                GROUP BY m.prefix_site_id
            ),
            site_yoy AS (
                SELECT m.prefix_site_id, SUM(m.total_payload_tb) as p_yoy
                FROM "measDailyTrafficPayload" m
                JOIN target_sites t ON t.p = m.prefix_site_id
                WHERE m.date BETWEEN %s AND %s
                GROUP BY m.prefix_site_id
            )
            SELECT 
                c.prefix_site_id,
                COALESCE(t.kab, '–') as kabupaten,
                COALESCE(t.nop, 'Unmapped') as nop,
                ROUND(c.p_cur::numeric, 2) as payload_cur,
                ROUND(y.p_yoy::numeric, 2) as payload_yoy,
                ROUND((c.p_cur - y.p_yoy)::numeric, 2) as diff,
                CASE WHEN y.p_yoy > 0 THEN ROUND((((c.p_cur - y.p_yoy) / y.p_yoy) * 100)::numeric, 2) ELSE NULL END as diff_pct
            FROM site_cur c
            INNER JOIN site_yoy y ON c.prefix_site_id = y.prefix_site_id
            JOIN target_sites t ON t.p = c.prefix_site_id
            WHERE (c.p_cur - y.p_yoy) < 0
            ORDER BY diff ASC
            LIMIT %s
        '''

        all_params = tuple(nop_params) + (cur_start, cur_end, yoy_start, yoy_end, safe_top_n)
        cur.execute(query, all_params)
        rows = cur.fetchall()
        cur.close()

        sites = []
        for r in rows:
            sites.append({
                "site": str(r[0]),
                "kabupaten": str(r[1]),
                "nop": str(r[2]),
                "payload_cur": float(r[3]),
                "payload_yoy": float(r[4]),
                "diff": float(r[5]),
                "diff_pct": float(r[6]) if r[6] is not None else None
            })

        res = {
            "date": target_date_str,
            "mode": mode,
            "nop": nop or "All",
            "top_n": safe_top_n,
            "sites": sites
        }

        _LRU_CACHE[cache_key] = res
        while len(_LRU_CACHE) > _LRU_MAX_ENTRIES:
            _LRU_CACHE.popitem(last=False)

        return res
    finally:
        conn.close()


def prewarm_overview_cache():
    """Background pre-warm for current year dataset and inventory on server startup."""
    try:
        now_year = datetime.now().year
        logger.info(f"Pre-warming Overview dataset for year {now_year}...")
        get_overview_dataset(year=now_year)
        logger.info("Pre-warming Overview inventory...")
        get_overview_inventory()
        logger.info("Overview cache pre-warm completed.")
    except Exception as e:
        logger.warning(f"Overview cache pre-warm failed: {e}")
