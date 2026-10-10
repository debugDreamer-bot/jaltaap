"""Hospitals and public drinking-water points near every covered city, from OpenStreetMap.

Run from the repo root:  .venv/bin/python data/fetch_osm_relief.py [--refresh]

One Overpass API query per city (amenity=hospital with a name, amenity=drinking_water) within
RADIUS_M of the city centre in data/cities.json. Keeps the HOSPITALS nearest named hospitals and
the WATER nearest drinking-water points per city. Writes data/relief_osm.json.

Data © OpenStreetMap contributors, ODbL. Every row links to its OSM object in `source`.
Overpass usage policy: one request at a time with a pause between them; responses are cached
under backtests/.cache/overpass/ so reruns make no network calls.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CACHE = ROOT / "backtests" / ".cache" / "overpass"
OVERPASS = ["https://overpass-api.de/api/interpreter",          # main server, then public mirrors
            "https://overpass.kumi.systems/api/interpreter",
            "https://overpass.private.coffee/api/interpreter"]
UA = "JalTaap/0.1 (Environmental Hacks hackathon, Team DevCore)"
RADIUS_M = 7000
HOSPITALS = 8
WATER = 6


def km(a: tuple[float, float], b: tuple[float, float]) -> float:
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(b[1] - a[1]) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def query(lat: float, lon: float) -> str:
    return (f'[out:json][timeout:60];('
            f'node["amenity"="hospital"]["name"](around:{RADIUS_M},{lat},{lon});'
            f'way["amenity"="hospital"]["name"](around:{RADIUS_M},{lat},{lon});'
            f'node["amenity"="drinking_water"](around:{RADIUS_M},{lat},{lon});'
            f');out center tags;')


def fetch(q: str, refresh: bool) -> dict:
    path = CACHE / (hashlib.sha256(q.encode()).hexdigest()[:24] + ".json")
    if path.exists() and not refresh:
        return json.loads(path.read_text(encoding="utf-8"))
    CACHE.mkdir(parents=True, exist_ok=True)
    for attempt in range(6):
        url = OVERPASS[attempt % len(OVERPASS)]
        try:
            r = httpx.post(url, data={"data": q}, headers={"User-Agent": UA}, timeout=90)
        except httpx.HTTPError:
            time.sleep(5)
            continue
        if r.status_code in (429, 500, 502, 503, 504):
            time.sleep(8 * (attempt + 1))
            continue
        r.raise_for_status()
        body = r.json()
        path.write_text(json.dumps(body), encoding="utf-8")
        time.sleep(2)   # be gentle with the shared public server
        return body
    return {}   # every server busy: this city is skipped; rerun later (cached cities are instant)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args()
    cities = json.loads((DATA / "cities.json").read_text(encoding="utf-8"))
    out: list[dict] = []
    for c in cities:
        centre = (c["lat"], c["lon"])
        body = fetch(query(*centre), args.refresh)
        if not body:
            print(f"{c['id']:<20} SKIPPED (Overpass busy); rerun to fill it in")
            continue
        hosp, water = [], []
        for el in body.get("elements", []):
            lat = el.get("lat", (el.get("center") or {}).get("lat"))
            lon = el.get("lon", (el.get("center") or {}).get("lon"))
            if lat is None or lon is None:
                continue
            tags = el.get("tags", {})
            row = {"lat": round(lat, 6), "lon": round(lon, 6), "_d": km(centre, (lat, lon)),
                   "source": f"https://www.openstreetmap.org/{el['type']}/{el['id']}",
                   "id": f"osm_{el['type'][0]}{el['id']}", "city": c["id"], "coord_source": "openstreetmap",
                   "status": "open", "cool_room": "unknown", "since": None}
            if tags.get("amenity") == "hospital":
                hosp.append({**row, "name": tags["name"], "name_hi": tags.get("name:hi"), "kind": "hospital"})
            else:
                label = tags.get("name") or "Public drinking water"
                water.append({**row, "name": f"{label} ({c['name']})" if not tags.get("name") else label,
                              "name_hi": tags.get("name:hi") or "पीने का पानी", "kind": "water"})
        hosp.sort(key=lambda r: r["_d"])
        water.sort(key=lambda r: r["_d"])
        keep = hosp[:HOSPITALS] + water[:WATER]
        for r in keep:
            r.pop("_d")
        out += keep
        print(f"{c['id']:<20} hospitals {len(hosp):>3} -> {min(len(hosp), HOSPITALS)}   water {len(water):>3} -> {min(len(water), WATER)}")
    (DATA / "relief_osm.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {len(out)} points to data/relief_osm.json")


if __name__ == "__main__":
    main()
