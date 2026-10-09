"""Geocode data/hotspots.seed.csv and data/relief_points.seed.csv.

Writes data/hotspots.json, data/relief_points.json and data/GEOCODING_REVIEW.md.

Run from the repo root:  .venv/bin/python data/geocode_hotspots.py [--refresh]

Order of attempts for each row (the first in-Delhi hit wins):
  1. Nominatim  "<name>, Delhi"
  2. Open-Meteo geocoding "<name>"            (only for locality-like names)
  3. Nominatim  "<variant>, Delhi"            (one hand-picked variant, if the row has one)
  4. Open-Meteo geocoding "<variant>"         (only if the variant is locality-like)
Any hit outside the Delhi bounding box (risk.grid.in_delhi) is rejected. Rows that fail every
attempt keep lat/lon = null and coord_source = "none". Coordinates are never typed by hand.
Every row is needs_check = true: a teammate must confirm each pin on a map.

Nominatim usage policy: at most one request per second (we sleep 1.1 s) and a descriptive
User-Agent. Every HTTP response is cached under backtests/.cache/geocode/.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sys
import time
from pathlib import Path
from urllib.parse import urlencode

import httpx

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from risk.grid import in_delhi  # noqa: E402

DATA = ROOT / "data"
CACHE = ROOT / "backtests" / ".cache" / "geocode"
UA = "JalTaap/0.1 (Environmental Hacks hackathon, Team DevCore)"
NOMINATIM = "https://nominatim.openstreetmap.org/search"
OPEN_METEO = "https://geocoding-api.open-meteo.com/v1/search"

# One sensible variant per name, used only if the full name fails.
VARIANTS = {
    "Minto Bridge underpass": "Minto Bridge",
    "Pul Prahladpur underpass": "Pul Prahladpur",
    "Azadpur market underpass": "Azadpur",
    "Zakhira flyover and underpass": "Zakhira",
    "Moolchand underpass": "Moolchand",
    "IP Estate near WHO building": "Indraprastha Estate",
    "Delhi-Meerut Expressway near Vinod Nagar": "Vinod Nagar",
    "Jahangirpuri Metro station": "Jahangirpuri",
    "Loni Road roundabout": "Loni Road",
    "New Delhi Railway Station area": "New Delhi Railway Station",
    "Mathura Road near Ashram": "Ashram",
    "Old Rajinder Nagar": "Old Rajendra Nagar",
    "AIIMS crossing": "AIIMS",
    "Mukarba Chowk": "Mukarba",
    "Delhi-Noida Link Road": "DND Flyway",
    "Cooling zone near Jama Masjid": "Jama Masjid",
    "Bamboo cooling shelter Bawana": "Bawana",
    "Bamboo cooling shelter Alipur": "Alipur",
    "Cooling shelter outside DC office Outer North": "Narela",
    "AIIMS New Delhi": "All India Institute of Medical Sciences",
    "Dr RML Hospital": "Ram Manohar Lohia Hospital",
    "LNJP Hospital": "Lok Nayak Hospital",
    "GTB Hospital": "Guru Teg Bahadur Hospital",
}

# Geocoder hits a human reviewer judged to be a different place. The hit is rejected and the
# next attempt runs. Keyed by the exact query sent; the reason is shown in the review file.
REJECT = {
    "nominatim:AIIMS New Delhi, Delhi": "matched Safdarjung Hospital (across the road), not AIIMS",
}

# Why a pin needs extra care (written after reading each geocoder match; shown in the review).
REVIEW_NOTES = {
    "hs_minto_bridge": "SUSPECT: matched Shivaji Bridge railway station near Minto Bridge, not the underpass itself",
    "hs_pul_prahladpur": "SUSPECT: matched a private house; address also mentions Faridabad. Check it is the underpass",
    "hs_azadpur": "matched Azadpur metro station, not the market underpass",
    "hs_ip_estate_who": "locality centroid of IP Estate, not the WHO building",
    "hs_vinod_nagar": "locality centroid of Vinod Nagar, not the expressway",
    "hs_loni_road": "SUSPECT: a point on a long road, not necessarily the roundabout",
    "hs_mathura_rd_ashram": "first variant 'Ashram Chowk' was not used; 'Ashram' matched Ashram metro station on Mathura Road",
    "hs_dnd_link": "SUSPECT: matched a Delhi-Meerut RRTS / Mayur Vihar flyover feature, not the DND itself",
    "hs_old_rajinder_nagar": "'Rajinder Nagar' was also probed but matched a clinic in New Rajinder Nagar; not used",
    "rp_bawana_bamboo": "locality centroid; shelter location within Bawana unknown",
    "rp_alipur_bamboo": "locality centroid; shelter location within Alipur unknown",
    "rp_outer_north_dc": "SUSPECT: Narela railway station used as a stand-in for the DC office Outer North",
    "rp_aiims": "first query matched Safdarjung Hospital and was rejected",
    "rp_safdarjung": "matched a bus stop named Safdarjung Hospital",
    "rp_lnjp": "matched a metro construction site named LNJP Hospital, next to the hospital",
}

# Names containing these words are features, not localities: GeoNames (Open-Meteo) cannot
# resolve them and a same-named locality would be a wrong pin.
NOT_LOCALITY = ("underpass", "flyover", "road", "station", "hospital", "building", "crossing",
                "expressway", "shelter", "office", "zone", "near", "aiims", "flyway", "chowk", "bridge")


def is_locality(q: str) -> bool:
    low = q.lower()
    return not any(w in low for w in NOT_LOCALITY)


class Client:
    def __init__(self, refresh: bool):
        self.refresh = refresh
        self.http = httpx.Client(headers={"User-Agent": UA}, timeout=30)
        self.last_nominatim = 0.0
        CACHE.mkdir(parents=True, exist_ok=True)

    def get(self, base: str, params: dict) -> object:
        url = f"{base}?{urlencode(params)}"
        path = CACHE / (hashlib.sha256(url.encode()).hexdigest()[:24] + ".json")
        if path.exists() and not self.refresh:
            return json.loads(path.read_text(encoding="utf-8"))["body"]
        if base == NOMINATIM:
            wait = 1.1 - (time.monotonic() - self.last_nominatim)
            if wait > 0:
                time.sleep(wait)
            self.last_nominatim = time.monotonic()
        r = self.http.get(base, params=params)
        r.raise_for_status()
        body = r.json()
        path.write_text(json.dumps({"url": url, "body": body}, ensure_ascii=False), encoding="utf-8")
        return body

    def nominatim(self, q: str):
        query = f"{q}, Delhi"
        body = self.get(NOMINATIM, {"q": query, "format": "jsonv2", "countrycodes": "in", "limit": 1})
        if f"nominatim:{query}" in REJECT:
            return {"rejected": f"nominatim:{query} -> rejected: {REJECT[f'nominatim:{query}']}"}
        for hit in body or []:
            lat, lon = float(hit["lat"]), float(hit["lon"])
            if in_delhi(lat, lon):
                kind = f"{hit.get('category', '')}/{hit.get('type', '')}"
                return {"lat": round(lat, 5), "lon": round(lon, 5), "coord_source": f"nominatim:{query}",
                        "coord_note": hit.get("display_name", ""), "osm_kind": kind}
            return {"rejected": f"nominatim:{query} -> {lat:.4f},{lon:.4f} outside Delhi box"}
        return None

    def open_meteo(self, q: str):
        body = self.get(OPEN_METEO, {"name": q, "count": 5, "language": "en", "format": "json"})
        rejected = []
        for hit in (body or {}).get("results", []) or []:
            lat, lon = float(hit["latitude"]), float(hit["longitude"])
            if hit.get("country_code") == "IN" and in_delhi(lat, lon):
                note = ", ".join(str(hit[k]) for k in ("name", "admin2", "admin1", "country") if hit.get(k))
                return {"lat": round(lat, 5), "lon": round(lon, 5), "coord_source": f"open-meteo:{q}",
                        "coord_note": note, "osm_kind": f"geonames/{hit.get('feature_code', '')}"}
            rejected.append(f"{lat:.2f},{lon:.2f}")
        if rejected:
            return {"rejected": f"open-meteo:{q} -> only outside-Delhi hits ({'; '.join(rejected)})"}
        return None


def geocode(client: Client, name: str) -> tuple[dict, list[str]]:
    tried: list[str] = []
    attempts = [("nominatim", name)]
    if is_locality(name):
        attempts.append(("open-meteo", name))
    var = VARIANTS.get(name)
    if var:
        attempts.append(("nominatim", var))
        if is_locality(var):
            attempts.append(("open-meteo", var))
    for svc, q in attempts:
        res = client.nominatim(q) if svc == "nominatim" else client.open_meteo(q)
        if res and "lat" in res:
            tried.append(res["coord_source"])
            return res, tried
        tried.append(res["rejected"] if res else f"{svc}:{q} -> no result")
    return {"lat": None, "lon": None, "coord_source": "none", "coord_note": "", "osm_kind": ""}, tried


def read_csv(path: Path) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true", help="ignore the HTTP cache")
    args = ap.parse_args()
    client = Client(args.refresh)

    review: list[dict] = []
    hotspots = []
    for row in read_csv(DATA / "hotspots.seed.csv"):
        geo, tried = geocode(client, row["name"])
        years = [int(y) for y in row["years_seen"].split(";") if y.strip()]
        hotspots.append({
            "id": row["id"], "name": row["name"], "type": row["type"],
            "agency": row["agency_default"], "agency_confidence": row["agency_confidence"],
            "years_seen": len(years), "years": years, "evidence": row["evidence"], "source": row["source"],
            "lat": geo["lat"], "lon": geo["lon"], "coord_source": geo["coord_source"],
            "coord_note": geo["coord_note"], "needs_check": True,
        })
        review.append({"file": "hotspots", "id": row["id"], "name": row["name"], **geo, "tried": tried})
        print(f"{row['id']:24s} {geo['coord_source']}")

    relief = []
    for row in read_csv(DATA / "relief_points.seed.csv"):
        geo, tried = geocode(client, row["name"])
        relief.append({
            "id": row["id"], "name": row["name"], "kind": row["kind"], "status": row["status"],
            "since": row["since"] or None, "cool_room": row["cool_room"], "source": row["source"],
            "lat": geo["lat"], "lon": geo["lon"], "coord_source": geo["coord_source"],
            "coord_note": geo["coord_note"], "needs_check": True,
        })
        review.append({"file": "relief_points", "id": row["id"], "name": row["name"], **geo, "tried": tried})
        print(f"{row['id']:24s} {geo['coord_source']}")

    (DATA / "hotspots.json").write_text(json.dumps(hotspots, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    (DATA / "relief_points.json").write_text(json.dumps(relief, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    write_review(review)
    ok = sum(1 for r in review if r["lat"] is not None)
    print(f"geocoded {ok}/{len(review)} rows; see data/GEOCODING_REVIEW.md")


def write_review(rows: list[dict]) -> None:
    def esc(s: str) -> str:
        return str(s).replace("|", "\\|")

    failed = [r for r in rows if r["lat"] is None]
    found = [r for r in rows if r["lat"] is not None]
    lines = [
        "# Geocoding review",
        "",
        "Generated by `data/geocode_hotspots.py`. Every coordinate below came from a geocoder",
        "(Nominatim / OpenStreetMap or Open-Meteo geocoding / GeoNames); none was typed by hand.",
        "Every row is `needs_check=true`: open the map link, confirm the pin sits on the named",
        "place, and fix the coordinates in the JSON if not. A locality-level hit (a whole",
        "neighbourhood, or a variant query) is only an approximation of the exact spot.",
        "",
        f"Geocoded: {len(found)} of {len(rows)} rows. Failed: {len(failed)}.",
        "",
        "## Failures (no coordinates; lat/lon left empty)",
        "",
    ]
    if failed:
        lines += ["| file | id | name | attempts | note |", "|---|---|---|---|---|"]
        for r in failed:
            lines.append(f"| {r['file']} | {r['id']} | {esc(r['name'])} | {esc('; '.join(r['tried']))} "
                         f"| {esc(REVIEW_NOTES.get(r['id'], ''))} |")
    else:
        lines.append("None.")
    lines += [
        "",
        "## Geocoded rows (verify each pin)",
        "",
        "Rows marked SUSPECT first.",
        "",
        "| file | id | name | query used | lat, lon | geocoder match | match kind | note | map | checked |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    found.sort(key=lambda r: not REVIEW_NOTES.get(r["id"], "").startswith("SUSPECT"))
    for r in found:
        link = f"https://www.google.com/maps?q={r['lat']},{r['lon']}"
        lines.append(
            f"| {r['file']} | {r['id']} | {esc(r['name'])} | {esc(r['coord_source'])} | {r['lat']}, {r['lon']} "
            f"| {esc(r['coord_note'])} | {esc(r['osm_kind'])} | {esc(REVIEW_NOTES.get(r['id'], ''))} "
            f"| [map]({link}) | [ ] |"
        )
    lines += ["", "Earlier attempts that were rejected or empty are listed in the script output and",
              "can be reproduced from the cache; the query that produced each pin is in `coord_source`.", ""]
    (DATA / "GEOCODING_REVIEW.md").write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
