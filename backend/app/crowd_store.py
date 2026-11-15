"""
Crowdsource targets and manual KPI inputs for OKR > Crowdsource (OpenSignal + Ookla).

Tables live in onedb and are written with ONEDB_RW_USER:
  netpulse_crowd_target  Target WIN per source/region valid from start_week (YYYYWW)
  netpulse_crowd_manual  Manual KPI inputs for Ookla (Coverage, Top Rated)
Both tables are created and seeded if they do not exist.
"""
from typing import Any, Dict, List, Optional
from .db import get_onedb_connection, get_onedb_rw_connection

_DDL = """
CREATE TABLE IF NOT EXISTS netpulse_crowd_target (
    source        TEXT NOT NULL CHECK (source IN ('ONX', 'OOKLA')),
    region        TEXT NOT NULL DEFAULT 'SULAWESI',
    start_week    INT  NOT NULL,
    target_win    INT  NOT NULL CHECK (target_win >= 0),
    show_on_chart BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (source, region, start_week)
);
CREATE TABLE IF NOT EXISTS netpulse_crowd_manual (
    region      TEXT NOT NULL DEFAULT 'SULAWESI',
    yearweek    INT  NOT NULL,
    kpi_key     TEXT NOT NULL CHECK (kpi_key IN ('ook_coverage_all', 'ook_toprated_all')),
    tsel_value  DOUBLE PRECISION,
    status      TEXT NOT NULL CHECK (status IN ('WIN', 'DRAW', 'LOSE')),
    updated_at  TIMESTAMP NOT NULL DEFAULT now(),
    PRIMARY KEY (region, yearweek, kpi_key)
);
"""

_SEED_TARGETS = [
    # (source, region, start_week, target_win, show_on_chart)
    ("ONX",   "SULAWESI", 202601, 12, True),
    ("ONX",   "SULAWESI", 202625, 14, True),
    ("ONX",   "SULAWESI", 202641,  8, False),
    ("OOKLA", "SULAWESI", 202601,  5, True),
    ("OOKLA", "SULAWESI", 202627,  9, True),
    ("OOKLA", "SULAWESI", 202641,  4, False),
]

_SEED_MANUAL = [
    # (region, yearweek, kpi_key, tsel_value, status)
    ("SULAWESI", 202644, "ook_coverage_all", 30.34, "WIN"),
    ("SULAWESI", 202644, "ook_toprated_all", 3.51, "WIN"),
]

_ready = False


def _validate_week(w: int, field_name: str = "week") -> None:
    if not isinstance(w, int) or w < 202401 or w > 203053 or (w % 100 < 1 or w % 100 > 53):
        raise ValueError(f"Invalid {field_name}: {w}. Expected YYYYWW format (e.g. 202644).")


def _rw():
    global _ready
    conn = get_onedb_rw_connection()
    if not _ready:
        with conn, conn.cursor() as cur:
            cur.execute("SELECT to_regclass('netpulse_crowd_target') IS NULL, to_regclass('netpulse_crowd_manual') IS NULL")
            new_target, new_manual = cur.fetchone()
            cur.execute(_DDL)
            if new_target:
                cur.executemany(
                    "INSERT INTO netpulse_crowd_target (source, region, start_week, target_win, show_on_chart) "
                    "VALUES (%s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
                    _SEED_TARGETS,
                )
            if new_manual:
                cur.executemany(
                    "INSERT INTO netpulse_crowd_manual (region, yearweek, kpi_key, tsel_value, status) "
                    "VALUES (%s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
                    _SEED_MANUAL,
                )
        _ready = True
    return conn


def _read(sql: str, params=()) -> List[tuple]:
    if not _ready:
        _rw().close()  # one-time DDL/seed only; never leave the RW connection open
    conn = get_onedb_connection()
    if conn is None:
        raise RuntimeError("onedb is unreachable (connection failed)")
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchall()
    finally:
        conn.close()


def list_targets(region: Optional[str] = None) -> List[Dict[str, Any]]:
    sql = "SELECT source, region, start_week, target_win, show_on_chart FROM netpulse_crowd_target"
    params = ()
    if region:
        sql += " WHERE UPPER(region) = UPPER(%s)"
        params = (region,)
    sql += " ORDER BY source, region, start_week"
    rows = _read(sql, params)
    return [
        {
            "source": r[0],
            "region": r[1],
            "start_week": r[2],
            "target_win": r[3],
            "show_on_chart": bool(r[4]),
        }
        for r in rows
    ]


