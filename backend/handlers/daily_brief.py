"""DailyBriefFn (05:30 IST): a fixed-template heat brief to every heat subscriber.

Subscribers inside a city grid share that city's forecast; subscribers elsewhere in India get one
batched point request for all their areas.
"""
from __future__ import annotations

import json

from common.geo import geohash_decode

from common import dynamo
from common.aws import client
from common.config import settings
from common.obs import logger, metrics, tracer
from risk import grid as gridmod
from risk import service


def plans_for_areas(areas: list[str]) -> dict[str, dict]:
    """Today's heat plan per subscriber area (geohash5)."""
    by_city: dict[str, list[tuple[str, str]]] = {}
    loose: list[tuple[str, float, float]] = []
    for area in areas:
        lat, lon = geohash_decode(area)
        c = gridmod.city_of(lat, lon)
        if c:
            by_city.setdefault(c["id"], []).append((area, gridmod.covering_cell(lat, lon)))
        elif gridmod.in_india(lat, lon):
            loose.append((area, lat, lon))
    out: dict[str, dict] = {}
    for city_id, pairs in by_city.items():
        series_by_cell = service.grid_series(city_id)
        cell_plans: dict[str, dict] = {}
        for area, cell in pairs:
            if cell not in cell_plans:
                s = series_by_cell[cell]
                cell_plans[cell] = service.heat_plan_from_series(s, lat=s["lat"], lon=s["lon"], label=cell,
                                                                 day=s["fetched_at"][:10])
            out[area] = cell_plans[cell]
    if loose:
        for (area, lat, lon), s in zip(loose, service.point_series([(la, lo) for _, la, lo in loose])):
            out[area] = service.heat_plan_from_series(s, lat=lat, lon=lon, label=area, day=s["fetched_at"][:10])
    return out


@metrics.log_metrics
@logger.inject_lambda_context(clear_state=True)
@tracer.capture_lambda_handler
def handler(event, context):
    subs = [s for s in dynamo.all_subscriptions() if s["hazard"] == "heat"]
    if not subs:
        return {"briefs": 0}
    plans = plans_for_areas(sorted({s["area"] for s in subs}))
    sqs = client("sqs")
    sent = 0
    for sub in subs:
        plan = plans.get(sub["area"])
        if not plan:
            continue
        sqs.send_message(QueueUrl=settings().alert_queue_url, MessageBody=json.dumps({
            "user_hash": sub["user"].split("#", 1)[1], "hazard": "heat", "area": sub["area"],
            "template_key": "brief_heat",
            "params": {"band": plan["day_band"], "heavy_work_windows": plan["heavy_work_windows"],
                       "updated_at": plan["data_updated_at"]},
        }))
        sent += 1
    logger.info("briefs queued", extra={"briefs": sent})
    return {"briefs": sent}
