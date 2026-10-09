"""TelegramWebhookFn: verify the secret header, deduplicate on update_id, enqueue, return 200."""
from __future__ import annotations

import json

from common import dynamo
from common.aws import client
from common.channels import telegram
from common.config import settings
from common.http import MAX_BODY, error, raw_body, respond
from common.obs import MetricUnit, logger, metrics
from common.secrets import get_secret


@metrics.log_metrics
@logger.inject_lambda_context
def handler(event, context):
    secret = (event.get("headers") or {}).get("x-telegram-bot-api-secret-token")
    if not telegram.verify_secret(secret, get_secret("telegram/secret_token")):
        logger.warning("telegram secret rejected")
        return error(401, "bad secret")
    body = raw_body(event)
    if len(body) > MAX_BODY:
        return error(413, "body too large")
    try:
        update = json.loads(body)
    except ValueError:
        return error(400, "invalid json")
    queued = 0
    for msg in telegram.parse_update(update):
        if not dynamo.claim_message("telegram", msg.message_id):
            continue
        client("sqs").send_message(QueueUrl=settings().inbound_queue_url, MessageBody=msg.model_dump_json())
        queued += 1
    if queued:
        metrics.add_metric(name="MessagesIn", unit=MetricUnit.Count, value=queued)
    return respond(200, {"ok": True})
