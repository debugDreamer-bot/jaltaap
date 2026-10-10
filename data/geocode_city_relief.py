"""Geocode data/relief_cities.seed.csv (researched heat-relief places outside Delhi).

Writes data/relief_cities.json (same fields as data/relief_points.json) and a review section in
data/GEOCODING_REVIEW.md. Same rules as geocode_city_hotspots.py: Nominatim (1 request a second,
cached), then Open-Meteo; a hit counts only inside the city's area; coordinates are never typed
by hand; unresolved rows keep lat/lon = null and the app leaves them out.

Run from the repo root:  .venv/bin/python data/geocode_city_relief.py [--refresh]
"""
from __future__ import annotations

import argparse
import csv
import json

from geocode_city_hotspots import DATA, area, inside, replace_section  # also puts backend/ on sys.path
from geocode_hotspots import NOMINATIM, OPEN_METEO, Client


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args()
    cl = Client(args.refresh)
    out, review = [], []
    for r in csv.DictReader(open(DATA / "relief_cities.seed.csv", encoding="utf-8")):
        place, box = area(r["city"])
        hit = None
        for kind, q in (("nominatim", r["geocode_query"]), ("nominatim", f"{r['name']}, {place['name']}"),
                        ("open-meteo", r["geocode_query"].split(",")[0].strip())):
            if kind == "nominatim":
                for h in cl.get(NOMINATIM, {"q": q, "format": "jsonv2", "countrycodes": "in", "limit": 3}) or []:
                    if inside(box, float(h["lat"]), float(h["lon"])):
                        hit = (float(h["lat"]), float(h["lon"]), f"nominatim:{q}", h.get("display_name", "")[:160])
                        break
            else:
                for h in (cl.get(OPEN_METEO, {"name": q, "count": 10, "language": "en", "format": "json"}) or {}).get("results") or []:
                    if h.get("country_code") == "IN" and inside(box, h["latitude"], h["longitude"]):
                        hit = (h["latitude"], h["longitude"], f"open-meteo:{q}", f"{h['name']}, {h.get('admin1', '')}")
                        break
            if hit:
                break
        out.append({"id": r["id"], "name": r["name"], "kind": r["kind"], "status": r["status"], "since": r["since"] or None,
                    "cool_room": "yes" if r["kind"] == "cooling" else "unknown", "source": r["source"], "quote": r["quote"],
                    "city": r["city"], "lat": round(hit[0], 6) if hit else None, "lon": round(hit[1], 6) if hit else None,
                    "coord_source": hit[2] if hit else "none", "coord_note": hit[3] if hit else "", "needs_check": True})
        review.append(f"- [ ] `{r['id']}` {r['name']} ({r['city']}): "
                      + (f"{hit[0]:.5f}, {hit[1]:.5f} via {hit[2]} ({hit[3]})" if hit else "**not geocoded**"))
    (DATA / "relief_cities.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    ok = sum(1 for o in out if o["lat"] is not None)
    print(f"geocoded {ok} of {len(out)}; wrote data/relief_cities.json")
    replace_section(DATA / "GEOCODING_REVIEW.md", "Relief places outside Delhi (data/geocode_city_relief.py)",
                    "Researched from news, municipal notices and Bhubaneswar's Heat Wave Action Plan 2025 (source and "
                    "quote in data/relief_cities.seed.csv). Check every pin.\n\n" + "\n".join(review))


if __name__ == "__main__":
    main()
