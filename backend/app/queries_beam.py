"""Beam footprint ("horizon") of one sector on the terrain, for the cell map.

Rays leave the antenna every RAY_STEP degrees across the horizontal beamwidth; along each ray the ground is
sampled from the DEM. For each ground point:
- zone: which part of the vertical half-power beam reaches it, from its depression angle seen from the antenna
    high = upper third of the beam (far reach), mid = around the main beam (tilt), low = lower third (near),
    under = below the lower -3 dB edge (close to the site), far = above the upper -3 dB edge (beyond the beam).
- shade: how hidden it is behind nearer terrain = the height (m) it would have to rise to be in line of sight
    of the antenna (0 = visible). The map draws higher blocking darker.
Earth curvature (k = 4/3) lowers far points. Consecutive samples with the same zone and shade class are merged
into runs so the map draws a few hundred wedges per sector.
"""
import math
from typing import Any, Dict, List

from .elevation import get_local_elevations

EARTH_R = 6371008.8
K_FACTOR = 4 / 3
RAY_STEP = 2.0
MAX_RADIUS_M = 15000
MIN_RADIUS_M = 1500
MAX_SAMPLES = 220
SHADE_CLASSES = (0.0, 5.0, 20.0, 50.0)   # blocked by > 0, 5, 20, 50 m -> class 1..4


def _dest(lat, lon, az, d):
    r = d / EARTH_R
    la, lo, b = math.radians(lat), math.radians(lon), math.radians(az)
    la2 = math.asin(math.sin(la) * math.cos(r) + math.cos(la) * math.sin(r) * math.cos(b))
    lo2 = lo + math.atan2(math.sin(b) * math.sin(r) * math.cos(la), math.cos(r) - math.sin(la) * math.sin(la2))
    return math.degrees(la2), math.degrees(lo2)


def _shade_class(h: float) -> int:
    c = 0
    for i, lim in enumerate(SHADE_CLASSES):
        if h > lim:
            c = i + 1
    return c


def default_radius(tx_height: float, tilt: float, vbw: float) -> float:
    """Far enough for the upper -3 dB edge to land on flat ground (or the cap when it points at the horizon)."""
    upper = tilt - vbw / 2
    if upper <= 0.3:
        return MAX_RADIUS_M
    return max(MIN_RADIUS_M, min(MAX_RADIUS_M, 1.3 * tx_height / math.tan(math.radians(upper))))


def beam_footprint(lat: float, lon: float, azimuth: float, beamwidth: float, tx_height: float,
                   tilts: List[float], vbw: float, radius_m: float = None) -> Dict[str, Any]:
    beamwidth = max(10.0, min(float(beamwidth or 65), 120.0))
    vbw = max(2.0, min(float(vbw or 7), 30.0))
    tx_height = max(1.0, min(float(tx_height or 30), 200.0))
    tilts = [float(t) for t in tilts][:2]
    radius = float(radius_m) if radius_m else max(default_radius(tx_height, t, vbw) for t in tilts)
    radius = max(300.0, min(radius, MAX_RADIUS_M))
    n_rays = int(round(beamwidth / RAY_STEP)) + 1
    ray_az = [azimuth - beamwidth / 2 + i * beamwidth / (n_rays - 1) for i in range(n_rays)]
    step = max(30.0, radius / MAX_SAMPLES)
    dists = [step * (j + 1) for j in range(int(radius // step))]

    pts = [(lat, lon)] + [_dest(lat, lon, az, d) for az in ray_az for d in dists]
    elev = get_local_elevations(pts)
    if elev[0] is None or sum(e is None for e in elev) > len(elev) * 0.5:
        raise ValueError("No terrain height for this area (outside the GLO-30 coverage in onedb).")
    ground0 = elev[0]
    tx = ground0 + tx_height
    n = len(dists)

    # depression angle of every ground point and how far it is below the line of sight
    rays = []
    for i, az in enumerate(ray_az):
        hs = elev[1 + i * n: 1 + (i + 1) * n]
        last = ground0
        theta, shade = [], []
        min_tan = math.inf          # smallest tan(depression) so far = the highest obstacle seen from the antenna
        for d, h in zip(dists, hs):
            h = last if h is None else h
            last = h
            eff = h - d * d / (2 * K_FACTOR * EARTH_R)
            t = (tx - eff) / d
            shade.append(max(0.0, (t - min_tan) * d) if min_tan < math.inf else 0.0)
            min_tan = min(min_tan, t)
            theta.append(math.degrees(math.atan(t)))
        rays.append((az, theta, shade))

    results = []
    half = beamwidth / (n_rays - 1) / 2
    for tilt in tilts:
        lo_edge, hi_edge, third = tilt + vbw / 2, tilt - vbw / 2, vbw / 6

        def zone(th):
            if th > lo_edge:
                return "under"
            if th > tilt + third:
                return "low"
            if th >= tilt - third:
                return "mid"
            if th >= hi_edge:
                return "high"
            return "far"

        runs, area, blocked = [], {}, {}
        landing = None
        for az, theta, shade in rays:
            cur = None
            for j, d in enumerate(dists):
                z = zone(theta[j])
                s = _shade_class(shade[j])
                a = (d - step / 2) * step * math.radians(2 * half)
                area[z] = area.get(z, 0.0) + a
                if s:
                    blocked[z] = blocked.get(z, 0.0) + a
                if cur and cur[4] == z and cur[5] == s:
                    cur[3] = d + step / 2
                else:
                    if cur:
                        runs.append(cur)
                    cur = [round(az - half, 2), round(az + half, 2), round(max(0.0, d - step / 2), 1), d + step / 2, z, s]
            if cur:
                runs.append(cur)
            # main beam landing on the centre ray: first point at or below the tilt line
            if abs(az - azimuth) <= half + 1e-6 and landing is None:
                landing = next((d for d, th in zip(dists, theta) if th <= tilt), None)
        for r in runs:
            r[3] = round(r[3], 1)
        results.append({
            "tilt": tilt,
            "runs": runs,   # [az0, az1, d0, d1, zone, shade class]
            "landing_m": round(landing, 0) if landing else None,
            "area_km2": {z: round(v / 1e6, 3) for z, v in area.items()},
            "blocked_pct": {z: round(100 * blocked.get(z, 0) / v, 1) for z, v in area.items() if v > 0},
        })
    return {
        "radius_m": round(radius), "step_m": round(step, 1), "rays": n_rays, "vbw": vbw, "tx_height": tx_height,
        "ground_m": ground0, "shade_classes": SHADE_CLASSES, "results": results,
    }
