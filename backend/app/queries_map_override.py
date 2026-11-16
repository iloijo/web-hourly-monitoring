"""RNO edits of azimuth / M-tilt / E-tilt on the cell map, kept in onedb `map_cell_override`.

raw_desiqa is replaced every week, so edits never go there. One row per edit:
- status 'active'   : applied on the map on top of DESIQA (at most one active row per cell)
- status 'replaced' : superseded by a newer edit of the same cell
- status 'reset'    : the user went back to the DESIQA values
- status 'synced'   : DESIQA now carries the edited values, so the edit is finished
- status 'rolledback': undone with Rollback; the edit it replaced (if any) is active again

batch_id groups the rows written by one save (a cell plus the rest of its sector), so a rollback can undo
the whole save. deleted_at hides a closed row from History (soft delete, the row stays for the audit).

Each edited field is compared with the latest DESIQA week on every read. A field whose DESIQA value now
equals the edit counts as done; when every edited field is done the row is closed as 'synced'.
"""
import copy
import re
import threading
import uuid
from decimal import Decimal
from typing import Any, Dict, List, Optional

from .db import get_onedb_connection

FIELDS = ("azimuth", "mt", "et")
LIMITS = {"azimuth": (0.0, 360.0), "mt": (-20.0, 20.0), "et": (-10.0, 20.0)}
TOLERANCE = 0.05

_DDL = """
CREATE TABLE IF NOT EXISTS map_cell_override (
    id bigserial PRIMARY KEY,
    site_id text NOT NULL,
    ci integer NOT NULL,
    cell_name text NOT NULL DEFAULT '',
    azimuth numeric(5,1),
    mt numeric(4,1),
    et numeric(4,1),
    desiqa_azimuth numeric(5,1),
    desiqa_mt numeric(4,1),
    desiqa_et numeric(4,1),
    desiqa_week smallint,
    note text NOT NULL DEFAULT '',
    edited_by text NOT NULL,
    edited_at timestamptz NOT NULL DEFAULT now(),
    status text NOT NULL DEFAULT 'active',
    closed_by text,
    closed_at timestamptz,
    closed_week smallint
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_map_cell_override_active
    ON map_cell_override (site_id, ci, upper(cell_name)) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_map_cell_override_site ON map_cell_override (site_id);
ALTER TABLE map_cell_override ADD COLUMN IF NOT EXISTS batch_id text;
ALTER TABLE map_cell_override ADD COLUMN IF NOT EXISTS deleted_by text;
ALTER TABLE map_cell_override ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_map_cell_override_batch ON map_cell_override (batch_id) WHERE batch_id IS NOT NULL;
"""
_ready = {"ok": False}
_ready_lock = threading.Lock()


class OverrideError(Exception):
    """Validation error that is safe to show to the user."""


def _ensure_table(cur):
    if _ready["ok"]:
        return
    with _ready_lock:
        if not _ready["ok"]:
            cur.execute(_DDL)
            _ready["ok"] = True


def _f(v) -> Optional[float]:
    if v is None:
        return None
    return float(v) if isinstance(v, Decimal) else float(v)


def _same(a, b) -> bool:
    return a is not None and b is not None and abs(float(a) - float(b)) < TOLERANCE


def _num(v):
    v = _f(v)
    if v is None:
        return None
    return int(v) if v.is_integer() else round(v, 1)


def _key(site_id, ci, cell_name) -> tuple:
    return (str(site_id).upper(), int(ci), (cell_name or "").upper())


_COLS = ("id", "site_id", "ci", "cell_name", "azimuth", "mt", "et", "desiqa_azimuth", "desiqa_mt", "desiqa_et",
         "desiqa_week", "note", "edited_by", "edited_at", "status", "closed_by", "closed_at", "closed_week",
         "batch_id", "deleted_by", "deleted_at")
_SELECT = "SELECT " + ", ".join(_COLS) + " FROM map_cell_override"


def _rows(cur) -> List[Dict[str, Any]]:
    return [dict(zip(_COLS, r)) for r in cur.fetchall()]


def _public(r: Dict[str, Any]) -> Dict[str, Any]:
    out = {k: r[k] for k in ("id", "site_id", "ci", "cell_name", "note", "edited_by", "status", "closed_by",
                             "desiqa_week", "closed_week", "batch_id", "deleted_by")}
    for f in FIELDS:
        out[f] = _num(r[f])
        out[f"desiqa_{f}"] = _num(r[f"desiqa_{f}"])
    out["edited_at"] = r["edited_at"].isoformat() if r["edited_at"] else None
    out["closed_at"] = r["closed_at"].isoformat() if r["closed_at"] else None
    out["deleted_at"] = r["deleted_at"].isoformat() if r["deleted_at"] else None
    return out


