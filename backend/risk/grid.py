"""The Delhi forecast grid: 6 x 6 = 36 points at 0.1 degree steps.

Points run from lat 28.4 to 28.9 and lon 76.8 to 77.3. Each point is the centre of a
0.1 degree square drawn on the map. Global models run at roughly 9 to 25 km, so a finer
grid adds no information.
"""
from __future__ import annotations

LATS = [round(28.4 + 0.1 * i, 1) for i in range(6)]
LONS = [round(76.8 + 0.1 * i, 1) for i in range(6)]
HALF = 0.05

# Delhi bounding box = grid extent. Locations outside it are rejected.
BBOX = {"min_lat": LATS[0] - HALF, "max_lat": LATS[-1] + HALF, "min_lon": LONS[0] - HALF, "max_lon": LONS[-1] + HALF}


def cell_id(lat: float, lon: float) -> str:
    return f"g_{lat:.1f}_{lon:.1f}"


def cells() -> list[dict]:
    """All 36 cells with centre and polygon bounds."""
    out = []
    for la in LATS:
        for lo in LONS:
            out.append({
                "id": cell_id(la, lo),
                "lat": la,
                "lon": lo,
                "bounds": [round(lo - HALF, 2), round(la - HALF, 2), round(lo + HALF, 2), round(la + HALF, 2)],
            })
    return out


def in_delhi(lat: float, lon: float) -> bool:
    return BBOX["min_lat"] <= lat <= BBOX["max_lat"] and BBOX["min_lon"] <= lon <= BBOX["max_lon"]


def snap(lat: float, lon: float) -> str:
    """Id of the nearest grid cell (clamped to the grid)."""
    la = min(LATS, key=lambda v: abs(v - lat))
    lo = min(LONS, key=lambda v: abs(v - lon))
    return cell_id(la, lo)