def target_for(source: str, region: str, week: int, targets: Optional[List[Dict[str, Any]]] = None) -> Optional[Dict[str, Any]]:
    """Return target valid at `week` (latest start_week <= week for that source and region)."""
    if targets is None:
        targets = list_targets(region)
    matching = [
        t for t in targets
        if t["source"].upper() == source.upper()
        and t["region"].upper() == region.upper()
        and t["start_week"] <= week
    ]
    if not matching:
        return None
    return max(matching, key=lambda x: x["start_week"])


def save_target(source: str, region: str, start_week: int, target_win: int, show_on_chart: bool = False) -> None:
    source_clean = (source or "").strip().upper()
    if source_clean not in ("ONX", "OOKLA"):
        raise ValueError("source must be 'ONX' or 'OOKLA'")
    region_clean = (region or "SULAWESI").strip().upper()
    _validate_week(start_week, "start_week")
    if not isinstance(target_win, int) or target_win < 0 or target_win > 30:
        raise ValueError("target_win must be an integer between 0 and 30")

    conn = _rw()
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO netpulse_crowd_target (source, region, start_week, target_win, show_on_chart)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (source, region, start_week)
                DO UPDATE SET target_win = EXCLUDED.target_win, show_on_chart = EXCLUDED.show_on_chart
                """,
                (source_clean, region_clean, start_week, target_win, bool(show_on_chart)),
            )
    finally:
        conn.close()


def delete_target(source: str, region: str, start_week: int) -> None:
    source_clean = (source or "").strip().upper()
    region_clean = (region or "SULAWESI").strip().upper()
    conn = _rw()
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                "DELETE FROM netpulse_crowd_target WHERE source = %s AND region = %s AND start_week = %s",
                (source_clean, region_clean, int(start_week)),
            )
    finally:
        conn.close()


def list_manual(region: Optional[str] = None) -> List[Dict[str, Any]]:
    sql = "SELECT region, yearweek, kpi_key, tsel_value, status FROM netpulse_crowd_manual"
    params = ()
    if region:
        sql += " WHERE UPPER(region) = UPPER(%s)"
        params = (region,)
    sql += " ORDER BY region, yearweek DESC, kpi_key"
    rows = _read(sql, params)
    return [
        {
            "region": r[0],
            "yearweek": r[1],
            "kpi_key": r[2],
            "tsel_value": r[3],
            "status": r[4],
        }
        for r in rows
    ]


def manual_for(region: str, week: int, kpi_key: str, manual_list: Optional[List[Dict[str, Any]]] = None) -> Optional[Dict[str, Any]]:
    """Carry forward: return row with latest yearweek <= week."""
    if manual_list is None:
        manual_list = list_manual(region)
    matching = [
        m for m in manual_list
        if m["region"].upper() == region.upper()
        and m["kpi_key"] == kpi_key
        and m["yearweek"] <= week
    ]
    if not matching:
        return None
    return max(matching, key=lambda x: x["yearweek"])


def save_manual(region: str, yearweek: int, kpi_key: str, tsel_value: Optional[float], status: str) -> None:
    region_clean = (region or "SULAWESI").strip().upper()
    _validate_week(yearweek, "yearweek")
    kpi_clean = (kpi_key or "").strip()
    if kpi_clean not in ("ook_coverage_all", "ook_toprated_all"):
        raise ValueError("kpi_key must be 'ook_coverage_all' or 'ook_toprated_all'")
    status_clean = (status or "").strip().upper()
    if status_clean not in ("WIN", "DRAW", "LOSE"):
        raise ValueError("status must be 'WIN', 'DRAW', or 'LOSE'")
    val = float(tsel_value) if tsel_value is not None else None

    conn = _rw()
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO netpulse_crowd_manual (region, yearweek, kpi_key, tsel_value, status, updated_at)
                VALUES (%s, %s, %s, %s, %s, now())
                ON CONFLICT (region, yearweek, kpi_key)
                DO UPDATE SET tsel_value = EXCLUDED.tsel_value, status = EXCLUDED.status, updated_at = now()
                """,
                (region_clean, yearweek, kpi_clean, val, status_clean),
            )
    finally:
        conn.close()


def delete_manual(region: str, yearweek: int, kpi_key: str) -> None:
    region_clean = (region or "SULAWESI").strip().upper()
    conn = _rw()
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                "DELETE FROM netpulse_crowd_manual WHERE region = %s AND yearweek = %s AND kpi_key = %s",
                (region_clean, int(yearweek), kpi_key.strip()),
            )
    finally:
        conn.close()
