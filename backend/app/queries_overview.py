import logging
import time
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from .db import get_onedb_connection

logger = logging.getLogger(__name__)

# Valid columns for drill-down hierarchy
VALID_DRILL_LEVELS = {
    "branch": "branch",
    "sales_cluster": "sales_cluster",
    "rtpo": "rtpo"
}

_LATEST_DATE_CACHE: Optional[str] = None
_LATEST_DATE_CACHE_TIME: float = 0
_LATEST_DATE_TTL_SEC: int = 600

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


def _apply_branch_filter(branch: Optional[str], col_expr: str = "branch"):
    """
    Returns SQL snippet and list of params for filtering by branch.
    Handles 'All', 'Unmapped', and specific branch names.
    """
    if not branch or branch.strip().lower() in ("all", "all branch", "all branches", ""):
        return "", []
    b = branch.strip()
    if b.lower() == "unmapped":
        return f"AND ({col_expr} IS NULL OR {col_expr} = 'Unmapped')", []
    return f"AND {col_expr} = %s", [b]


def get_overview_summary(date: Optional[str] = None, branch: Optional[str] = None) -> Dict[str, Any]:
    """
    Summary KPI tiles (Total Payload, 4G, 5G, Total Traffic) with YoY %,
    plus inventory site counts (2G, 4G, 5G) from latest week.
    """
    latest_date = get_latest_overview_date()
    target_date = date.strip() if date and date.strip() else latest_date

    conn = get_onedb_connection()
    if not conn:
        raise RuntimeError("Could not connect to OneDb database")

    try:
        cur = conn.cursor()

        # 1. Fetch KPI current date and YoY date
        branch_clause, branch_params = _apply_branch_filter(branch, col_expr="branch")
        query_kpi = f'''
            SELECT 
                date,
                COALESCE(SUM(total_payload_tb), 0) as total_payload,
                COALESCE(SUM(payload_4g_tb), 0) as payload_4g,
                COALESCE(SUM(payload_5g_tb), 0) as payload_5g,
                COALESCE(SUM(total_traffic_mio_erl) * 1000, 0) as total_traffic_kerl
            FROM "measDailyTrafficPayload"
            WHERE date IN (%s::date, %s::date - interval '1 year')
            {branch_clause}
            GROUP BY date
        '''
        # Params: target_date, target_date, plus branch_params
        cur.execute(query_kpi, (target_date, target_date) + tuple(branch_params))
        rows = cur.fetchall()

        cur_data = {"total_payload": 0.0, "payload_4g": 0.0, "payload_5g": 0.0, "total_traffic": 0.0}
        yoy_data = {"total_payload": None, "payload_4g": None, "payload_5g": None, "total_traffic": None}

        for r in rows:
            r_date_str = r[0].strftime("%Y-%m-%d")
            if r_date_str == target_date:
                cur_data["total_payload"] = float(r[1])
                cur_data["payload_4g"] = float(r[2])
                cur_data["payload_5g"] = float(r[3])
                cur_data["total_traffic"] = float(r[4])
            else:
                yoy_data["total_payload"] = float(r[1])
                yoy_data["payload_4g"] = float(r[2])
                yoy_data["payload_5g"] = float(r[3])
                yoy_data["total_traffic"] = float(r[4])

        def calc_pct(c_val: float, y_val: Optional[float]) -> Optional[float]:
            if y_val is not None and y_val > 0:
                return round(((c_val - y_val) / y_val) * 100.0, 2)
            return None

        # Share of 5G
        share_5g = round((cur_data["payload_5g"] / cur_data["total_payload"] * 100.0), 2) if cur_data["total_payload"] > 0 else 0.0

        kpi_result = {
            "total_payload": {
                "value": round(cur_data["total_payload"], 2),
                "yoy_val": round(yoy_data["total_payload"], 2) if yoy_data["total_payload"] is not None else None,
                "yoy_pct": calc_pct(cur_data["total_payload"], yoy_data["total_payload"]),
                "unit": "TB"
            },
            "payload_4g": {
                "value": round(cur_data["payload_4g"], 2),
                "yoy_val": round(yoy_data["payload_4g"], 2) if yoy_data["payload_4g"] is not None else None,
                "yoy_pct": calc_pct(cur_data["payload_4g"], yoy_data["payload_4g"]),
                "unit": "TB"
            },
            "payload_5g": {
                "value": round(cur_data["payload_5g"], 2),
                "yoy_val": round(yoy_data["payload_5g"], 2) if yoy_data["payload_5g"] is not None else None,
                "yoy_pct": calc_pct(cur_data["payload_5g"], yoy_data["payload_5g"]),
                "share_pct": share_5g,
                "unit": "TB"
            },
            "total_traffic": {
                "value": round(cur_data["total_traffic"], 2),
                "yoy_val": round(yoy_data["total_traffic"], 2) if yoy_data["total_traffic"] is not None else None,
                "yoy_pct": calc_pct(cur_data["total_traffic"], yoy_data["total_traffic"]),
                "unit": "KErl"
            }
        }

        # 2. Inventory site counts (latest week)
        cur.execute('SELECT MAX("Week") FROM "CellList4G"')
        max_week_row = cur.fetchone()
        latest_week = max_week_row[0] if max_week_row and max_week_row[0] else "Unknown"

        b_filter_cell, b_params_cell = _apply_branch_filter(branch, col_expr='"Branch"')
        
        # 2G count
        cur.execute(f'''
            SELECT COUNT(DISTINCT "Site ID") 
            FROM "CellList2G" 
            WHERE "Week" = %s {b_filter_cell}
        ''', (latest_week,) + tuple(b_params_cell))
        sites_2g = cur.fetchone()[0] or 0

        # 4G count
        cur.execute(f'''
            SELECT COUNT(DISTINCT "Site ID") 
            FROM "CellList4G" 
            WHERE "Week" = %s {b_filter_cell}
        ''', (latest_week,) + tuple(b_params_cell))
        sites_4g = cur.fetchone()[0] or 0

        # 5G count
        if not branch or branch.strip().lower() in ("all", "all branch", "all branches", ""):
            cur.execute('SELECT COUNT(DISTINCT siteid) FROM ref_cell_5g')
            sites_5g = cur.fetchone()[0] or 0
        else:
            b_val = branch.strip()
            if b_val.lower() == "unmapped":
                cur.execute('''
                    SELECT COUNT(DISTINCT r.siteid) 
                    FROM ref_cell_5g r
                    LEFT JOIN "LookupSITEID" l ON LEFT(r.siteid, 6) = l."Prefix Site ID"
                    WHERE l."Branch" IS NULL OR l."Branch" = 'Unmapped'
                ''')
            else:
                cur.execute('''
                    SELECT COUNT(DISTINCT r.siteid) 
                    FROM ref_cell_5g r
                    LEFT JOIN "LookupSITEID" l ON LEFT(r.siteid, 6) = l."Prefix Site ID"
                    WHERE l."Branch" = %s
                ''', (b_val,))
            sites_5g = cur.fetchone()[0] or 0

        cur.close()

        return {
            "selected_date": target_date,
            "branch": branch or "All",
            "latest_date": latest_date,
            "kpi": kpi_result,
            "inventory": {
                "week": latest_week,
                "sites_2g": int(sites_2g),
                "sites_4g": int(sites_4g),
                "sites_5g": int(sites_5g)
            }
        }
    finally:
        conn.close()


