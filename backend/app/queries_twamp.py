import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from collections import defaultdict
from .errors import public_error
from .db import get_onedb_connection, get_latest_data_date
from .site_names import get_site_display_name

logger = logging.getLogger("twamp_queries")

def get_twamp_packet_loss_data(
    site_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
) -> Dict[str, Any]:
    """
    Queries measTwamp4g in onedb for site_id across [start_date, end_date].
    Returns time series of Packet Loss Rate (%), Delay (ms), Jitter (ms), and Tx/Rx packets.
    """
    site_clean = str(site_id).strip().upper()
    latest_dt = get_latest_data_date("onedb", "measTwamp4g")

    if not end_date:
        end_date = latest_dt.strftime("%Y-%m-%d")
    if not start_date:
        start_date = (datetime.strptime(end_date, "%Y-%m-%d") - timedelta(days=13)).strftime("%Y-%m-%d")

    conn = get_onedb_connection(timeout=10)
    if not conn:
        return {
            "status": "error",
            "message": "OneDb unreachable",
            "site_id": site_clean,
            "dates": [],
            "series": {},
            "summary": {},
            "table_rows": []
        }

    try:
        cur = conn.cursor()

        # Join on CellListRCI using enodeb_id
        query = """
            SELECT 
                t."Begin Time",
                t."Managed Element",
                COALESCE(t."Total Number of Twamp detect packets transmitted 1630557082985", 0) as tx,
                COALESCE(t."Total number of TWAMP detect packets received", 0) as rx,
                COALESCE(t."Average Delay of TWAMP Detecting Link(ms) 1630557082931", 0) as delay,
                COALESCE(t."Average Jitter of TWAMP Detecting Link(ms) 1630557083091", 0) as jitter
            FROM "measTwamp4g" t
            JOIN "CellListRCI" c ON t."ManagedElement ID" = c.enodeb_id
            WHERE c.site_id = %s
              AND t."Begin Time" >= %s::date
              AND t."Begin Time" <= (%s::date + interval '1 day')
            ORDER BY t."Begin Time";
        """
        cur.execute(query, (site_clean, start_date, end_date))
        rows = cur.fetchall()

        # Fallback by site ID in Managed Element string
        if not rows:
            query_fb = """
                SELECT 
                    t."Begin Time",
                    t."Managed Element",
                    COALESCE(t."Total Number of Twamp detect packets transmitted 1630557082985", 0) as tx,
                    COALESCE(t."Total number of TWAMP detect packets received", 0) as rx,
                    COALESCE(t."Average Delay of TWAMP Detecting Link(ms) 1630557082931", 0) as delay,
                    COALESCE(t."Average Jitter of TWAMP Detecting Link(ms) 1630557083091", 0) as jitter
                FROM "measTwamp4g" t
                WHERE t."Managed Element" ILIKE %s
                  AND t."Begin Time" >= %s::date
                  AND t."Begin Time" <= (%s::date + interval '1 day')
                ORDER BY t."Begin Time";
            """
            cur.execute(query_fb, (f"%{site_clean}%", start_date, end_date))
            rows = cur.fetchall()

        cur.close()
    except Exception as e:
        logger.error(f"Error querying TWAMP for {site_clean}: {e}")
        conn.rollback()
        conn.close()
        return {
            "status": "error",
            "message": public_error(e),
            "site_id": site_clean,
            "dates": [],
            "series": {},
            "summary": {},
            "table_rows": []
        }
    finally:
        conn.close()

    dates = []
    loss_rates = []
    delays = []
    jitters = []
    tx_list = []
    rx_list = []
    table_rows = []

    # Daily aggregation (in case there are multiple client IDs per site)
    daily_data = {}
    for r in rows:
        b_time, me, tx, rx, delay, jitter = r[0], r[1], float(r[2]), float(r[3]), float(r[4]), float(r[5])
        d_str = b_time.strftime("%Y-%m-%d") if isinstance(b_time, datetime) else str(b_time)[:10]

        if d_str not in daily_data:
            daily_data[d_str] = { "tx": 0.0, "rx": 0.0, "delays": [], "jitters": [], "me": me }
        
        daily_data[d_str]["tx"] += tx
        daily_data[d_str]["rx"] += rx
        if delay > 0:
            daily_data[d_str]["delays"].append(delay)
        if jitter > 0:
            daily_data[d_str]["jitters"].append(jitter)

    sorted_dates = sorted(daily_data.keys())
    for d_str in sorted_dates:
        item = daily_data[d_str]
        tx = item["tx"]
        rx = item["rx"]
        loss_cnt = max(0.0, tx - rx)
        loss_pct = round((loss_cnt / tx * 100.0), 4) if tx > 0 else 0.0
        avg_d = round(sum(item["delays"]) / len(item["delays"]), 2) if item["delays"] else 0.0
        avg_j = round(sum(item["jitters"]) / len(item["jitters"]), 2) if item["jitters"] else 0.0

        dates.append(d_str)
        loss_rates.append(loss_pct)
        delays.append(avg_d)
        jitters.append(avg_j)
        tx_list.append(round(tx, 0))
        rx_list.append(round(rx, 0))

        table_rows.append({
            "date": d_str,
            "site_id": site_clean,
            "managed_element": item["me"],
            "tx_packets": round(tx, 0),
            "rx_packets": round(rx, 0),
            "loss_packets": round(loss_cnt, 0),
            "packet_loss_rate_pct": loss_pct,
            "avg_delay_ms": avg_d,
            "avg_jitter_ms": avg_j
        })

    avg_loss = round(sum(loss_rates) / len(loss_rates), 4) if loss_rates else 0.0
    max_loss = max(loss_rates) if loss_rates else 0.0
    avg_del = round(sum(delays) / len(delays), 2) if delays else 0.0
    max_del = max(delays) if delays else 0.0
    avg_jit = round(sum(jitters) / len(jitters), 2) if jitters else 0.0
    tot_tx = sum(tx_list)
    tot_rx = sum(rx_list)
    tot_loss = tot_tx - tot_rx

    site_display = get_site_display_name(site_clean)

    return {
        "status": "success",
        "site_id": site_clean,
        "site_name": site_display,
        "start_date": start_date,
        "end_date": end_date,
        "dates": dates,
        "series": {
            "packet_loss_rate": loss_rates,
            "avg_delay": delays,
            "avg_jitter": jitters,
            "tx_packets": tx_list,
            "rx_packets": rx_list
        },
        "summary": {
            "avg_loss_rate": avg_loss,
            "max_loss_rate": max_loss,
            "avg_delay": avg_del,
            "max_delay": max_del,
            "avg_jitter": avg_jit,
            "total_tx": tot_tx,
            "total_rx": tot_rx,
            "total_loss": tot_loss
        },
        "table_rows": table_rows
    }


