"""
Worst Cell Top-N (WPC) and ZTZP (Zero Traffic Zero Payload) for 2G / 4G / 5G daily data.

Rules follow the WPC Kabupaten and "Payload less than 5" reports:
- success-rate KPIs: cells below threshold, ranked by FAIL = Denum - Num
- drop / block KPIs: cells above threshold, ranked by FAIL = Num
- DL PRB: cells above threshold, ranked by PRB Num (traffic weight)
- value KPIs (Max RRC, CQI, SE, User Thp): ranked by value, worst first
Over a date range, num/denum are summed first; "days_breach" counts days the daily value breached.
"""
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from .db import get_latest_data_date, get_onedb_connection

# kind: 'success' | 'drop' | 'load' | 'value'; op: '<' or '>'; scale: 100 for percent
WPC_KPIS: Dict[str, List[Dict[str, Any]]] = {
    "4g": [
        {"id": "rrc_sr", "title": "RRC Est", "unit": "%", "op": "<", "thr": 98, "kind": "success", "scale": 100,
         "num": "Num RRC Setup SR AMQ", "den": "Denum RRC Setup SR AMQ"},
        {"id": "erab_sr", "title": "E-RAB", "unit": "%", "op": "<", "thr": 98, "kind": "success", "scale": 100,
         "num": "Num E-RAB Setup SR AMQ", "den": "Denum E-RAB Setup SR AMQ"},
        {"id": "ifho_sr", "title": "IFHO", "unit": "%", "op": "<", "thr": 98, "kind": "success", "scale": 100,
         "num": "Num IFHO SR AMQ", "den": "Denum IFHO SR AMQ"},
        {"id": "dl_prb", "title": "DL PRB Util", "unit": "%", "op": ">", "thr": 70, "kind": "load", "scale": 100,
         "num": "DL PRB Utilization Num AMQ", "den": "DL PRB Utilization Denum AMQ"},
        {"id": "erab_drop", "title": "E-RAB Drop", "unit": "%", "op": ">", "thr": 1, "kind": "drop", "scale": 100,
         "num": "Num E-RAB Drop AMQ", "den": "Denum E-RAB Drop AMQ"},
        {"id": "csfb_sr", "title": "CSFB Prep", "unit": "%", "op": "<", "thr": 99.5, "kind": "success", "scale": 100,
         "num": "Num CSFB SR AMQ", "den": "Denum CSFB SR AMQ"},
        {"id": "max_rrc", "title": "Max RRC Connection", "unit": "User", "op": ">", "thr": 120, "kind": "value",
         "val": "Maximum Number of RRC Connection User(unit)", "agg": "max"},
        {"id": "availability", "title": "Availability", "unit": "%", "op": "<", "thr": 99, "kind": "success", "scale": 100,
         "num": "Cell Availability Num 4G AMQ", "den": "Cell Availability Denum 4G AMQ"},
        {"id": "cqi", "title": "CQI", "unit": "", "op": "<", "thr": 10, "kind": "value", "scale": 1,
         "num": "Num Average CQI_Rev", "den": "Denum Average CQI_Rev"},
        {"id": "se", "title": "SE", "unit": "bps/Hz", "op": "<", "thr": 1.8, "kind": "value", "scale": 1,
         "num": "spectrum efficiency num", "den": "spectrum efficiency denum"},
        {"id": "volte_cssr", "title": "VoLTE CSSR", "unit": "%", "op": "<", "thr": 98, "kind": "success", "scale": 100,
         "num": "Call_Setup_VoLTE_Num AMQ", "den": "Call_Setup_VoLTE_Denum AMQ"},
        {"id": "volte_drop", "title": "VoLTE Call Drop", "unit": "%", "op": ">", "thr": 1, "kind": "drop", "scale": 100,
         "num": "Call_Drop_VoLTE_Num AMQ", "den": "Call_Drop_VoLTE_Denum AMQ"},
        {"id": "user_dl_thp", "title": "User DL Throughput", "unit": "Kbps", "op": "<", "thr": 1500, "kind": "value", "scale": 1,
         "num": "User DL Throughput Num AMQ", "den": "User DL Throughput Denum AMQ"},
    ],
    "5g": [
        {"id": "sn_sr", "title": "SN Setup SR", "unit": "%", "op": "<", "thr": 98, "kind": "success", "scale": 100,
         "num": "SN_Setup_Success_Rate(%)_LW_Num", "den": "SN_Setup_Success_Rate(%)_LW_Denum"},
        {"id": "nr_drop", "title": "NR Drop", "unit": "%", "op": ">", "thr": 1, "kind": "drop", "scale": 100,
         "num": "NR_Retainability(%)_LW_Num", "den": "NR_Retainability(%)_LW_Denum"},
        {"id": "intra_ho", "title": "Intra HO SR", "unit": "%", "op": "<", "thr": 98, "kind": "success", "scale": 100,
         "num": "Intra_Handover_Success_Rate(%)_LW_Num", "den": "Intra_Handover_Success_Rate(%)_LW_Denum"},
        {"id": "inter_ho", "title": "Inter HO SR", "unit": "%", "op": "<", "thr": 98, "kind": "success", "scale": 100,
         "num": "Inter_Handover_Success_Rate(%)_LW_Num", "den": "Inter_Handover_Success_Rate(%)_LW_Denum"},
        {"id": "dl_prb", "title": "DL PRB Util", "unit": "%", "op": ">", "thr": 70, "kind": "load", "scale": 100,
         "num": "PRB_Utilization_DL(%)_LW_Num", "den": "PRB_Utilization_DL(%)_LW_Denum"},
        {"id": "availability", "title": "Availability", "unit": "%", "op": "<", "thr": 99, "kind": "value", "scale": 100,
         "val": "Availability(%)_LW", "agg": "avg"},
        {"id": "cqi", "title": "CQI", "unit": "", "op": "<", "thr": 10, "kind": "value",
         "val": "Average_CQI-XHJ_1646720281179", "agg": "avg"},
        {"id": "se", "title": "SE", "unit": "bps/Hz", "op": "<", "thr": 1.8, "kind": "value", "scale": 1,
         "num": "Num_Spectrum_Eff-xhj_1646720281711", "den": "Denum_Spectrum_Eff-xhj_1646720283300"},
    ],
    "2g": [
        {"id": "sdsr", "title": "SDSR", "unit": "%", "op": "<", "thr": 98, "kind": "success", "scale": 100,
         "num": "SDSR_num_ono", "den": "SDSR_denum_ono"},
        {"id": "hosr", "title": "HOSR", "unit": "%", "op": "<", "thr": 96, "kind": "success", "scale": 100,
         "num": "HOSR_num_ono", "den": "HOSR_denum_ono"},
        {"id": "tbf_comp", "title": "TBF Completion", "unit": "%", "op": "<", "thr": 99, "kind": "success", "scale": 100,
         "num": "Num TBF Comp SR NFJ_1513202618039-0-23", "den": "Denum TBF Comp SR NFJ_1513202618039-0-24"},
        {"id": "tch_block", "title": "TCH Block", "unit": "%", "op": ">", "thr": 2, "kind": "drop", "scale": 100,
         "num": "TCH_Block_num_ono", "den": "TCH_Block_denum_ono"},
        {"id": "tch_drop", "title": "TCH Drop", "unit": "%", "op": ">", "thr": 1, "kind": "drop", "scale": 100,
         "num": "TCH_Drop_num_ono", "den": "TCH_Drop_denum_ono"},
        {"id": "tbf_est", "title": "TBF Establishment", "unit": "%", "op": "<", "thr": 98, "kind": "success", "scale": 100,
         "num": "Num TBF DL Est SR NFJ_1513202618039-0-17", "den": "Denum TBF DL Est SR NFJ_1513202618039-0-18"},
        {"id": "sdcch_block", "title": "SDCCH Block", "unit": "%", "op": ">", "thr": 0.5, "kind": "drop", "scale": 100,
         "num": "SDCCH_Block_num_ono", "den": "SDCCH_Block_denum_ono"},
        {"id": "availability", "title": "Availability", "unit": "%", "op": "<", "thr": 99, "kind": "success", "scale": 100,
         "num": "Num TCH Availability_Ono", "den": "Denum TCH Availability_ono"},
    ],
}

