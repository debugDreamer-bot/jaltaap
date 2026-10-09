"""WhatsAppWebhookFn: GET handshake; POST verify signature, deduplicate, enqueue, return 200 fast."""
from __future__ import annotations

import json

from common import dynamo
from common.aws import client
from common.channels import whatsapp
from common.config import settings
from common.http import MAX_BODY, error, query, raw_body, respond
from common.obs import MetricUnit, logger, metrics
from common.secrets import get_secret


@metrics.log_metrics
@logger.inject_lambda_context
def handler(event, context):
    method = (event.get("requestContext") or {}).get("http", {}).get("method", "GET")
    if method == "GET":
        challenge = whatsapp.verify_handshake(query(event), get_secret("whatsapp/verify_token"))
        return respond(200, text=challenge) if challenge is not None else error(403, "verification failed")

    body = raw_body(event)
    if len(body) > MAX_BODY:
        return error(413, "body too large")
    sig = (event.get("headers") or {}).get("x-hub-signature-256")
    if not whatsapp.verify_signature(body, sig, get_secret("whatsapp/app_secret")):
        logger.warning("whatsapp signature rejected")
        return error(401, "bad signature")
    try:
        payload = json.loads(body)
    except ValueError:
        return error(400, "invalid json")

    queued = 0
    for msg in whatsapp.parse_inbound(payload):
        if not dynamo.claim_message("whatsapp", msg.message_id):
            continue  # Meta retries deliveries; process each message id once
        client("sqs").send_message(QueueUrl=settings().inbound_queue_url, MessageBody=msg.model_dump_json())
        queued += 1
    if queued:
        metrics.add_metric(name="MessagesIn", unit=MetricUnit.Count, value=queued)
    return respond(200, {"ok": True})
