import re
from typing import Dict, Optional
from .db import get_onedb_connection

_SITE_NAMES_CACHE: Optional[Dict[str, str]] = None

def clean_site_name(raw_name: str, site_id: str) -> str:
    """
    Cleans eNodeB/Cell/Site raw strings into a concise, readable Site Name:
    E_MRW002M41_Bungku -> Bungku
    C_COI350M21_CombatApartemenAzureCPI -> CombatApartemenAzureCPI
    TMH018MD1_MG$TBG Jatando -> TBG Jatando
    E_UPD160M41_HotelValentino-DMT -> HotelValentino-DMT
    """
    if not raw_name:
        return ""
    name = str(raw_name).strip()
    if "$" in name:
        name = name.split("$")[-1].strip()
    elif "_" in name:
        parts = name.split("_")
        if len(parts) >= 2:
            name = "_".join(parts[2:]) if len(parts) > 2 and (parts[0] in ['E', 'C', 'S', 'N', '2G', '5G']) else parts[-1]
            
    # Remove prefix site_id if repeated in name e.g. "COI350 - ..."
    name = re.sub(rf"^{re.escape(site_id)}\s*[-_:]*\s*", "", name, flags=re.IGNORECASE).strip()
    return name

def load_site_names() -> Dict[str, str]:
    """Loads all site names across 4G, 5G, and 2G tables into memory."""
    global _SITE_NAMES_CACHE
    if _SITE_NAMES_CACHE is not None:
        return _SITE_NAMES_CACHE
        
    # A failed load is not cached (returns {}), so the next call retries once OneDb is back
    conn = get_onedb_connection(timeout=10)
    if not conn:
        return {}

    site_names = {}
    try:
        cur = conn.cursor()
        
        # 1. From CellListRCI (4G and 5G sites)
        cur.execute("""
            SELECT DISTINCT "site_id", "enodeb_name" 
            FROM "CellListRCI" 
            WHERE "site_id" IS NOT NULL AND "enodeb_name" IS NOT NULL;
        """)
        for sid, enb in cur.fetchall():
            s_clean = str(sid).strip().upper()
            if s_clean and s_clean not in site_names:
                c_name = clean_site_name(enb, s_clean)
                if c_name:
                    site_names[s_clean] = c_name

        # 2. From CellList2G (2G sites)
        cur.execute("""
            SELECT DISTINCT "Site ID", "SITE Name" 
            FROM "CellList2G" 
            WHERE "Site ID" IS NOT NULL AND "SITE Name" IS NOT NULL;
        """)
        for sid, sname in cur.fetchall():
            s_clean = str(sid).strip().upper()
            if s_clean and (s_clean not in site_names or not site_names[s_clean]):
                c_name = clean_site_name(sname, s_clean)
                if c_name:
                    site_names[s_clean] = c_name

        cur.close()
        conn.close()
        _SITE_NAMES_CACHE = site_names
        return _SITE_NAMES_CACHE
    except Exception as e:
        print(f"Error loading site names: {e}")
        try:
            conn.close()
        except Exception:
            pass
        return {}

def get_site_name(site_id: str) -> str:
    """Returns the clean site name for a site ID."""
    if not site_id:
        return ""
    names = load_site_names()
    return names.get(site_id.strip().upper(), "")

def get_site_display_name(site_id: str) -> str:
    """Returns 'SiteID - SiteName' or just 'SiteID' if name is unavailable."""
    s_id = site_id.strip().upper() if site_id else ""
    s_name = get_site_name(s_id)
    if s_name:
        return f"{s_id} - {s_name}"
    return s_id