def get_overview_trend(end_date: Optional[str] = None, days: int = 30, branch: Optional[str] = None) -> Dict[str, Any]:
    """
    30-Day Productivity Trend:
    - Payload Trend: 2G, 4G, 5G stacked + YoY dashed line
    - Traffic Trend: 2G, VoLTE stacked + YoY dashed line
    """
    latest_date = get_latest_overview_date()
    target_end_date = end_date.strip() if end_date and end_date.strip() else latest_date
    safe_days = max(7, min(days, 90))

    conn = get_onedb_connection()
    if not conn:
        raise RuntimeError("Could not connect to OneDb database")

    try:
        cur = conn.cursor()

        branch_clause_cur, b_params_cur = _apply_branch_filter(branch, col_expr="branch")
        branch_clause_yoy, b_params_yoy = _apply_branch_filter(branch, col_expr="branch")

        query = f'''
            WITH cur AS (
                SELECT 
                    date,
                    (date - interval '1 year')::date as yoy_match_date,
                    COALESCE(SUM(payload_2g_tb), 0) as p2g,
                    COALESCE(SUM(payload_4g_tb), 0) as p4g,
                    COALESCE(SUM(payload_5g_tb), 0) as p5g,
                    COALESCE(SUM(total_payload_tb), 0) as p_total,
                    COALESCE(SUM(traffic_2g_mio_erl) * 1000, 0) as t2g,
                    COALESCE(SUM(traffic_volte_mio_erl) * 1000, 0) as t_volte,
                    COALESCE(SUM(total_traffic_mio_erl) * 1000, 0) as t_total
                FROM "measDailyTrafficPayload"
                WHERE date BETWEEN (%s::date - (%s - 1) * interval '1 day') AND %s::date
                {branch_clause_cur}
                GROUP BY date
            ),
            yoy AS (
                SELECT 
                    date as yoy_date,
                    COALESCE(SUM(total_payload_tb), 0) as p_total_yoy,
                    COALESCE(SUM(total_traffic_mio_erl) * 1000, 0) as t_total_yoy
                FROM "measDailyTrafficPayload"
                WHERE date BETWEEN ((%s::date - interval '1 year') - (%s - 1) * interval '1 day') AND (%s::date - interval '1 year')
                {branch_clause_yoy}
                GROUP BY date
            )
            SELECT 
                cur.date,
                cur.p2g,
                cur.p4g,
                cur.p5g,
                cur.p_total,
                yoy.p_total_yoy,
                cur.t2g,
                cur.t_volte,
                cur.t_total,
                yoy.t_total_yoy
            FROM cur
            LEFT JOIN yoy ON cur.yoy_match_date = yoy.yoy_date
            ORDER BY cur.date ASC
        '''

        params = (
            target_end_date, safe_days, target_end_date
        ) + tuple(b_params_cur) + (
            target_end_date, safe_days, target_end_date
        ) + tuple(b_params_yoy)

        cur.execute(query, params)
        rows = cur.fetchall()
        cur.close()

        trend_data = []
        for r in rows:
            d = r[0]
            trend_data.append({
                "date": d.strftime("%Y-%m-%d"),
                "date_label": d.strftime("%d %b"),
                "payload_2g": round(float(r[1]), 2),
                "payload_4g": round(float(r[2]), 2),
                "payload_5g": round(float(r[3]), 2),
                "total_payload": round(float(r[4]), 2),
                "total_payload_yoy": round(float(r[5]), 2) if r[5] is not None else None,
                "traffic_2g": round(float(r[6]), 2),
                "traffic_volte": round(float(r[7]), 2),
                "total_traffic": round(float(r[8]), 2),
                "total_traffic_yoy": round(float(r[9]), 2) if r[9] is not None else None,
            })

        return {
            "end_date": target_end_date,
            "days": safe_days,
            "branch": branch or "All",
            "trend": trend_data
        }
    finally:
        conn.close()


