"""RNO revision of DESIQA: two versions of the cell database.

- Original : raw_desiqa as synced every week (read only, latest week).
- RNO      : Original + the RNO revisions below + the azimuth / M-tilt / E-tilt edits of map_cell_override.

DESIQA is not always right, so RNO keeps its own values per field in onedb `map_desiqa_revision`
(one row per edit of one field, same life cycle as map_cell_override):
- 'active'   applied in the RNO version (at most one per cell or site and field)
- 'replaced' superseded by a newer edit, 'reset' back to DESIQA, 'synced' DESIQA now carries the value.
Site fields (coordinates, tower, address...) have ci = -1 and hold for every cell of the site.
Azimuth / M-tilt / E-tilt stay in map_cell_override (their editor has the DESIQA guard and rollback).
"""
import threading
import uuid
from collections import Counter
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

from .db import get_onedb_connection

SITE_CI = -1

# id, label, level, group, kind (num/text), (min, max) for numbers
FIELD_DEFS = [
    # RF (cell)
    ("tinggi_antena_m", "Antenna height (m)", "cell", "rf", "num", (0, 200)),
    ("tipe_antena", "Antenna type", "cell", "rf", "text", None),
    ("beamwidth", "H-beamwidth (°)", "cell", "rf", "num", (5, 360)),
    ("pci_scr_bcch", "PCI", "cell", "rf", "num", (0, 1007)),
    ("band", "Band", "cell", "rf", "text", None),
    ("bandwidth_lte", "Bandwidth LTE", "cell", "rf", "text", None),
    ("micro_macro", "Micro / Macro", "cell", "rf", "text", None),
    ("cell_name_oss", "Cell name OSS", "cell", "rf", "text", None),
    # location (site)
    ("site_lat", "Latitude", "site", "location", "num", (-12, 8)),
    ("site_long", "Longitude", "site", "location", "num", (110, 142)),
    ("tinggi_tower_m", "Tower height (m)", "site", "location", "num", (0, 200)),
    ("tipe_site", "Site type", "site", "location", "text", None),
    ("site_location", "Site location", "site", "location", "text", None),
    ("nop", "NOP", "site", "location", "text", None),
    ("propinsi", "Province", "site", "location", "text", None),
    ("kota_kabupaten", "Kabupaten", "site", "location", "text", None),
    ("kecamatan", "Kecamatan", "site", "location", "text", None),
    ("kelurahan", "Kelurahan", "site", "location", "text", None),
    ("alamat", "Address", "site", "location", "text", None),
    # other cell fields
    ("neid", "NE ID", "cell", "other", "text", None),
    ("neid_sec", "NE ID sector", "cell", "other", "text", None),
    ("bts_name", "BTS name", "cell", "other", "text", None),
    ("bts_name_oss", "BTS name OSS", "cell", "other", "text", None),
    ("lac", "LAC / TAC", "cell", "other", "text", None),
    ("lacci", "LACCI", "cell", "other", "text", None),
    ("cgi", "CGI", "cell", "other", "text", None),
    ("bsc_rnc_id", "BSC/RNC ID", "cell", "other", "text", None),
    ("bsc_rnc_name", "BSC/RNC name", "cell", "other", "text", None),
    ("bts_no", "BTS no", "cell", "other", "text", None),
    ("site", "Site", "cell", "other", "text", None),
    ("bts", "BTS", "cell", "other", "text", None),
    ("type", "Type", "cell", "other", "text", None),
    ("trx", "TRX", "cell", "other", "text", None),
    ("ncc", "NCC", "cell", "other", "text", None),
    ("bcc", "BCC", "cell", "other", "text", None),
    ("remark_db", "Remark DB", "cell", "other", "text", None),
    ("oa_date", "OA date", "cell", "other", "text", None),
    ("keterangan", "Keterangan", "cell", "other", "text", None),
    # other site fields
    ("vendor", "Vendor", "site", "other", "text", None),
    ("cluster_sales", "Cluster sales", "site", "other", "text", None),
    ("do_name", "DO name", "site", "other", "text", None),
    ("branch", "Branch", "site", "other", "text", None),
    ("sub_branch", "Sub branch", "site", "other", "text", None),
    ("infra_type", "Infra type", "site", "other", "text", None),
    ("power_system", "Power system", "site", "other", "text", None),
    ("main_power", "Main power", "site", "other", "text", None),
    ("daya_kva", "Daya (kVA)", "site", "other", "text", None),
    ("transport_type", "Transport type", "site", "other", "text", None),
    ("bandwidth_transport", "Transport bandwidth", "site", "other", "text", None),
    ("transmission", "Transmission", "site", "other", "text", None),
    ("tower_provider", "Tower provider", "site", "other", "text", None),
    ("objective_coverage", "Objective coverage", "site", "other", "text", None),
    ("bcp_status", "BCP status", "site", "other", "text", None),
    ("status_lahan", "Status lahan", "site", "other", "text", None),
    ("start_periode_kontrak", "Contract start", "site", "other", "text", None),
    ("end_periode_kontrak", "Contract end", "site", "other", "text", None),
    ("flag_site", "Flag site", "site", "other", "text", None),
]
FIELDS = {f[0]: {"id": f[0], "label": f[1], "level": f[2], "group": f[3], "kind": f[4], "range": f[5]} for f in FIELD_DEFS}
DESIQA_COLS = [f for f in FIELDS if f != "beamwidth"]   # beamwidth comes from tb_GcellTA, not raw_desiqa

