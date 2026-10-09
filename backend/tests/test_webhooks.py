import hashlib
import hmac
import json

import boto3

from common.channels import telegram, whatsapp


def _wa_payload(msg_id="wamid.1", text="aaj kaam kab karu"):
    return {"entry": [{"changes": [{"value": {"messages": [
        {"from": "919800000001", "id": msg_id, "timestamp": "1760000000", "type": "text", "text": {"body": text}}]}}]}]}


def _signed_event(payload, secret="app-secret", bad=False):
    raw = json.dumps(payload).encode()
    sig = "sha256=" + hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    if bad:
        sig = sig[:-1] + ("0" if sig[-1] != "0" else "1")
    return {"requestContext": {"http": {"method": "POST"}}, "headers": {"x-hub-signature-256": sig},
            "body": raw.decode(), "isBase64Encoded": False}


def test_signature_valid_and_invalid():
    raw = b'{"a":1}'
    good = "sha256=" + hmac.new(b"s", raw, hashlib.sha256).hexdigest()
    assert whatsapp.verify_signature(raw, good, "s")
    assert not whatsapp.verify_signature(raw, good, "other")
    assert not whatsapp.verify_signature(raw + b" ", good, "s")
    assert not whatsapp.verify_signature(raw, None, "s")


def test_handshake():
    params = {"hub.mode": "subscribe", "hub.verify_token": "t", "hub.challenge": "42"}
    assert whatsapp.verify_handshake(params, "t") == "42"
    assert whatsapp.verify_handshake(params, "wrong") is None


def test_parse_inbound_types():
    payload = {"entry": [{"changes": [{"value": {"messages": [
        {"from": "91", "id": "a", "type": "location", "location": {"latitude": 28.61, "longitude": 77.2}},
        {"from": "91", "id": "b", "type": "image", "image": {"id": "MEDIA1", "caption": "pani"}},
        {"from": "91", "id": "c", "type": "interactive", "interactive": {"button_reply": {"id": "heat", "title": "Heat plan"}}},
    ]}}]}]}
    msgs = whatsapp.parse_inbound(payload)
    assert [m.type for m in msgs] == ["location", "image", "interactive"]
    assert msgs[0].lat == 28.61 and msgs[1].media_id == "MEDIA1" and msgs[2].text == "Heat plan"


def test_status_callbacks_are_ignored():
    assert whatsapp.parse_inbound({"entry": [{"changes": [{"value": {"statuses": [{"id": "x"}]}}]}]}) == []


def test_whatsapp_get_handshake_handler(aws, ctx):
    from handlers.webhook_whatsapp import handler
    ev = {"requestContext": {"http": {"method": "GET"}},
          "queryStringParameters": {"hub.mode": "subscribe", "hub.verify_token": "verify-me", "hub.challenge": "777"}}
    res = handler(ev, ctx)
    assert res["statusCode"] == 200 and res["body"] == "777"
    ev["queryStringParameters"]["hub.verify_token"] = "nope"
    assert handler(ev, ctx)["statusCode"] == 403


def test_whatsapp_rejects_bad_signature(aws, ctx):
    from handlers.webhook_whatsapp import handler
    assert handler(_signed_event(_wa_payload(), bad=True), ctx)["statusCode"] == 401


def _queue_depth():
    import os
    sqs = boto3.client("sqs", region_name="ap-south-1")
    attrs = sqs.get_queue_attributes(QueueUrl=os.environ["INBOUND_QUEUE_URL"], AttributeNames=["ApproximateNumberOfMessages"])
    return int(attrs["Attributes"]["ApproximateNumberOfMessages"])


def test_same_message_id_twice_enqueues_once(aws, ctx):
    from handlers.webhook_whatsapp import handler
    assert handler(_signed_event(_wa_payload("wamid.dup")), ctx)["statusCode"] == 200
    assert handler(_signed_event(_wa_payload("wamid.dup")), ctx)["statusCode"] == 200
    assert _queue_depth() == 1


def test_telegram_secret(aws, ctx):
    from handlers.webhook_telegram import handler
    update = {"update_id": 9, "message": {"message_id": 1, "date": 1, "chat": {"id": 55}, "text": "garmi"}}
    ok = {"headers": {"x-telegram-bot-api-secret-token": "tg-secret"}, "body": json.dumps(update)}
    bad = {"headers": {"x-telegram-bot-api-secret-token": "wrong"}, "body": json.dumps(update)}
    assert handler(bad, ctx)["statusCode"] == 401
    assert handler(ok, ctx)["statusCode"] == 200
    assert handler(ok, ctx)["statusCode"] == 200   # Telegram retry: deduplicated
    assert _queue_depth() == 1


def test_telegram_parse_photo_picks_largest():
    upd = {"update_id": 1, "message": {"chat": {"id": 1}, "photo": [{"file_id": "s", "file_size": 10},
                                                                    {"file_id": "L", "file_size": 999}]}}
    assert telegram.parse_update(upd)[0].media_id == "L"
