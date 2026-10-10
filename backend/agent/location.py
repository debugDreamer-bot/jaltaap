"""Resolve a place name anywhere in India (pan-India coverage).

Order: our own Delhi reference names, a covered city's own name, Amazon Location Places v2, then
Open-Meteo geocoding. Results are biased to the city the user names (or the city of their last
location, else Delhi) so "Saket" means Delhi's Saket unless the user says otherwise. Anything
outside India is rejected.
"""
from __future__ import annotations

import re

import httpx

from common import refdata
from common.config import settings
from common.secrets import get_secret
from risk import grid as gridmod

DELHI_CENTRE = (77.2090, 28.6139)  # lon, lat for Places BiasPosition
# Generic words ignored when matching names: "Zakhira underpass" should match "Zakhira flyover and underpass".
_STOP = {"the", "and", "near", "at", "in", "to", "mein", "me", "se", "ka", "ki", "ke", "delhi", "new", "area",
         "underpass", "flyover", "station", "road", "market", "cooling", "zone", "centre", "center", "shelter",
         "bamboo", "outside", "office", "hospital", "building", "crossing", "metro", "roundabout", "nearest",
         "city", "india", "shahar"}


ALIASES = {"bombay": "mumbai", "calcutta": "kolkata", "madras": "chennai", "bangalore": "bengaluru", "dilli": "delhi"}
_HI_STOP = {"में", "मे", "का", "की", "के", "शहर", "पास", "आज", "कल"}


def _tokens(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z]+", text.lower()) if w not in _STOP and len(w) > 2}


def mentioned_city(text: str) -> dict | None:
    """A covered city named in the text (English or Hindi name), if any."""
    low = text.lower()
    for c in gridmod.cities():
        if re.search(rf"\b{re.escape(c['name'].lower())}\b", low) or c["name_hi"] in text:
            return c
    for alias, cid in ALIASES.items():
        if re.search(rf"\b{alias}\b", low):
            return gridmod.city(cid)
    return None


def _with_city(hit: dict) -> dict:
    cov = gridmod.coverage(hit["lat"], hit["lon"])
    return {**hit, "city": cov["city_name"], "coverage": cov["tier"]}


def _from_refdata(text: str) -> dict | None:
    """Match against Delhi hotspot and relief point names (coordinates from our geocoded seed data)."""
    want = _tokens(text)
    if not want:
        return None
    best, score = None, 0.0
    for item in refdata.hotspots() + refdata.relief_points():
        have = _tokens(item["name"])
        if not have:
            continue
        overlap = len(want & have) / len(want | have)   # 1.0 only when the distinctive words match exactly
        if overlap > score:
            best, score = item, overlap
    if best and score >= 0.99:
        return {"found": True, "lat": best["lat"], "lon": best["lon"], "label": best["name"],
                "confidence": 0.9, "source": "jaltaap-seed"}
    return None


def _from_city_name(text: str, city: dict | None) -> dict | None:
    """The text is just a covered city's name ("Mumbai", "mumbai mein"): use the city centre."""
    if city is None:
        return None
    names = {city["name"].lower(), city["name_hi"]} | {a for a, cid in ALIASES.items() if cid == city["id"]}
    words = re.findall(r"[a-z]+|[ऀ-ॿ]+", text.lower())
    rest = [w for w in words if w not in names and w not in _STOP and w not in _HI_STOP and len(w) > 2]
    if rest:
        return None
    return {"found": True, "lat": city["lat"], "lon": city["lon"], "label": city["name"], "confidence": 0.8,
            "source": "jaltaap-cities"}


def _from_places(text: str, bias: tuple[float, float]) -> dict | None:
    """Amazon Location Service Places v2 geocode (confirm request shape in the Places docs)."""
    try:
        key = get_secret("location/places_api_key")
    except Exception:  # noqa: BLE001 - no key configured: skip to the fallback
        return None
    url = f"https://places.geo.{settings().location_index_region}.amazonaws.com/v2/geocode"
    body = {"QueryText": f"{text}, India", "MaxResults": 1, "BiasPosition": list(bias),
            "Filter": {"IncludeCountries": ["IND"]}, "Language": "en"}
    try:
        r = httpx.post(url, params={"key": key}, json=body, timeout=6.0)
        r.raise_for_status()
        items = r.json().get("ResultItems", [])
    except httpx.HTTPError:
        return None
    if not items:
        return None
    it = items[0]
    lon, lat = it["Position"]
    overall = (it.get("MatchScores") or {}).get("Overall")
    return {"found": True, "lat": lat, "lon": lon, "label": it.get("Title") or text,
            "confidence": round(float(overall), 2) if overall is not None else 0.7, "source": "amazon-location"}


def _from_open_meteo(text: str, prefer: dict | None) -> dict | None:
    """Open-Meteo geocoding: good for localities. Prefer a hit inside the preferred city's grid."""
    name = text
    if prefer:   # "Andheri, Mumbai" geocodes better as "Andheri"
        name = re.sub(rf"\b{re.escape(prefer['name'])}\b|{re.escape(prefer['name_hi'])}", "", text, flags=re.I)
        name = name.strip(" ,.-") or text
    try:
        r = httpx.get("https://geocoding-api.open-meteo.com/v1/search",
                      params={"name": name, "count": 10, "language": "en", "format": "json"}, timeout=6.0)
        r.raise_for_status()
        results = r.json().get("results", []) or []
    except httpx.HTTPError:
        return None
    indian = [res for res in results if res.get("country_code") == "IN" and gridmod.in_india(res["latitude"], res["longitude"])]
    if not indian:
        return None
    pick = indian[0]
    if prefer:
        box = gridmod.city_bbox(prefer)
        inside = [res for res in indian if box["min_lat"] - 0.2 <= res["latitude"] <= box["max_lat"] + 0.2
                  and box["min_lon"] - 0.2 <= res["longitude"] <= box["max_lon"] + 0.2]
        if inside:
            pick = inside[0]
        elif prefer["id"] != "delhi" or mentioned_city(text):
            return None   # the user named a city and this place is not in it: do not jump across India
    return {"found": True, "lat": pick["latitude"], "lon": pick["longitude"], "label": pick["name"],
            "confidence": 0.6, "source": "open-meteo-geocoding"}


def resolve(text: str, near: dict | None = None) -> dict:
    """Find a place in India. `near` is the user's last location ({lat, lon}) and only sets the bias."""
    text = (text or "").strip()[:120]
    if not text:
        return {"found": False, "reason": "empty"}
    named = mentioned_city(text)
    prefer = named or (gridmod.city_of(near["lat"], near["lon"]) if near else None) or gridmod.city("delhi")
    bias = (prefer["lon"], prefer["lat"]) if prefer else DELHI_CENTRE
    finders = [lambda: _from_city_name(text, named)]
    if named is None or named["id"] == "delhi":
        finders.insert(0, lambda: _from_refdata(text))
    finders += [lambda: _from_places(text, bias), lambda: _from_open_meteo(text, prefer)]
    for finder in finders:
        hit = finder()
        if hit and gridmod.in_india(hit["lat"], hit["lon"]):
            return _with_city(hit)
    return {"found": False, "reason": "not found in India; ask the user for a location pin"}
