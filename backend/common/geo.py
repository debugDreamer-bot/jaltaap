"""Small geo helpers: distances, geohash keys, distance from a point to a straight route."""
from __future__ import annotations

import math

EARTH_R_M = 6_371_000.0


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_R_M * math.asin(math.sqrt(a))


_BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"


def geohash(lat: float, lon: float, precision: int) -> str:
    """Standard geohash encoding (base32, interleaved lon/lat bits)."""
    lat_r, lon_r = [-90.0, 90.0], [-180.0, 180.0]
    out, bits, bit_count, even = [], 0, 0, True
    while len(out) < precision:
        rng, val = (lon_r, lon) if even else (lat_r, lat)
        mid = (rng[0] + rng[1]) / 2
        if val >= mid:
            bits, rng[0] = (bits << 1) | 1, mid
        else:
            bits, rng[1] = bits << 1, mid
        even, bit_count = not even, bit_count + 1
        if bit_count == 5:
            out.append(_BASE32[bits])
            bits, bit_count = 0, 0
    return "".join(out)


def geohash_decode(code: str) -> tuple[float, float]:
    """Centre (lat, lon) of a geohash cell."""
    lat_r, lon_r = [-90.0, 90.0], [-180.0, 180.0]
    even = True
    for ch in code:
        idx = _BASE32.index(ch)
        for shift in range(4, -1, -1):
            rng = lon_r if even else lat_r
            mid = (rng[0] + rng[1]) / 2
            if (idx >> shift) & 1:
                rng[0] = mid
            else:
                rng[1] = mid
            even = not even
    return (lat_r[0] + lat_r[1]) / 2, (lon_r[0] + lon_r[1]) / 2


def point_to_segment_m(lat: float, lon: float, a: tuple[float, float], b: tuple[float, float]) -> float:
    """Distance in metres from a point to segment a-b, on a local equirectangular projection.

    Good to well under 1 % over city distances.
    """
    lat0 = math.radians((a[0] + b[0]) / 2)

    def xy(p_lat, p_lon):
        return (math.radians(p_lon) * math.cos(lat0) * EARTH_R_M, math.radians(p_lat) * EARTH_R_M)

    px, py = xy(lat, lon)
    ax, ay = xy(*a)
    bx, by = xy(*b)
    dx, dy = bx - ax, by - ay
    seg2 = dx * dx + dy * dy
    t = 0.0 if seg2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg2))
    cx, cy = ax + t * dx, ay + t * dy
    return math.hypot(px - cx, py - cy)


def directions_url(lat: float, lon: float) -> str:
    return f"https://www.google.com/maps/dir/?api=1&destination={lat:.5f},{lon:.5f}"
