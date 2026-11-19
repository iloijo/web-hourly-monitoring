"""Load the kabupaten / kecamatan borders (GeoJSON, WGS84) into onedb and build the NOP borders.

Source: "Border Kab & Kec" MapInfo tables (Kabupaten_map.TAB, BTS_KECAMATAN_NASIONAL_V20_9_rev.TAB),
converted with ogr2ogr (QGIS) to GeoJSON; only REGION_OMS = SULAWESI kecamatan are kept.

NOP is not in the source and a kabupaten can be split over two NOPs, so each kecamatan takes the NOP
of most raw_desiqa sites inside it (else the kabupaten majority, else the nearest site), and the NOP
border is the union of its kecamatan.

Usage (from backend/):  python scripts/load_borders.py <kab.geojson> <kec.geojson>
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.db import get_onedb_rw_connection  # noqa: E402

# simplification tolerance (degrees) per zoom level: lo ~550 m, mid ~90 m, hi ~20 m
LEVELS = {"geom_lo": 0.005, "geom_mid": 0.0008, "geom_hi": 0.0002}


def _features(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)["features"]


def _simplified_columns(cur, table):
    for col, tol in LEVELS.items():
        cur.execute(f"UPDATE {table} SET {col} = ST_Multi(ST_MakeValid(ST_SimplifyPreserveTopology(geom, %s)))", (tol,))
        cur.execute(f"CREATE INDEX IF NOT EXISTS {table}_{col}_gix ON {table} USING GIST ({col})")


def main(kab_path, kec_path):
    conn = get_onedb_rw_connection(timeout=20)
    cur = conn.cursor()
    cur.execute("SET statement_timeout = 0")
    cols = ", ".join(f"{c} geometry(MultiPolygon, 4326)" for c in LEVELS)
    cur.execute(f"""
        DROP TABLE IF EXISTS geo_kecamatan, geo_kabupaten, geo_nop;
        CREATE TABLE geo_kabupaten (id_kab text PRIMARY KEY, kabupaten text, id_prov text,
            geom geometry(MultiPolygon, 4326), {cols});
        CREATE TABLE geo_kecamatan (id_kec text PRIMARY KEY, kecamatan text, id_kab text, id_prov text,
            luas_km2 double precision, nop text, nop_source text, geom geometry(MultiPolygon, 4326), {cols});
        CREATE TABLE geo_nop (nop text PRIMARY KEY, kecamatan_count int, geom geometry(MultiPolygon, 4326), {cols});
    """)

    ins = "ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)), 3))"
    for f in _features(kab_path):
        p = f["properties"]
        cur.execute(f"INSERT INTO geo_kabupaten (id_kab, kabupaten, id_prov, geom) VALUES (%s, %s, %s, {ins})",
                    (p["ID_KAB"], p["KABUPATEN"], (p.get("ID_PRO") or p["ID_KAB"][:2]), json.dumps(f["geometry"])))
    for f in _features(kec_path):
        p = f["properties"]
        cur.execute(f"""INSERT INTO geo_kecamatan (id_kec, kecamatan, id_kab, id_prov, luas_km2, geom)
                        VALUES (%s, %s, %s, %s, %s, {ins}) ON CONFLICT (id_kec) DO NOTHING""",
                    (p["ID_KEC"], p["KECAMATAN"], p["ID_KAB"], p["ID_PROV"], p.get("Luas_Km2"), json.dumps(f["geometry"])))
    cur.execute("CREATE INDEX geo_kabupaten_gix ON geo_kabupaten USING GIST (geom)")
    cur.execute("CREATE INDEX geo_kecamatan_gix ON geo_kecamatan USING GIST (geom)")

    # NOP per kecamatan from the sites inside it (one row per site, latest DESIQA week)
    cur.execute("""
        CREATE TEMP TABLE _sites AS
        SELECT DISTINCT ON (site_id) site_id, nop, ST_SetSRID(ST_MakePoint(site_long, site_lat), 4326) AS g
        FROM raw_desiqa
        WHERE nop IS NOT NULL AND site_long BETWEEN 110 AND 135 AND site_lat BETWEEN -12 AND 8
          AND weeknum = (SELECT MAX(weeknum) FROM raw_desiqa)
        ORDER BY site_id;
        CREATE INDEX ON _sites USING GIST (g);
        ANALYZE _sites;

        WITH c AS (
            SELECT k.id_kec, s.nop, COUNT(*) n,
                   ROW_NUMBER() OVER (PARTITION BY k.id_kec ORDER BY COUNT(*) DESC, s.nop) rk
            FROM geo_kecamatan k JOIN _sites s ON ST_Intersects(k.geom, s.g)
            GROUP BY k.id_kec, s.nop)
        UPDATE geo_kecamatan k SET nop = c.nop, nop_source = 'sites' FROM c WHERE c.id_kec = k.id_kec AND c.rk = 1;

        WITH c AS (
            SELECT id_kab, nop, ROW_NUMBER() OVER (PARTITION BY id_kab ORDER BY COUNT(*) DESC, nop) rk
            FROM geo_kecamatan WHERE nop IS NOT NULL GROUP BY id_kab, nop)
        UPDATE geo_kecamatan k SET nop = c.nop, nop_source = 'kabupaten'
        FROM c WHERE k.nop IS NULL AND c.id_kab = k.id_kab AND c.rk = 1;

        UPDATE geo_kecamatan k SET nop_source = 'nearest',
            nop = (SELECT s.nop FROM _sites s ORDER BY s.g <-> ST_PointOnSurface(k.geom) LIMIT 1)
        WHERE k.nop IS NULL;

        INSERT INTO geo_nop (nop, kecamatan_count, geom)
        SELECT nop, COUNT(*), ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_Union(geom)), 3))
        FROM geo_kecamatan GROUP BY nop;
    """)
    for t in ("geo_kabupaten", "geo_kecamatan", "geo_nop"):
        _simplified_columns(cur, t)
    cur.execute("GRANT SELECT ON geo_kabupaten, geo_kecamatan, geo_nop TO PUBLIC")
    conn.commit()

    cur.execute("SELECT nop_source, COUNT(*) FROM geo_kecamatan GROUP BY 1 ORDER BY 1")
    print("kecamatan NOP source:", cur.fetchall())
    cur.execute("SELECT nop, kecamatan_count FROM geo_nop ORDER BY 1")
    print("NOP:", cur.fetchall())
    for t in ("geo_kabupaten", "geo_kecamatan", "geo_nop"):
        cur.execute(f"SELECT COUNT(*), pg_size_pretty(pg_total_relation_size('{t}')) FROM {t}")
        print(t, cur.fetchone())
    conn.close()


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