def apply_overrides(data: Dict[str, Any]) -> Dict[str, Any]:
    """Copy of a /api/map/cells result with the active edits applied.

    Every cell gets `desiqa` (the DESIQA values); an edited cell also gets `override` and its azimuth / mt / et
    become the edited values. Edits that DESIQA now matches are closed here as 'synced'.
    """
    cells = data.get("cells") or []
    if not cells:
        return data
    out = copy.copy(data)
    out["cells"] = [dict(c, desiqa={f: c.get(f) for f in FIELDS}) for c in cells]
    site_ids = sorted({c["site_id"] for c in cells})
    conn = get_onedb_connection(timeout=10)
    if not conn:
        out["override_error"] = "OneDb is not reachable, edits are not shown."
        return out
    try:
        cur = conn.cursor()
        _ensure_table(cur)
        cur.execute(_SELECT + " WHERE status = 'active' AND site_id = ANY(%s)", (site_ids,))
        active = {_key(r["site_id"], r["ci"], r["cell_name"]): r for r in _rows(cur)}
        synced = []
        edited = 0
        for c in out["cells"]:
            r = active.get(_key(c["site_id"], c["ci"], c["cell_name"]))
            if not r:
                continue
            pending = [f for f in FIELDS if r[f] is not None and not _same(r[f], c["desiqa"][f])]
            if not pending:
                synced.append(r["id"])
                continue
            edited += 1
            for f in pending:
                c[f] = _num(r[f])
            c["override"] = {
                **_public(r),
                "pending": pending,
                # DESIQA moved to another value since the edit (field still differs from the edit)
                "desiqa_changed": [f for f in pending if r[f"desiqa_{f}"] is not None
                                   and c["desiqa"][f] is not None and not _same(r[f"desiqa_{f}"], c["desiqa"][f])],
            }
        if synced:
            cur.execute("""
                UPDATE map_cell_override SET status = 'synced', closed_by = 'DESIQA', closed_at = now(), closed_week = %s
                WHERE id = ANY(%s) AND status = 'active'
            """, (data.get("week"), synced))
        conn.commit()
        cur.close()
    except Exception as e:  # the map still works without the edits
        conn.rollback()
        out["override_error"] = f"Edits could not be read: {e}"
        return out
    finally:
        conn.close()
    out["edited"] = edited
    return out


def _clean_value(field: str, v) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        x = round(float(v), 1)
    except (TypeError, ValueError):
        raise OverrideError(f"{field} must be a number.")
    lo, hi = LIMITS[field]
    if field == "azimuth":
        if not lo <= x <= hi:
            raise OverrideError("Azimuth must be 0 – 360°.")
        x = 0.0 if x >= 360 else x
    elif not lo <= x <= hi:
        raise OverrideError(f"{field.upper()} must be {lo:g} – {hi:g}°.")
    return x


def _desiqa_now(cur, keys: List[tuple]) -> Dict[tuple, Dict[str, Any]]:
    """Latest-week DESIQA azimuth / mt / et of the given cells, read on the server (never trusted from the client)."""
    site_ids = sorted({k[0] for k in keys})
    cur.execute("""
        SELECT site_id, ci, COALESCE(cell_name_oss, ''), azimuth, mt, et, weeknum
        FROM raw_desiqa
        WHERE network = '4G' AND weeknum = (SELECT MAX(weeknum) FROM raw_desiqa) AND site_id = ANY(%s)
    """, (site_ids,))
    out = {}
    for sid, ci, name, az, mt, et, week in cur.fetchall():
        out.setdefault(_key(sid, ci, name), {"azimuth": _f(az), "mt": _f(mt), "et": _f(et), "week": week})
    return out


_BATCH_RE = re.compile(r"^[A-Za-z0-9-]{8,40}$")


