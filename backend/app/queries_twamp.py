import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
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
            "message": str(e),
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
