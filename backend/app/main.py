import os
from pathlib import Path
from typing import Optional, List
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from .db import check_db_health, get_twodb_connection, get_latest_data_date
from .queries import get_site_payload_data
from .queries_daily import (
    get_hierarchy_data, 
    get_site_payload_daily_data, 
    get_scope_aggregation_data,
    DAILY_KPIS_CONFIG
)
from .queries_5g import get_5g_sites, get_site_payload_5g_data, get_scope_aggregation_5g_data, KPIS_5G_CONFIG
from .queries_2g import get_2g_sites, get_site_payload_2g_data, get_scope_aggregation_2g_data, KPIS_2G_CONFIG
from .site_names import load_site_names, get_site_display_name, get_site_name

app = FastAPI(title="Monitoring KPI Dashboard", version="2.5.0")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory cache for all site IDs from CellListRCI
CACHED_SITES: List[str] = []

@app.get("/api/status")
def get_status():
    """Returns database connection status."""
    return check_db_health()

@app.get("/api/latest_dates")
def get_latest_dates():
    """Latest available data date (YYYY-MM-DD) per monitoring source."""
    sources = {
        "4g_hourly": ("twodb", "measHy4g"),
        "4g_daily": ("onedb", "measDy4g"),
        "5g": ("onedb", "measDy5g"),
        "2g": ("onedb", "measDy2g"),
    }
    return {k: get_latest_data_date(db, t).strftime("%Y-%m-%d") for k, (db, t) in sources.items()}

