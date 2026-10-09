"""RiskRefreshFn (hourly): fetch 36 cells, compute heat and flood for now..+48 h, write RiskCache,
enqueue alerts for subscribers whose area crosses ORANGE heat or HIGH flood risk."""
from __future__ import annotations

import json

from common.geo import geohash, geohash_decode

from common import dynamo, refdata
from common.aws import client
from common.config import settings
from common.geo import haversine_m
from common.ids import hour_iso, now_ist
from common.obs import logger, metrics, tracer
from risk import grid as gridmod
from risk import service
from risk.flood import level_index
from risk.heat import band_index
from risk.openmeteo import OpenMeteoError

HOURS = 49              # now to +48 h
FLOOD_ALERT_RADIUS_M = 3000


def compute(now=None) -> dict:
    """Pure-ish computation (network for forecasts only); returns cache items and alert candidates."""
    now = now or now_ist()
    series_by_cell = service.grid_series()
    fetched_at = next(iter(series_by_cell.values()))["fetched_at"]
    today = now.date().isoformat()
    items: list[dict] = []
    day_bands: dict[str, dict] = {}
    hours_available: list[str] = []

    for cell in gridmod.cells():
        s = series_by_cell[cell["id"]]
        rows = service.heat_hours(s, now, HOURS)
        if not hours_available:
            hours_available = [r["time"] for r in rows]
        for r in rows:
            items.append({"pk": f"heat#{cell['id']}", "sk": r["time"], **{k: r[k] for k in ("band", "temp_c", "rh", "wet_bulb_c")},
                          "computed_at": fetched_at})
        plan = service.heat_plan_from_series(s, lat=cell["lat"], lon=cell["lon"], label=cell["id"], day=today)
        day_bands[cell["id"]] = {"day_band": plan["day_band"], "avoid_windows": plan["avoid_windows"],
                                 "heavy_work_windows": plan["heavy_work_windows"]}
        if rows:
            items.append({"pk": f"heat#{cell['id']}", "sk": "latest", **{k: rows[0][k] for k in ("band", "temp_c", "rh", "wet_bulb_c")},
                          "time": rows[0]["time"], "day_band": plan["day_band"], "computed_at": fetched_at})

    since = dynamo.since(2)   # crowd confirmation window
    verified = dynamo.reports_by_status("verified", since) + dynamo.reports_by_status("confirmed", since)
    flood_latest: dict[str, dict] = {}
    for spot in refdata.hotspots():
        s = series_by_cell[gridmod.snap(spot["lat"], spot["lon"])]
        rows = service.flood_hours(s, spot, now, HOURS, reports=verified)
        for r in rows:
            items.append({"pk": f"flood#{spot['id']}", "sk": r["time"], "computed_at": fetched_at,
                          **{k: r[k] for k in ("level", "risk", "rain_next_1h_mm", "rain_next_3h_mm", "confirmed_reports")}})
        if rows:
            latest = {**rows[0], "pk": f"flood#{spot['id']}", "sk": "latest", "computed_at": fetched_at}
            items.append(latest)
            flood_latest[spot["id"]] = latest

    items.append({"pk": "meta#heat", "sk": "latest", "hours_available": hours_available, "data_updated_at": fetched_at})
    items.append({"pk": "meta#flood", "sk": "latest", "hours_available": hours_available, "data_updated_at": fetched_at})
    return {"items": items, "day_bands": day_bands, "flood_latest": flood_latest, "fetched_at": fetched_at}


def alert_candidates(result: dict, subscriptions: list[dict]) -> list[dict]:
    """Messages for AlertQueue. The 6-hour dedupe happens in AlertSenderFn."""
    out = []
    for sub in subscriptions:
        lat, lon = geohash_decode(sub["area"])
        if sub["hazard"] == "heat":
            info = result["day_bands"].get(gridmod.snap(lat, lon))
            if info and band_index(info["day_band"]) >= band_index("ORANGE"):
                out.append({"user_hash": sub["user"].split("#", 1)[1], "hazard": "heat", "area": sub["area"],
                            "template_key": "alert_heat",
                            "params": {"band": info["day_band"], "avoid_windows": info["avoid_windows"],
                                       "updated_at": result["fetched_at"]}})
        elif sub["hazard"] == "flood":
            near = [f for f in result["flood_latest"].values()
                    if haversine_m(lat, lon, f["lat"], f["lon"]) <= FLOOD_ALERT_RADIUS_M and level_index(f["level"]) >= level_index("HIGH")]
            if near:
                worst = max(near, key=lambda f: (level_index(f["level"]), f["risk"]))
                out.append({"user_hash": sub["user"].split("#", 1)[1], "hazard": "flood", "area": sub["area"],
                            "template_key": "alert_flood",
                            "params": {"spot": worst["name"], "level": worst["level"], "agency": worst["agency"],
                                       "updated_at": result["fetched_at"]}})
    return out


@metrics.log_metrics
@logger.inject_lambda_context(clear_state=True)
@tracer.capture_lambda_handler
def handler(event, context):
    try:
        result = compute()
    except OpenMeteoError:
        # keep the last good cache (48 h TTL); the API keeps showing its older data_updated_at
        logger.exception("forecast unavailable; RiskCache left unchanged this hour")
        return {"items": 0, "alerts": 0, "error": "forecast unavailable"}
    dynamo.put_risk_items(result["items"])
    alerts = alert_candidates(result, dynamo.all_subscriptions())
    sqs = client("sqs")
    for a in alerts:
        sqs.send_message(QueueUrl=settings().alert_queue_url, MessageBody=json.dumps(a))
    logger.info("risk refreshed", extra={"items": len(result["items"]), "alerts_enqueued": len(alerts),
                                         "hour": hour_iso(now_ist())})
    return {"items": len(result["items"]), "alerts": len(alerts)}