# RNO value -> key of a /api/map/cells cell
MAP_KEYS = {
    "site_lat": "lat", "site_long": "lon", "tinggi_antena_m": "antenna_height", "tipe_antena": "antenna_type",
    "beamwidth": "beamwidth", "pci_scr_bcch": "pci", "bandwidth_lte": "bandwidth", "micro_macro": "micro_macro",
    "tipe_site": "site_type", "site_location": "site_location", "nop": "nop", "kota_kabupaten": "kabupaten",
    "kecamatan": "kecamatan", "remark_db": "remark_db", "oa_date": "oa_date", "band": "band_label",
}

_DDL = """
CREATE TABLE IF NOT EXISTS map_desiqa_revision (
    id bigserial PRIMARY KEY,
    site_id text NOT NULL,
    ci integer NOT NULL,              -- -1 = site field
    cell_name text NOT NULL DEFAULT '',
    field text NOT NULL,
    value text,
    desiqa_value text,
    desiqa_week smallint,
    note text NOT NULL DEFAULT '',
    edited_by text NOT NULL,
    edited_at timestamptz NOT NULL DEFAULT now(),
    status text NOT NULL DEFAULT 'active',
    closed_by text,
    closed_at timestamptz,
    closed_week smallint,
    batch_id text
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_map_desiqa_revision_active
    ON map_desiqa_revision (site_id, ci, upper(cell_name), field) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_map_desiqa_revision_site ON map_desiqa_revision (site_id);
"""
_ready = {"ok": False}
_ready_lock = threading.Lock()


class RevisionError(Exception):
    """Validation error that is safe to show to the user."""


def _ensure_table(cur):
    if _ready["ok"]:
        return
    with _ready_lock:
        if not _ready["ok"]:
            cur.execute(_DDL)
            _ready["ok"] = True


def _text(v) -> Optional[str]:
    """DB value as the text stored and compared (numbers without a trailing .0)."""
    if v is None:
        return None
    if isinstance(v, (datetime, date)):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, (Decimal, float)):
        f = float(v)
        return str(int(f)) if f.is_integer() else f"{f:.6f}".rstrip("0").rstrip(".")
    s = str(v).strip()
    return s or None


def _same(field: str, a: Optional[str], b: Optional[str]) -> bool:
    if a is None or b is None:
        return a is None and b is None
    if FIELDS[field]["kind"] == "num":
        try:
            return abs(float(a) - float(b)) < 1e-6
        except ValueError:
            pass
    return a.strip().upper() == b.strip().upper()


