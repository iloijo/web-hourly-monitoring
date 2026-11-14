"""
Saved clusters for Cluster Monitoring (shared by every user of the dashboard).

Tables live in onedb and are written with the ONEDB_RW_USER role:
  netpulse_cluster         one row per cluster (name, PIC, Before / After date ranges, activity markers)
  netpulse_cluster_member  site_id + sector; sector NULL means every sector of the site
"""
import json
import re
from datetime import date
from typing import Any, Dict, List, Optional

from .db import get_onedb_rw_connection

_DDL = """
CREATE TABLE IF NOT EXISTS netpulse_cluster (
    id            SERIAL PRIMARY KEY,
    name          TEXT NOT NULL UNIQUE,
    description   TEXT NOT NULL DEFAULT '',
    pic           TEXT NOT NULL DEFAULT '',
    before_start  DATE,
    before_end    DATE,
    after_start   DATE,
    after_end     DATE,
    markers       JSONB NOT NULL DEFAULT '[]',
    created_at    TIMESTAMP NOT NULL DEFAULT now(),
    updated_at    TIMESTAMP NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS netpulse_cluster_member (
    cluster_id INT NOT NULL REFERENCES netpulse_cluster(id) ON DELETE CASCADE,
    site_id    TEXT NOT NULL,
    sector     INT
);
-- tables created by the first version (activity_date + before/after days) get the date-range columns
ALTER TABLE netpulse_cluster ADD COLUMN IF NOT EXISTS before_start DATE;
ALTER TABLE netpulse_cluster ADD COLUMN IF NOT EXISTS before_end DATE;
ALTER TABLE netpulse_cluster ADD COLUMN IF NOT EXISTS after_start DATE;
ALTER TABLE netpulse_cluster ADD COLUMN IF NOT EXISTS after_end DATE;
ALTER TABLE netpulse_cluster ADD COLUMN IF NOT EXISTS markers JSONB NOT NULL DEFAULT '[]';
-- username of the dashboard user who created the cluster: only they (and SuperAdmin) may edit or delete it
ALTER TABLE netpulse_cluster ADD COLUMN IF NOT EXISTS created_by TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS netpulse_cluster_member_uq
    ON netpulse_cluster_member (cluster_id, site_id, COALESCE(sector, -1));
"""
_ready = False

_SITE_RE = re.compile(r"^[A-Z0-9]{6}$")


def _conn():
    global _ready
    conn = get_onedb_rw_connection()
    if not _ready:
        with conn, conn.cursor() as cur:
            cur.execute(_DDL)
        _ready = True
    return conn


