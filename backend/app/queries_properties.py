"""4G cell properties for one site: CompilePowerRet (power / RET) + lte_cell_config (reselection) + location."""
from decimal import Decimal
from typing import Any, Dict, List

from .bands import lte_band
from .db import get_onedb_connection

# (key, header) in display order; the frontend renders and exports these as-is
# User requested order:
# Setelah cellname masukkan SiteID_CI. Geser Max CP Pwr, CP Pwr, RS PWR, PA, PB, Tilt RET setelah TAC.
PROPERTY_COLUMNS: List[tuple] = [
    ("sector", "Sector"),
    ("cell_name", "Cell Name"),
    ("siteid_ci", "SiteID_CI"),
    ("band", "Band"),
    ("earfcn", "EARFCN"),
    ("bandwidth_dl", "BW DL"),
    ("pci", "PCI"),
    ("tac", "TAC"),
    ("max_cp_trans_pwr", "Max CP Pwr (dBm)"),
    ("cp_trans_pwr", "CP Pwr (dBm)"),
    ("cp_spe_ref_sig_pwr", "RS Pwr (dBm)"),
    ("pa_for_dtch", "Pa"),
    ("pb", "Pb"),
    ("tilt_ret", "Tilt RET"),
    ("tx_rx", "TxRx"),
    ("mimo", "MIMO"),
    ("rru_type", "RRU Type"),
    ("ref_ant", "Antenna"),
    ("max_transmit_power_w", "Max Tx Pwr (W)"),
    ("real_power", "Real Pwr (W)"),
    ("ret_match_method", "RET Match"),
    ("cell_reselection_priority", "Resel Priority"),
    ("thresh_svr_low", "threshSvrLow"),
    ("sel_qrx_lev_min", "selQrxLevMin"),
    ("snonintrasearch", "sNonIntraSearch"),
    ("intra_qrx_lev_min", "intraQrxLevMin"),
    ("kecamatan", "Kecamatan"),
    ("kabupaten", "Kabupaten"),
    ("nop", "NOP"),
    ("branch", "Branch"),
    ("updated_at", "CompilePowerRet Update"),
]


def _sector_from(sec_type: str, site_sector: str) -> int:
    """Same sector rule as the 4G Daily charts: '<SITE>_<n>_<TYPE>' then '<SITE>_<n>'."""
    for value in (sec_type, site_sector):
        parts = (value or "").split("_")
        if len(parts) >= 2 and parts[1].isdigit():
            return int(parts[1])
    return 1


def get_site_properties(site_id: str) -> Dict[str, Any]:
    site = site_id.strip().upper()
    conn = get_onedb_connection(timeout=10)
    if not conn:
        return {"error": "OneDb is not reachable.", "site_id": site, "columns": PROPERTY_COLUMNS, "rows": []}
    try:
        cur = conn.cursor()
        # Cells come from CellListRCI or CompilePowerRet (some sites are only in one of them)
        cur.execute("""
            WITH cells AS (
                SELECT siteid_ci FROM "CellListRCI" WHERE site_id = %s
                UNION
                SELECT siteid_ci FROM "CompilePowerRet" WHERE siteid = %s
            )
            SELECT
                x.siteid_ci AS siteid_ci,
                COALESCE(r.cell_name, p.cellname) AS rci_cell_name, COALESCE(r.ci, p.cellid) AS ci,
                COALESCE(r."sec new type", p.siteid_sec_rci) AS sec_type, r.site_id_sector_id,
                COALESCE(r.kecamatan, l."Kecamatan") AS kecamatan,
                COALESCE(r.kabupaten, l."Kota/Kabupaten") AS kabupaten,
                l."NOP" AS nop, l."Branch" AS branch,
                p.cellname, p.earfcn, p.bandwidth_dl, p.tx_rx, p.mimo, p.rru_type, p.ref_ant,
                p.max_cp_trans_pwr, p.max_transmit_power_w, p.cp_trans_pwr, p.cp_spe_ref_sig_pwr,
                p.pa_for_dtch, p.pb, p.real_power, p.tilt_ret, p.ret_match_method, p.updated_at,
                c.pci, c.tac, c."cellReselectionPriority" AS cell_reselection_priority,
                c."threshSvrLow" AS thresh_svr_low, c."selQrxLevMin" AS sel_qrx_lev_min,
                c.snonintrasearch, c."intraQrxLevMin" AS intra_qrx_lev_min
            FROM cells x
            LEFT JOIN (
                SELECT DISTINCT ON (siteid_ci) * FROM "CellListRCI" WHERE site_id = %s ORDER BY siteid_ci
            ) r ON r.siteid_ci = x.siteid_ci
            LEFT JOIN (
                SELECT DISTINCT ON (siteid_ci) * FROM "CompilePowerRet"
                WHERE siteid = %s ORDER BY siteid_ci, updated_at DESC NULLS LAST
            ) p ON p.siteid_ci = x.siteid_ci
            LEFT JOIN (
                SELECT DISTINCT ON (siteid_ci) * FROM "lte_cell_config"
                WHERE siteid = %s ORDER BY siteid_ci
            ) c ON c.siteid_ci = x.siteid_ci
            LEFT JOIN "LookupSITEID" l ON l."Prefix Site ID" = %s
            ORDER BY 2
        """, (site, site, site, site, site, site))
        cols = [d[0] for d in cur.description]
        raw = [dict(zip(cols, r)) for r in cur.fetchall()]
        cur.close()
    finally:
        conn.close()

    rows = []
    for r in raw:
        row = {k: r.get(k) for k, _ in PROPERTY_COLUMNS}
        row["siteid_ci"] = r.get("siteid_ci")
        row["cell_name"] = r["cellname"] or r["rci_cell_name"]
        row["sector"] = _sector_from(r["sec_type"], r["site_id_sector_id"])
        row["band"] = lte_band(r["ci"], row["cell_name"])
        row["updated_at"] = r["updated_at"].strftime("%Y-%m-%d %H:%M") if r["updated_at"] else None
        for k, v in row.items():
            if isinstance(v, (Decimal, float)):  # plain JSON numbers, no trailing .0
                row[k] = int(v) if float(v).is_integer() else float(v)
        rows.append(row)

    return {
        "site_id": site,
        "columns": [{"key": k, "label": label} for k, label in PROPERTY_COLUMNS],
        "rows": rows,
        "sectors": sorted({r["sector"] for r in rows}),
    }
