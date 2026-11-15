"""4G cell map: cell geometry from raw_desiqa (+ beamwidth from tb_GcellTA) for a site and its 1st tier.

raw_desiqa is replaced every week, so only the latest weeknum is read. Coordinates of every 4G site are
kept in memory (about 8k sites) to find the 1st tier and the sites shown inside the map viewport.
"""
import math
import re
import threading
import time
from decimal import Decimal
from typing import Any, Dict, List, Optional

from .bands import lte_band
from .db import get_onedb_connection
from .queries_properties import _sector_from

_SITES_TTL_SEC = 3600
_sites_cache: Dict[str, Any] = {"at": 0.0, "week": None, "sites": []}
_sites_lock = threading.Lock()

TIER_RADIUS_KM = 15.0       # 1st tier candidates are searched inside this radius first
TIER_RADIUS_MAX_KM = 35.0   # rural sites: widen the search when too few neighbours were found
TIER_MAX_SITES = 12
TIER_ANGLE_DEG = 30.0       # a farther site in the same direction (within +-30 deg) is "behind" a nearer one
TIER_SAME_RING = 1.3        # ...unless it is less than 1.3x as far (same ring of sites)
COLOCATED_KM = 0.05


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371.0088 * 2 * math.asin(math.sqrt(a))


def _bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def _angle_diff(a: float, b: float) -> float:
    d = abs(a - b) % 360
    return 360 - d if d > 180 else d


def _all_sites() -> Dict[str, Any]:
    """{week, sites: [{site_id, lat, lon}]} of every 4G site in the latest raw_desiqa week (cached 1 h)."""
    with _sites_lock:
        if _sites_cache["sites"] and time.time() - _sites_cache["at"] < _SITES_TTL_SEC:
            return _sites_cache
    conn = get_onedb_connection(timeout=10)
    if not conn:
        return _sites_cache  # stale data is better than none while OneDb is unreachable
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT weeknum, site_id, AVG(site_lat), AVG(site_long), COUNT(*)
            FROM raw_desiqa
            WHERE network = '4G' AND weeknum = (SELECT MAX(weeknum) FROM raw_desiqa)
              AND site_lat BETWEEN -15 AND 10 AND site_long BETWEEN 90 AND 145
            GROUP BY weeknum, site_id
        """)
        rows = cur.fetchall()
        cur.close()
    finally:
        conn.close()
    sites = [{"site_id": r[1], "lat": float(r[2]), "lon": float(r[3]), "cells": int(r[4])} for r in rows]
    with _sites_lock:
        _sites_cache.update(at=time.time(), week=rows[0][0] if rows else None, sites=sites)
        return _sites_cache


def _first_tier(main: Dict[str, Any], sites: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Nearest sites around `main` that are not hidden behind a nearer site in the same direction."""
    def candidates(radius):
        out = []
        for s in sites:
            if s["site_id"] == main["site_id"]:
                continue
            d = _haversine_km(main["lat"], main["lon"], s["lat"], s["lon"])
            if d <= radius:
                out.append({**s, "distance_km": d, "bearing": _bearing_deg(main["lat"], main["lon"], s["lat"], s["lon"])})
        return sorted(out, key=lambda x: x["distance_km"])

    cands = candidates(TIER_RADIUS_KM)
    if len([c for c in cands if c["distance_km"] > COLOCATED_KM]) < 3:
        cands = candidates(TIER_RADIUS_MAX_KM)

    accepted: List[Dict[str, Any]] = []
    for c in cands:
        if c["distance_km"] <= COLOCATED_KM:  # another site id on the same tower
            accepted.append(c)
            continue
        hidden = any(
            a["distance_km"] > COLOCATED_KM
            and _angle_diff(a["bearing"], c["bearing"]) < TIER_ANGLE_DEG
            and c["distance_km"] > a["distance_km"] * TIER_SAME_RING
            for a in accepted
        )
        if not hidden:
            accepted.append(c)
        if len(accepted) >= TIER_MAX_SITES:
            break
    return accepted


