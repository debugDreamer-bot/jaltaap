"""DynamoDB data access for the six JalTaap tables (spec 9.2)."""
from __future__ import annotations

import time
from datetime import timedelta
from decimal import Decimal
from typing import Any

from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

from common.aws import client, table
from common.config import settings
from common.ids import iso, now_ist

DAY = 86_400


def to_dynamo(value: Any) -> Any:
    """Floats become Decimals for DynamoDB."""
    if isinstance(value, float):
        return Decimal(str(round(value, 6)))
    if isinstance(value, dict):
        return {k: to_dynamo(v) for k, v in value.items() if v is not None}
    if isinstance(value, list):
        return [to_dynamo(v) for v in value]
    return value


def from_dynamo(value: Any) -> Any:
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, dict):
        return {k: from_dynamo(v) for k, v in value.items()}
    if isinstance(value, list):
        return [from_dynamo(v) for v in value]
    return value


# ---------------- Idempotency ----------------
def claim_message(channel: str, message_id: str) -> bool:
    """True the first time a message id is seen; False for duplicates (Meta and Telegram retry)."""
    try:
        table(settings().idempotency_table).put_item(
            Item={"pk": f"msg#{channel}#{message_id}", "received_at": iso(now_ist()), "ttl": int(time.time()) + 2 * DAY},
            ConditionExpression="attribute_not_exists(pk)",
        )
        return True
    except ClientError as err:
        if err.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return False
        raise


def rate_limit(key: str, limit: int, window_s: int) -> bool:
    """Fixed-window counter in the idempotency table. True if the call is allowed."""
    bucket = int(time.time()) // window_s
    try:
        res = table(settings().idempotency_table).update_item(
            Key={"pk": f"rate#{key}#{bucket}"},
            UpdateExpression="ADD n :one SET #t = if_not_exists(#t, :ttl)",
            ExpressionAttributeNames={"#t": "ttl"},
            ExpressionAttributeValues={":one": 1, ":ttl": int(time.time()) + window_s * 2},
            ReturnValues="UPDATED_NEW",
        )
        return int(res["Attributes"]["n"]) <= limit
    except ClientError:
        return True  # never block a user because the limiter failed


# ---------------- Users ----------------
def get_user(user_hash: str) -> dict | None:
    item = table(settings().users_table).get_item(Key={"pk": f"user#{user_hash}"}).get("Item")
    return from_dynamo(item) if item else None


def put_user(user_hash: str, *, channel: str, channel_id: str, lang: str, **extra) -> dict:
    item = {"pk": f"user#{user_hash}", "channel": channel, "channel_id": channel_id, "lang": lang,
            "profile": extra.pop("profile", []), "consent_at": iso(now_ist()), "trust": 1.0, **extra}
    table(settings().users_table).put_item(Item=to_dynamo(item))
    return item


def update_user(user_hash: str, **fields) -> None:
    if not fields:
        return
    names = {f"#{k}": k for k in fields}
    values = {f":{k}": to_dynamo(v) for k, v in fields.items()}
    table(settings().users_table).update_item(
        Key={"pk": f"user#{user_hash}"},
        UpdateExpression="SET " + ", ".join(f"#{k} = :{k}" for k in fields),
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
    )


def delete_everything(user_hash: str) -> dict:
    """STOP: delete the user, subscriptions and conversation history."""
    counts = {"subscriptions": 0, "messages": 0}
    for sub in list_user_subscriptions(user_hash):
        table(settings().subscriptions_table).delete_item(Key={"pk": sub["pk"], "sk": sub["sk"]})
        counts["subscriptions"] += 1
    conv = table(settings().conversations_table)
    resp = conv.query(KeyConditionExpression=Key("pk").eq(f"user#{user_hash}"), ProjectionExpression="pk, sk")
    with conv.batch_writer() as batch:
        for it in resp.get("Items", []):
            batch.delete_item(Key={"pk": it["pk"], "sk": it["sk"]})
            counts["messages"] += 1
    table(settings().users_table).delete_item(Key={"pk": f"user#{user_hash}"})
    return counts


# ---------------- Conversations ----------------
def append_turn(user_hash: str, role: str, text: str) -> None:
    ts = time.time_ns()
    table(settings().conversations_table).put_item(Item={
        "pk": f"user#{user_hash}", "sk": f"msg#{ts:020d}", "role": role, "text": text[:2000],
        "ttl": int(time.time()) + DAY,
    })


def last_turns(user_hash: str, turns: int = 6) -> list[dict]:
    """Last `turns` user+assistant pairs, oldest first, as Strands/Converse messages."""
    resp = table(settings().conversations_table).query(
        KeyConditionExpression=Key("pk").eq(f"user#{user_hash}"), ScanIndexForward=False, Limit=turns * 2)
    items = list(reversed(resp.get("Items", [])))
    msgs = [{"role": it["role"], "content": [{"text": it["text"]}]} for it in items]
    while msgs and msgs[0]["role"] != "user":   # Converse requires starting with a user turn
        msgs.pop(0)
    return msgs