def save_overrides(cells: List[Dict[str, Any]], values: Dict[str, Any], note: str, user: str,
                   batch_id: Optional[str] = None) -> Dict[str, Any]:
    """Edit one or more cells. `values` holds only the fields being changed; the other fields keep the cell's
    current edit. A field equal to DESIQA needs no edit; a cell left with no edited field goes back to DESIQA.
    Rows of one save share a batch_id; pass the batch_id of a previous call to add more cells to that save."""
    if batch_id is not None and not _BATCH_RE.match(str(batch_id)):
        raise OverrideError("Invalid batch id.")
    batch_id = batch_id or uuid.uuid4().hex
    if not cells:
        raise OverrideError("No cell selected.")
    if len(cells) > 60:
        raise OverrideError("At most 60 cells per save.")
    changes = {f: _clean_value(f, values[f]) for f in FIELDS if f in values}
    if not changes:
        raise OverrideError("Nothing to change.")
    note = (note or "").strip()[:300]
    try:
        keys = [_key(c["site_id"], c["ci"], c.get("cell_name") or "") for c in cells]
    except (KeyError, TypeError, ValueError):
        raise OverrideError("Each cell needs site_id, ci and cell_name.")

    conn = get_onedb_connection(timeout=10)
    if not conn:
        raise OverrideError("OneDb is not reachable.")
    saved, cleared, unchanged = 0, 0, 0
    try:
        cur = conn.cursor()
        _ensure_table(cur)
        base = _desiqa_now(cur, keys)
        missing = [k for k in keys if k not in base]
        if missing:
            raise OverrideError(f"{missing[0][0]}_{missing[0][1]} is not in the latest DESIQA week.")
        cur.execute(_SELECT + " WHERE status = 'active' AND site_id = ANY(%s)", (sorted({k[0] for k in keys}),))
        active = {_key(r["site_id"], r["ci"], r["cell_name"]): r for r in _rows(cur)}
        for k, c in zip(keys, cells):
            d = base[k]
            old = active.get(k)
            target = {f: _f(old[f]) if old else None for f in FIELDS}
            target.update(changes)
            # only fields that differ from DESIQA are kept as an edit
            target = {f: (v if v is not None and not _same(v, d[f]) else None) for f, v in target.items()}
            if old and all(_same(target[f], old[f]) or (target[f] is None and old[f] is None) for f in FIELDS) \
                    and (not note or note == old["note"]):
                unchanged += 1
                continue
            if old:
                cur.execute("UPDATE map_cell_override SET status = 'replaced', closed_by = %s, closed_at = now() WHERE id = %s",
                            (user, old["id"]))
            if all(v is None for v in target.values()):
                if old:
                    cleared += 1
                else:
                    unchanged += 1
                continue
            cur.execute("""
                INSERT INTO map_cell_override (site_id, ci, cell_name, azimuth, mt, et,
                    desiqa_azimuth, desiqa_mt, desiqa_et, desiqa_week, note, edited_by, batch_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (k[0], k[1], c.get("cell_name") or "", target["azimuth"], target["mt"], target["et"],
                  d["azimuth"], d["mt"], d["et"], d["week"], note or (old["note"] if old else ""), user, batch_id))
            saved += 1
        conn.commit()
        cur.close()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    return {"saved": saved, "cleared": cleared, "unchanged": unchanged, "batch_id": batch_id}


def reset_overrides(cells: List[Dict[str, Any]], user: str) -> Dict[str, Any]:
    """Back to DESIQA: closes the active edit of each cell as 'reset'."""
    if not cells:
        raise OverrideError("No cell selected.")
    keys = [_key(c["site_id"], c["ci"], c.get("cell_name") or "") for c in cells]
    conn = get_onedb_connection(timeout=10)
    if not conn:
        raise OverrideError("OneDb is not reachable.")
    try:
        cur = conn.cursor()
        _ensure_table(cur)
        n = 0
        for sid, ci, name in keys:
            cur.execute("""
                UPDATE map_cell_override SET status = 'reset', closed_by = %s, closed_at = now()
                WHERE status = 'active' AND site_id = %s AND ci = %s AND upper(cell_name) = %s
            """, (user, sid, ci, name))
            n += cur.rowcount
        conn.commit()
        cur.close()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    return {"reset": n}


_CELL_WHERE = "site_id = %s AND ci = %s AND upper(cell_name) = %s"


def _rollback_cell(cur, key: tuple, user: str) -> str:
    """Undo the latest change of one cell. Returns what happened: 'undone' (back to the edit before, or to
    DESIQA when there was none), 'reset_undone' (a Reset is undone, its edit is active again) or 'none'."""
    cur.execute(_SELECT + " WHERE status = 'active' AND " + _CELL_WHERE + " FOR UPDATE", key)
    active = _rows(cur)
    if active:
        a = active[0]
        cur.execute("UPDATE map_cell_override SET status = 'rolledback', closed_by = %s, closed_at = now() WHERE id = %s",
                    (user, a["id"]))
        # the edit this one replaced was closed in the same transaction, so with the same now()
        cur.execute(_SELECT + " WHERE status = 'replaced' AND deleted_at IS NULL AND closed_at = %s AND "
                    + _CELL_WHERE + " ORDER BY id DESC LIMIT 1", (a["edited_at"], *key))
        prev = _rows(cur)
        if prev:
            cur.execute("UPDATE map_cell_override SET status = 'active', closed_by = NULL, closed_at = NULL, "
                        "closed_week = NULL WHERE id = %s", (prev[0]["id"],))
        return "undone"
    # no edit on the map: undo a Reset when it is the cell's latest change
    cur.execute(_SELECT + " WHERE deleted_at IS NULL AND " + _CELL_WHERE
                + " ORDER BY coalesce(closed_at, edited_at) DESC, id DESC LIMIT 1", key)
    last = _rows(cur)
    cleared = False
    if last and last[0]["status"] == "replaced":
        # an edit saved back to the DESIQA values closes the old row without writing a new one
        cur.execute("SELECT 1 FROM map_cell_override WHERE edited_at = %s AND " + _CELL_WHERE + " LIMIT 1",
                    (last[0]["closed_at"], *key))
        cleared = cur.fetchone() is None
    if last and (last[0]["status"] == "reset" or cleared):
        cur.execute("UPDATE map_cell_override SET status = 'active', closed_by = NULL, closed_at = NULL, "
                    "closed_week = NULL WHERE id = %s", (last[0]["id"],))
        return "reset_undone"
    return "none"


def rollback_overrides(cells: List[Dict[str, Any]], batch_id: Optional[str], user: str) -> Dict[str, Any]:
    """Undo the latest change of the given cells, or of every cell whose active edit belongs to `batch_id`."""
    if batch_id is not None and not _BATCH_RE.match(str(batch_id)):
        raise OverrideError("Invalid batch id.")
    if not cells and not batch_id:
        raise OverrideError("No cell selected.")
    conn = get_onedb_connection(timeout=10)
    if not conn:
        raise OverrideError("OneDb is not reachable.")
    try:
        cur = conn.cursor()
        _ensure_table(cur)
        keys = [_key(c["site_id"], c["ci"], c.get("cell_name") or "") for c in (cells or [])]
        if batch_id:
            cur.execute("SELECT site_id, ci, cell_name FROM map_cell_override WHERE status = 'active' AND batch_id = %s",
                        (batch_id,))
            keys += [_key(*r) for r in cur.fetchall()]
        keys = list(dict.fromkeys(keys))
        if len(keys) > 60:
            raise OverrideError("At most 60 cells per rollback.")
        done = {"undone": 0, "reset_undone": 0, "none": 0}
        for k in keys:
            done[_rollback_cell(cur, k, user)] += 1
        conn.commit()
        cur.close()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    return {**done, "cells": len(keys)}


def delete_override(row_id: int, user: str, is_super: bool) -> Dict[str, Any]:
    """Soft delete of a closed History row: hidden from History, kept in the table for the audit."""
    conn = get_onedb_connection(timeout=10)
    if not conn:
        raise OverrideError("OneDb is not reachable.")
    try:
        cur = conn.cursor()
        _ensure_table(cur)
        cur.execute(_SELECT + " WHERE id = %s FOR UPDATE", (int(row_id),))
        rows = _rows(cur)
        if not rows or rows[0]["deleted_at"] is not None:
            raise OverrideError("This edit is not in History any more.")
        r = rows[0]
        if r["status"] == "active":
            raise OverrideError("The edit is still on the map: Reset or Rollback it first.")
        if not is_super and (r["edited_by"] or "").lower() != (user or "").lower():
            raise OverrideError("Only SuperAdmin can delete an edit made by someone else.")
        cur.execute("UPDATE map_cell_override SET deleted_by = %s, deleted_at = now() WHERE id = %s", (user, r["id"]))
        conn.commit()
        cur.close()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    return {"deleted": 1, "site_id": r["site_id"], "ci": r["ci"]}


def get_override_history(site_id: str, limit: int = 300, include_deleted: bool = False) -> Dict[str, Any]:
    """Every edit (active and closed) of a site, newest first. Soft-deleted rows only with include_deleted."""
    conn = get_onedb_connection(timeout=10)
    if not conn:
        return {"error": "OneDb is not reachable.", "rows": []}
    try:
        cur = conn.cursor()
        _ensure_table(cur)
        cur.execute(_SELECT + " WHERE site_id = %s" + ("" if include_deleted else " AND deleted_at IS NULL")
                    + " ORDER BY edited_at DESC, id DESC LIMIT %s", (site_id.strip().upper(), limit))
        rows = [_public(r) for r in _rows(cur)]
        conn.commit()
        cur.close()
    finally:
        conn.close()
    return {"site_id": site_id.strip().upper(), "rows": rows}