TECH_SOURCE = {
    "4g": {"table": "measDy4g", "cell": "Cell Name"},
    "5g": {"table": "measDy5g", "cell": "NRPhysicalCellDU Name"},
    "2g": {"table": "measDy2g", "cell": "BTS Name"},
}

# ZTZP expressions per tech (availability in %, payload in MB, 2G traffic in Erlang)
ZTZP_EXPR = {
    "4g": {
        # fully down cells report Denum 0; the % column (0) keeps them in the availability list
        "avail": 'COALESCE("Cell Availability Num 4G AMQ" / NULLIF("Cell Availability Denum 4G AMQ", 0), "Cell Availability 4G_(%)") * 100',
        "payload": '"4G Payload (MByte) AMQ"',
    },
    "5g": {
        "avail": '"Availability(%)_LW" * 100',
        "payload": '"Payload(GB)_LW" * 1024',
    },
    "2g": {
        "avail": 'COALESCE("Num TCH Availability_Ono" / NULLIF("Denum TCH Availability_ono", 0), "TCH Availability (%)_Ono") * 100',
        "payload": 'COALESCE("GPRS Payload (Mbyte)_ono", 0) + COALESCE("EDGE Payload (Mbyte)_ono", 0)',
        "traffic": '"TCH Traffic (Erl)_ono"',
    },
}
ZTZP_LOW_LIMIT = 5        # MB payload / Erlang traffic
ZTZP_AVAIL_OK = 80        # payload list needs availability >= 80%
ZTZP_AVAIL_DOWN = 50      # availability list: < 50%
ZTZP_AGING_WINDOW = 30    # days looked back for aging

