"""RiskRefreshFn (hourly): fetch every city grid cell, compute heat and flood for now..+48 h, write
RiskCache, enqueue alerts for subscribers whose area crosses ORANGE heat or HIGH flood/rain risk."""
from __future__ import annotations

import json

from common.geo import geohash_decode

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
CELL_FIELDS = ("band", "temp_c", "rh", "wet_bulb_c", "rain_next_3h_mm", "area_flood_level")


def pack(row: dict) -> list:
    """Compact cell value for the hourly snapshot item (keeps 126 cells in a few KB)."""
    return [row.get(k) for k in CELL_FIELDS]


def unpack(values: list) -> dict:
    return {k: v for k, v in zip(CELL_FIELDS, values)}


def compute(now=None) -> dict:
    """Pure-ish computation (network for forecasts only); returns cache items and alert candidates.

    Heat for every city is stored as one snapshot item per hour (pk "heatgrid", sk = ISO hour,
    plus sk "latest"): about 50 writes an hour instead of one per cell per hour.
    """
    now = now or now_ist()
    series_by_cell = service.grid_series()
    fetched_at = next(iter(series_by_cell.values()))["fetched_at"]
    today = now.date().isoformat()
    items: list[dict] = []
    day_bands: dict[str, dict] = {}
    hours_available: list[str] = []
    snapshots: dict[str, dict] = {}

    for cell in gridmod.cells():
        s = series_by_cell[cell["id"]]
        rows = service.heat_hours(s, now, HOURS)
        if not hours_available:
            hours_available = [r["time"] for r in rows]
        for r in rows:
            snapshots.setdefault(r["time"], {})[cell["id"]] = pack(r)
        plan = service.heat_plan_from_series(s, lat=cell["lat"], lon=cell["lon"], label=cell["id"], day=today)
        day_bands[cell["id"]] = {"day_band": plan["day_band"], "avoid_windows": plan["avoid_windows"],
                                 "heavy_work_windows": plan["heavy_work_windows"],
                                 "area_flood_level": rows[0].get("area_flood_level") if rows else None,
                                 "rain_next_3h_mm": rows[0].get("rain_next_3h_mm") if rows else None}
    for hour, cells in snapshots.items():
        items.append({"pk": "heatgrid", "sk": hour, "cells": cells, "computed_at": fetched_at})
    if hours_available:
        items.append({"pk": "heatgrid", "sk": "latest", "time": hours_available[0],
                      "cells": snapshots[hours_available[0]], "computed_at": fetched_at})

    since = dynamo.since(2)   # crowd confirmation window
    verified = dynamo.reports_by_status("verified", since) + dynamo.reports_by_status("confirmed", since)
    flood_latest: dict[str, dict] = {}
    for spot in refdata.hotspots():
        cell = gridmod.nearest_cell(spot["lat"], spot["lon"])
        if cell is None:
            continue   # a hotspot far from every covered city: no forecast cell to score it with
        s = series_by_cell[cell]
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


def area_conditions(result: dict, areas: list[str], now=None) -> dict[str, dict]:
    """Day band and area rain level per subscriber area (geohash5).

    Areas inside a city grid reuse that cell; areas elsewhere in India get one batched point fetch.
    """
    out: dict[str, dict] = {}
    loose: list[tuple[str, float, float]] = []
    for area in areas:
        lat, lon = geohash_decode(area)
        cell = gridmod.covering_cell(lat, lon)
        if cell and cell in result["day_bands"]:
            out[area] = result["day_bands"][cell]
        elif gridmod.in_india(lat, lon):
            loose.append((area, lat, lon))
    if loose:
        now = now or now_ist()
        try:
            series = service.point_series([(la, lo) for _, la, lo in loose])
        except OpenMeteoError:
            logger.exception("point forecasts for outlying subscribers unavailable")
            return out
        for (area, la, lo), s in zip(loose, series):
            plan = service.heat_plan_from_series(s, lat=la, lon=lo, label=area, day=now.date().isoformat())
            first = service.heat_hours(s, now, 1)
            out[area] = {"day_band": plan["day_band"], "avoid_windows": plan["avoid_windows"],
                         "heavy_work_windows": plan["heavy_work_windows"],
                         "area_flood_level": first[0].get("area_flood_level") if first else None,
                         "rain_next_3h_mm": first[0].get("rain_next_3h_mm") if first else None}
    return out


def alert_candidates(result: dict, subscriptions: list[dict], conditions: dict[str, dict] | None = None) -> list[dict]:
    """Messages for AlertQueue. The 6-hour dedupe happens in AlertSenderFn."""
    if conditions is None:
        conditions = area_conditions(result, sorted({s["area"] for s in subscriptions}))
    out = []
    for sub in subscriptions:
        lat, lon = geohash_decode(sub["area"])
        info = conditions.get(sub["area"])
        user = sub["user"].split("#", 1)[1]
        if sub["hazard"] == "heat":
            if info and band_index(info["day_band"]) >= band_index("ORANGE"):
                out.append({"user_hash": user, "hazard": "heat", "area": sub["area"], "template_key": "alert_heat",
                            "params": {"band": info["day_band"], "avoid_windows": info["avoid_windows"],
                                       "updated_at": result["fetched_at"]}})
        elif sub["hazard"] == "flood":
            near = [f for f in result["flood_latest"].values()
                    if haversine_m(lat, lon, f["lat"], f["lon"]) <= FLOOD_ALERT_RADIUS_M and level_index(f["level"]) >= level_index("HIGH")]
            if near:
                worst = max(near, key=lambda f: (level_index(f["level"]), f["risk"]))
                out.append({"user_hash": user, "hazard": "flood", "area": sub["area"], "template_key": "alert_flood",
                            "params": {"spot": worst["name"], "level": worst["level"], "agency": worst["agency"],
                                       "updated_at": result["fetched_at"]}})
            elif info and info.get("area_flood_level") and level_index(info["area_flood_level"]) >= level_index("HIGH"):
                out.append({"user_hash": user, "hazard": "flood", "area": sub["area"], "template_key": "alert_rain_area",
                            "params": {"level": info["area_flood_level"], "rain_mm": info.get("rain_next_3h_mm"),
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
