"""DailyBriefFn (05:30 IST): a fixed-template heat brief to every heat subscriber."""
from __future__ import annotations

import json

from common.geo import geohash, geohash_decode

from common import dynamo
from common.aws import client
from common.config import settings
from common.obs import logger, metrics, tracer
from risk import grid as gridmod
from risk import service


@metrics.log_metrics
@logger.inject_lambda_context(clear_state=True)
@tracer.capture_lambda_handler
def handler(event, context):
    subs = [s for s in dynamo.all_subscriptions() if s["hazard"] == "heat"]
    if not subs:
        return {"briefs": 0}
    series_by_cell = service.grid_series()
    today = None
    plans: dict[str, dict] = {}
    sqs = client("sqs")
    for sub in subs:
        lat, lon = geohash_decode(sub["area"])
        cell = gridmod.snap(lat, lon)
        if cell not in plans:
            s = series_by_cell[cell]
            today = today or s["fetched_at"][:10]
            plans[cell] = service.heat_plan_from_series(s, lat=lat, lon=lon, label=cell, day=today)
        plan = plans[cell]
        sqs.send_message(QueueUrl=settings().alert_queue_url, MessageBody=json.dumps({
            "user_hash": sub["user"].split("#", 1)[1], "hazard": "heat", "area": sub["area"],
            "template_key": "brief_heat",
            "params": {"band": plan["day_band"], "heavy_work_windows": plan["heavy_work_windows"],
                       "updated_at": plan["data_updated_at"]},
        }))
    return {"briefs": len(subs)}