def _site_sql(cell_expr: str) -> str:
    """Site prefix: E_MRW002MR1_Bungku_MR01 -> MRW002, also for names without the 'E_' part."""
    return (f"COALESCE(substring({cell_expr} from '^[A-Z]_([A-Z0-9]{{6}})'), "
            f"substring({cell_expr} from '^([A-Z0-9]{{6}})'))")


# site -> branch / NOP (LookupSITEID) and Kabupaten / Kecamatan (CellListRCI first, like the hierarchy filter)
_LOC_CTE = """
    loc AS (
        SELECT DISTINCT ON (l."Prefix Site ID")
               l."Prefix Site ID" AS site, l."Branch" AS branch, l."NOP" AS nop,
               COALESCE(r.kabupaten, l."Kota/Kabupaten") AS kabupaten,
               COALESCE(r.kecamatan, l."Kecamatan") AS kecamatan
        FROM "LookupSITEID" l
        LEFT JOIN (SELECT DISTINCT ON (site_id) site_id, kabupaten, kecamatan FROM "CellListRCI" ORDER BY site_id) r
               ON r.site_id = l."Prefix Site ID"
        ORDER BY l."Prefix Site ID"
    )"""


def _q(col: str) -> str:
    """Quoted column name, with % escaped for psycopg2 parameter strings."""
    return '"' + col.replace('%', '%%') + '"'


def _scope_sql(scope: str, nops, cities, kecamatans):
    """WHERE fragment on the loc columns plus its params; an empty selection matches nothing."""
    column, values = {
        "nop": ("loc.nop", nops),
        "city": ("loc.kabupaten", cities),
        "kecamatan": ("loc.kecamatan", kecamatans),
    }.get(scope, (None, None))
    if column is None:
        return "", []
    if not values:
        return "AND FALSE", []
    return f"AND {column} = ANY(%s)", [list(values)]


def _date_range(tech: str, start_date: Optional[str], end_date: Optional[str]):
    latest = get_latest_data_date("onedb", TECH_SOURCE[tech]["table"])
    end = datetime.strptime(end_date, "%Y-%m-%d") if end_date else latest
    start = datetime.strptime(start_date, "%Y-%m-%d") if start_date else end
    if start > end:
        start, end = end, start
    return start, end


