import math
import random
from datetime import datetime, timedelta
from typing import List, Dict, Any

def generate_mock_kpi_data(
    site_id: str = "SON002",
    sector: str = "2",
    start_date: str = "2026-10-16",
    end_date: str = "2026-10-30",
    selected_bands: List[str] = None
) -> Dict[str, Any]:
    """
    Generates high-fidelity hourly 4G KPI dataset matching the NetKPI Monitor
    reference layout with multiple carriers/bands.
    """
    if selected_bands is None:
        selected_bands = ["L1800", "L2100", "L2300_1", "L900"]

    # Carriers corresponding to bands for this sector
    carrier_defs = [
        {"band": "L1800", "code": f"L1800 ML-{sector}1", "color": "#3b82f6", "base_thp": 35.0, "base_payload": 7.0, "base_rrc": 40},
        {"band": "L2100", "code": f"L2100 MR-{sector}3", "color": "#c084fc", "base_thp": 28.0, "base_payload": 5.5, "base_rrc": 32},
        {"band": "L2300_1", "code": f"L2300_1 ME-{sector}4", "color": "#22c55e", "base_thp": 45.0, "base_payload": 6.8, "base_rrc": 45},
        {"band": "L900", "code": f"L900 MT-{sector}2", "color": "#f97316", "base_thp": 12.0, "base_payload": 3.8, "base_rrc": 55},
    ]

    # Filter carriers by selected bands
    active_carriers = [c for c in carrier_defs if any(b.lower() in c["band"].lower() for b in selected_bands)]
    if not active_carriers:
        active_carriers = carrier_defs

    # Time series generation
    try:
        dt_start = datetime.strptime(start_date, "%Y-%m-%d")
        dt_end = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)
    except Exception:
        dt_start = datetime(2026, 10, 16, 0, 0)
        dt_end = datetime(2026, 10, 30, 23, 0)

    timestamps = []
    curr = dt_start
    while curr < dt_end:
        timestamps.append(curr.strftime("%d %b %H:00"))
        curr += timedelta(hours=1)

    # Initialize KPI data structure
    kpis = {
        "payload": {"title": "Payload (GB)", "unit": "GB", "series": {}},
        "max_rrc": {"title": "Max RRC User (Users)", "unit": "Users", "series": {}},
        "availability": {"title": "Availability (%)", "unit": "%", "series": {}},
        "dl_prb": {"title": "DL PRB (%)", "unit": "%", "series": {}},
        "dl_thp": {"title": "User DL Thp (Mbps)", "unit": "Mbps", "series": {}},
        "cqi": {"title": "CQI", "unit": "", "series": {}}
    }

    for c in active_carriers:
        c_code = c["code"]
        kpis["payload"]["series"][c_code] = []
        kpis["max_rrc"]["series"][c_code] = []
        kpis["availability"]["series"][c_code] = []
        kpis["dl_prb"]["series"][c_code] = []
        kpis["dl_thp"]["series"][c_code] = []
        kpis["cqi"]["series"][c_code] = []

    # Deterministic seed for reproducible smooth curves
    rnd = random.Random(42 + hash(site_id) % 1000 + int(sector if sector.isdigit() else 1))

    for idx, ts in enumerate(timestamps):
        # Diurnal pattern based on hour of day (0-23)
        hour = idx % 24
        # Traffic bell curve peaking around 20:00 (hour 20) and trough at 04:00 (hour 4)
        diurnal = 0.5 + 0.5 * math.sin((hour - 10) * math.pi / 12)
        if diurnal < 0.15:
            diurnal = 0.15

        for c in active_carriers:
            code = c["code"]
            noise = rnd.uniform(-0.12, 0.12)
            
            # 1. Payload (GB): peaks in evening up to 16 GB, dip at dawn
            carrier_factor = c["base_payload"] / 5.0
            p_val = max(0.2, (c["base_payload"] * diurnal * 2.1) + (noise * 2.0))
            # occasional peak spike
            if (idx % 83 == 0) and c["band"] == "L1800":
                p_val += 7.5
            kpis["payload"]["series"][code].append(round(p_val, 2))

            # 2. Max RRC Users: 20 - 70, occasional spike
            rrc_val = max(10, int((c["base_rrc"] * diurnal * 1.5) + (noise * 15)))
            if (idx % 115 == 0) and c["band"] == "L1800":
                rrc_val += 55
            kpis["max_rrc"]["series"][code].append(rrc_val)

            # 3. Availability (%): 99.8 - 100%, dip occasionally
            avail_val = 100.0
            if (idx == 12 or idx == 310) and c["band"] == "L1800":
                avail_val = 38.5
            elif rnd.random() < 0.015:
                avail_val = round(rnd.uniform(96.0, 99.5), 2)
            kpis["availability"]["series"][code].append(avail_val)

            # 4. DL PRB (%): diurnal utilization 15% - 98%
            prb_val = min(100.0, max(5.0, (diurnal * 88.0 * carrier_factor) + (noise * 12.0)))
            if c["band"] == "L900":
                # L900 has lower capacity, reaches high PRB faster
                prb_val = min(100.0, prb_val * 1.35)
            kpis["dl_prb"]["series"][code].append(round(prb_val, 1))

            # 5. User DL Thp (Mbps): inverse relation to PRB
            inv_diurnal = 1.0 - (diurnal * 0.6)
            thp_val = max(1.5, (c["base_thp"] * inv_diurnal) + (noise * 8.0))
            kpis["dl_thp"]["series"][code].append(round(thp_val, 2))

            # 6. CQI: 7.5 to 11.2
            cqi_val = max(6.5, min(12.0, 9.4 + (math.cos(hour * math.pi / 12) * 1.2) + (noise * 0.8)))
            kpis["cqi"]["series"][code].append(round(cqi_val, 2))

    return {
        "site_id": site_id,
        "sector": sector,
        "timestamps": timestamps,
        "carriers": active_carriers,
        "kpis": kpis,
        "summary": {
            "total_payload_gb": round(sum(sum(kpis["payload"]["series"][c["code"]]) for c in active_carriers), 1),
            "avg_prb_util": round(sum(sum(kpis["dl_prb"]["series"][c["code"]]) for c in active_carriers) / (len(timestamps) * len(active_carriers)), 1),
            "peak_hourly_payload": max(max(kpis["payload"]["series"][c["code"]]) for c in active_carriers),
            "peak_prb_util": max(max(kpis["dl_prb"]["series"][c["code"]]) for c in active_carriers),
        }
    }
