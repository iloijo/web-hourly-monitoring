"""
CEI targets and event remarks for OKR > CEI (shared by every user of the dashboard).

Tables live in onedb and are written with the ONEDB_RW_USER role:
  netpulse_cei_target  Good Cell target (%) valid from start_week (YYYYWW) until the next row
  netpulse_cei_event   remark shown on the charts; kind 'weekly' (achievement trend) or 'daily' (KQI trend)
Both tables are seeded from the W43 2026 weekly report when they are created.
"""
from datetime import date
from typing import Any, Dict, List

from .db import get_onedb_connection, get_onedb_rw_connection

_DDL = """
CREATE TABLE IF NOT EXISTS netpulse_cei_target (
    start_week  INT PRIMARY KEY,
    target_pct  NUMERIC(6, 3) NOT NULL
);
CREATE TABLE IF NOT EXISTS netpulse_cei_event (
    id          SERIAL PRIMARY KEY,
    event_date  DATE NOT NULL,
    kind        TEXT NOT NULL CHECK (kind IN ('weekly', 'daily')),
    label       TEXT NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT now()
);
"""

_SEED_TARGETS = [(202601, 88.76), (202614, 89.29), (202627, 89.90), (202640, 90.51)]

# Weekly remarks carry only a week; they are stored on the Friday that starts the week
_SEED_WEEKLY = [
    (1, "Target for Q1 2026 has been applied"),
    (7, "New method for UL/DL VoIP jitter, changed to UL/DL VoIP Qual"),
    (8, "Transport activity IP Statis DNS video improvement"),
    (9, "Ramadhan week, user throughput improved, KQI improved"),
    (11, "RAFI period, utilization up and throughput degraded"),
    (14, "Target change from 88.76 to 89.29"),
    (19, "Regular activity: maximize power by Boost PAPB on 6638 cells"),
    (23, "Core HW issue at Gayungan Makassar, fix after World Cup freeze"),
    (27, "Meta integrity change to improve VoIP (WhatsApp protocol ID); target change to 89.90%"),
    (35, "Massive degradation from rolling blackout period in Sulawesi"),
    (37, "Rollback Aro5200 parameter change supporting WhatsApp"),
    (40, "Target change to 90.51%"),
    (43, "Availability: frequent rolling blackout again, KQI degraded"),
]
_SEED_DAILY = [
    ("2026-05-05", "MME & SPGW ZTE modernization"),
    ("2026-06-10", "Hard disk boot loop issue in SUD (probe ID 165)"),
    ("2026-06-15", "VoIP jitter packet interval"),
    ("2026-06-25", "Meta VoIP integrity improvement, VoIP DL/UL Qual improved"),
    ("2026-07-02", "Meta VoIP integrity improvement, VoIP DL/UL Qual improved"),
    ("2026-07-31", "SKKL issue at NOP Manado"),
    ("2026-08-15", "SKKL recovery at NOP Manado"),
    ("2026-08-29", "Scheduled rolling blackout in Sulawesi"),
    ("2026-09-16", "MLBB & FF major game updates; Aro5200 change for WhatsApp, VoIP DL/UL degraded"),
    ("2026-09-19", "SKKL issue at P. Obi"),
    ("2026-09-28", "SKKL issue at P. Obi solved"),
    ("2026-10-03", "VoIP DL/UL Qual improved, unknown activity"),
    ("2026-10-08", "VoIP DL/UL Qual degraded, unknown activity"),
    ("2026-10-22", "VoIP DL/UL Qual degraded, unknown activity"),
]
_ready = False


def week_start(week: int) -> date:
    """CEI weeks run Friday to Thursday; week 1 starts on the first Friday of the year (2026: 2 Jan)."""
    year, num = divmod(int(week), 100)
    jan1 = date(year, 1, 1)
    first_friday = date.fromordinal(jan1.toordinal() + (4 - jan1.weekday()) % 7)
    return date.fromordinal(first_friday.toordinal() + (num - 1) * 7)


def week_of(day: date) -> int:
    """YYYYWW of the CEI week that contains `day`."""
    for year in (day.year, day.year - 1):
        start = week_start(year * 100 + 1)
        if day >= start:
            return year * 100 + (day - start).days // 7 + 1
    return day.year * 100 + 1


def _rw():
    global _ready
    conn = get_onedb_rw_connection()
    if not _ready:
        with conn, conn.cursor() as cur:
            cur.execute("SELECT to_regclass('netpulse_cei_target') IS NULL, to_regclass('netpulse_cei_event') IS NULL")
            new_target, new_event = cur.fetchone()
            cur.execute(_DDL)
            if new_target:
                cur.executemany("INSERT INTO netpulse_cei_target VALUES (%s, %s)", _SEED_TARGETS)
            if new_event:
                rows = [(week_start(202600 + w), "weekly", t) for w, t in _SEED_WEEKLY]
                rows += [(d, "daily", t) for d, t in _SEED_DAILY]
                cur.executemany("INSERT INTO netpulse_cei_event (event_date, kind, label) VALUES (%s, %s, %s)", rows)
        _ready = True
    return conn


def _read(sql: str, params=()) -> List[tuple]:
    """Reads with the pooled read role; creates and seeds the tables first when they do not exist yet."""
    if not _ready:
        _rw().close()
    conn = get_onedb_connection()
    if not conn:
        raise RuntimeError("OneDb is not reachable.")
    try:
        cur = conn.cursor()
        cur.execute(sql, params)
        return cur.fetchall()
    finally:
        conn.close()


def list_targets() -> List[Dict[str, Any]]:
    rows = _read("SELECT start_week, target_pct FROM netpulse_cei_target ORDER BY 1")
    return [{"start_week": r[0], "target_pct": float(r[1])} for r in rows]


def target_for(week: int, targets: List[Dict[str, Any]]):
    current = None
    for t in targets:
        if t["start_week"] <= week:
            current = t["target_pct"]
    return current


def save_target(start_week: int, target_pct: float) -> None:
    if not (200001 <= int(start_week) <= 210053) or not (0 < float(target_pct) <= 100):
        raise ValueError("Week must be YYYYWW and target between 0 and 100.")
    conn = _rw()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("""INSERT INTO netpulse_cei_target VALUES (%s, %s)
                           ON CONFLICT (start_week) DO UPDATE SET target_pct = EXCLUDED.target_pct""",
                        (int(start_week), float(target_pct)))
    finally:
        conn.close()


def delete_target(start_week: int) -> None:
    conn = _rw()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("DELETE FROM netpulse_cei_target WHERE start_week = %s", (int(start_week),))
    finally:
        conn.close()


def list_events() -> List[Dict[str, Any]]:
    rows = _read("SELECT id, event_date, kind, label FROM netpulse_cei_event ORDER BY event_date, id")
    return [{"id": r[0], "date": r[1].isoformat(), "week": week_of(r[1]), "kind": r[2], "label": r[3]} for r in rows]


def add_event(event_date: str, kind: str, label: str) -> None:
    label = (label or "").strip()
    if kind not in ("weekly", "daily") or not label:
        raise ValueError("Event needs a date, a kind (weekly or daily) and a label.")
    conn = _rw()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("INSERT INTO netpulse_cei_event (event_date, kind, label) VALUES (%s, %s, %s)",
                        (date.fromisoformat(event_date), kind, label[:300]))
    finally:
        conn.close()


def delete_event(event_id: int) -> None:
    conn = _rw()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("DELETE FROM netpulse_cei_event WHERE id = %s", (int(event_id),))
    finally:
        conn.close()
