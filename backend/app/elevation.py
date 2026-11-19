"""Terrain elevation for the cell map profile tool.

Order of sources:
  1. local cache (SQLite, backend/data/elevation_cache.sqlite3), keyed on a ~11 m grid
  2. OpenTopoData public API, dataset srtm30m (100 points per request, max 1 request per second)
  3. Copernicus GLO-30 rasters stored in onedb (dem_glo30), when the API is out of quota, rate limited
     or unreachable. Points inside a loaded 1-degree tile without a raster block are open sea (0 m).
"""
import json
import logging
import sqlite3
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

from .db import get_onedb_connection

logger = logging.getLogger("elevation")

API_URL = "https://api.opentopodata.org/v1/srtm30m"
API_BATCH = 100
API_MIN_INTERVAL = 1.05          # public API: max 1 call per second
API_BACKOFF_SEC = 15 * 60        # after a quota / rate-limit answer, go straight to the local DEM for a while
MAX_POINTS = 400
ROUND = 4                        # cache key precision (1e-4 deg, about 11 m)

SOURCE_LABEL = {
    "api": "SRTM 30 m (OpenTopoData)",
    "local": "Copernicus GLO-30 (onedb)",
}

_CACHE_PATH = Path(__file__).resolve().parent.parent / "data" / "elevation_cache.sqlite3"
_cache_lock = threading.Lock()
_cache_conn: Optional[sqlite3.Connection] = None
_api_lock = threading.Lock()
_api_state = {"last_call": 0.0, "blocked_until": 0.0, "last_error": None}


def _cache() -> sqlite3.Connection:
    global _cache_conn
    if _cache_conn is None:
        _CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        c = sqlite3.connect(str(_CACHE_PATH), check_same_thread=False, isolation_level=None)
        c.execute("PRAGMA journal_mode=WAL")
        c.execute("CREATE TABLE IF NOT EXISTS elev (lat REAL, lon REAL, src TEXT, h REAL, PRIMARY KEY (lat, lon, src))")
        _cache_conn = c
    return _cache_conn


def _key(lat: float, lon: float) -> Tuple[float, float]:
    return round(lat, ROUND), round(lon, ROUND)


def _cache_get(keys: Sequence[Tuple[float, float]], src: str) -> Dict[Tuple[float, float], float]:
    out = {}
    with _cache_lock:
        c = _cache()
        for i in range(0, len(keys), 400):
            chunk = keys[i:i + 400]
            q = " OR ".join(["(lat=? AND lon=?)"] * len(chunk))
            args = [v for k in chunk for v in k]
            for lat, lon, h in c.execute(f"SELECT lat, lon, h FROM elev WHERE src=? AND ({q})", [src, *args]):
                out[(lat, lon)] = h
    return out


def _cache_put(values: Dict[Tuple[float, float], float], src: str) -> None:
    if not values:
        return
    with _cache_lock:
        _cache().executemany("INSERT OR REPLACE INTO elev (lat, lon, src, h) VALUES (?, ?, ?, ?)",
                             [(k[0], k[1], src, h) for k, h in values.items()])


def _api_fetch(keys: List[Tuple[float, float]]) -> Dict[Tuple[float, float], float]:
    """OpenTopoData in batches of 100; stops at the first quota / network problem (the rest goes local)."""
    out: Dict[Tuple[float, float], float] = {}
    for i in range(0, len(keys), API_BATCH):
        if time.time() < _api_state["blocked_until"]:
            break
        chunk = keys[i:i + API_BATCH]
        locs = "|".join(f"{lat},{lon}" for lat, lon in chunk)
        with _api_lock:  # one call per second for the whole backend
            wait = API_MIN_INTERVAL - (time.time() - _api_state["last_call"])
            if wait > 0:
                time.sleep(wait)
            _api_state["last_call"] = time.time()
            try:
                req = urllib.request.Request(f"{API_URL}?locations={locs}", headers={"User-Agent": "netpulse-cellmap"})
                with urllib.request.urlopen(req, timeout=20) as r:
                    body = json.loads(r.read().decode("utf-8"))
            except urllib.error.HTTPError as e:
                _api_state["last_error"] = f"HTTP {e.code}"
                if e.code in (429, 403):  # daily quota or rate limit
                    _api_state["blocked_until"] = time.time() + API_BACKOFF_SEC
                logger.warning(f"OpenTopoData HTTP {e.code}, using the local DEM")
                break
            except Exception as e:
                _api_state["last_error"] = str(e)
                logger.warning(f"OpenTopoData unreachable ({e}), using the local DEM")
                break
        if body.get("status") != "OK":
            _api_state["last_error"] = str(body.get("error") or body.get("status"))
            _api_state["blocked_until"] = time.time() + API_BACKOFF_SEC
            break
        for k, res in zip(chunk, body.get("results", [])):
            h = res.get("elevation")
            if h is not None:  # null = outside SRTM / void; left for the local DEM
                out[k] = float(h)
    return out


