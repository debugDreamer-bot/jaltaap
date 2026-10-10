"""Build data/cities.json from data/cities.seed.csv (pan-India coverage).

Run from the repo root:  .venv/bin/python data/build_cities.py

Each city's centre comes from the Open-Meteo Geocoding API (country code IN), never typed by
hand. A `grid_centre_override` in the seed moves only the forecast grid (for coastal cities whose
geocoded centre would put a third of the grid over the sea); the override is recorded in the
output with the reason. Delhi keeps its 6 x 6 grid (risk/grid.py); every other city gets a 3 x 3
grid at 0.1 degree steps around its (rounded) centre.

Agency names are starting values for routing reports and must be checked by a teammate
(agency_confidence = low), like the Delhi hotspot agencies.
"""
from __future__ import annotations

import csv
import json
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
GEOCODE = "https://geocoding-api.open-meteo.com/v1/search"


def geocode(query: str, state: str | None = None, near: tuple[float, float] | None = None) -> dict:
    """Most populous Indian match, restricted to the expected state (or within 0.5 degree of `near`)."""
    r = httpx.get(GEOCODE, params={"name": query, "count": 20, "language": "en", "format": "json"}, timeout=15)
    r.raise_for_status()
    hits = [h for h in r.json().get("results", []) or [] if h.get("country_code") == "IN"]
    if state:   # GeoNames writes e.g. "National Capital Territory of Delhi"; a missing admin1 is accepted
        key = state.lower().split()[0]
        hits = [h for h in hits if not h.get("admin1") or key in h["admin1"].lower()]
    if near:
        hits = [h for h in hits if abs(h["latitude"] - near[0]) < 0.5 and abs(h["longitude"] - near[1]) < 0.5]
    if not hits:
        raise SystemExit(f"no Indian geocoding result for {query!r}")
    best = max(hits, key=lambda h: h.get("population") or 0)   # the city, not a village of the same name
    return {"lat": round(best["latitude"], 4), "lon": round(best["longitude"], 4),
            "admin1": best.get("admin1"), "population": best.get("population")}


# Satellite cities inside Delhi's grid get their own agencies (reports go to MCG, not MCD).
NCR_ZONES = [
    ("gurugram", "Gurugram", "गुरुग्राम", "Gurugram", 12, "MCG", "Municipal Corporation of Gurugram", "GMDA", "Gurugram Metropolitan Development Authority"),
    ("noida", "Noida", "नोएडा", "Noida", 9, "NOIDA_AUTH", "Noida Authority", "NOIDA_AUTH", "Noida Authority"),
    ("faridabad", "Faridabad", "फ़रीदाबाद", "Faridabad", 10, "MCF", "Municipal Corporation Faridabad", "MCF", "Municipal Corporation Faridabad"),
    ("ghaziabad", "Ghaziabad", "ग़ाज़ियाबाद", "Ghaziabad", 9, "GNN", "Ghaziabad Nagar Nigam", "GNN", "Ghaziabad Nagar Nigam"),
]


def ncr_zones() -> list[dict]:
    zones = []
    for zid, name, name_hi, query, radius, cc, cn, wc, wn in NCR_ZONES:
        g = geocode(query, near=(28.61, 77.21))
        zones.append({"id": zid, "name": name, "name_hi": name_hi, "lat": g["lat"], "lon": g["lon"], "radius_km": radius,
                      "agencies": {"civic": cc, "water": wc}, "agency_names": {wc: wn, cc: cn},
                      "coord_source": "open-meteo-geocoding"})
    return zones


def main() -> None:
    out = []
    taken: set[str] = set()
    with open(DATA / "cities.seed.csv", newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            g = geocode(row["query"], state=row["state"])
            if row["grid_centre_override"]:
                glat, glon = (float(v) for v in row["grid_centre_override"].split(";"))
            else:
                glat, glon = round(g["lat"], 1), round(g["lon"], 1)
            tier = row.get("tier") or ("full" if row["id"] == "delhi" else "heat_and_rain")
            if row["id"] == "delhi":
                grid = {"lats": [round(28.4 + 0.1 * i, 1) for i in range(6)],
                        "lons": [round(76.8 + 0.1 * i, 1) for i in range(6)]}
            elif tier == "city":   # one 0.1-degree cell at the city centre
                grid = {"lats": [glat], "lons": [glon]}
            else:
                grid = {"lats": [round(glat + d, 1) for d in (-0.1, 0.0, 0.1)],
                        "lons": [round(glon + d, 1) for d in (-0.1, 0.0, 0.1)]}
            ids = {f"g_{la:.1f}_{lo:.1f}" for la in grid["lats"] for lo in grid["lons"]}
            if ids & taken:
                print(f"SKIP {row['id']}: its cell overlaps another city's grid ({sorted(ids & taken)})")
                continue
            taken |= ids
            out.append({
                "id": row["id"], "name": row["name"], "name_hi": row["name_hi"], "state": row["state"],
                "lat": g["lat"], "lon": g["lon"], "population": g["population"],
                "coord_source": "open-meteo-geocoding",
                "grid": grid, "grid_centre_override": row["grid_centre_override"] or None,
                "tier": tier,
                "agencies": {"civic": row["civic_agency"], "water": row["water_agency"]},
                # one body for roads and water (e.g. KMC): keep its corporate name, not the water wing's
                "agency_names": {row["water_agency"]: row["water_agency_name"],
                                 row["civic_agency"]: row["civic_agency_name"]},
                "agency_confidence": "high" if row["id"] == "delhi" else "low",
                "why": row["why"],
            })
            print(f"{row['id']:<10} {g['lat']:.4f},{g['lon']:.4f}  grid {grid['lats'][0]}..{grid['lats'][-1]} x "
                  f"{grid['lons'][0]}..{grid['lons'][-1]}")
    out[0]["zones"] = ncr_zones()   # Delhi first
    (DATA / "cities.json").write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(out)} cities to data/cities.json")


if __name__ == "__main__":
    main()
