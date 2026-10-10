"""Geocode data/hotspots_cities.seed.csv (researched waterlogging hotspots outside Delhi).

Writes data/hotspots_cities.json (same schema as data/hotspots.json) and appends a section to
data/GEOCODING_REVIEW.md listing every pin for a teammate to check.

Run from the repo root:  .venv/bin/python data/geocode_city_hotspots.py [--refresh]

Attempts per row: Nominatim "<geocode_query>", then Nominatim "<name>, <City>", then Open-Meteo
geocoding for the first part of the query. A hit is accepted only inside the city's forecast
area (grid bounds plus a 0.25 degree margin; Gurugram uses its NCR zone). Coordinates are never
typed by hand; rows that fail keep lat/lon = null and are left out by the app. UNKNOWN agencies
fall back to the city's civic body with agency_confidence = low.

Nominatim usage policy: at most one request per second and an identifying User-Agent; responses
are cached under backtests/.cache/geocode/ (shared with geocode_hotspots.py).
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "data"))

from geocode_hotspots import NOMINATIM, OPEN_METEO, Client  # noqa: E402

from risk import grid as gridmod  # noqa: E402

DATA = ROOT / "data"
MARGIN = 0.25


def replace_section(path, heading: str, body: str) -> None:
    """Replace one '## heading' section of a Markdown file (up to the next '## '), or append it."""
    import re
    text = path.read_text(encoding="utf-8")
    block = f"## {heading}\n\n{body.rstrip()}\n"
    pat = re.compile(rf"^## {re.escape(heading)}\n.*?(?=^## |\Z)", re.S | re.M)
    text = pat.sub(lambda m: block + "\n", text) if pat.search(text) else text.rstrip() + "\n\n" + block
    path.write_text(text.rstrip() + "\n", encoding="utf-8")


def area(city_id: str) -> tuple[dict, dict]:
    """(city or NCR zone record, bounding box) for a research city id."""
    for c in gridmod.cities():
        if c["id"] == city_id:
            b = gridmod.city_bbox(c)
            return c, {k: v + (-MARGIN if k.startswith("min") else MARGIN) for k, v in b.items()}
        for z in c.get("zones", []):
            if z["id"] == city_id:
                d = z["radius_km"] / 111 + 0.05
                return {**z, "tier": c["tier"]}, {"min_lat": z["lat"] - d, "max_lat": z["lat"] + d,
                                                   "min_lon": z["lon"] - d, "max_lon": z["lon"] + d}
    raise SystemExit(f"unknown city {city_id}")


def inside(box: dict, lat: float, lon: float) -> bool:
    return box["min_lat"] <= lat <= box["max_lat"] and box["min_lon"] <= lon <= box["max_lon"]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args()
    cl = Client(args.refresh)
    out, review = [], []
    for r in csv.DictReader(open(DATA / "hotspots_cities.seed.csv", encoding="utf-8")):
        place, box = area(r["city"])
        queries = [("nominatim", r["geocode_query"]), ("nominatim", f"{r['name']}, {place['name']}"),
                   ("open-meteo", r["geocode_query"].split(",")[0].strip())]
        hit = None
        for kind, q in queries:
            if kind == "nominatim":
                res = cl.get(NOMINATIM, {"q": q, "format": "jsonv2", "countrycodes": "in", "limit": 3}) or []
                for h in res:
                    lat, lon = float(h["lat"]), float(h["lon"])
                    if inside(box, lat, lon):
                        hit = (lat, lon, f"nominatim:{q}", h.get("display_name", "")[:160])
                        break
            else:
                res = (cl.get(OPEN_METEO, {"name": q, "count": 10, "language": "en", "format": "json"}) or {}).get("results") or []
                for h in res:
                    if h.get("country_code") == "IN" and inside(box, h["latitude"], h["longitude"]):
                        hit = (h["latitude"], h["longitude"], f"open-meteo:{q}", f"{h['name']}, {h.get('admin1', '')}")
                        break
            if hit:
                break
        agency, conf = r["agency_default"], "low"
        if agency == "UNKNOWN" and hit:
            agency = gridmod.agencies_for(hit[0], hit[1])["civic"]
        years = sorted({int(y) for y in r["years_seen"].split(";") if y.strip()})
        row = {"id": r["id"], "name": r["name"], "type": r["type"], "agency": agency, "agency_confidence": conf,
               "years_seen": len(years), "years": years, "evidence": r["evidence"], "source": r["source"],
               "quote": r["quote"], "city": r["city"],
               "lat": round(hit[0], 6) if hit else None, "lon": round(hit[1], 6) if hit else None,
               "coord_source": hit[2] if hit else "none", "coord_note": hit[3] if hit else "", "needs_check": True}
        out.append(row)
        review.append(f"- [ ] `{r['id']}` {r['name']} ({r['city']}): "
                      + (f"{row['lat']}, {row['lon']} via {row['coord_source']} ({row['coord_note']})" if hit else "**not geocoded**"))
        print(f"{r['id']:<50} {'OK ' + row['coord_source'] if hit else 'MISS'}")
    (DATA / "hotspots_cities.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    ok = sum(1 for o in out if o["lat"] is not None)
    print(f"geocoded {ok} of {len(out)}; wrote data/hotspots_cities.json")
    replace_section(DATA / "GEOCODING_REVIEW.md", "Hotspots outside Delhi (data/geocode_city_hotspots.py)",
                    "Researched from news and official notices (source and quote in data/hotspots_cities.seed.csv). "
                    "Every pin needs a human check; many are locality-level.\n\n" + "\n".join(review))


if __name__ == "__main__":
    main()