def get_overview_branches(date: Optional[str] = None, level: str = "branch", parent: Optional[str] = None) -> Dict[str, Any]:
    """
    Branch ranking & drill-down:
    level: 'branch' -> 'sales_cluster' -> 'rtpo'
    parent: name of parent branch or cluster
    """
    latest_date = get_latest_overview_date()
    target_date = date.strip() if date and date.strip() else latest_date

    lvl = level.lower().strip() if level else "branch"
    if lvl not in VALID_DRILL_LEVELS:
        lvl = "branch"

    col_name = VALID_DRILL_LEVELS[lvl]

    where_parent_cur = ""
    where_parent_yoy = ""
    params_parent_cur: List[Any] = []
    params_parent_yoy: List[Any] = []

    if lvl == "sales_cluster" and parent:
        p = parent.strip()
        if p.lower() == "unmapped":
            where_parent_cur = "AND (branch IS NULL OR branch = 'Unmapped')"
            where_parent_yoy = "AND (branch IS NULL OR branch = 'Unmapped')"
        else:
            where_parent_cur = "AND branch = %s"
            where_parent_yoy = "AND branch = %s"
            params_parent_cur.append(p)
            params_parent_yoy.append(p)
    elif lvl == "rtpo" and parent:
        p = parent.strip()
        if p.lower() == "unmapped":
            where_parent_cur = "AND (sales_cluster IS NULL OR sales_cluster = 'Unmapped')"
            where_parent_yoy = "AND (sales_cluster IS NULL OR sales_cluster = 'Unmapped')"
        else:
            where_parent_cur = "AND sales_cluster = %s"
            where_parent_yoy = "AND sales_cluster = %s"
            params_parent_cur.append(p)
            params_parent_yoy.append(p)

    conn = get_onedb_connection()
    if not conn:
        raise RuntimeError("Could not connect to OneDb database")

    try:
        cur = conn.cursor()

        query = f'''
            WITH cur AS (
                SELECT 
                    COALESCE("{col_name}", 'Unmapped') as name,
                    COUNT(prefix_site_id) as site_count,
                    COALESCE(SUM(total_payload_tb), 0) as payload,
                    COALESCE(SUM(total_traffic_mio_erl) * 1000, 0) as traffic
                FROM "measDailyTrafficPayload"
                WHERE date = %s::date {where_parent_cur}
                GROUP BY COALESCE("{col_name}", 'Unmapped')
            ),
            yoy AS (
                SELECT 
                    COALESCE("{col_name}", 'Unmapped') as name,
                    COALESCE(SUM(total_payload_tb), 0) as payload_yoy,
                    COALESCE(SUM(total_traffic_mio_erl) * 1000, 0) as traffic_yoy
                FROM "measDailyTrafficPayload"
                WHERE date = %s::date - interval '1 year' {where_parent_yoy}
                GROUP BY COALESCE("{col_name}", 'Unmapped')
            )
            SELECT 
                cur.name,
                cur.payload,
                CASE WHEN yoy.payload_yoy > 0 THEN ((cur.payload - yoy.payload_yoy) / yoy.payload_yoy) * 100.0 ELSE NULL END as payload_yoy_pct,
                cur.traffic,
                CASE WHEN yoy.traffic_yoy > 0 THEN ((cur.traffic - yoy.traffic_yoy) / yoy.traffic_yoy) * 100.0 ELSE NULL END as traffic_yoy_pct,
                cur.site_count
            FROM cur
            LEFT JOIN yoy ON cur.name = yoy.name
            ORDER BY cur.payload DESC
        '''

        all_params = (target_date,) + tuple(params_parent_cur) + (target_date,) + tuple(params_parent_yoy)
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

        return {
            "date": target_date,
            "level": lvl,
            "parent": parent,
            "items": items
        }
    finally:
        conn.close()