def _clean(field: str, v) -> Optional[str]:
    if field not in FIELDS:
        raise RevisionError(f"Unknown field '{field}'.")
    s = _text(v) if not isinstance(v, str) else v.strip()
    if not s:
        return None
    d = FIELDS[field]
    if d["kind"] == "num":
        try:
            x = float(s.replace(",", "."))
        except ValueError:
            raise RevisionError(f"{d['label']} must be a number.")
        lo, hi = d["range"]
        if not lo <= x <= hi:
            raise RevisionError(f"{d['label']} must be {lo:g} – {hi:g}.")
        return _text(x)
    return s[:200]


def _key(ci, cell_name) -> tuple:
    return (int(ci), (cell_name or "").upper())


def _original(cur, site_id: str) -> Dict[str, Any]:
    """Latest-week DESIQA of one site: site fields (most common value over its 4G cells) and every 4G cell."""
    cols = ", ".join(f"d.{c}" for c in DESIQA_COLS if c != "cell_name_oss")
    cur.execute(f"""
        SELECT d.weeknum, d.ci, COALESCE(d.cell_name_oss, '') AS cell_name_oss, {cols}, g.beamwidth_antenna AS beamwidth
        FROM raw_desiqa d
        LEFT JOIN LATERAL (SELECT beamwidth_antenna FROM "tb_GcellTA" t WHERE t.site_id = d.site_id AND t.ci = d.ci LIMIT 1) g ON true
        WHERE d.network = '4G' AND d.weeknum = (SELECT MAX(weeknum) FROM raw_desiqa) AND d.site_id = %s
        ORDER BY d.ci
    """, (site_id,))
    names = [c[0] for c in cur.description]
    rows = [dict(zip(names, r)) for r in cur.fetchall()]
    cells, seen = [], set()
    for r in rows:
        k = _key(r["ci"], r["cell_name_oss"])
        if k in seen:
            continue
        seen.add(k)
        cells.append({"ci": r["ci"], "cell_name": r["cell_name_oss"],
                      "values": {f: _text(r.get(f)) for f in FIELDS if FIELDS[f]["level"] == "cell"}})
    site = {}
    for f, d in FIELDS.items():
        if d["level"] == "site":
            vals = [v for v in (_text(r.get(f)) for r in rows) if v is not None]
            site[f] = Counter(vals).most_common(1)[0][0] if vals else None
    return {"week": rows[0]["weeknum"] if rows else None, "site": site, "cells": cells}


_COLS = ("id", "site_id", "ci", "cell_name", "field", "value", "desiqa_value", "desiqa_week", "note",
         "edited_by", "edited_at", "status", "closed_by", "closed_at", "batch_id")


def _active(cur, site_ids: List[str]) -> List[Dict[str, Any]]:
    cur.execute("SELECT " + ", ".join(_COLS) + " FROM map_desiqa_revision WHERE status = 'active' AND site_id = ANY(%s)",
                (site_ids,))
    out = []
    for r in cur.fetchall():
        d = dict(zip(_COLS, r))
        d["edited_at"] = d["edited_at"].isoformat() if d["edited_at"] else None
        d["closed_at"] = d["closed_at"].isoformat() if d["closed_at"] else None
        out.append(d)
    return out


def _pub(r: Dict[str, Any]) -> Dict[str, Any]:
    return {k: r[k] for k in ("id", "value", "desiqa_value", "desiqa_week", "note", "edited_by", "edited_at", "batch_id")}