@app.get("/api/sites")
def get_sites():
    """Returns all unique site IDs and site names from CellListRCI for autocomplete/dropdown."""
    global CACHED_SITES
    site_names = load_site_names()
    if CACHED_SITES:
        return {"sites": CACHED_SITES, "site_names": site_names, "total": len(CACHED_SITES)}
    
    try:
        conn = get_twodb_connection(timeout=5)
        if not conn:
            CACHED_SITES = list(site_names.keys()) if site_names else ["MRW002", "UPD919", "UPD183", "COI350"]
            return {"sites": CACHED_SITES, "site_names": site_names, "total": len(CACHED_SITES)}
        cur = conn.cursor()
        cur.execute("""
            SELECT DISTINCT site_id 
            FROM "CellListRCI" 
            WHERE site_id IS NOT NULL AND site_id != '' 
            ORDER BY site_id;
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        CACHED_SITES = [r[0].strip() for r in rows if r[0]]
        return {"sites": CACHED_SITES, "site_names": site_names, "total": len(CACHED_SITES)}
    except Exception as e:
        CACHED_SITES = list(site_names.keys()) if site_names else ["MRW002", "UPD919", "UPD183", "COI350"]
        return {"sites": CACHED_SITES, "site_names": site_names, "error": str(e), "total": len(CACHED_SITES)}

@app.get("/api/site_names")
def get_site_names():
    """Returns complete site_id -> site_name dictionary."""
    return load_site_names()

@app.get("/api/payload_sectors")
def get_payload_sectors(
    site_id: str = Query("MRW002", description="Site ID e.g. MRW002, UPD919, UPD183"),
    start_date: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    time_mode: str = Query("hourly", description="hourly or daily"),
    sector: Optional[str] = Query(None, description="Filter sector number: all, 1, 2, 3..."),
    band: Optional[str] = Query(None, description="Filter band: all, L1800, L2100..."),
    cell_type: Optional[str] = Query("macro", description="macro, indoor, or all"),
    days_back: int = Query(6, description="Default days back (6 days)")
):
    """
    Returns 4G multi-KPI data across all measHy4g radio metrics with standard Band coloring.
    Sector grouping and cell topology derived from CellListRCI in TwoDb.
    """
    try:
        data = get_site_payload_data(
            site_id=site_id.strip(),
            start_date=start_date.strip() if start_date else None,
            end_date=end_date.strip() if end_date else None,
            time_mode=time_mode.strip(),
            sector_filter=sector.strip() if sector else None,
            band_filter=band.strip() if band else None,
            cell_type=cell_type.strip() if cell_type else "macro",
            days_back=days_back
        )
        return data
    except Exception as e:
        return {"error": str(e), "site_id": site_id, "sectors": {}}

@app.get("/api/hierarchy")
def get_hierarchy():
    """
    Returns geographical hierarchy: NOP -> Kabupaten -> Kecamatan -> Sites
    based on CellListRCI joined with LookupSITEID from OneDb.
    """
    try:
        return get_hierarchy_data()
    except Exception as e:
        return {"error": str(e), "nops": [], "tree": {}, "sites": []}

@app.get("/api/daily/kpi_list")
def get_daily_kpis():
    """Returns all available KPIs for 4G Daily monitoring with category grouping."""
    kpi_items = []
    for k_id, cfg in DAILY_KPIS_CONFIG.items():
        kpi_items.append({
            "id": k_id,
            "label": cfg["title"],
            "unit": cfg["unit"],
            "category": cfg["category"],
            "source": cfg["source"],
            "is_bdbh": cfg["source"] == "measBdbh4g"
        })
    return {"kpis": kpi_items, "total": len(kpi_items)}

@app.get("/api/daily/payload_sectors")
def get_daily_payload_sectors(
    site_id: str = Query("MRW002", description="Site ID e.g. MRW002, UPD919, UPD183"),
    start_date: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    sector: Optional[str] = Query(None, description="Filter sector number: all, 1, 2, 3..."),
    band: Optional[str] = Query(None, description="Filter band: all, L1800, L2100..."),
    cell_type: Optional[str] = Query("macro", description="macro, indoor, or all"),
    days_back: int = Query(14, description="Default days back (14 days)")
):
    """
    Returns 4G Daily multi-KPI data from OneDb (measDy4g & measBdbh4g).
    - Uses measBdbh4g for DL/UL PRB, User DL/UL Throughput, Spectrum Efficiency
    - Uses measDy4g for all other radio metrics
    - Modulation schemes, UMTS, and PDCP SDU Loss QCI1 are skipped.
    """
    try:
        s_id = site_id.strip() if isinstance(site_id, str) else "MRW002"
        s_date = start_date.strip() if isinstance(start_date, str) else None
        e_date = end_date.strip() if isinstance(end_date, str) else None
        sec_f = sector.strip() if isinstance(sector, str) else None
        b_f = band.strip() if isinstance(band, str) else None
        c_type = cell_type.strip() if isinstance(cell_type, str) else "macro"
        d_back = days_back if isinstance(days_back, int) else 14

        data = get_site_payload_daily_data(
            site_id=s_id,
            start_date=s_date,
            end_date=e_date,
            sector_filter=sec_f,
            band_filter=b_f,
            cell_type=c_type,
            days_back=d_back
        )
        return data
    except Exception as e:
        return {"error": str(e), "site_id": site_id if isinstance(site_id, str) else "MRW002", "sectors": {}}

@app.get("/api/daily/aggregation")
def get_daily_aggregation_endpoint(
    scope: str = Query("regional"),
    mode: str = Query("full"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    nops: Optional[List[str]] = Query(None),
    cities: Optional[List[str]] = Query(None),
    kecamatans: Optional[List[str]] = Query(None),
    sites: Optional[List[str]] = Query(None),
    bands: Optional[List[str]] = Query(None)
):
    """
    Returns time-series KPI charts for higher-level scopes:
    - Regional (Region Sulawesi)
    - NOP (multi-NOP curves or single NOP band curves)
    - City/Kabupaten (multi-city curves or single city band curves)
    - Kecamatan (multi-kecamatan curves or single kecamatan band curves)
    - Site (multi-site curves or single site band curves)
    """
    try:
        data = get_scope_aggregation_data(
            scope=scope,
            mode=mode,
            start_date=start_date,
            end_date=end_date,
            nops=nops,
            cities=cities,
            kecamatans=kecamatans,
            sites=sites,
            bands=bands
        )
        return data
    except Exception as e:
        return {
            "error": str(e),
            "scope": scope,
            "mode": mode,
            "kpis": {},
            "timestamps": []
        }

# =============================================================================
# 5G Monitoring Endpoints
# =============================================================================
@app.get("/api/5g/sites")
def get_5g_sites_endpoint():
    """Returns all unique 5G sites for autocomplete/dropdown with site names."""
    sites = get_5g_sites()
    names_map = load_site_names()
    return {"sites": sites, "site_names": {s: names_map.get(s, "") for s in sites}, "total": len(sites)}

@app.get("/api/5g/kpi_list")
def get_5g_kpi_list_endpoint():
    """Returns all 5G KPIs catalog with category grouping."""
    kpi_items = []
    for k_id, cfg in KPIS_5G_CONFIG.items():
        kpi_items.append({
            "id": k_id,
            "label": cfg["title"],
            "unit": cfg["unit"],
            "category": cfg["category"],
            "has_tot": cfg.get("has_tot", False),
            "is_avg": cfg.get("is_avg", True),
            "source": "measDy5g"
        })
    return {"kpis": kpi_items, "total": len(kpi_items)}

@app.get("/api/5g/payload_sectors")
def get_5g_payload_sectors_endpoint(
    site_id: str = Query("UPD012", description="Site ID"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    sector: Optional[str] = Query(None),
    band: Optional[str] = Query(None),
    cell_type: Optional[str] = Query("macro"),
    days_back: int = Query(14)
):
    """Returns 5G multi-KPI data across all measDy5g radio metrics."""
    try:
        s_id = site_id.strip() if isinstance(site_id, str) else "UPD012"
        s_date = start_date.strip() if isinstance(start_date, str) else None
        e_date = end_date.strip() if isinstance(end_date, str) else None
        sec_f = sector.strip() if isinstance(sector, str) else None
        b_f = band.strip() if isinstance(band, str) else None
        c_type = cell_type.strip() if isinstance(cell_type, str) else "macro"
        d_back = days_back if isinstance(days_back, int) else 14

        return get_site_payload_5g_data(
            site_id=s_id,
            start_date=s_date,
            end_date=e_date,
            sector_filter=sec_f,
            band_filter=b_f,
            cell_type=c_type,
            days_back=d_back
        )
    except Exception as e:
        return {"error": str(e), "site_id": site_id, "sectors": {}}

@app.get("/api/5g/aggregation")
def get_5g_aggregation_endpoint(
    scope: str = Query("regional"),
    mode: str = Query("full"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    nops: Optional[List[str]] = Query(None),
    cities: Optional[List[str]] = Query(None),
    kecamatans: Optional[List[str]] = Query(None),
    sites: Optional[List[str]] = Query(None),
    bands: Optional[List[str]] = Query(None)
):
    """
    Returns 5G time-series KPI charts across all 25 KPIs for higher-level scopes:
    - Regional (Region Sulawesi)
    - NOP
    - City/Kabupaten
    - Kecamatan
    - Site
    Supports full mode (multi-entity) or band mode (NR2300, NR2600, NR2100).
    """
    try:
        data = get_scope_aggregation_5g_data(
            scope=scope,
            mode=mode,
            start_date=start_date,
            end_date=end_date,
            nops=nops,
            cities=cities,
            kecamatans=kecamatans,
            sites=sites,
            bands=bands
        )
        return data
    except Exception as e:
        return {
            "error": str(e),
            "scope": scope,
            "mode": mode,
            "kpis": {},
            "timestamps": []
        }

# =============================================================================
# 2G Monitoring Endpoints
# =============================================================================
@app.get("/api/2g/sites")
def get_2g_sites_endpoint():
    """Returns all unique 2G sites for autocomplete/dropdown with site names."""
    sites = get_2g_sites()
    names_map = load_site_names()
    return {"sites": sites, "site_names": {s: names_map.get(s, "") for s in sites}, "total": len(sites)}

@app.get("/api/2g/kpi_list")
def get_2g_kpi_list_endpoint():
    """Returns all 2G KPIs catalog with category grouping."""
    kpi_items = []
    for k_id, cfg in KPIS_2G_CONFIG.items():
        kpi_items.append({
            "id": k_id,
            "label": cfg["title"],
            "unit": cfg["unit"],
            "category": cfg["category"],
            "has_tot": cfg.get("has_tot", False),
            "is_avg": cfg.get("is_avg", True),
            "source": "measDy2g"
        })
    return {"kpis": kpi_items, "total": len(kpi_items)}

@app.get("/api/2g/payload_sectors")
def get_2g_payload_sectors_endpoint(
    site_id: str = Query("MRW002", description="Site ID"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    sector: Optional[str] = Query(None),
    band: Optional[str] = Query(None),
    cell_type: Optional[str] = Query("macro"),
    days_back: int = Query(14)
):
    """Returns 2G multi-KPI data across all measDy2g radio metrics."""
    try:
        s_id = site_id.strip() if isinstance(site_id, str) else "MRW002"
        s_date = start_date.strip() if isinstance(start_date, str) else None
        e_date = end_date.strip() if isinstance(end_date, str) else None
        sec_f = sector.strip() if isinstance(sector, str) else None
        b_f = band.strip() if isinstance(band, str) else None
        c_type = cell_type.strip() if isinstance(cell_type, str) else "macro"
        d_back = days_back if isinstance(days_back, int) else 14

        return get_site_payload_2g_data(
            site_id=s_id,
            start_date=s_date,
            end_date=e_date,
            sector_filter=sec_f,
            band_filter=b_f,
            cell_type=c_type,
            days_back=d_back
        )
    except Exception as e:
        return {"error": str(e), "site_id": site_id, "sectors": {}}

@app.get("/api/2g/aggregation")
def get_2g_aggregation_endpoint(
    scope: str = Query("regional"),
    mode: str = Query("full"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    nops: Optional[List[str]] = Query(None),
    cities: Optional[List[str]] = Query(None),
    kecamatans: Optional[List[str]] = Query(None),
    sites: Optional[List[str]] = Query(None),
    bands: Optional[List[str]] = Query(None)
):
    """
    Returns 2G time-series KPI charts across all 30 KPIs for higher-level scopes:
    - Regional (Region Sulawesi)
    - NOP
    - City/Kabupaten
    - Kecamatan
    - Site
    Supports full mode (multi-entity) or band mode (GSM, DCS).
    """
    try:
        data = get_scope_aggregation_2g_data(
            scope=scope,
            mode=mode,
            start_date=start_date,
            end_date=end_date,
            nops=nops,
            cities=cities,
            kecamatans=kecamatans,
            sites=sites,
            bands=bands
        )
        return data
    except Exception as e:
        return {
            "error": str(e),
            "scope": scope,
            "mode": mode,
            "kpis": {},
            "timestamps": []
        }

# Static file serving for React frontend production build
DIST_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if DIST_DIR.exists() and (DIST_DIR / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        file_path = DIST_DIR / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(DIST_DIR / "index.html")