def get_twamp_scope_aggregation(
    scope: str = "regional",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    nops: Optional[List[str]] = None,
    cities: Optional[List[str]] = None,
    kecamatans: Optional[List[str]] = None,
    sites: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Returns TWAMP Packet Loss, Delay, and Jitter time series aggregated across:
    - Regional (Region Sulawesi)
    - NOP
    - City/Kabupaten
    - Kecamatan
    - Site
    Supports multi-entity comparative curves.
    """
    latest_dt = get_latest_data_date("onedb", "measTwamp4g")
    if not end_date:
        end_date = latest_dt.strftime("%Y-%m-%d")
    if not start_date:
        start_date = (datetime.strptime(end_date, "%Y-%m-%d") - timedelta(days=13)).strftime("%Y-%m-%d")

    def _clean_list(items):
        if not items:
            return None
        res = []
        for it in items:
            if isinstance(it, str):
                for p in it.split(','):
                    pc = p.strip().upper()
                    if pc:
                        res.append(pc)
            elif it:
                res.append(str(it).strip().upper())
        return list(dict.fromkeys(res)) if res else None

    nops = _clean_list(nops)
    cities = _clean_list(cities)
    kecamatans = _clean_list(kecamatans)
    sites = _clean_list(sites)

    scope_clean = str(scope).strip().lower()
    conn = get_onedb_connection(timeout=15)
    if not conn:
        return {
            "status": "error",
            "message": "OneDb unreachable",
            "scope": scope_clean,
            "dates": [],
            "entities": [],
            "series": {},
            "summary": {},
            "table_rows": []
        }

    try:
        cur = conn.cursor()

        # Build dynamic entity expression and filter conditions
        where_clauses = [
            't."Begin Time" >= %s::date',
            't."Begin Time" <= (%s::date + interval \'1 day\')'
        ]
        params: List[Any] = [start_date, end_date]

        if scope_clean == "regional":
            entity_expr = "'Region Sulawesi'"
            group_expr = "t.\"Begin Time\""
            order_expr = "t.\"Begin Time\""

        elif scope_clean == "nop":
            entity_expr = "COALESCE(l.\"NOP\", 'OTHER')"
            group_expr = "t.\"Begin Time\", COALESCE(l.\"NOP\", 'OTHER')"
            order_expr = "t.\"Begin Time\", entity"
            if nops:
                where_clauses.append("l.\"NOP\" = ANY(%s)")
                params.append([n.upper() for n in nops])

        elif scope_clean == "city":
            entity_expr = "COALESCE(c.kabupaten, 'UNKNOWN')"
            group_expr = "t.\"Begin Time\", COALESCE(c.kabupaten, 'UNKNOWN')"
            order_expr = "t.\"Begin Time\", entity"
            if nops:
                where_clauses.append("l.\"NOP\" = ANY(%s)")
                params.append([n.upper() for n in nops])
            if cities:
                where_clauses.append("c.kabupaten = ANY(%s)")
                params.append([c.upper() for c in cities])

        elif scope_clean == "kecamatan":
            entity_expr = "COALESCE(c.kecamatan, 'UNKNOWN')"
            group_expr = "t.\"Begin Time\", COALESCE(c.kecamatan, 'UNKNOWN')"
            order_expr = "t.\"Begin Time\", entity"
            if cities:
                where_clauses.append("c.kabupaten = ANY(%s)")
                params.append([c.upper() for c in cities])
            if kecamatans:
                where_clauses.append("c.kecamatan = ANY(%s)")
                params.append([k.upper() for k in kecamatans])

        else: # site scope
            entity_expr = "c.site_id"
            group_expr = "t.\"Begin Time\", c.site_id"
            order_expr = "t.\"Begin Time\", entity"
            if sites:
                where_clauses.append("c.site_id = ANY(%s)")
                params.append([s.upper() for s in sites])

        where_sql = " AND ".join(where_clauses)

        query = f"""
            SELECT 
                t."Begin Time",
                {entity_expr} as entity,
                sum(COALESCE(t."Total Number of Twamp detect packets transmitted 1630557082985", 0)) as tx,
                sum(COALESCE(t."Total number of TWAMP detect packets received", 0)) as rx,
                avg(NULLIF(t."Average Delay of TWAMP Detecting Link(ms) 1630557082931", 0)) as avg_delay,
                avg(NULLIF(t."Average Jitter of TWAMP Detecting Link(ms) 1630557083091", 0)) as avg_jitter
            FROM "measTwamp4g" t
            JOIN "CellListRCI" c ON t."ManagedElement ID" = c.enodeb_id
            LEFT JOIN "LookupSITEID" l ON c.site_id = l."Prefix Site ID"
            WHERE {where_sql}
            GROUP BY {group_expr}
            ORDER BY {order_expr};
        """
        cur.execute(query, tuple(params))
        rows = cur.fetchall()
        cur.close()
    except Exception as e:
        logger.error(f"Error querying TWAMP scope aggregation: {e}")
        conn.rollback()
        conn.close()
        return {
            "status": "error",
            "message": public_error(e),
            "scope": scope_clean,
            "dates": [],
            "entities": [],
            "series": {},
            "summary": {},
            "table_rows": []
        }
    finally:
        conn.close()

    # Organize dates and entities
    all_dates_set = set()
    all_entities_set = set()
    entity_date_data = defaultdict(dict)
    table_rows = []

    for r in rows:
        b_time, entity, tx, rx, delay, jitter = r[0], r[1], float(r[2] or 0), float(r[3] or 0), float(r[4] or 0), float(r[5] or 0)
        d_str = b_time.strftime("%Y-%m-%d") if isinstance(b_time, datetime) else str(b_time)[:10]

        all_dates_set.add(d_str)
        all_entities_set.add(entity)

        loss_cnt = max(0.0, tx - rx)
        loss_pct = round((loss_cnt / tx * 100.0), 4) if tx > 0 else 0.0

        entity_date_data[entity][d_str] = {
            "tx": tx,
            "rx": rx,
            "loss_pct": loss_pct,
            "delay": round(delay, 2),
            "jitter": round(jitter, 2)
        }

        table_rows.append({
            "date": d_str,
            "entity": entity,
            "scope": scope_clean.capitalize(),
            "tx_packets": round(tx, 0),
            "rx_packets": round(rx, 0),
            "loss_packets": round(loss_cnt, 0),
            "packet_loss_rate_pct": loss_pct,
            "avg_delay_ms": round(delay, 2),
            "avg_jitter_ms": round(jitter, 2)
        })

    sorted_dates = sorted(list(all_dates_set))
    sorted_entities = sorted(list(all_entities_set))

    # Build comparative time series per metric and per entity
    loss_rate_series = {}
    delay_series = {}
    jitter_series = {}
    tx_series = {}
    rx_series = {}

    all_loss_vals = []
    all_delay_vals = []
    all_jitter_vals = []
    total_tx_all = 0.0
    total_rx_all = 0.0

    for ent in sorted_entities:
        ent_loss = []
        ent_delay = []
        ent_jitter = []
        ent_tx = []
        ent_rx = []
        for d in sorted_dates:
            d_val = entity_date_data[ent].get(d)
            if d_val:
                ent_loss.append(d_val["loss_pct"])
                ent_delay.append(d_val["delay"])
                ent_jitter.append(d_val["jitter"])
                ent_tx.append(round(d_val["tx"], 0))
                ent_rx.append(round(d_val["rx"], 0))
                all_loss_vals.append(d_val["loss_pct"])
                all_delay_vals.append(d_val["delay"])
                all_jitter_vals.append(d_val["jitter"])
                total_tx_all += d_val["tx"]
                total_rx_all += d_val["rx"]
            else:
                ent_loss.append(None)
                ent_delay.append(None)
                ent_jitter.append(None)
                ent_tx.append(None)
                ent_rx.append(None)

        loss_rate_series[ent] = ent_loss
        delay_series[ent] = ent_delay
        jitter_series[ent] = ent_jitter
        tx_series[ent] = ent_tx
        rx_series[ent] = ent_rx

    avg_loss = round(sum(all_loss_vals) / len(all_loss_vals), 4) if all_loss_vals else 0.0
    max_loss = max(all_loss_vals) if all_loss_vals else 0.0
    avg_del = round(sum(all_delay_vals) / len(all_delay_vals), 2) if all_delay_vals else 0.0
    avg_jit = round(sum(all_jitter_vals) / len(all_jitter_vals), 2) if all_jitter_vals else 0.0

    return {
        "status": "success",
        "scope": scope_clean,
        "start_date": start_date,
        "end_date": end_date,
        "dates": sorted_dates,
        "entities": sorted_entities,
        "series": {
            "packet_loss_rate": loss_rate_series,
            "avg_delay": delay_series,
            "avg_jitter": jitter_series,
            "tx_packets": tx_series,
            "rx_packets": rx_series
        },
        "summary": {
            "avg_loss_rate": avg_loss,
            "max_loss_rate": max_loss,
            "avg_delay": avg_del,
            "avg_jitter": avg_jit,
            "total_tx": total_tx_all,
            "total_rx": total_rx_all,
            "total_loss": total_tx_all - total_rx_all
        },
        "table_rows": table_rows
    }


# ---------------------------------------------------------------------------------------------------------------
# Before / After comparison (same idea as Cluster Monitoring): per entity of the scope, with a per-site breakdown.
# Loss rate = lost / sent over the whole period; delay and jitter = mean of the daily values. Lower is better for
# all three; the remark uses the Cluster Monitoring rule (growth beyond +-3 %).
# ---------------------------------------------------------------------------------------------------------------
TWAMP_COMPARE_KPIS = [
    ("loss_rate", "Packet Loss Rate", "%", "down"),
    ("delay", "Avg Delay", "ms", "down"),
    ("jitter", "Avg Jitter", "ms", "down"),
    ("tx", "Tx Packets / day", "packets", None),
]
OUTLIER_FACTOR = 20


def get_twamp_compare(
    scope: str,
    before_start: str, before_end: str, after_start: str, after_end: str,
    nops: Optional[List[str]] = None,
    cities: Optional[List[str]] = None,
    kecamatans: Optional[List[str]] = None,
    sites: Optional[List[str]] = None,
) -> Dict[str, Any]:
    from .queries_cluster import _compare   # same Before/After/Delta/Growth/Remark rule

    def _clean(items):
        out = []
        for it in items or []:
            out += [p.strip().upper() for p in str(it).split(",") if p.strip()]
        return list(dict.fromkeys(out)) or None

    nops, cities, kecamatans, sites = _clean(nops), _clean(cities), _clean(kecamatans), _clean(sites)
    scope = str(scope or "regional").strip().lower()
    entity_expr = {
        "regional": "'Region Sulawesi'",
        "nop": "COALESCE(l.\"NOP\", 'OTHER')",
        "city": "COALESCE(c.kabupaten, 'UNKNOWN')",
        "kecamatan": "COALESCE(c.kecamatan, 'UNKNOWN')",
    }.get(scope, "c.site_id")
    where = ["t.\"Begin Time\" >= %s::date", "t.\"Begin Time\" < (%s::date + interval '1 day')"]
    params: List[Any] = [min(before_start, after_start), max(before_end, after_end)]
    filters = {
        "nop": [("l.\"NOP\"", nops)],
        "city": [("l.\"NOP\"", nops), ("c.kabupaten", cities)],
        "kecamatan": [("c.kabupaten", cities), ("c.kecamatan", kecamatans)],
        "site": [("c.site_id", sites)],
    }.get(scope, [])
    for col, values in filters:
        if values:
            where.append(f"{col} = ANY(%s)")
            params.append(values)

    # One row per eNodeB in the site list (CellListRCI has one row per cell: joining it directly would count the
    # same TWAMP row once per cell). Site-days whose sent count is far above the usual (broken counter, e.g.
    # 600 million packets against ~0.9 million a day) are left out: one of them would decide a whole NOP.
    query = f"""
        WITH enb AS (
            SELECT DISTINCT ON (enodeb_id) enodeb_id, site_id, kabupaten, kecamatan
            FROM "CellListRCI" WHERE enodeb_id IS NOT NULL ORDER BY enodeb_id, site_id
        ), daily AS (
            SELECT {entity_expr} AS entity, c.site_id, t."Begin Time"::date AS d,
                   sum(COALESCE(t."Total Number of Twamp detect packets transmitted 1630557082985", 0)) AS tx,
                   sum(COALESCE(t."Total number of TWAMP detect packets received", 0)) AS rx,
                   avg(NULLIF(t."Average Delay of TWAMP Detecting Link(ms) 1630557082931", 0)) AS delay,
                   avg(NULLIF(t."Average Jitter of TWAMP Detecting Link(ms) 1630557083091", 0)) AS jitter
            FROM "measTwamp4g" t
            JOIN enb c ON t."ManagedElement ID" = c.enodeb_id
            LEFT JOIN "LookupSITEID" l ON c.site_id = l."Prefix Site ID"
            WHERE {" AND ".join(where)}
              AND (t."Begin Time"::date BETWEEN %s AND %s OR t."Begin Time"::date BETWEEN %s AND %s)
            GROUP BY 1, 2, 3
        ), lim AS (
            SELECT {OUTLIER_FACTOR} * percentile_cont(0.5) WITHIN GROUP (ORDER BY tx) AS max_tx FROM daily WHERE tx > 0
        )
        SELECT entity, site_id, CASE WHEN d BETWEEN %s AND %s THEN 'b' ELSE 'a' END AS period,
               count(*) FILTER (WHERE tx <= lim.max_tx) AS days,
               sum(tx) FILTER (WHERE tx <= lim.max_tx), sum(rx) FILTER (WHERE tx <= lim.max_tx),
               avg(delay) FILTER (WHERE tx <= lim.max_tx), avg(jitter) FILTER (WHERE tx <= lim.max_tx),
               count(*) FILTER (WHERE tx > lim.max_tx) AS dropped
        FROM daily CROSS JOIN lim
        GROUP BY 1, 2, 3
    """
    conn = get_onedb_connection(timeout=15)
    if not conn:
        return {"status": "error", "message": "OneDb unreachable"}
    try:
        cur = conn.cursor()
        cur.execute(query, (*params, before_start, before_end, after_start, after_end, before_start, before_end))
        rows = cur.fetchall()
        cur.close()
    except Exception as e:
        logger.error(f"Error querying TWAMP compare: {e}")
        conn.rollback()
        return {"status": "error", "message": public_error(e)}
    finally:
        conn.close()

    # sums per (entity, site, period) -> KPI values; entity totals add the site sums up
    acc = defaultdict(lambda: {"days": 0, "tx": 0.0, "rx": 0.0, "delay": [], "jitter": []})
    dropped = []
    for entity, site, period, days, tx, rx, delay, jitter, n_drop in rows:
        if n_drop:
            dropped.append({"site": site, "period": "before" if period == "b" else "after", "days": int(n_drop)})
        for key in ((entity, None, period), (entity, site, period)):
            a = acc[key]
            a["days"] = max(a["days"], int(days or 0))
            a["tx"] += float(tx or 0)
            a["rx"] += float(rx or 0)
            if delay is not None:
                a["delay"].append(float(delay))
            if jitter is not None:
                a["jitter"].append(float(jitter))

    def _values(a):
        if not a or a["tx"] <= 0:
            return {"loss_rate": None, "delay": None, "jitter": None, "tx": None}
        return {
            "loss_rate": round(max(0.0, a["tx"] - a["rx"]) / a["tx"] * 100, 4),
            "delay": round(sum(a["delay"]) / len(a["delay"]), 2) if a["delay"] else None,
            "jitter": round(sum(a["jitter"]) / len(a["jitter"]), 2) if a["jitter"] else None,
            "tx": round(a["tx"] / max(1, a["days"]), 0),
        }

    def _row(entity, site):
        b, a = _values(acc.get((entity, site, "b"))), _values(acc.get((entity, site, "a")))
        return {k: _compare(b[k], a[k], pol) for k, _, _, pol in TWAMP_COMPARE_KPIS}

    entities = sorted({k[0] for k in acc})
    out = []
    for ent in entities:
        site_ids = sorted({k[1] for k in acc if k[0] == ent and k[1] is not None})
        out.append({
            "entity": ent,
            "kpis": _row(ent, None),
            "sites": [{"site": s, "name": get_site_display_name(s), "kpis": _row(ent, s)} for s in site_ids],
        })
    return {
        "status": "success", "scope": scope,
        "before": {"start": before_start, "end": before_end},
        "after": {"start": after_start, "end": after_end},
        "kpis": [{"id": k, "title": t, "unit": u, "polarity": p or "neutral"} for k, t, u, p in TWAMP_COMPARE_KPIS],
        "entities": out,
        # site-days left out for an abnormal sent count (more than OUTLIER_FACTOR x the median site-day)
        "dropped": sorted(dropped, key=lambda x: (x["site"], x["period"])),
        "outlier_factor": OUTLIER_FACTOR,
    }
