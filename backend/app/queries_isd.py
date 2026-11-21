"""Directional ISD per cell and the TA70 / ISD remark (method of the TA_ISD_TA70 workbook, Sulawesi).

ISD of a cell = distance to the nearest 4G site in the direction of its azimuth: first within +-60 deg, then
+-90 deg; when there is none, the nearest site in any direction and the cell is "Cover Open Area / End Cell".
- Sites closer than 50 m (same tower) and farther than 20 km are ignored.
- Target sites exclude indoor-only sites and Combat / micro sites (COI, _MCP, _MCR in the name): they are
  temporary or low antennas, not the edge of macro coverage. Those cells are still judged themselves.
Remark from TA70 / ISD: < 0.3 Undershooting, 0.3-1.0 Normal, 1.0-1.3 Overlap, > 1.3 Overshooting.
Sites come from the latest raw_desiqa week (the on-air list), cached for an hour.
"""
import math
import threading
import time
from collections import defaultdict
from typing import Any, Dict, List, Optional

from .db import get_onedb_connection

WINDOWS = (60.0, 90.0)
MIN_KM = 0.05
MAX_KM = 20.0
GRID_DEG = 0.1                    # ~11 km buckets; 20 km is reached by looking 2 buckets around
RATIO_LIMITS = ((0.3, "Undershooting"), (1.0, "Normal"), (1.3, "Overlap"))
END_CELL = "Cover Open Area / End Cell"
REMARK_COLORS = {"Undershooting": "#0ea5e9", "Normal": "#16a34a", "Overlap": "#f59e0b",
                 "Overshooting": "#dc2626", END_CELL: "#64748b"}

_cache: Dict[str, Any] = {"at": 0.0, "week": None, "sites": [], "grid": {}}
_lock = threading.Lock()
_TTL_SEC = 3600


def _haversine_km(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371.0088 * 2 * math.asin(math.sqrt(a))


def _bearing(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def _angle_diff(a, b):
    d = abs(a - b) % 360
    return 360 - d if d > 180 else d


def _targets() -> Dict[str, Any]:
    """Sites that can be the ISD target, bucketed on a grid."""
    with _lock:
        if _cache["sites"] and time.time() - _cache["at"] < _TTL_SEC:
            return _cache
    conn = get_onedb_connection(timeout=15)
    if not conn:
        return _cache   # stale is better than nothing while OneDb is unreachable
    try:
        cur = conn.cursor()
        cur.execute(r"""
            SELECT weeknum, site_id, AVG(site_lat), AVG(site_long),
                   site_id LIKE 'COI%%' OR bool_or(COALESCE(cell_name_oss, '') ~* '(combat|_MCP|_MCR)') AS small,
                   bool_and(upper(regexp_replace(COALESCE(cell_name_oss, ''), '^.*_', '')) ~ '^[IQ][A-Z][0-9]'
                            OR COALESCE(tipe_site, '') = 'In Building') AS indoor
            FROM raw_desiqa
            WHERE network = '4G' AND weeknum = (SELECT MAX(weeknum) FROM raw_desiqa)
              AND site_lat BETWEEN -15 AND 10 AND site_long BETWEEN 90 AND 145
            GROUP BY weeknum, site_id
        """)
        rows = cur.fetchall()
        cur.close()
    finally:
        conn.close()
    sites, grid = [], defaultdict(list)
    for week, site_id, lat, lon, small, indoor in rows:
        if small or indoor:
            continue
        s = {"site_id": site_id, "lat": float(lat), "lon": float(lon)}
        sites.append(s)
        grid[(int(math.floor(s["lat"] / GRID_DEG)), int(math.floor(s["lon"] / GRID_DEG)))].append(s)
    with _lock:
        _cache.update(at=time.time(), week=rows[0][0] if rows else None, sites=sites, grid=dict(grid))
        return _cache


def _near(cache, lat, lon):
    gy, gx = int(math.floor(lat / GRID_DEG)), int(math.floor(lon / GRID_DEG))
    for dy in (-2, -1, 0, 1, 2):
        for dx in (-2, -1, 0, 1, 2):
            yield from cache["grid"].get((gy + dy, gx + dx), ())


def isd_for(lat: Optional[float], lon: Optional[float], azimuth: Optional[float], site_id: str,
            cache: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    """{isd_m, target, bearing, window} of one sector, None without coordinates or azimuth."""
    if lat is None or lon is None or azimuth is None:
        return None
    cache = cache or _targets()
    cands = []
    for s in _near(cache, lat, lon):
        if s["site_id"] == site_id:
            continue
        d = _haversine_km(lat, lon, s["lat"], s["lon"])
        if MIN_KM <= d <= MAX_KM:
            cands.append((d, s, _bearing(lat, lon, s["lat"], s["lon"])))
    if not cands:
        return None
    cands.sort(key=lambda c: c[0])
    for w in WINDOWS:
        hit = next((c for c in cands if _angle_diff(c[2], azimuth) <= w), None)
        if hit:
            break
    window = f"±{int(w)}°" if hit else "any"
    d, s, b = hit or cands[0]
    return {"isd_m": round(d * 1000), "target": s["site_id"], "target_lat": s["lat"], "target_lon": s["lon"],
            "bearing": round(b, 1), "window": window}


def ta_remark(ta70_m: Optional[float], isd: Optional[Dict[str, Any]], indoor: bool = False) -> Dict[str, Any]:
    """{ratio, remark} from TA70 (m) and the cell's ISD."""
    if indoor:
        return {"ratio": None, "remark": "Indoor / small cell (excluded)"}
    if not isd:
        return {"ratio": None, "remark": "No ISD (no site within 20 km)"}
    if isd["window"] == "any":
        ratio = round(ta70_m / isd["isd_m"], 2) if ta70_m and isd["isd_m"] else None
        return {"ratio": ratio, "remark": END_CELL}
    if ta70_m is None:
        return {"ratio": None, "remark": "No TA sample"}
    ratio = round(ta70_m / isd["isd_m"], 2)
    remark = next((r for lim, r in RATIO_LIMITS if ratio < lim), "Overshooting")
    return {"ratio": ratio, "remark": remark}


def add_isd(data: Dict[str, Any]) -> Dict[str, Any]:
    """Adds `isd` to every cell of a /api/map/cells answer (uses the azimuth shown on the map)."""
    cache = _targets()
    for c in data.get("cells", []):
        c["isd"] = None if c.get("indoor") else isd_for(c.get("lat"), c.get("lon"), c.get("azimuth"), c["site_id"], cache)
    data["isd_rule"] = {"windows": [int(w) for w in WINDOWS], "min_m": int(MIN_KM * 1000), "max_km": MAX_KM,
                        "limits": [[lim, r] for lim, r in RATIO_LIMITS], "colors": REMARK_COLORS}
    return data
