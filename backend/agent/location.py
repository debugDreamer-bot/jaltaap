"""Resolve a place name inside Delhi. Order: our own reference names, Amazon Location Places v2,
then Open-Meteo geocoding. Anything outside the Delhi bounding box is rejected."""
from __future__ import annotations

import re

import httpx

from common import refdata
from common.config import settings
from common.secrets import get_secret
from risk.grid import in_delhi

DELHI_CENTRE = (77.2090, 28.6139)  # lon, lat for Places BiasPosition
# Generic words ignored when matching names: "Zakhira underpass" should match "Zakhira flyover and underpass".
_STOP = {"the", "and", "near", "at", "in", "to", "mein", "me", "se", "ka", "ki", "ke", "delhi", "new", "area",
         "underpass", "flyover", "station", "road", "market", "cooling", "zone", "centre", "center", "shelter",
         "bamboo", "outside", "office", "hospital", "building", "crossing", "metro", "roundabout", "nearest"}


def _tokens(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z]+", text.lower()) if w not in _STOP and len(w) > 2}


def _from_refdata(text: str) -> dict | None:
    """Match against hotspot and relief point names (coordinates from our geocoded seed data)."""
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


def _from_places(text: str) -> dict | None:
    """Amazon Location Service Places v2 geocode (confirm request shape in the Places docs)."""
    try:
        key = get_secret("location/places_api_key")
    except Exception:  # noqa: BLE001 - no key configured: skip to the fallback
        return None
    url = f"https://places.geo.{settings().location_index_region}.amazonaws.com/v2/geocode"
    body = {"QueryText": f"{text}, Delhi", "MaxResults": 1, "BiasPosition": list(DELHI_CENTRE),
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


def _from_open_meteo(text: str) -> dict | None:
    try:
        r = httpx.get("https://geocoding-api.open-meteo.com/v1/search",
                      params={"name": text, "count": 5, "language": "en", "format": "json"}, timeout=6.0)
        r.raise_for_status()
        results = r.json().get("results", []) or []
    except httpx.HTTPError:
        return None
    for res in results:
        if res.get("country_code") == "IN" and in_delhi(res["latitude"], res["longitude"]):
            return {"found": True, "lat": res["latitude"], "lon": res["longitude"], "label": res["name"],
                    "confidence": 0.6, "source": "open-meteo-geocoding"}
    return None


def resolve(text: str) -> dict:
    text = (text or "").strip()[:120]
    if not text:
        return {"found": False, "reason": "empty"}
    for finder in (_from_refdata, _from_places, _from_open_meteo):
        hit = finder(text)
        if hit and in_delhi(hit["lat"], hit["lon"]):
            return hit
    return {"found": False, "reason": "not found inside Delhi; ask the user for a location pin"}
