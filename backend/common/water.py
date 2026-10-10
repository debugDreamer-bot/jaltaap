"""Water-access reports: leaks, tanker no-shows, no supply and dirty water (spec US-11).

Two ways in:
  photo  the same verified photo loop as waterlogging; a water hazard_type routes the report to the
         city's water agency (Delhi Jal Board in Delhi) instead of the road agency.
  text   a tanker that never came or a dry tap cannot be photographed, so the agent files a text
         report at the user's last location (stored only at geohash6, about 1 km). Text reports start
         'unverified' and become 'corroborated' when independent reporters in the same ~1 km cell
         report the same issue within 24 hours. Only corroborated or verified issues reach the
         public map; officers see everything.
"""
from __future__ import annotations

from common import dynamo
from common.geo import geohash, geohash_decode
from common.ids import iso, new_ulid, now_ist
from risk import grid as gridmod

ISSUES = ("leak", "tanker_no_show", "no_supply", "dirty_water")
PHOTO_TYPES = {"pipe_leak": "leak", "dirty_water": "dirty_water", "tanker_issue": "tanker_no_show"}
CORROBORATE_USERS = 3        # independent reporters in the same geohash6 cell
WINDOW_H = 24
PUBLIC_STATUSES = ("corroborated", "verified", "confirmed")


def water_agency(lat: float, lon: float) -> str:
    return gridmod.agencies_for(lat, lon)["water"]


def civic_agency(lat: float, lon: float) -> str:
    return gridmod.agencies_for(lat, lon)["civic"]


def _same_issue_nearby(gh6: str, issue: str) -> list[dict]:
    since = dynamo.since(WINDOW_H)
    rows = []
    for status in ("unverified", "corroborated", "verified", "confirmed"):
        rows += [r for r in dynamo.reports_by_status(status, since)
                 if r.get("category") == "water" and r.get("issue") == issue and r.get("geohash6") == gh6]
    return rows


def file_text_report(*, user_hash: str, channel: str, lat: float, lon: float, issue: str, note: str = "") -> dict:
    """Create (or refresh) a text water report. Returns {report_id, status, agency, reporters, duplicate}."""
    if issue not in ISSUES:
        raise ValueError(f"issue must be one of {ISSUES}")
    gh6 = geohash(lat, lon, 6)
    clat, clon = geohash_decode(gh6)   # store the ~1 km cell centre, never the exact point
    agency = water_agency(lat, lon)
    nearby = _same_issue_nearby(gh6, issue)
    mine = [r for r in nearby if r.get("user_hash") == user_hash]
    if mine:
        r = mine[0]
        return {"report_id": r["report_id"], "status": r["status"], "agency": r["agency"],
                "reporters": len({x.get("user_hash") for x in nearby}), "duplicate": True}
    rid = new_ulid()
    now = now_ist()
    dynamo.put_report({
        "pk": f"report#{rid}", "report_id": rid, "user_hash": user_hash, "channel": channel,
        "category": "water", "issue": issue, "source": "text", "lat": round(clat, 5), "lon": round(clon, 5),
        "geohash5": gh6[:5], "geohash6": gh6, "geohash7": gh6, "status": "unverified", "agency": agency,
        "note": (note or "")[:280], "created_at": iso(now),
    })
    reporters = {x.get("user_hash") for x in nearby} | {user_hash}
    status = "unverified"
    if len(reporters) >= CORROBORATE_USERS:
        status = "corroborated"
        for r in nearby + [{"report_id": rid}]:
            if r.get("status", "unverified") == "unverified":
                dynamo.update_report(r["report_id"], status="corroborated", corroborations=len(reporters))
    return {"report_id": rid, "status": status, "agency": agency, "reporters": len(reporters), "duplicate": False}


def public_issues(hours: float = WINDOW_H) -> list[dict]:
    """Water issues for the public map, grouped by ~1 km cell and issue. No user data, no notes."""
    since = dynamo.since(hours)
    groups: dict[tuple[str, str], dict] = {}
    for status in PUBLIC_STATUSES:
        for r in dynamo.reports_by_status(status, since):
            issue = r.get("issue") or PHOTO_TYPES.get((r.get("verdict") or {}).get("hazard_type", ""))
            if r.get("category") != "water" or not issue:
                continue
            gh6 = r.get("geohash6") or geohash(float(r["lat"]), float(r["lon"]), 6)
            g = groups.setdefault((gh6, issue), {"issue": issue, "reports": 0, "photo_verified": 0,
                                                 "agency": r.get("agency"), "latest": r["created_at"],
                                                 "status": status})
            lat, lon = geohash_decode(gh6)
            g.update(lat=round(lat, 4), lon=round(lon, 4))
            g["reports"] += 1
            g["photo_verified"] += int(r.get("source", "photo") == "photo")
            g["latest"] = max(g["latest"], r["created_at"])
    out = list(groups.values())
    out.sort(key=lambda g: g["latest"], reverse=True)
    out.sort(key=lambda g: -g["reports"])   # stable: most-reported first, newest first within a count
    return out
