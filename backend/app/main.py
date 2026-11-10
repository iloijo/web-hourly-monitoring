import os
import base64
import secrets
import threading
import time
from collections import OrderedDict
from pathlib import Path
from typing import Optional, List
from fastapi import FastAPI, Query, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response, JSONResponse
from pydantic import BaseModel
from .config import settings
from .db import check_db_health, get_twodb_connection, get_latest_data_date
from .queries import get_site_payload_data
from .queries_daily import (
    get_hierarchy_data, 
    get_site_payload_daily_data, 
    DAILY_KPIS_CONFIG
)
from .queries_5g import get_5g_sites, get_site_payload_5g_data, get_scope_aggregation_5g_data, KPIS_5G_CONFIG
from .queries_2g import get_2g_sites, get_site_payload_2g_data, get_scope_aggregation_2g_data, KPIS_2G_CONFIG
from .queries_ta import get_ta_4g_data, get_ta_5g_data, get_ta_compare_data
from .queries_twamp import get_twamp_packet_loss_data, get_twamp_scope_aggregation
from .site_names import load_site_names, get_site_display_name, get_site_name
from .queries_properties import get_site_properties
from .queries_scope_4g import get_scope_aggregation_data, get_hourly_scope_aggregation_data
from .queries_worstcell import get_worst_cells, get_ztzp
from .export_xlsx import build_workbook, safe_filename
from .queries_cluster import get_cluster_compare, get_site_sectors
from .queries_overview import (
    get_overview_dataset,
    get_overview_inventory,
    get_overview_drill,
    get_overview_top_decline,
    get_latest_overview_date,
    prewarm_overview_cache
)
from . import clusters as cluster_store
from . import cei_store
from .queries_cei import (
    get_cei_weeks, get_cei_weekly, get_cei_throughput, get_cei_contributors, get_cei_daily, get_cei_hierarchy,
)

# Short-lived result cache: switching back to a scope/site already viewed returns instantly.
# Data only changes when the auto import runs (every 2 h), so 10 minutes is safe.
_RESULT_CACHE: "OrderedDict[tuple, tuple]" = OrderedDict()
_RESULT_CACHE_LOCK = threading.Lock()
_RESULT_CACHE_TTL_SEC = 600
_RESULT_CACHE_MAX = 256

def _cached(fn):
    def wrapper(**kwargs):
        key = (fn.__name__,) + tuple(
            (k, tuple(v) if isinstance(v, list) else v) for k, v in sorted(kwargs.items())
        )
        now = time.time()
        with _RESULT_CACHE_LOCK:
            hit = _RESULT_CACHE.get(key)
            if hit and now - hit[0] < _RESULT_CACHE_TTL_SEC:
                _RESULT_CACHE.move_to_end(key)
                return hit[1]
        result = fn(**kwargs)
        if isinstance(result, dict) and not result.get("error"):
            with _RESULT_CACHE_LOCK:
                _RESULT_CACHE[key] = (now, result)
                _RESULT_CACHE.move_to_end(key)
                while len(_RESULT_CACHE) > _RESULT_CACHE_MAX:
                    _RESULT_CACHE.popitem(last=False)
        return result
    return wrapper

get_site_payload_data = _cached(get_site_payload_data)
get_site_payload_daily_data = _cached(get_site_payload_daily_data)
get_scope_aggregation_data = _cached(get_scope_aggregation_data)
get_hourly_scope_aggregation_data = _cached(get_hourly_scope_aggregation_data)
get_site_payload_5g_data = _cached(get_site_payload_5g_data)
get_scope_aggregation_5g_data = _cached(get_scope_aggregation_5g_data)
get_site_payload_2g_data = _cached(get_site_payload_2g_data)
get_scope_aggregation_2g_data = _cached(get_scope_aggregation_2g_data)
get_ta_4g_data = _cached(get_ta_4g_data)
get_ta_5g_data = _cached(get_ta_5g_data)
get_twamp_packet_loss_data = _cached(get_twamp_packet_loss_data)
get_ta_compare_data = _cached(get_ta_compare_data)
get_twamp_scope_aggregation = _cached(get_twamp_scope_aggregation)
get_site_properties = _cached(get_site_properties)
get_worst_cells = _cached(get_worst_cells)
get_ztzp = _cached(get_ztzp)
get_cluster_compare = _cached(get_cluster_compare)
get_cei_weeks = _cached(get_cei_weeks)
get_cei_weekly = _cached(get_cei_weekly)
get_cei_throughput = _cached(get_cei_throughput)
get_cei_contributors = _cached(get_cei_contributors)
get_cei_daily = _cached(get_cei_daily)
get_cei_hierarchy = _cached(get_cei_hierarchy)
app = FastAPI(title="netPulse - KPI Monitoring Dashboard", version="3.8.0")
app.add_middleware(GZipMiddleware, minimum_size=1000)