def get_record(site_id: str) -> Dict[str, Any]:
    """Original and RNO value of every field of a site and its 4G cells. Revisions DESIQA now matches are closed."""
    site_id = site_id.strip().upper()
    conn = get_onedb_connection(timeout=10)
    if not conn:
        raise RevisionError("OneDb is not reachable.")
    try:
        cur = conn.cursor()
        _ensure_table(cur)
        orig = _original(cur, site_id)
        if not orig["cells"]:
            raise RevisionError(f"{site_id} has no 4G cell in the latest DESIQA week.")
        revs = _active(cur, [site_id])
        by_key = {(r["ci"], (r["cell_name"] or "").upper(), r["field"]): r for r in revs}
        synced = []

        def pick(ci, name, field, original):
            r = by_key.get((ci, (name or "").upper(), field))
            if r and _same(field, r["value"], original):
                synced.append(r["id"])
                r = None
            return {"original": original, "rno": r["value"] if r else original, "revision": _pub(r) if r else None}

        site = {f: pick(SITE_CI, "", f, v) for f, v in orig["site"].items()}
        cells = [{"ci": c["ci"], "cell_name": c["cell_name"],
                  "fields": {f: pick(c["ci"], c["cell_name"], f, v) for f, v in c["values"].items()}}
                 for c in orig["cells"]]
        if synced:
            cur.execute("""UPDATE map_desiqa_revision SET status = 'synced', closed_by = 'DESIQA', closed_at = now(), closed_week = %s
                           WHERE id = ANY(%s) AND status = 'active'""", (orig["week"], synced))
        conn.commit()
        cur.close()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    return {"site_id": site_id, "week": orig["week"], "fields": list(FIELDS.values()), "site": site, "cells": cells}


