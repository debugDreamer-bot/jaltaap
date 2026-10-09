"""ChatApiFn: POST /chat for the public web chat. Must answer in under 25 s."""
from __future__ import annotations

from pydantic import ValidationError

from agent.session import answer
from common import dynamo, i18n
from common.http import error, json_body, respond, source_ip
from common.ids import user_hash
from common.models import ChatRequest
from common.obs import MetricUnit, logger, metrics, tracer
from risk.grid import in_delhi

PER_SESSION_PER_MIN = 8
PER_IP_PER_MIN = 30


@metrics.log_metrics
@logger.inject_lambda_context(clear_state=True)
@tracer.capture_lambda_handler
def handler(event, context):
    try:
        req = ChatRequest.model_validate(json_body(event))
    except (ValueError, ValidationError):
        return error(400, "send {session_id, message, lat?, lon?}")
    if not dynamo.rate_limit(f"chat#s#{req.session_id}", PER_SESSION_PER_MIN, 60) or \
            not dynamo.rate_limit(f"chat#ip#{source_ip(event)}", PER_IP_PER_MIN, 60):
        return error(429, "too many messages, please wait a minute")
    uh = user_hash("web", req.session_id)
    logger.append_keys(user_hash=uh[:16])
    metrics.add_metric(name="MessagesIn", unit=MetricUnit.Count, value=1)
    lang = i18n.detect_language(req.message)
    loc = None
    if req.lat is not None and req.lon is not None:
        if not in_delhi(req.lat, req.lon):
            return respond(200, {"reply": i18n.t("outside_delhi", lang), "data_updated_at": None})
        loc = {"lat": req.lat, "lon": req.lon, "label": None}
    out = answer(user_hash=uh, channel="web", lang=lang, text=req.message, last_location=loc)
    metrics.add_metric(name="RepliesOut", unit=MetricUnit.Count, value=1)
    return respond(200, {"reply": out["reply"], "data_updated_at": out["data_updated_at"]})