def get_worst_cells(
    tech: str = "4g",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    top_n: int = 10,
    scope: str = "regional",
    nops: Optional[List[str]] = None,
    cities: Optional[List[str]] = None,
    kecamatans: Optional[List[str]] = None,
) -> Dict[str, Any]:
    tech = tech.lower()
    if tech not in WPC_KPIS:
        return {"error": f"Unknown tech {tech}", "kpis": []}
    kpis = WPC_KPIS[tech]
    src = TECH_SOURCE[tech]
    start, end = _date_range(tech, start_date, end_date)
    scope = (scope or "regional").lower()
    top_n = max(1, min(int(top_n), 200))
    scope_where, scope_params = _scope_sql(scope, nops, cities, kecamatans)

    # Daily per cell -> summed per cell (breach days from the daily values) -> ranked per KPI.
    # Only the Top-N rows per KPI leave the database.
    daily_cols, cell_cols, parts = [], [], []
    for k in kpis:
        kid, op, thr = k["id"], ("<" if k["op"] == "<" else ">"), k["thr"]
        if "num" in k:
            scale = k.get("scale", 1)
            daily_cols.append(f'SUM({_q(k["num"])}) AS n_{kid}, SUM({_q(k["den"])}) AS d_{kid}')
            daily_val = f'(n_{kid} / NULLIF(d_{kid}, 0) * {scale})'
            cell_cols.append(f'SUM(n_{kid}) AS n_{kid}, SUM(d_{kid}) AS d_{kid}')
            value = f'(n_{kid} / NULLIF(d_{kid}, 0) * {scale})::float8'
        else:
            agg = "MAX" if k["agg"] == "max" else "AVG"
            daily_cols.append(f'{agg}({_q(k["val"])}) * {k.get("scale", 1)} AS v_{kid}')
            daily_val = f'v_{kid}'
            cell_cols.append(f'{agg}(v_{kid}) AS v_{kid}')
            value = f'v_{kid}::float8'
        cell_cols.append(f'COUNT(*) FILTER (WHERE {daily_val} {op} {thr}) AS b_{kid}')
        cell_cols.append(f'COUNT({daily_val}) AS c_{kid}')

        if k["kind"] == "success":
            fail = f'(d_{kid} - n_{kid})::float8'
        elif k["kind"] in ("drop", "load"):
            fail = f'n_{kid}::float8'
        else:
            fail = 'NULL::float8'
        order = f'{value} {"ASC" if op == "<" else "DESC"}' if k["kind"] == "value" else f'{fail} DESC'
        parts.append(f"""
            (SELECT '{kid}' AS kpi, cell, site, branch, nop, kabupaten, kecamatan,
                    {value} AS value, {fail} AS fail, b_{kid} AS days_breach, c_{kid} AS days,
                    COUNT(*) OVER () AS total
             FROM cl WHERE {value} {op} {thr}
             ORDER BY {order} NULLS LAST LIMIT {top_n})""")

    sql = f"""
        WITH {_LOC_CTE},
        d AS (
            SELECT {_q(src['cell'])} AS cell, "Begin Time"::date AS day, {', '.join(daily_cols)}
            FROM {_q(src['table'])}
            WHERE "Begin Time" >= %s AND "Begin Time" < %s
            GROUP BY 1, 2
        ),
        c AS (SELECT cell, {', '.join(cell_cols)} FROM d GROUP BY cell),
        cl AS (
            SELECT c.*, {_site_sql('c.cell')} AS site, loc.branch, loc.nop, loc.kabupaten, loc.kecamatan
            FROM c LEFT JOIN loc ON loc.site = {_site_sql('c.cell')}
            WHERE TRUE {scope_where}
        )
        {' UNION ALL '.join(parts)}
    """
    conn = get_onedb_connection(timeout=15)
    if not conn:
        return {"error": "OneDb is not reachable.", "kpis": []}
    try:
        cur = conn.cursor()
        cur.execute(sql, [start, end + timedelta(days=1)] + scope_params)
        cols = [c[0] for c in cur.description]
        ranked = [dict(zip(cols, r)) for r in cur.fetchall()]
        cur.close()
    finally:
        conn.close()

    by_kpi: Dict[str, List[Dict[str, Any]]] = {}
    for r in ranked:
        by_kpi.setdefault(r.pop("kpi"), []).append(r)

    result = []
    for k in kpis:
        rows = by_kpi.get(k["id"], [])
        total = rows[0]["total"] if rows else 0
        for r in rows:
            r.pop("total")
            r["value"] = round(r["value"], 2) if r["value"] is not None else None
            r["fail"] = round(r["fail"]) if r["fail"] is not None else None
        result.append({
            "id": k["id"], "title": k["title"], "unit": k["unit"], "op": k["op"], "threshold": k["thr"],
            "kind": k["kind"], "rank_by": "value" if k["kind"] == "value" else "fail",
            "total_breach": total, "rows": rows,
        })

    return {
        "tech": tech, "start_date": start.strftime("%Y-%m-%d"), "end_date": end.strftime("%Y-%m-%d"),
        "days": (end - start).days + 1, "scope": scope, "top_n": top_n, "kpis": result,
    }