@app.on_event("startup")
def startup_event():
    threading.Thread(target=prewarm_overview_cache, daemon=True).start()

class LoginPayload(BaseModel):
    username: str
    password: str

# HTTP Basic login for protected endpoints when DASHBOARD_USER and DASHBOARD_PASS are set in backend/.env
@app.middleware("http")
async def basic_auth(request: Request, call_next):
    if not (settings.DASHBOARD_USER and settings.DASHBOARD_PASS):
        return await call_next(request)

    path = request.url.path
    # Allow static assets, SPA routes, and auth endpoints through
    if not path.startswith("/api/") or path.startswith("/api/auth/"):
        return await call_next(request)

    header = request.headers.get("authorization", "")
    if header.lower().startswith("basic "):
        try:
            user, _, pw = base64.b64decode(header[6:]).decode("utf-8").partition(":")
        except Exception:
            user, pw = "", ""
        if secrets.compare_digest(user, settings.DASHBOARD_USER) and secrets.compare_digest(pw, settings.DASHBOARD_PASS):
            return await call_next(request)

    # Return 401 JSON without WWW-Authenticate header to prevent native browser login dialog
    return JSONResponse(
        status_code=401,
        content={"error": "Unauthorized", "message": "Authentication is required to access netPulse data."}
    )

@app.post("/api/auth/login")
def api_login(payload: LoginPayload):
    """Authenticate against DASHBOARD_USER and DASHBOARD_PASS from backend/.env."""
    if not (settings.DASHBOARD_USER and settings.DASHBOARD_PASS):
        return {"success": True, "user": payload.username or "Admin", "token": "open_access"}

    if (
        secrets.compare_digest(payload.username, settings.DASHBOARD_USER)
        and secrets.compare_digest(payload.password, settings.DASHBOARD_PASS)
    ):
        raw = f"{payload.username}:{payload.password}"
        token = base64.b64encode(raw.encode("utf-8")).decode("utf-8")
        return {"success": True, "user": payload.username, "token": token}

    return JSONResponse(
        status_code=401,
        content={"error": "Username and password do not match."}
    )