def _local_fetch(keys: List[Tuple[float, float]]) -> Dict[Tuple[float, float], float]:
    """Bilinear samples from dem_glo30 in onedb."""
    if not keys:
        return {}
    conn = get_onedb_connection(timeout=15)
    if not conn:
        return {}
    out: Dict[Tuple[float, float], float] = {}
    try:
        cur = conn.cursor()
        cur.execute("""
            WITH p AS (
                SELECT i, lat, lon, ST_SetSRID(ST_MakePoint(lon, lat), 4326) AS g
                FROM unnest(%s::float8[], %s::float8[]) WITH ORDINALITY AS u(lat, lon, i)
            )
            SELECT p.i,
                   (SELECT ST_Value(d.rast, 1, p.g, true, 'bilinear') FROM dem_glo30 d
                    WHERE ST_Intersects(ST_ConvexHull(d.rast), p.g) LIMIT 1),
                   EXISTS (SELECT 1 FROM dem_glo30_cover c
                           WHERE c.lat_floor = floor(p.lat) AND c.lon_floor = floor(p.lon))
            FROM p ORDER BY p.i
        """, ([k[0] for k in keys], [k[1] for k in keys]))
        for i, h, covered in cur.fetchall():
            if h is not None:
                out[keys[i - 1]] = float(h)
            elif covered:  # loaded tile, no block stored: open sea
                out[keys[i - 1]] = 0.0
        cur.close()
    except Exception as e:
        logger.error(f"local DEM query failed: {e}")
        conn.rollback()
    finally:
        conn.close()
    return out


def get_elevations(points: Sequence[Sequence[float]]) -> Dict:
    """points: [[lat, lon], ...] -> {elevations: [m | None], source, sources: {api, local, missing}}"""
    pts = [(float(p[0]), float(p[1])) for p in points[:MAX_POINTS]]
    keys = [_key(*p) for p in pts]
    uniq = list(dict.fromkeys(keys))

    found: Dict[Tuple[float, float], Tuple[float, str]] = {}
    for src in ("api", "local"):
        for k, h in _cache_get(uniq, src).items():
            found.setdefault(k, (h, src))

    missing = [k for k in uniq if k not in found]
    if missing:
        api = _api_fetch(missing)
        _cache_put(api, "api")
        for k, h in api.items():
            found[k] = (h, "api")
        rest = [k for k in missing if k not in api]
        if rest:
            local = _local_fetch(rest)
            _cache_put(local, "local")
            for k, h in local.items():
                found[k] = (h, "local")

    elev, counts = [], {"api": 0, "local": 0, "missing": 0}
    for k in keys:
        if k in found:
            h, src = found[k]
            elev.append(round(h, 1))
            counts[src] += 1
        else:
            elev.append(None)
            counts["missing"] += 1
    main = "api" if counts["api"] >= counts["local"] else "local"
    return {
        "elevations": elev,
        "source": main,
        "source_label": SOURCE_LABEL[main] if counts["api"] + counts["local"] else None,
        "sources": counts,
        "api_blocked": time.time() < _api_state["blocked_until"],
        "api_error": _api_state["last_error"] if counts["local"] else None,
    }


def get_local_elevations(points: Sequence[Sequence[float]], chunk: int = 2500) -> List[Optional[float]]:
    """Heights for many points (beam footprint): cache first, then the onedb GLO-30 only (the public API
    allows 100 points a second, far too slow for thousands of points)."""
    keys = [_key(float(p[0]), float(p[1])) for p in points]
    uniq = list(dict.fromkeys(keys))
    found: Dict[Tuple[float, float], float] = {}
    for src in ("api", "local"):
        for k, h in _cache_get(uniq, src).items():
            found.setdefault(k, h)
    missing = [k for k in uniq if k not in found]
    for i in range(0, len(missing), chunk):
        local = _local_fetch(missing[i:i + chunk])
        _cache_put(local, "local")
        found.update(local)
    return [round(found[k], 1) if k in found else None for k in keys]
