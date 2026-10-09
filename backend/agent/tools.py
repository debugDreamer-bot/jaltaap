"""Agent tools (spec 7.2). Each tool calls the risk engine or data layer, never another LLM.

The user's identity is bound in a closure per request: no tool takes a user id, phone number or
chat id, so the model can never act on another user or message an arbitrary number.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date as Date, timedelta

from strands import tool

from agent import location as loc
from common import dynamo, i18n, refdata
from common.geo import directions_url, geohash, haversine_m, point_to_segment_m
from common.ids import now_ist
from risk import service
from risk.flood import LEVEL_ORDER, level_index
from risk.grid import in_delhi

PROFILE_FLAGS = ["heavy_work", "age_60_plus", "pregnant", "chronic_illness", "not_acclimatised"]
HAZARDS = ["heat", "flood"]


@dataclass
class UserContext:
    user_hash: str
    channel: str
    lang: str = "en"
    last_location: dict | None = None
    profile: list[str] = field(default_factory=list)
    # filled while the agent runs
    tools_called: list[str] = field(default_factory=list)
    data_updated_at: str | None = None
    footers: list[str] = field(default_factory=list)
    tool_results: list[dict] = field(default_factory=list)


def _record(ctx: UserContext, name: str, result: dict) -> dict:
    ctx.tools_called.append(name)
    ctx.tool_results.append({"tool": name, "result": result})
    if result.get("data_updated_at"):
        ctx.data_updated_at = result["data_updated_at"]
    if result.get("footer"):
        ctx.footers.append(result["footer"])
    return result


def _check_point(lat: float, lon: float) -> dict | None:
    if lat is None or lon is None or not in_delhi(float(lat), float(lon)):
        return {"ok": False, "error": "location outside Delhi or missing; ask the user for a Delhi place name or pin"}
    return None


def build_tools(ctx: UserContext) -> list:
    lang = ctx.lang

    @tool
    def resolve_location(text: str) -> dict:
        """Find a place in Delhi from its name (area, landmark, underpass, market).

        Returns {found, lat, lon, label, confidence, source}. Returns found=false outside Delhi or when
        the place is unknown; then ask the user for a location pin instead of guessing.
        """
        result = loc.resolve(text)
        if result.get("found"):
            ctx.last_location = {"lat": result["lat"], "lon": result["lon"], "label": result["label"]}
        return _record(ctx, "resolve_location", result)

    @tool
    def get_heat_plan(lat: float, lon: float, date: str = "", profile: list[str] | None = None) -> dict:
        """Hourly heat plan for one Delhi location and date (YYYY-MM-DD, default today in IST; up to 2 days ahead).

        profile may include: heavy_work, age_60_plus, pregnant, chronic_illness, not_acclimatised (only if the
        user said so). Returns the day band, time blocks with bands, heavy_work_windows, avoid_windows, the
        noon pause, advice lines in the user's language and a footer line to end the reply with.
        """
        bad = _check_point(lat, lon)
        if bad:
            return _record(ctx, "get_heat_plan", bad)
        today = now_ist().date()
        day = date or today.isoformat()
        try:
            d = Date.fromisoformat(day)
        except ValueError:
            d = today
        if not (today - timedelta(days=1) <= d <= today + timedelta(days=2)):
            return _record(ctx, "get_heat_plan", {"ok": False, "error": "forecast covers yesterday to 2 days ahead only"})
        prof = [p for p in (profile or ctx.profile) if p in PROFILE_FLAGS]
        label = (ctx.last_location or {}).get("label") or f"{lat:.2f}, {lon:.2f}"
        try:
            plan = service.heat_plan(lat, lon, label=label, day=d.isoformat(), profile=prof)
        except Exception:  # noqa: BLE001
            return _record(ctx, "get_heat_plan", {"ok": False, "error": "forecast data unavailable right now"})
        result = {
            "ok": True,
            "location": plan["location"],
            "date": plan["date"],
            "day_band": plan["day_band"],
            "day_band_words": i18n.band_word(plan["day_band"], lang),
            "escalations": plan["escalations"],
            "blocks": plan["blocks"],
            "heavy_work_windows": plan["heavy_work_windows"],
            "avoid_windows": plan["avoid_windows"],
            "noon_pause": plan["noon_pause"],
            "peak_hour": plan["peak_hour"],
            "last_night_min_c": plan["last_night_min_c"],
            "advice": i18n.advice(plan["advice_keys"], lang),
            "data_updated_at": plan["data_updated_at"],
            "footer": i18n.footer(plan["data_updated_at"], lang),
        }
        return _record(ctx, "get_heat_plan", result)

    @tool
    def find_relief(lat: float, lon: float, kind: str = "any", limit: int = 3) -> dict:
        """Nearest cooling zones, water points or hospitals to a Delhi location.

        kind is one of: cooling, water, hospital, any. Returns up to `limit` points (max 5) with name, kind,
        distance_m, status and a Google Maps directions_url.
        """
        bad = _check_point(lat, lon)
        if bad:
            return _record(ctx, "find_relief", bad)
        kind = kind if kind in ("cooling", "water", "hospital") else "any"
        pts = [p for p in refdata.relief_points() if kind == "any" or p["kind"] == kind]
        ranked = sorted(pts, key=lambda p: haversine_m(lat, lon, p["lat"], p["lon"]))[: max(1, min(int(limit), 5))]
        result = {"ok": True, "points": [{
            "name": p["name"], "kind": p["kind"], "status": p.get("status"),
            "distance_m": int(round(haversine_m(lat, lon, p["lat"], p["lon"]), -1)),
            "directions_url": directions_url(p["lat"], p["lon"]),
        } for p in ranked]}
        if not ranked:
            result = {"ok": False, "error": "no relief points of that kind on record"}
        return _record(ctx, "find_relief", result)

    def _flood_near(lat: float, lon: float, radius_m: int) -> tuple[list[dict], str | None]:
        spots = [s for s in refdata.hotspots() if haversine_m(lat, lon, s["lat"], s["lon"]) <= radius_m]
        if not spots:
            return [], None
        cached = dynamo.batch_get_risk([(f"flood#{s['id']}", "latest") for s in spots])
        by_id = {c["pk"].split("#", 1)[1]: c for c in cached}
        updated = max((c.get("computed_at", "") for c in cached), default=None)
        if len(by_id) < len(spots):
            live, updated = service.flood_now_for_spots(spots)
            by_id = {r["id"]: r for r in live}
        rows = []
        for s in spots:
            r = by_id.get(s["id"])
            if r:
                rows.append({**r, "distance_m": int(round(haversine_m(lat, lon, s["lat"], s["lon"]), -1))})
        return rows, updated

    @tool
    def get_flood_risk(lat: float, lon: float, radius_m: int = 3000, hours: int = 3) -> dict:
        """Waterlogging risk at listed Delhi hotspots near a location for the next 3 hours.

        Returns hotspots ranked by level (CONFIRMED > SEVERE > HIGH > MEDIUM > LOW) with the owning agency,
        expected rain in the next 1 and 3 hours, verified report count and distance.
        """
        bad = _check_point(lat, lon)
        if bad:
            return _record(ctx, "get_flood_risk", bad)
        try:
            rows, updated = _flood_near(lat, lon, max(500, min(int(radius_m), 10_000)))
        except Exception:  # noqa: BLE001
            return _record(ctx, "get_flood_risk", {"ok": False, "error": "rain data unavailable right now"})
        if not rows:
            return _record(ctx, "get_flood_risk", {"ok": True, "hotspots": [], "note": "no listed hotspots in range"})
        rows.sort(key=lambda r: (-level_index(r["level"]), r["distance_m"]))
        result = {"ok": True, "horizon_h": 3, "hotspots": [{
            "name": r["name"], "agency": r["agency"], "level": r["level"],
            "level_words": i18n.level_word(r["level"], lang), "rain_next_1h_mm": r["rain_next_1h_mm"],
            "rain_next_3h_mm": r["rain_next_3h_mm"], "confirmed_reports": r.get("confirmed_reports", 0),
            "distance_m": r["distance_m"]} for r in rows[:5]]}
        if updated:
            result["data_updated_at"] = updated
            result["footer"] = i18n.footer(updated, lang)
        return _record(ctx, "get_flood_risk", result)

    @tool
    def check_route(origin: str, destination: str) -> dict:
        """Waterlogging hotspots within 500 m of the straight line between two Delhi places (names).

        Returns the hotspots on the way, the worst level, and a short hint. The line is straight, not the
        road route, so say "on or near the way".
        """
        a, b = loc.resolve(origin), loc.resolve(destination)
        if not (a.get("found") and b.get("found")):
            return _record(ctx, "check_route", {"ok": False, "error": "could not find one of the places in Delhi",
                                                "origin_found": a.get("found", False), "destination_found": b.get("found", False)})
        pa, pb = (a["lat"], a["lon"]), (b["lat"], b["lon"])
        near = [s for s in refdata.hotspots() if point_to_segment_m(s["lat"], s["lon"], pa, pb) <= 500]
        rows, updated = [], None
        if near:
            mid = ((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2)
            radius = haversine_m(*pa, *pb) / 2 + 600
            rows, updated = _flood_near(mid[0], mid[1], int(radius))
            ids = {s["id"] for s in near}
            rows = [r for r in rows if r["id"] in ids]
        worst = max((r["level"] for r in rows), key=level_index, default="LOW")
        hint = {"en": "Avoid the spots marked HIGH or worse; wait for the rain to pass or take a parallel road.",
                "hi": "ज़्यादा या गंभीर खतरे वाली जगहों से बचें; बारिश रुकने का इंतज़ार करें या दूसरी सड़क लें।",
                "hinglish": "HIGH ya usse zyada khatre wali jagah se bachein; baarish rukne ka intezaar karein ya doosri sadak lein."}
        result = {"ok": True, "origin": a["label"], "destination": b["label"], "worst_level": worst,
                  "worst_level_words": i18n.level_word(worst, lang),
                  "hotspots_on_the_way": [{"name": r["name"], "agency": r["agency"], "level": r["level"],
                                           "rain_next_3h_mm": r["rain_next_3h_mm"]} for r in
                                          sorted(rows, key=lambda r: -level_index(r["level"]))],
                  "hint": hint[lang] if level_index(worst) >= LEVEL_ORDER.index("HIGH") else None}
        if updated:
            result["data_updated_at"] = updated
            result["footer"] = i18n.footer(updated, lang)
        return _record(ctx, "check_route", result)

    @tool
    def manage_subscription(action: str, hazards: list[str] | None = None, lat: float | None = None,
                            lon: float | None = None) -> dict:
        """Turn heat and flood alerts on or off for this user, or show their status.

        action is subscribe, unsubscribe or status. hazards is a list of heat and/or flood (default both).
        For subscribe, lat/lon default to the user's last shared location. Alerts are sent at most once per
        hazard per area every 6 hours, plus a 05:30 IST daily heat brief.
        """
        if ctx.channel == "web":
            return _record(ctx, "manage_subscription", {"ok": False, "error": "alerts need WhatsApp or Telegram"})
        hz = [h for h in (hazards or HAZARDS) if h in HAZARDS] or HAZARDS
        if action == "status":
            subs = dynamo.list_user_subscriptions(ctx.user_hash)
            return _record(ctx, "manage_subscription", {"ok": True, "subscriptions": [
                {"hazard": s["hazard"], "area": s["area"]} for s in subs]})
        if action == "unsubscribe":
            n = dynamo.unsubscribe(ctx.user_hash, hz)
            return _record(ctx, "manage_subscription", {"ok": True, "removed": n})
        if action != "subscribe":
            return _record(ctx, "manage_subscription", {"ok": False, "error": "unknown action"})
        point = (lat, lon) if lat is not None and lon is not None else (
            (ctx.last_location["lat"], ctx.last_location["lon"]) if ctx.last_location else None)
        if not point or not in_delhi(*point):
            return _record(ctx, "manage_subscription", {"ok": False, "error": "need a Delhi location; ask for a pin"})
        area = geohash(point[0], point[1], 5)
        for h in hz:
            dynamo.subscribe(ctx.user_hash, area, h)
        dynamo.update_user(ctx.user_hash, last_geohash6=geohash(point[0], point[1], 6))
        msg = i18n.t("subscribed", lang, hazards=", ".join(hz))
        return _record(ctx, "manage_subscription", {"ok": True, "subscribed": hz, "message": msg})

    return [resolve_location, get_heat_plan, find_relief, get_flood_risk, check_route, manage_subscription]
