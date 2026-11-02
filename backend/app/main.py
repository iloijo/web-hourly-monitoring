import os
from pathlib import Path
from typing import Optional, List
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from .db import check_db_health, get_twodb_connection
from .queries import get_site_payload_data

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

@app.get("/api/sites")
def get_sites():
    """Returns all unique site IDs from CellListRCI for autocomplete/dropdown."""
    global CACHED_SITES
    if CACHED_SITES:
        return {"sites": CACHED_SITES, "total": len(CACHED_SITES)}
    
    try:
        conn = get_twodb_connection(timeout=5)
        if not conn:
            return {"sites": ["MRW002", "UPD919", "UPD183", "COI350"], "total": 4}
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
        return {"sites": CACHED_SITES, "total": len(CACHED_SITES)}
    except Exception as e:
        return {"sites": ["MRW002", "UPD919", "UPD183", "COI350"], "error": str(e), "total": 4}

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