def save_revisions(site_id: str, changes: List[Dict[str, Any]], note: str, user: str) -> Dict[str, Any]:
    """changes: [{ci (None/-1 = site field), cell_name, field, value}]. A value equal to DESIQA (or empty) clears
    the revision; anything else replaces the active one. One save shares a batch_id."""
    site_id = site_id.strip().upper()
    if not changes:
        raise RevisionError("Nothing to change.")
    if len(changes) > 500:
        raise RevisionError("At most 500 field changes per save.")
    note = (note or "").strip()[:300]
    batch_id = uuid.uuid4().hex
    conn = get_onedb_connection(timeout=10)
    if not conn:
        raise RevisionError("OneDb is not reachable.")
    saved = cleared = unchanged = 0
    try:
        cur = conn.cursor()
        _ensure_table(cur)
        orig = _original(cur, site_id)
        cell_orig = {_key(c["ci"], c["cell_name"]): c["values"] for c in orig["cells"]}
        active = {(r["ci"], (r["cell_name"] or "").upper(), r["field"]): r for r in _active(cur, [site_id])}
        for ch in changes:
            field = ch.get("field")
            if field not in FIELDS:
                raise RevisionError(f"Unknown field '{field}'.")
            level = FIELDS[field]["level"]
            if level == "site":
                ci, name, base = SITE_CI, "", orig["site"].get(field)
            else:
                if ch.get("ci") is None:
                    raise RevisionError(f"{FIELDS[field]['label']} is a cell field: pick a cell.")
                k = _key(ch["ci"], ch.get("cell_name") or "")
                if k not in cell_orig:
                    raise RevisionError(f"{site_id}_{ch['ci']} is not in the latest DESIQA week.")
                ci, name, base = k[0], ch.get("cell_name") or "", cell_orig[k].get(field)
            value = _clean(field, ch.get("value"))
            old = active.get((ci, name.upper(), field))
            if value is None or _same(field, value, base):
                if old:
                    cur.execute("UPDATE map_desiqa_revision SET status = 'reset', closed_by = %s, closed_at = now() WHERE id = %s",
                                (user, old["id"]))
                    cleared += 1
                else:
                    unchanged += 1
                continue
            if old and _same(field, value, old["value"]) and (not note or note == old["note"]):
                unchanged += 1
                continue
            if old:
                cur.execute("UPDATE map_desiqa_revision SET status = 'replaced', closed_by = %s, closed_at = now() WHERE id = %s",
                            (user, old["id"]))
            cur.execute("""
                INSERT INTO map_desiqa_revision (site_id, ci, cell_name, field, value, desiqa_value, desiqa_week, note, edited_by, batch_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (site_id, ci, name, field, value, base, orig["week"], note or (old["note"] if old else ""), user, batch_id))
            saved += 1
        conn.commit()
        cur.close()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    return {"saved": saved, "cleared": cleared, "unchanged": unchanged, "batch_id": batch_id}


def list_revisions(site_id: Optional[str] = None, status: str = "active", limit: int = 20000) -> Dict[str, Any]:
    """Revisions for the RNO vs DESIQA list / export (all sites unless site_id), newest first."""
    conn = get_onedb_connection(timeout=10)
    if not conn:
        raise RevisionError("OneDb is not reachable.")
    try:
        cur = conn.cursor()
        _ensure_table(cur)
        where, args = [], []
        if status != "all":
            where.append("status = %s")
            args.append(status)
        if site_id:
            where.append("site_id = %s")
            args.append(site_id.strip().upper())
        cur.execute("SELECT " + ", ".join(_COLS) + " FROM map_desiqa_revision"
                    + (" WHERE " + " AND ".join(where) if where else "")
                    + " ORDER BY edited_at DESC, id DESC LIMIT %s", (*args, limit))
        rows = []
        for r in cur.fetchall():
            d = dict(zip(_COLS, r))
            d["edited_at"] = d["edited_at"].isoformat() if d["edited_at"] else None
            d["closed_at"] = d["closed_at"].isoformat() if d["closed_at"] else None
            d["label"] = FIELDS.get(d["field"], {}).get("label", d["field"])
            d["level"] = "site" if d["ci"] == SITE_CI else "cell"
            rows.append(d)
        conn.commit()
        cur.close()
    finally:
        conn.close()
    return {"rows": rows}


def apply_revisions(data: Dict[str, Any]) -> Dict[str, Any]:
    """RNO version of a /api/map/cells result: active revisions written over the DESIQA values the map uses.
    Each touched cell gets `rno` = {map key: {original, value, field}}; revised site coordinates move the site."""
    cells = data.get("cells") or []
    if not cells:
        return data
    conn = get_onedb_connection(timeout=10)
    if not conn:
        return {**data, "revision_error": "OneDb is not reachable, RNO revisions are not shown."}
    try:
        cur = conn.cursor()
        _ensure_table(cur)
        revs = _active(cur, sorted({c["site_id"] for c in cells}))
        conn.commit()
        cur.close()
    except Exception as e:  # the map still works with DESIQA only
        conn.rollback()
        return {**data, "revision_error": f"RNO revisions could not be read: {e.__class__.__name__}"}
    finally:
        conn.close()
    if not revs:
        return data
    site_revs: Dict[str, Dict[str, Any]] = {}
    cell_revs: Dict[tuple, Dict[str, Any]] = {}
    for r in revs:
        if r["field"] not in MAP_KEYS:
            continue
        if r["ci"] == SITE_CI:
            site_revs.setdefault(r["site_id"], {})[r["field"]] = r
        else:
            cell_revs.setdefault((r["site_id"], r["ci"], (r["cell_name"] or "").upper()), {})[r["field"]] = r

    def conv(field, v):
        if v is None or FIELDS[field]["kind"] != "num":
            return v
        x = float(v)
        return int(x) if x.is_integer() else x

    out_cells = []
    for c in cells:
        touched = {**site_revs.get(c["site_id"], {}), **cell_revs.get((c["site_id"], c["ci"], (c["cell_name"] or "").upper()), {})}
        if not touched:
            out_cells.append(c)
            continue
        c = dict(c)
        rno = {}
        for field, r in touched.items():
            key = MAP_KEYS[field]
            rno[key] = {"field": field, "original": c.get(key), "value": conv(field, r["value"]),
                        "edited_by": r["edited_by"], "edited_at": r["edited_at"], "note": r["note"]}
            c[key] = conv(field, r["value"])
        c["rno"] = rno
        out_cells.append(c)
    sites = []
    for s in data.get("sites") or []:
        sr = site_revs.get(s["site_id"], {})
        if "site_lat" in sr or "site_long" in sr:
            s = dict(s, lat=conv("site_lat", sr["site_lat"]["value"]) if "site_lat" in sr else s["lat"],
                     lon=conv("site_long", sr["site_long"]["value"]) if "site_long" in sr else s["lon"], moved=True)
        sites.append(s)
    center = data.get("center")
    main = next((s for s in sites if s["site_id"] == data.get("site_id") and s.get("moved")), None)
    if main:
        center = {"lat": main["lat"], "lon": main["lon"]}
    return {**data, "center": center, "cells": out_cells, "sites": sites, "revised": sum(1 for c in out_cells if c.get("rno"))}
