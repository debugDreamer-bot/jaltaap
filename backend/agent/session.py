"""One conversational turn, shared by the messaging worker and the web chat API."""
from __future__ import annotations

from datetime import datetime, timedelta

from agent import agent as runner
from agent.tools import UserContext
from common import dynamo
from common.geo import geohash, geohash_decode
from common.config import IST
from common.ids import now_ist
from common.obs import MetricUnit, metrics

LOCATION_FRESH_H = 6


def location_from_user(user: dict | None) -> dict | None:
    """Last location is stored only as geohash6 (about 1 km); decode its centre for context."""
    if not user or not user.get("last_geohash6"):
        return None
    at = user.get("last_location_at")
    if at and datetime.fromisoformat(at) < now_ist() - timedelta(hours=LOCATION_FRESH_H):
        return None
    lat, lon = geohash_decode(user["last_geohash6"])
    return {"lat": float(lat), "lon": float(lon), "label": user.get("last_location_label")}


def answer(*, user_hash: str, channel: str, lang: str, text: str, last_location: dict | None,
           profile: list[str] | None = None, shift: dict | None = None) -> dict:
    ctx = UserContext(user_hash=user_hash, channel=channel, lang=lang, last_location=last_location,
                      profile=profile or [], shift=shift)
    history = dynamo.last_turns(user_hash, turns=6)
    out = runner.run(ctx, text, history)
    dynamo.append_turn(user_hash, "user", text)
    dynamo.append_turn(user_hash, "assistant", out["reply"])
    metrics.add_metric(name="AgentLatencyMs", unit=MetricUnit.Milliseconds, value=out["latency_ms"])
    if out["fallback_used"]:
        metrics.add_metric(name="FallbackModelUsed", unit=MetricUnit.Count, value=1)
    if out["error"]:
        metrics.add_metric(name="ToolErrors", unit=MetricUnit.Count, value=1)
    if channel != "web" and ctx.last_location and ctx.last_location != last_location:   # web sessions keep no user row
        dynamo.update_user(user_hash, last_geohash6=geohash(ctx.last_location["lat"], ctx.last_location["lon"], 6),
                           last_location_at=now_ist().isoformat(timespec="seconds"),
                           last_location_label=ctx.last_location.get("label") or "")
    return out


__all__ = ["answer", "location_from_user", "IST"]