# ---------------- Subscriptions ----------------
def subscribe(user_hash: str, geohash5: str, hazard: str, brief_time: str | None = "05:30") -> None:
    table(settings().subscriptions_table).put_item(Item={
        "pk": f"area#{geohash5}", "sk": f"user#{user_hash}#{hazard}", "user": f"user#{user_hash}",
        "hazard": hazard, "area": geohash5, "brief_time": brief_time or "", "created_at": iso(now_ist()),
    })


def unsubscribe(user_hash: str, hazards: list[str] | None = None) -> int:
    n = 0
    for sub in list_user_subscriptions(user_hash):
        if hazards and sub["hazard"] not in hazards:
            continue
        table(settings().subscriptions_table).delete_item(Key={"pk": sub["pk"], "sk": sub["sk"]})
        n += 1
    return n


def list_user_subscriptions(user_hash: str) -> list[dict]:
    resp = table(settings().subscriptions_table).query(
        IndexName="byUser", KeyConditionExpression=Key("user").eq(f"user#{user_hash}"))
    return [from_dynamo(i) for i in resp.get("Items", [])]


def all_subscriptions() -> list[dict]:
    """Small table (demo scale); a scan per scheduler cycle is fine."""
    t = table(settings().subscriptions_table)
    resp = t.scan()
    items = resp.get("Items", [])
    while "LastEvaluatedKey" in resp:
        resp = t.scan(ExclusiveStartKey=resp["LastEvaluatedKey"])
        items.extend(resp.get("Items", []))
    return [from_dynamo(i) for i in items]


def mark_alerted(pk: str, sk: str, when_iso: str) -> None:
    table(settings().subscriptions_table).update_item(
        Key={"pk": pk, "sk": sk}, UpdateExpression="SET last_alert_at = :t", ExpressionAttributeValues={":t": when_iso})


def get_subscription(pk: str, sk: str) -> dict | None:
    item = table(settings().subscriptions_table).get_item(Key={"pk": pk, "sk": sk}).get("Item")
    return from_dynamo(item) if item else None


# ---------------- Risk cache ----------------
def put_risk_items(items: list[dict]) -> None:
    ttl = int(time.time()) + 2 * DAY
    with table(settings().risk_table).batch_writer(overwrite_by_pkeys=["pk", "sk"]) as batch:
        for it in items:
            batch.put_item(Item=to_dynamo({**it, "ttl": ttl}))


def batch_get_risk(keys: list[tuple[str, str]]) -> list[dict]:
    """BatchGetItem in chunks of 100 using the low-level client."""
    from boto3.dynamodb.types import TypeDeserializer
    deser = TypeDeserializer()
    name = settings().risk_table
    out: list[dict] = []
    for i in range(0, len(keys), 100):
        req = {name: {"Keys": [{"pk": {"S": pk}, "sk": {"S": sk}} for pk, sk in keys[i:i + 100]]}}
        while req:
            resp = client("dynamodb").batch_get_item(RequestItems=req)
            for raw in resp.get("Responses", {}).get(name, []):
                out.append(from_dynamo({k: deser.deserialize(v) for k, v in raw.items()}))
            req = resp.get("UnprocessedKeys") or None
    return out


def get_risk_item(pk: str, sk: str) -> dict | None:
    item = table(settings().risk_table).get_item(Key={"pk": pk, "sk": sk}).get("Item")
    return from_dynamo(item) if item else None


# ---------------- Reports ----------------
def put_report(item: dict) -> None:
    table(settings().reports_table).put_item(Item=to_dynamo(item))


def get_report(report_id: str) -> dict | None:
    item = table(settings().reports_table).get_item(Key={"pk": f"report#{report_id}"}).get("Item")
    return from_dynamo(item) if item else None


def update_report(report_id: str, **fields) -> dict:
    names = {f"#{k}": k for k in fields}
    values = {f":{k}": to_dynamo(v) for k, v in fields.items()}
    resp = table(settings().reports_table).update_item(
        Key={"pk": f"report#{report_id}"},
        UpdateExpression="SET " + ", ".join(f"#{k} = :{k}" for k in fields),
        ExpressionAttributeNames=names, ExpressionAttributeValues=values, ReturnValues="ALL_NEW")
    return from_dynamo(resp["Attributes"])


def reports_by_status(status: str, since_iso: str | None = None, limit: int = 200) -> list[dict]:
    cond = Key("status").eq(status)
    if since_iso:
        cond = cond & Key("created_at").gte(since_iso)
    resp = table(settings().reports_table).query(IndexName="byStatus", KeyConditionExpression=cond,
                                                 ScanIndexForward=False, Limit=limit)
    return [from_dynamo(i) for i in resp.get("Items", [])]


def reports_in_area(geohash5: str, since_iso: str) -> list[dict]:
    resp = table(settings().reports_table).query(
        IndexName="byArea", KeyConditionExpression=Key("geohash5").eq(geohash5) & Key("created_at").gte(since_iso))
    return [from_dynamo(i) for i in resp.get("Items", [])]


def since(hours: float) -> str:
    return iso(now_ist() - timedelta(hours=hours))