def normalize_members(members: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Upper-cases site ids, drops duplicates and sector picks already covered by the whole site."""
    whole, sectors = set(), set()
    for m in members or []:
        site = str(m.get("site_id") or m.get("site") or "").strip().upper()
        if not _SITE_RE.match(site):
            raise ValueError(f"Invalid site ID: {site or '(empty)'}")
        sec = m.get("sector")
        if sec in (None, "", "all"):
            whole.add(site)
        else:
            sectors.add((site, int(sec)))
    out = [{"site_id": s, "sector": None} for s in sorted(whole)]
    out += [{"site_id": s, "sector": n} for s, n in sorted(sectors) if s not in whole]
    return out


def _iso(d) -> Optional[str]:
    return d.isoformat() if d else None


def _row(r, members) -> Dict[str, Any]:
    return {
        "id": r[0], "name": r[1], "description": r[2], "pic": r[3],
        "before_start": _iso(r[4]), "before_end": _iso(r[5]), "after_start": _iso(r[6]), "after_end": _iso(r[7]),
        "markers": r[8] or [],
        "created_at": r[9].isoformat(timespec="seconds"), "updated_at": r[10].isoformat(timespec="seconds"),
        "created_by": r[11] or "",
        "members": members,
    }


_SELECT = ("SELECT id, name, description, pic, before_start, before_end, after_start, after_end, markers, "
           "created_at, updated_at, created_by FROM netpulse_cluster")


def can_manage(actor: Optional[Dict[str, Any]], created_by: str) -> bool:
    """SuperAdmin, or the user who created the cluster. Clusters without an owner are SuperAdmin only."""
    if not actor:
        return False
    return bool(actor.get("is_super")) or (bool(created_by) and created_by == actor.get("username"))


class Forbidden(Exception):
    """Actor is not allowed to change this cluster."""


def list_clusters() -> List[Dict[str, Any]]:
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(_SELECT + " ORDER BY updated_at DESC")
            rows = cur.fetchall()
            cur.execute("SELECT cluster_id, site_id, sector FROM netpulse_cluster_member ORDER BY site_id, sector NULLS FIRST")
            by_id: Dict[int, list] = {}
            for cid, site, sec in cur.fetchall():
                by_id.setdefault(cid, []).append({"site_id": site, "sector": sec})
        return [_row(r, by_id.get(r[0], [])) for r in rows]
    finally:
        conn.close()


def _opt_date(payload: Dict[str, Any], key: str) -> Optional[date]:
    value = payload.get(key)
    try:
        return date.fromisoformat(str(value)[:10]) if value else None
    except ValueError:
        raise ValueError(f"Invalid {key.replace('_', ' ')}: {value!r}")


def _markers(raw) -> str:
    out = {}
    for m in raw or []:
        d = str((m or {}).get("date") or "")[:10]
        date.fromisoformat(d)  # raises ValueError on a bad date
        out[d] = str(m.get("label") or "Activity").strip()[:80]
    return json.dumps([{"date": d, "label": out[d]} for d in sorted(out)])


def _validate(payload: Dict[str, Any]):
    name = str(payload.get("name") or "").strip()
    if not name:
        raise ValueError("Cluster name is required.")
    members = normalize_members(payload.get("members"))
    if not members:
        raise ValueError("A cluster needs at least one site.")
    dates = [_opt_date(payload, k) for k in ("before_start", "before_end", "after_start", "after_end")]
    b_start, b_end, a_start, a_end = dates
    if (b_start and b_end and b_start > b_end) or (a_start and a_end and a_start > a_end):
        raise ValueError("Each period must start on or before its end.")
    if b_end and a_start and b_end >= a_start:
        raise ValueError("The Before period must end before the After period starts.")
    return (name, str(payload.get("description") or "").strip(), str(payload.get("pic") or "").strip(),
            *dates, _markers(payload.get("markers"))), members


def save_cluster(payload: Dict[str, Any], actor: Optional[Dict[str, Any]], cluster_id: Optional[int] = None) -> Dict[str, Any]:
    """Creates a cluster (cluster_id None) or replaces an existing one with its members.

    PIC is the creator's name and is set once; edits keep it. Only the creator or SuperAdmin may edit.
    """
    fields, members = _validate(payload)
    actor_name = str((actor or {}).get("username") or "")
    pic_name = str((actor or {}).get("full_name") or actor_name)
    conn = _conn()
    try:
        with conn, conn.cursor() as cur:
            if cluster_id is None:
                cur.execute(
                    "INSERT INTO netpulse_cluster (name, description, pic, before_start, before_end, after_start, after_end, "
                    "markers, created_by) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
                    fields[:2] + (pic_name,) + fields[3:] + (actor_name,))
                cluster_id = cur.fetchone()[0]
            else:
                cur.execute("SELECT pic, created_by FROM netpulse_cluster WHERE id=%s FOR UPDATE", (cluster_id,))
                row = cur.fetchone()
                if row is None:
                    raise LookupError("Cluster not found.")
                if not can_manage(actor, row[1]):
                    raise Forbidden("Hanya pembuat cluster atau SuperAdmin yang bisa mengedit cluster ini.")
                fields = fields[:2] + (row[0],) + fields[3:]  # keep the original PIC
                cur.execute(
                    "UPDATE netpulse_cluster SET name=%s, description=%s, pic=%s, before_start=%s, before_end=%s, "
                    "after_start=%s, after_end=%s, markers=%s, updated_at=now() WHERE id=%s", fields + (cluster_id,))
                cur.execute("DELETE FROM netpulse_cluster_member WHERE cluster_id=%s", (cluster_id,))
            cur.executemany(
                "INSERT INTO netpulse_cluster_member (cluster_id, site_id, sector) VALUES (%s, %s, %s)",
                [(cluster_id, m["site_id"], m["sector"]) for m in members])
            cur.execute(_SELECT + " WHERE id=%s", (cluster_id,))
            return _row(cur.fetchone(), members)
    finally:
        conn.close()


def delete_cluster(cluster_id: int, actor: Optional[Dict[str, Any]]) -> bool:
    conn = _conn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("SELECT created_by FROM netpulse_cluster WHERE id=%s FOR UPDATE", (cluster_id,))
            row = cur.fetchone()
            if row is None:
                return False
            if not can_manage(actor, row[0]):
                raise Forbidden("Hanya pembuat cluster atau SuperAdmin yang bisa menghapus cluster ini.")
            cur.execute("DELETE FROM netpulse_cluster WHERE id=%s", (cluster_id,))
            return cur.rowcount > 0
    finally:
        conn.close()