@app.get("/api/auth/check")
def api_check_auth(request: Request):
    """Verify currently stored session token."""
    if not (settings.DASHBOARD_USER and settings.DASHBOARD_PASS):
        return {"authenticated": True, "auth_required": False, "user": "Admin"}

    header = request.headers.get("authorization", "")
    if header.lower().startswith("basic "):
        try:
            user, _, pw = base64.b64decode(header[6:]).decode("utf-8").partition(":")
            if secrets.compare_digest(user, settings.DASHBOARD_USER) and secrets.compare_digest(pw, settings.DASHBOARD_PASS):
                return {"authenticated": True, "auth_required": True, "user": user}
        except Exception:
            pass

    return JSONResponse(
        status_code=401,
        content={"authenticated": False, "auth_required": True}
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
        "overview": ("onedb", "measDailyTrafficPayload"),
        "4g_hourly": ("twodb", "measHy4g"),
        "4g_daily": ("onedb", "measDy4g"),
        "5g": ("onedb", "measDy5g"),
        "2g": ("onedb", "measDy2g"),
        "ta_4g": ("onedb", "measTa4g"),
        "ta_5g": ("onedb", "measTa5g"),
        "packet_loss": ("onedb", "measTwamp4g"),
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

@app.get("/api/hourly/properties")
@app.get("/api/daily/properties")
def get_daily_properties(site_id: str = Query(..., description="Site ID e.g. MRW002")):
    """4G cell properties of one site (CompilePowerRet + lte_cell_config + location)."""
    try:
        return get_site_properties(site_id=site_id)
    except Exception as e:
        return {"error": str(e), "site_id": site_id, "columns": [], "rows": []}

@app.post("/api/export/xlsx")
async def export_xlsx(request: Request):
    """Turns the page's export payload {filename, sheets: [{name, columns, rows}]} into an .xlsx download."""
    payload = await request.json()
    content = build_workbook(payload.get("sheets") or [])
    filename = safe_filename(payload.get("filename"))
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

@app.get("/api/overview/dataset")
def get_overview_dataset_endpoint(
    year: int = Query(2026, description="Year to fetch (includes year and year-1)"),
    nop: Optional[str] = Query(None, description="NOP filter"),
    kabupaten: Optional[str] = Query(None, description="Kabupaten filter"),
    kecamatan: Optional[str] = Query(None, description="Kecamatan filter"),
    refresh: bool = Query(False, description="Force refresh cache")
):
    """Daily aggregated dataset for the specified year and previous year."""
    try:
        return get_overview_dataset(
            year=year,
            nop=nop,
            kabupaten=kabupaten,
            kecamatan=kecamatan,
            refresh=refresh
        )
    except Exception as e:
        return {"error": str(e), "year": year, "rows": []}

@app.get("/api/overview/inventory")
def get_overview_inventory_endpoint(
    nop: Optional[str] = Query(None, description="NOP filter"),
    kabupaten: Optional[str] = Query(None, description="Kabupaten filter"),
    kecamatan: Optional[str] = Query(None, description="Kecamatan filter"),
    refresh: bool = Query(False, description="Force refresh cache")
):
    """Registered 2G/4G/5G site inventory counts grouped by NOP or filtered by scope."""
    try:
        return get_overview_inventory(
            nop=nop,
            kabupaten=kabupaten,
            kecamatan=kecamatan,
            refresh=refresh
        )
    except Exception as e:
        return {"error": str(e), "week": "Unknown", "nops": {}}

@app.get("/api/overview/drill")
def get_overview_drill_endpoint(
    date: Optional[str] = Query(None, description="Selected date (YYYY-MM-DD)"),
    mode: str = Query("YTD", description="Analysis mode: YoY, MTD, YTD"),
    level: str = Query("kabupaten", description="Hierarchy level: kabupaten, kecamatan, site"),
    parent: Optional[str] = Query(None, description="Parent name (NOP, Kabupaten, or Kecamatan)"),
    nop: Optional[str] = Query(None, description="NOP filter"),
    kabupaten: Optional[str] = Query(None, description="Kabupaten filter")
):
    """Geographic drill-down ranking (NOP -> Kabupaten -> Kecamatan -> Site) under YoY/MTD/YTD modes."""
    try:
        return get_overview_drill(
            date=date,
            mode=mode,
            level=level,
            parent=parent,
            nop=nop,
            kabupaten=kabupaten
        )
    except Exception as e:
        return {"error": str(e), "items": []}

@app.get("/api/overview/top_decline")
def get_overview_top_decline_endpoint(
    date: Optional[str] = Query(None, description="Target date (YYYY-MM-DD)"),
    mode: str = Query("YTD", description="Analysis mode: YoY, MTD, YTD"),
    nop: Optional[str] = Query(None, description="NOP filter"),
    kabupaten: Optional[str] = Query(None, description="Kabupaten filter"),
    kecamatan: Optional[str] = Query(None, description="Kecamatan filter"),
    top_n: int = Query(10, description="Top N sites (default 10)")
):
    """Top sites with largest payload decline vs same period last year."""
    try:
        return get_overview_top_decline(
            date=date,
            mode=mode,
            nop=nop,
            kabupaten=kabupaten,
            kecamatan=kecamatan,
            top_n=top_n
        )
    except Exception as e:
        return {"error": str(e), "sites": []}

@app.get("/api/worstcell")
def get_worstcell_endpoint(
    tech: str = Query("4g", description="2g, 4g or 5g"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    top_n: int = Query(10),
    scope: str = Query("regional", description="regional, nop, city or kecamatan"),
    nops: Optional[List[str]] = Query(None),
    cities: Optional[List[str]] = Query(None),
    kecamatans: Optional[List[str]] = Query(None),
):
    """Worst Cell Top-N per KPI (WPC rules); a date range sums num/denum and counts breach days."""
    try:
        return get_worst_cells(tech=tech, start_date=start_date, end_date=end_date, top_n=top_n,
                               scope=scope, nops=nops, cities=cities, kecamatans=kecamatans)
    except Exception as e:
        return {"error": str(e), "kpis": []}

@app.get("/api/ztzp")
def get_ztzp_endpoint(
    tech: str = Query("4g", description="2g, 4g or 5g"),
    date: Optional[str] = Query(None),
    scope: str = Query("regional"),
    nops: Optional[List[str]] = Query(None),
    cities: Optional[List[str]] = Query(None),
    kecamatans: Optional[List[str]] = Query(None),
    category: Optional[str] = Query(None),
    limit: int = Query(500, description="rows returned; 0 = all"),
):
    """ZTZP sleeping / low payload / availability-issue cells on one date with aging."""
    try:
        return get_ztzp(tech=tech, date=date, scope=scope, nops=nops, cities=cities,
                        kecamatans=kecamatans, category=category, limit=limit)
    except Exception as e:
        return {"error": str(e), "rows": []}

@app.get("/api/hourly/aggregation")
def get_hourly_aggregation_endpoint(
    scope: str = Query("site"),
    mode: str = Query("full"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    nops: Optional[List[str]] = Query(None),
    cities: Optional[List[str]] = Query(None),
    kecamatans: Optional[List[str]] = Query(None),
    sites: Optional[List[str]] = Query(None),
    bands: Optional[List[str]] = Query(None)
):
    """4G Hourly charts (measHy4g) per Site; other scopes are not offered for Hourly."""
    try:
        return get_hourly_scope_aggregation_data(
            scope=scope, mode=mode, start_date=start_date, end_date=end_date,
            nops=nops, cities=cities, kecamatans=kecamatans, sites=sites, bands=bands,
        )
    except Exception as e:
        return {"error": str(e), "scope": scope, "mode": mode, "kpis": {}, "timestamps": []}


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



@app.get("/api/timing_advance/4g")
def get_ta_4g_endpoint(
    site_id: str = Query("BUO028"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    sector: Optional[str] = Query(None),
    band: Optional[str] = Query(None),
    cell_type: Optional[str] = Query("all")
):
    """Returns 4G Timing Advance distribution and cumulative data matching Bild 1 layout."""
    return get_ta_4g_data(
        site_id=site_id,
        start_date=start_date,
        end_date=end_date,
        sector_filter=sector,
        band_filter=band,
        cell_type=cell_type
    )

@app.get("/api/timing_advance/5g")
def get_ta_5g_endpoint(
    site_id: str = Query("UPD364"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    sector: Optional[str] = Query(None),
    band: Optional[str] = Query(None),
    cell_type: Optional[str] = Query("all")
):
    """Returns 5G Timing Advance distribution and cumulative data."""
    return get_ta_5g_data(
        site_id=site_id,
        start_date=start_date,
        end_date=end_date,
        sector_filter=sector,
        band_filter=band,
        cell_type=cell_type
    )

@app.get("/api/packet_loss/4g")
def get_packet_loss_4g_endpoint(
    site_id: str = Query("KWA001"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None)
):
    """Returns 4G TWAMP packet loss rate, delay, jitter, and packet volumes."""
    return get_twamp_packet_loss_data(
        site_id=site_id,
        start_date=start_date,
        end_date=end_date
    )



@app.get("/api/timing_advance/compare")
def get_ta_compare_endpoint(
    tech: str = Query("4g"),
    site_id: str = Query("BUO028"),
    before_start: Optional[str] = Query(None),
    before_end: Optional[str] = Query(None),
    after_start: Optional[str] = Query(None),
    after_end: Optional[str] = Query(None),
    sector: Optional[str] = Query(None),
    band: Optional[str] = Query(None),
    cell_type: Optional[str] = Query("all")
):
    """Compares Timing Advance between Before and After date ranges."""
    return get_ta_compare_data(
        tech=tech,
        site_id=site_id,
        before_start=before_start,
        before_end=before_end,
        after_start=after_start,
        after_end=after_end,
        sector_filter=sector,
        band_filter=band,
        cell_type=cell_type
    )

@app.get("/api/packet_loss/aggregation")
def get_packet_loss_aggregation_endpoint(
    scope: str = Query("regional"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    nops: Optional[List[str]] = Query(None),
    cities: Optional[List[str]] = Query(None),
    kecamatans: Optional[List[str]] = Query(None),
    sites: Optional[List[str]] = Query(None)
):
    """Returns TWAMP packet loss aggregated across Regional, NOP, City, Kecamatan, Site scopes."""
    return get_twamp_scope_aggregation(
        scope=scope,
        start_date=start_date,
        end_date=end_date,
        nops=nops,
        cities=cities,
        kecamatans=kecamatans,
        sites=sites
    )

# =============================================================================
# Cluster Monitoring: saved clusters (shared, onedb) and before/after comparison
# =============================================================================
def _cluster_error(e: Exception) -> JSONResponse:
    if isinstance(e, ValueError):
        return JSONResponse(status_code=400, content={"error": str(e)})
    if isinstance(e, LookupError):
        return JSONResponse(status_code=404, content={"error": str(e)})
    if getattr(e, "pgcode", None) == "23505":
        return JSONResponse(status_code=409, content={"error": "That cluster name is already taken."})
    return JSONResponse(status_code=503, content={"error": str(e)})

@app.get("/api/clusters")
def list_clusters_endpoint():
    try:
        return {"clusters": cluster_store.list_clusters()}
    except Exception as e:
        return _cluster_error(e)

@app.post("/api/clusters")
async def create_cluster_endpoint(request: Request):
    try:
        return cluster_store.save_cluster(await request.json())
    except Exception as e:
        return _cluster_error(e)

@app.put("/api/clusters/{cluster_id}")
async def update_cluster_endpoint(cluster_id: int, request: Request):
    try:
        return cluster_store.save_cluster(await request.json(), cluster_id)
    except Exception as e:
        return _cluster_error(e)

@app.delete("/api/clusters/{cluster_id}")
def delete_cluster_endpoint(cluster_id: int):
    try:
        if not cluster_store.delete_cluster(cluster_id):
            raise LookupError("Cluster not found.")
        return {"deleted": cluster_id}
    except Exception as e:
        return _cluster_error(e)

@app.get("/api/cluster/site_sectors")
def cluster_site_sectors_endpoint():
    """{site_id: [sectors]} of the 4G reference, for the Site Sector picker."""
    try:
        return {"site_sectors": get_site_sectors()}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/api/cluster/compare")
async def cluster_compare_endpoint(request: Request):
    """Body: {tech, members: ["UPD012", "UPD003_1"], start_date, end_date, before_start, before_end, after_start, after_end}."""
    body = await request.json()
    try:
        return get_cluster_compare(
            tech=str(body.get("tech") or "4g"),
            members=sorted({str(m).strip().upper() for m in body.get("members") or []}),
            **{k: body.get(k) or None for k in
               ("start_date", "end_date", "before_start", "before_end", "after_start", "after_end")},
        )
    except Exception as e:
        return JSONResponse(status_code=400 if isinstance(e, ValueError) else 500, content={"error": str(e)})

# ---------------------------------------------------------------------------
# OKR > CEI
# ---------------------------------------------------------------------------
def _cei_error(e: Exception):
    return JSONResponse(status_code=400 if isinstance(e, ValueError) else 503, content={"error": str(e)})

def _drop_cei_cache():
    """Targets and events are part of the CEI results, so an edit must not wait for the 10-minute cache."""
    with _RESULT_CACHE_LOCK:
        for key in [k for k in _RESULT_CACHE if str(k[0]).startswith("get_cei")]:
            del _RESULT_CACHE[key]

@app.get("/api/cei/weeks")
def cei_weeks_endpoint():
    try:
        return get_cei_weeks()
    except Exception as e:
        return _cei_error(e)

_CEI_SCOPE = Query("all", description="all, nop, kabupaten or kecamatan")
_CEI_VALUES = Query(None, description="NOP / kabupaten names, or KABUPATEN|KECAMATAN")

def _cei_values(values):
    return sorted({v.strip().upper() for v in values or [] if v and v.strip()})

@app.get("/api/cei/hierarchy")
def cei_hierarchy_endpoint():
    """NOP -> kabupaten -> kecamatan options from the CEI data."""
    try:
        return get_cei_hierarchy()
    except Exception as e:
        return _cei_error(e)

@app.get("/api/cei/weekly")
def cei_weekly_endpoint(week: Optional[int] = Query(None, description="YYYYWW, default latest"),
                        scope: str = _CEI_SCOPE, values: Optional[List[str]] = _CEI_VALUES):
    """Weekly CEI report: achievement trend, NOP table, KQI fail, most KQI, kabupaten, demarcation, cohort, status."""
    try:
        return get_cei_weekly(week=week, scope=scope, values=_cei_values(values))
    except Exception as e:
        return _cei_error(e)

@app.get("/api/cei/throughput")
def cei_throughput_endpoint(week: int = Query(..., description="YYYYWW"),
                            scope: str = _CEI_SCOPE, values: Optional[List[str]] = _CEI_VALUES):
    try:
        return get_cei_throughput(week=week, scope=scope, values=_cei_values(values))
    except Exception as e:
        return _cei_error(e)

@app.get("/api/cei/contributors")
def cei_contributors_endpoint(week: int = Query(..., description="YYYYWW"), top_n: int = Query(5, ge=1, le=10),
                              scope: str = _CEI_SCOPE, values: Optional[List[str]] = _CEI_VALUES):
    try:
        return get_cei_contributors(week=week, top_n=top_n, scope=scope, values=_cei_values(values))
    except Exception as e:
        return _cei_error(e)

@app.get("/api/cei/daily")
def cei_daily_endpoint(start_date: Optional[str] = Query(None), end_date: Optional[str] = Query(None),
                       scope: str = _CEI_SCOPE, values: Optional[List[str]] = _CEI_VALUES):
    try:
        return get_cei_daily(start_date=start_date, end_date=end_date, scope=scope, values=_cei_values(values))
    except Exception as e:
        return _cei_error(e)

@app.get("/api/cei/settings")
def cei_settings_endpoint():
    try:
        return {"targets": cei_store.list_targets(), "events": cei_store.list_events()}
    except Exception as e:
        return _cei_error(e)

@app.post("/api/cei/targets")
async def cei_save_target_endpoint(request: Request):
    body = await request.json()
    try:
        cei_store.save_target(body.get("start_week"), body.get("target_pct"))
        _drop_cei_cache()
        return {"targets": cei_store.list_targets()}
    except Exception as e:
        return _cei_error(e)

@app.delete("/api/cei/targets/{start_week}")
def cei_delete_target_endpoint(start_week: int):
    try:
        cei_store.delete_target(start_week)
        _drop_cei_cache()
        return {"targets": cei_store.list_targets()}
    except Exception as e:
        return _cei_error(e)

@app.post("/api/cei/events")
async def cei_add_event_endpoint(request: Request):
    body = await request.json()
    try:
        cei_store.add_event(str(body.get("date") or ""), str(body.get("kind") or ""), str(body.get("label") or ""))
        _drop_cei_cache()
        return {"events": cei_store.list_events()}
    except Exception as e:
        return _cei_error(e)

@app.delete("/api/cei/events/{event_id}")
def cei_delete_event_endpoint(event_id: int):
    try:
        cei_store.delete_event(event_id)
        _drop_cei_cache()
        return {"events": cei_store.list_events()}
    except Exception as e:
        return _cei_error(e)

# Static file serving for React frontend production build
DIST_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if DIST_DIR.exists() and (DIST_DIR / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        # Unknown API paths get a clear 404 instead of the app's HTML (e.g. a server older than the frontend)
        if full_path.startswith("api/"):
            return Response(
                content='{"error": "Endpoint not found on this server. Restart start_dashboard.bat."}',
                status_code=404, media_type="application/json",
            )
        file_path = DIST_DIR / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(
            DIST_DIR / "index.html",
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"}
        )