def get_ztzp(
    tech: str = "4g",
    date: Optional[str] = None,
    scope: str = "regional",
    nops: Optional[List[str]] = None,
    cities: Optional[List[str]] = None,
    kecamatans: Optional[List[str]] = None,
    category: Optional[str] = None,
    limit: int = 500,
) -> Dict[str, Any]:
    """
    Sleeping / low-payload cells (availability >= 80%, payload < 5 MB; 2G also traffic < 5 Erl)
    and availability-issue cells (< 50%) on one date, with aging = consecutive days in the same list.
    Category, aging and counts are computed in the database; only `limit` rows are returned
    (0 = all, used by the Excel export), optionally for one category.
    """
    tech = tech.lower()
    if tech not in ZTZP_EXPR:
        return {"error": f"Unknown tech {tech}", "rows": []}
    src = TECH_SOURCE[tech]
    expr = {k: v.replace('%', '%%') for k, v in ZTZP_EXPR[tech].items()}  # literal % for psycopg2
    day = datetime.strptime(date, "%Y-%m-%d") if date else get_latest_data_date("onedb", src["table"])
    window_start = day - timedelta(days=ZTZP_AGING_WINDOW - 1)

    scope = (scope or "regional").lower()
    scope_where, scope_params = _scope_sql(scope, nops, cities, kecamatans)
    has_traffic = "traffic" in expr
    low = f"(payload < {ZTZP_LOW_LIMIT}" + (f" OR traffic < {ZTZP_LOW_LIMIT})" if has_traffic else ")")
    traffic_col = f'SUM({expr["traffic"]}) AS traffic' if has_traffic else "NULL::numeric AS traffic"
    limit = max(0, int(limit))
    # Rows returned: the requested page, plus the first row of every category so all counts arrive
    if category:
        keep = "(category = %s AND rn_cat <= %s) OR rn_cat = 1" if limit else "category = %s OR rn_cat = 1"
        keep_params = [category, limit] if limit else [category]
    else:
        keep = "rn <= %s OR rn_cat = 1" if limit else "TRUE"
        keep_params = [limit] if limit else []

    sql = f"""
        WITH {_LOC_CTE},
        d AS (
            SELECT {_q(src['cell'])} AS cell, "Begin Time"::date AS day,
                   AVG({expr['avail']}) AS avail, SUM({expr['payload']}) AS payload, {traffic_col}
            FROM {_q(src['table'])}
            WHERE "Begin Time" >= %s AND "Begin Time" < %s
            GROUP BY 1, 2
        ),
        f AS (
            SELECT *, (avail >= {ZTZP_AVAIL_OK} AND {low}) AS is_low, (avail < {ZTZP_AVAIL_DOWN}) AS is_down FROM d
        ),
        hist AS (
            SELECT cell,
                   MAX(day) FILTER (WHERE NOT COALESCE(is_low, FALSE)) AS last_not_low,
                   MAX(day) FILTER (WHERE NOT COALESCE(is_down, FALSE)) AS last_not_down,
                   MIN(day) AS first_day
            FROM f GROUP BY cell
        ),
        today AS (
            SELECT f.cell, {_site_sql('f.cell')} AS site, loc.branch, loc.nop, loc.kabupaten, loc.kecamatan,
                   f.avail, f.payload, f.traffic, h.first_day,
                   CASE
                       WHEN f.is_down THEN 'Availability Issue'
                       WHEN f.payload = 0 AND (f.traffic IS NULL OR f.traffic = 0) THEN 'Sleeping'
                       ELSE COALESCE(NULLIF(concat_ws(' + ',
                           CASE WHEN f.payload < {ZTZP_LOW_LIMIT} THEN 'Low Payload' END,
                           CASE WHEN f.traffic < {ZTZP_LOW_LIMIT} THEN 'Low Traffic' END), ''), 'Low Payload')
                   END AS category,
                   CASE WHEN f.is_down THEN h.last_not_down ELSE h.last_not_low END AS last_ok
            FROM f JOIN hist h USING (cell)
            LEFT JOIN loc ON loc.site = {_site_sql('f.cell')}
            WHERE f.day = %s AND (f.is_low OR f.is_down) {scope_where}
        ),
        ranked AS (
            SELECT *,
                   CASE WHEN last_ok IS NOT NULL THEN %s::date - last_ok ELSE %s::date - first_day + 1 END AS aging_days,
                   (last_ok IS NULL AND first_day <= %s::date) AS aging_capped,
                   COUNT(*) OVER (PARTITION BY category) AS cat_count
            FROM today
        ),
        numbered AS (
            SELECT *,
                   ROW_NUMBER() OVER (ORDER BY category = 'Availability Issue', aging_days DESC, payload) AS rn,
                   ROW_NUMBER() OVER (PARTITION BY category ORDER BY aging_days DESC, payload) AS rn_cat
            FROM ranked
        )
        SELECT cell, site, branch, nop, kabupaten, kecamatan, category, avail, payload, traffic,
               aging_days, aging_capped, cat_count, rn_cat
        FROM numbered
        WHERE {keep}
        ORDER BY rn
    """
    d0 = day.date()
    params = ([window_start, day + timedelta(days=1), d0] + scope_params
              + [d0, d0, window_start.date()] + keep_params)
    conn = get_onedb_connection(timeout=20)
    if not conn:
        return {"error": "OneDb is not reachable.", "rows": []}
    try:
        cur = conn.cursor()
        cur.execute(sql, params)
        raw = cur.fetchall()
        cur.close()
    finally:
        conn.close()

    counts: Dict[str, int] = {}
    rows = []
    for (cell, site, branch, nop, kabupaten, kecamatan, cat, avail, payload, traffic,
         aging_days, aging_capped, cat_count, rn_cat) in raw:
        counts[cat] = int(cat_count)
        in_page = (cat == category) if category else True
        if not in_page or (limit and not category and rn_cat == 1 and len(rows) >= limit):
            continue
        rows.append({
            "cell": cell, "site": site, "branch": branch, "nop": nop,
            "kabupaten": kabupaten, "kecamatan": kecamatan, "category": cat,
            "availability": round(float(avail), 2) if avail is not None else None,
            "payload_mb": round(float(payload or 0), 3),
            "traffic_erl": round(float(traffic), 3) if traffic is not None else None,
            "aging_days": int(aging_days), "aging_capped": bool(aging_capped),
        })

    total = sum(counts.values()) if not category else counts.get(category, 0)
    return {
        "tech": tech, "date": day.strftime("%Y-%m-%d"), "scope": scope, "category": category,
        "aging_window": ZTZP_AGING_WINDOW, "has_traffic": has_traffic,
        "rules": {"low_limit": ZTZP_LOW_LIMIT, "avail_ok": ZTZP_AVAIL_OK, "avail_down": ZTZP_AVAIL_DOWN},
        "counts": counts, "total": total, "returned": len(rows), "rows": rows,
    }
