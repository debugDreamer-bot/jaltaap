"""Forecast grids for every covered city, plus the coverage rules.

Coverage has three tiers (see data/cities.json, built by data/build_cities.py):
  full           Delhi: 6 x 6 = 36 cells (lat 28.4 to 28.9, lon 76.8 to 77.3), waterlogging hotspots,
                 agency routing and replays.
  heat_and_rain  Ten more large cities: 3 x 3 cells each, on the live map, with area rain risk.
  city           52 more million-plus cities and state/UT capitals: one cell each, same features.
  point          Anywhere else in India: personal heat plans and rain for the exact point.

Each cell is the centre of a 0.1 degree square drawn on the map. Global models run at roughly
9 to 25 km, so a finer grid adds no information.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

HALF = 0.05
CITIES_FILE = Path(__file__).resolve().parent.parent / "refdata" / "cities.json"

# Rough box around India for pins and geocoder hits. Place names are also filtered by country
# code IN; a pin just across a land border can still pass this box (see DECISIONS.md).
INDIA_BBOX = {"min_lat": 6.5, "max_lat": 37.1, "min_lon": 68.1, "max_lon": 97.4}

# Delhi keeps its own names: the hotspot engine, replays and backtests are Delhi-only.
LATS = [round(28.4 + 0.1 * i, 1) for i in range(6)]
LONS = [round(76.8 + 0.1 * i, 1) for i in range(6)]
BBOX = {"min_lat": LATS[0] - HALF, "max_lat": LATS[-1] + HALF, "min_lon": LONS[0] - HALF, "max_lon": LONS[-1] + HALF}


def cell_id(lat: float, lon: float) -> str:
    return f"g_{lat:.1f}_{lon:.1f}"


@lru_cache(maxsize=1)
def cities() -> list[dict]:
    """All covered cities (Delhi first)."""
    return json.loads(CITIES_FILE.read_text(encoding="utf-8"))


def city(city_id: str) -> dict | None:
    return next((c for c in cities() if c["id"] == city_id), None)


def city_bbox(c: dict) -> dict:
    g = c["grid"]
    return {"min_lat": g["lats"][0] - HALF, "max_lat": g["lats"][-1] + HALF,
            "min_lon": g["lons"][0] - HALF, "max_lon": g["lons"][-1] + HALF}


def _inside(lat: float, lon: float, box: dict) -> bool:
    return box["min_lat"] <= lat <= box["max_lat"] and box["min_lon"] <= lon <= box["max_lon"]


def city_cells(c: dict) -> list[dict]:
    out = []
    for la in c["grid"]["lats"]:
        for lo in c["grid"]["lons"]:
            out.append({"id": cell_id(la, lo), "city": c["id"], "lat": la, "lon": lo,
                        "bounds": [round(lo - HALF, 2), round(la - HALF, 2), round(lo + HALF, 2), round(la + HALF, 2)]})
    return out


def cells(city_id: str | None = None) -> list[dict]:
    """Cells with centre and polygon bounds: one city's, or every covered city's when city_id is None."""
    chosen = [c for c in cities() if city_id is None or c["id"] == city_id]
    return [cell for c in chosen for cell in city_cells(c)]


def in_delhi(lat: float, lon: float) -> bool:
    return _inside(lat, lon, BBOX)


def in_india(lat: float, lon: float) -> bool:
    return _inside(lat, lon, INDIA_BBOX)


def city_of(lat: float, lon: float) -> dict | None:
    """The covered city whose grid contains the point, if any."""
    return next((c for c in cities() if _inside(lat, lon, city_bbox(c))), None)


def covering_cell(lat: float, lon: float) -> str | None:
    """Id of the nearest cell of the city grid containing the point, or None outside every grid."""
    c = city_of(lat, lon)
    if c is None:
        return None
    la = min(c["grid"]["lats"], key=lambda v: abs(v - lat))
    lo = min(c["grid"]["lons"], key=lambda v: abs(v - lon))
    return cell_id(la, lo)


def nearest_cell(lat: float, lon: float, max_deg: float = 0.3) -> str | None:
    """The cell containing the point, else the nearest cell of any city within max_deg (about 33 km).
    Used for hotspots on a city's edge, outside its grid."""
    cid = covering_cell(lat, lon)
    if cid:
        return cid
    best = min(cells(), key=lambda c: (c["lat"] - lat) ** 2 + (c["lon"] - lon) ** 2)
    return best["id"] if abs(best["lat"] - lat) <= max_deg and abs(best["lon"] - lon) <= max_deg else None


def snap(lat: float, lon: float) -> str:
    """Id of the nearest Delhi grid cell (clamped to the grid). Used for Delhi hotspots."""
    la = min(LATS, key=lambda v: abs(v - lat))
    lo = min(LONS, key=lambda v: abs(v - lon))
    return cell_id(la, lo)


def coverage(lat: float, lon: float) -> dict:
    """Which tier serves a point: {tier, city_id, city_name, agencies} or tier 'outside'."""
    c = city_of(lat, lon)
    if c:
        z = zone_of(lat, lon)
        return {"tier": c["tier"], "city_id": c["id"], "city_name": z["name"] if z else c["name"],
                "agencies": dict(z["agencies"]) if z else c["agencies"]}
    if in_india(lat, lon):
        return {"tier": "point", "city_id": None, "city_name": None, "agencies": None}
    return {"tier": "outside", "city_id": None, "city_name": None, "agencies": None}


def zone_of(lat: float, lon: float) -> dict | None:
    """A satellite city inside a city's grid with its own agencies (Gurugram, Noida, ... inside Delhi's)."""
    c = city_of(lat, lon)
    for z in (c or {}).get("zones", []):
        if _km(lat, lon, z["lat"], z["lon"]) <= z["radius_km"]:
            return z
    return None


def _km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    import math
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(a))


def agencies_for(lat: float, lon: float) -> dict:
    """{civic, water} agency codes for a point: a satellite-city zone first, then the city, else generic."""
    z = zone_of(lat, lon)
    if z:
        return dict(z["agencies"])
    c = city_of(lat, lon)
    return dict(c["agencies"]) if c else {"civic": "LOCAL_BODY", "water": "LOCAL_WATER"}


def agency_name(code: str, lat: float, lon: float) -> str:
    z, c = zone_of(lat, lon), city_of(lat, lon)
    for src in (z, c):
        if src and code in src.get("agency_names", {}):
            return src["agency_names"][code]
    return code