def _num(v):
    if isinstance(v, Decimal):
        v = float(v)
    if isinstance(v, float):
        return int(v) if v.is_integer() else round(v, 6)
    return v


def _to_float(v) -> Optional[float]:
    try:
        return float(str(v).strip().replace(",", "."))
    except (TypeError, ValueError):
        return None


# Last part of the OSS cell name, e.g. "..._IL01" / "..._QR013" (indoor, pRRU) or "..._ML01" / "..._VE01" /
# "..._EL07" (macro, easy macro). The tipe_site "In Building" also covers macro sectors on a building roof.
_INDOOR_CODE = re.compile(r"^[IQ][A-Z]\d")
_MACRO_CODE = re.compile(r"^[MVE][A-Z]\d")


def _is_indoor(cell_name: str, sec_type: Optional[str]) -> bool:
    code = cell_name.rsplit("_", 1)[-1].upper() if "_" in cell_name else ""
    if _INDOOR_CODE.match(code):
        return True
    if _MACRO_CODE.match(code):
        return False
    return "_IND" in (sec_type or "").upper()


def get_map_cells(site_id: str, tier: int = 0) -> Dict[str, Any]:
    site = site_id.strip().upper()
    cache = _all_sites()
    by_id = {s["site_id"]: s for s in cache["sites"]}
    main = by_id.get(site)
    if not main:
        if not cache["sites"]:
            return {"error": "OneDb is not reachable.", "site_id": site, "sites": [], "cells": []}
        return {"error": f"{site} has no 4G cells with coordinates in raw_desiqa (week {cache['week']}).",
                "site_id": site, "sites": [], "cells": []}

    site_rows = [{**main, "tier": 0, "distance_km": 0.0, "bearing": None}]
    if tier:
        site_rows += [{**s, "tier": 1} for s in _first_tier(main, cache["sites"])]

    # Nearest other site of each shown site sets how long its sectors are drawn (dense area -> short sectors)
    for s in site_rows:
        nearest = min(
            (_haversine_km(s["lat"], s["lon"], o["lat"], o["lon"])
             for o in cache["sites"] if o["site_id"] != s["site_id"]
             and abs(o["lat"] - s["lat"]) < 0.5 and abs(o["lon"] - s["lon"]) < 0.5
             and _haversine_km(s["lat"], s["lon"], o["lat"], o["lon"]) > COLOCATED_KM),
            default=None,
        )
        s["nearest_km"] = round(nearest, 3) if nearest is not None else None

    ids = [s["site_id"] for s in site_rows]
    conn = get_onedb_connection(timeout=10)
    if not conn:
        return {"error": "OneDb is not reachable.", "site_id": site, "sites": [], "cells": []}
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT d.site_id, d.ci, d.lac, d.lacci, d.cell_name_oss, d.neid, d.neid_sec, d.band AS band_label,
                   d.bandwidth_lte, d.pci_scr_bcch AS pci, d.site_lat, d.site_long, d.azimuth, d.et, d.mt,
                   d.tinggi_antena_m, d.tipe_antena, d.micro_macro, d.tipe_site, d.remark_db, d.oa_date,
                   d.kota_kabupaten, d.kecamatan, d.nop, d.site_location, d.weeknum,
                   g.beamwidth_antenna, r."sec new type" AS sec_type, r.site_id_sector_id
            FROM raw_desiqa d
            LEFT JOIN LATERAL (
                SELECT beamwidth_antenna FROM "tb_GcellTA" t
                WHERE t.site_id = d.site_id AND t.ci = d.ci LIMIT 1
            ) g ON true
            LEFT JOIN LATERAL (
                SELECT "sec new type", site_id_sector_id FROM "CellListRCI" c
                WHERE c.siteid_ci = d.site_id || '_' || d.ci LIMIT 1
            ) r ON true
            WHERE d.network = '4G' AND d.weeknum = %s AND d.site_id = ANY(%s)
            ORDER BY d.site_id, d.ci
        """, (cache["week"], ids))
        cols = [c[0] for c in cur.description]
        raw = [dict(zip(cols, r)) for r in cur.fetchall()]
        cur.close()
    finally:
        conn.close()

    cells = []
    seen = set()
    for r in raw:
        name = r["cell_name_oss"] or ""
        # Only exact repeats are dropped: one site can reuse a CI for a macro and an indoor cell
        key = (r["site_id"], r["ci"], name.upper())
        if key in seen:
            continue
        seen.add(key)
        beam = _to_float(r["beamwidth_antenna"])
        cells.append({
            "siteid_ci": f"{r['site_id']}_{r['ci']}",
            "site_id": r["site_id"],
            "ci": r["ci"],
            "cell_name": name,
            "sector": _sector_from(r["sec_type"], r["site_id_sector_id"]) if (r["sec_type"] or r["site_id_sector_id"])
                      else (int(str(r["ci"])[:-1]) if r["ci"] and r["ci"] >= 10 else 1),
            "band": lte_band(r["ci"], name),
            "band_label": r["band_label"],
            "bandwidth": r["bandwidth_lte"],
            "pci": r["pci"],
            "lac": r["lac"],
            "lacci": r["lacci"],
            "neid": r["neid"],
            "neid_sec": r["neid_sec"],
            "lat": _num(r["site_lat"]),
            "lon": _num(r["site_long"]),
            "azimuth": _num(r["azimuth"]),
            "beamwidth": _num(beam) if beam and beam > 0 else None,
            "et": _num(r["et"]),
            "mt": _num(r["mt"]),
            "antenna_height": _to_float(r["tinggi_antena_m"]),
            "antenna_type": r["tipe_antena"],
            "micro_macro": r["micro_macro"],
            "site_type": r["tipe_site"],
            "remark_db": r["remark_db"],
            "oa_date": r["oa_date"].strftime("%Y-%m-%d") if r["oa_date"] else None,
            "kabupaten": r["kota_kabupaten"],
            "kecamatan": r["kecamatan"],
            "nop": r["nop"],
            "site_location": r["site_location"],
            "indoor": _is_indoor(name, r["sec_type"]),
        })

    for s in site_rows:
        s["distance_km"] = round(s["distance_km"], 3)
        if s["bearing"] is not None:
            s["bearing"] = round(s["bearing"], 1)

    return {
        "site_id": site,
        "week": cache["week"],
        "center": {"lat": main["lat"], "lon": main["lon"]},
        "sites": site_rows,
        "cells": cells,
    }


def get_map_sites_in_bbox(south: float, west: float, north: float, east: float, limit: int = 3000) -> Dict[str, Any]:
    """Every 4G site inside the map viewport (site dots for context)."""
    cache = _all_sites()
    inside = [
        {"site_id": s["site_id"], "lat": s["lat"], "lon": s["lon"], "cells": s["cells"]}
        for s in cache["sites"]
        if south <= s["lat"] <= north and west <= s["lon"] <= east
    ]
    return {"week": cache["week"], "total": len(inside), "truncated": len(inside) > limit, "sites": inside[:limit]}


# --- Covmo grid (MR coverage, one snapshot per week) ---------------------------------------------------------
# Each covmo row is the centre of a zoom-20 web-mercator tile (~38 m). Tiles are aggregated per z20 x/y in SQL
# and sent as one compact string, because moving 25k+ rows from the remote OneDb dominated the response time.
COVMO_ZOOM = 20
COVMO_MAX_AREA_DEG2 = 0.03   # about 19 x 19 km at the equator; the map asks only from zoom 13
COVMO_LIMIT = 150000
_covmo_week: Dict[str, Any] = {"at": 0.0, "week": None, "date": None}


def _covmo_latest() -> Dict[str, Any]:
    if _covmo_week["week"] and time.time() - _covmo_week["at"] < _SITES_TTL_SEC:
        return _covmo_week
    conn = get_onedb_connection(timeout=10)
    if not conn:
        return _covmo_week
    try:
        cur = conn.cursor()
        # week is text ('44', '9'), so the latest week comes from the latest date (date_raw is indexed)
        cur.execute("SELECT week, date_raw FROM covmo WHERE date_raw = (SELECT MAX(date_raw) FROM covmo) LIMIT 1")
        row = cur.fetchone()
        cur.close()
    finally:
        conn.close()
    if row:
        _covmo_week.update(at=time.time(), week=row[0], date=row[1].strftime("%Y-%m-%d"))
    return _covmo_week


def get_map_covmo(south: float, west: float, north: float, east: float) -> Dict[str, Any]:
    """Covmo tiles of the latest week inside the bbox.

    `tiles` is "dx,dy,rsrp,rsrq,mr;..." where the zoom-20 tile is (x0 + dx, y0 + dy). A tile split over two
    kabupaten rows gets the MR-weighted average.
    """
    if (north - south) * (east - west) > COVMO_MAX_AREA_DEG2:
        return {"error": "Area too large, zoom in to load the covmo grid.", "tiles": ""}
    latest = _covmo_latest()
    if not latest["week"]:
        return {"error": "OneDb is not reachable.", "tiles": ""}
    conn = get_onedb_connection(timeout=15)
    if not conn:
        return {"error": "OneDb is not reachable.", "tiles": ""}
    n = 2 ** COVMO_ZOOM
    try:
        cur = conn.cursor()
        cur.execute("""
            WITH t AS (
                SELECT floor((longitude + 180.0) / 360.0 * %(n)s)::int AS x,
                       floor((1.0 - ln(tan(radians(latitude)) + 1.0 / cos(radians(latitude))) / pi()) / 2.0 * %(n)s)::int AS y,
                       "immediate_serv_RSRP_dbm" AS rsrp, "immediate_serv_RSRQ_db" AS rsrq,
                       GREATEST(COALESCE(immediate_mr_count, 0), 0) AS mr
                FROM covmo
                WHERE week = %(week)s AND longlat && ST_MakeEnvelope(%(w)s, %(s)s, %(e)s, %(nn)s, 4326)
                LIMIT %(lim)s
            ), g AS (
                SELECT x, y,
                       round((SUM(rsrp * GREATEST(mr, 1)) / NULLIF(SUM(GREATEST(mr, 1)) FILTER (WHERE rsrp IS NOT NULL), 0))::numeric, 1) AS rsrp,
                       round((SUM(rsrq * GREATEST(mr, 1)) / NULLIF(SUM(GREATEST(mr, 1)) FILTER (WHERE rsrq IS NOT NULL), 0))::numeric, 1) AS rsrq,
                       SUM(mr) AS mr
                FROM t GROUP BY x, y
            ), o AS (SELECT MIN(x) AS x0, MIN(y) AS y0 FROM g)
            SELECT o.x0, o.y0, COUNT(*),
                   string_agg(concat_ws(',', g.x - o.x0, g.y - o.y0, COALESCE(g.rsrp::text, ''), COALESCE(g.rsrq::text, ''), g.mr), ';')
            FROM g, o GROUP BY o.x0, o.y0
        """, {"n": n, "week": latest["week"], "w": west, "s": south, "e": east, "nn": north, "lim": COVMO_LIMIT + 1})
        row = cur.fetchone()
        cur.close()
    finally:
        conn.close()
    x0, y0, count, tiles = row if row else (0, 0, 0, "")
    return {"week": latest["week"], "last_date": latest["date"], "zoom": COVMO_ZOOM,
            "x0": x0, "y0": y0, "count": count or 0, "truncated": (count or 0) > COVMO_LIMIT, "tiles": tiles or ""}