def get_overview_top_decline(date: Optional[str] = None, branch: Optional[str] = None, top_n: int = 10) -> Dict[str, Any]:
    """
    Top-N sites with the largest negative difference in total_payload_tb vs same date last year.
    """
    latest_date = get_latest_overview_date()
    target_date = date.strip() if date and date.strip() else latest_date
    safe_top_n = max(1, min(top_n, 50))

    conn = get_onedb_connection()
    if not conn:
        raise RuntimeError("Could not connect to OneDb database")

    try:
        cur = conn.cursor()

        branch_clause_cur, b_params_cur = _apply_branch_filter(branch, col_expr="branch")
        branch_clause_yoy, b_params_yoy = _apply_branch_filter(branch, col_expr="branch")

        query = f'''
            WITH cur AS (
                SELECT 
                    prefix_site_id,
                    COALESCE(kota_kabupaten, '–') as kota_kabupaten,
                    COALESCE(branch, 'Unmapped') as branch,
                    total_payload_tb as payload_cur
                FROM "measDailyTrafficPayload"
                WHERE date = %s::date {branch_clause_cur}
            ),
            yoy AS (
                SELECT 
                    prefix_site_id,
                    total_payload_tb as payload_yoy
                FROM "measDailyTrafficPayload"
                WHERE date = %s::date - interval '1 year' {branch_clause_yoy}
            )
            SELECT 
                cur.prefix_site_id,
                cur.kota_kabupaten,
                cur.branch,
                cur.payload_cur,
                yoy.payload_yoy,
                (cur.payload_cur - yoy.payload_yoy) as diff,
                CASE WHEN yoy.payload_yoy > 0 THEN ((cur.payload_cur - yoy.payload_yoy) / yoy.payload_yoy) * 100.0 ELSE NULL END as diff_pct
            FROM cur
            INNER JOIN yoy ON cur.prefix_site_id = yoy.prefix_site_id
            WHERE (cur.payload_cur - yoy.payload_yoy) < 0
            ORDER BY diff ASC
            LIMIT %s
        '''

        params = (target_date,) + tuple(b_params_cur) + (target_date,) + tuple(b_params_yoy) + (safe_top_n,)
        cur.execute(query, params)
        rows = cur.fetchall()
        cur.close()

        sites = []
        for r in rows:
            sites.append({
                "site": str(r[0]),
                "kabupaten": str(r[1]),
                "branch": str(r[2]),
                "payload_cur": round(float(r[3]), 2),
                "payload_yoy": round(float(r[4]), 2),
                "diff": round(float(r[5]), 2),
                "diff_pct": round(float(r[6]), 2) if r[6] is not None else None
            })

        return {
            "date": target_date,
            "branch": branch or "All",
            "top_n": safe_top_n,
            "sites": sites
        }
    finally:
        conn.close()
