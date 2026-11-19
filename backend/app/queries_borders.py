"""Administrative borders for the cell map: kabupaten, kecamatan and NOP (onedb geo_* tables, Sulawesi).

Loaded by scripts/load_borders.py. Each table has three simplified copies of the geometry; the zoom picks one
and only the polygons touching the (snapped) viewport are sent. Borders never change, so answers are cached.
"""
import json
import math
from collections import OrderedDict
from threading import Lock
from typing import Any, Dict

from .db import get_onedb_connection

LAYERS = {
    "kab": ("geo_kabupaten", "id_kab", "kabupaten", "NULL", "NULL"),
    "kec": ("geo_kecamatan", "id_kec", "kecamatan", "(SELECT kabupaten FROM geo_kabupaten b WHERE b.id_kab = t.id_kab)", "t.nop"),
    "nop": ("geo_nop", "nop", "nop", "NULL", "nop"),
}
SNAP_DEG = 0.5
_CACHE: "OrderedDict[tuple, Dict[str, Any]]" = OrderedDict()
_CACHE_MAX = 96
_LOCK = Lock()


def _level(zoom: int) -> str:
    if zoom <= 9:
        return "geom_lo"
    if zoom <= 12:
        return "geom_mid"
    return "geom_hi"


def get_borders(layer: str, zoom: int, south: float, west: float, north: float, east: float) -> Dict[str, Any]:
    if layer not in LAYERS:
        raise ValueError(f"Unknown border layer '{layer}'.")
    level = _level(zoom)
    # snap outward so small pans hit the cache; the low level always covers the whole region
    if level == "geom_lo":
        box = (-90.0, -180.0, 90.0, 180.0)
    else:
        box = (math.floor(south / SNAP_DEG) * SNAP_DEG, math.floor(west / SNAP_DEG) * SNAP_DEG,
               math.ceil(north / SNAP_DEG) * SNAP_DEG, math.ceil(east / SNAP_DEG) * SNAP_DEG)
    key = (layer, level, box)
    with _LOCK:
        if key in _CACHE:
            _CACHE.move_to_end(key)
            return _CACHE[key]

    table, id_col, name_col, kab_expr, nop_expr = LAYERS[layer]
    conn = get_onedb_connection()
    if conn is None:
        raise RuntimeError("OneDb is unreachable.")
    try:
        cur = conn.cursor()
        cur.execute(f"""
            SELECT t.{id_col}, t.{name_col}, {kab_expr}, {nop_expr}, ST_AsGeoJSON(t.{level}, 5),
                   ST_Y(l.p), ST_X(l.p)
            FROM {table} t
            -- label on the largest part (an island must not take the name of a whole kabupaten)
            CROSS JOIN LATERAL (
                SELECT ST_PointOnSurface(d.geom) AS p FROM ST_Dump(t.geom_mid) d ORDER BY ST_Area(d.geom) DESC LIMIT 1
            ) l
            WHERE t.{level} && ST_MakeEnvelope(%s, %s, %s, %s, 4326)
        """, (box[1], box[0], box[3], box[2]))
        rows = cur.fetchall()
        cur.close()
    finally:
        conn.close()
    features = [{
        "type": "Feature",
        "properties": {"id": r[0], "name": r[1], "kab": r[2], "nop": r[3],
                       "label": [round(r[5], 5), round(r[6], 5)] if r[5] is not None else None},
        "geometry": json.loads(r[4]),
    } for r in rows if r[4]]
    out = {"type": "FeatureCollection", "layer": layer, "level": level, "features": features}
    with _LOCK:
        _CACHE[key] = out
        while len(_CACHE) > _CACHE_MAX:
            _CACHE.popitem(last=False)
    return out
