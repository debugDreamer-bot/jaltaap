import os
from dataclasses import dataclass

import boto3
import pytest

os.environ.update({
    "AWS_ACCESS_KEY_ID": "testing", "AWS_SECRET_ACCESS_KEY": "testing", "AWS_SESSION_TOKEN": "testing",
    "AWS_DEFAULT_REGION": "ap-south-1", "AWS_REGION": "ap-south-1",
    "POWERTOOLS_TRACE_DISABLED": "true", "POWERTOOLS_METRICS_NAMESPACE": "JalTaap",
    "BUCKET": "jaltaap-test-bucket", "MODEL_ID": "test-model", "FALLBACK_MODEL_ID": "test-fallback",
    "JALTAAP_SECRET_HASH_SALT": "salt", "JALTAAP_SECRET_WHATSAPP_APP_SECRET": "app-secret",
    "JALTAAP_SECRET_WHATSAPP_VERIFY_TOKEN": "verify-me", "JALTAAP_SECRET_TELEGRAM_SECRET_TOKEN": "tg-secret",
    "JALTAAP_SECRET_WHATSAPP_TOKEN": "wa-token", "JALTAAP_SECRET_WHATSAPP_PHONE_NUMBER_ID": "123",
    "JALTAAP_SECRET_TELEGRAM_BOT_TOKEN": "tg-token",
})


@dataclass
class FakeContext:
    function_name: str = "test-fn"
    memory_limit_in_mb: int = 256
    invoked_function_arn: str = "arn:aws:lambda:ap-south-1:123456789012:function:test-fn"
    aws_request_id: str = "req-1"


@pytest.fixture
def ctx():
    return FakeContext()


def _create_tables(ddb):
    simple = lambda name, keys: ddb.create_table(  # noqa: E731
        TableName=name, BillingMode="PAY_PER_REQUEST",
        KeySchema=[{"AttributeName": k, "KeyType": t} for k, t in keys],
        AttributeDefinitions=[{"AttributeName": k, "AttributeType": "S"} for k, _ in keys])
    simple("jaltaap-users", [("pk", "HASH")])
    simple("jaltaap-idempotency", [("pk", "HASH")])
    simple("jaltaap-risk", [("pk", "HASH"), ("sk", "RANGE")])
    simple("jaltaap-conversations", [("pk", "HASH"), ("sk", "RANGE")])
    ddb.create_table(
        TableName="jaltaap-subscriptions", BillingMode="PAY_PER_REQUEST",
        KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}, {"AttributeName": "sk", "KeyType": "RANGE"}],
        AttributeDefinitions=[{"AttributeName": a, "AttributeType": "S"} for a in ("pk", "sk", "user")],
        GlobalSecondaryIndexes=[{"IndexName": "byUser", "KeySchema": [{"AttributeName": "user", "KeyType": "HASH"}],
                                 "Projection": {"ProjectionType": "ALL"}}])
    ddb.create_table(
        TableName="jaltaap-reports", BillingMode="PAY_PER_REQUEST",
        KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}],
        AttributeDefinitions=[{"AttributeName": a, "AttributeType": "S"} for a in ("pk", "status", "created_at", "geohash5")],
        GlobalSecondaryIndexes=[
            {"IndexName": "byStatus", "KeySchema": [{"AttributeName": "status", "KeyType": "HASH"},
                                                    {"AttributeName": "created_at", "KeyType": "RANGE"}],
             "Projection": {"ProjectionType": "ALL"}},
            {"IndexName": "byArea", "KeySchema": [{"AttributeName": "geohash5", "KeyType": "HASH"},
                                                  {"AttributeName": "created_at", "KeyType": "RANGE"}],
             "Projection": {"ProjectionType": "ALL"}}])


@pytest.fixture
def aws():
    from moto import mock_aws

    from common import aws as awsmod, refdata, secrets
    with mock_aws():
        awsmod.reset_cache()
        secrets.clear()
        refdata.clear()
        _create_tables(boto3.client("dynamodb", region_name="ap-south-1"))
        boto3.client("s3", region_name="ap-south-1").create_bucket(
            Bucket="jaltaap-test-bucket", CreateBucketConfiguration={"LocationConstraint": "ap-south-1"})
        sqs = boto3.client("sqs", region_name="ap-south-1")
        os.environ["INBOUND_QUEUE_URL"] = sqs.create_queue(QueueName="inbound")["QueueUrl"]
        os.environ["ALERT_QUEUE_URL"] = sqs.create_queue(QueueName="alerts")["QueueUrl"]
        yield
        awsmod.reset_cache()


@pytest.fixture
def sent(monkeypatch):
    """Capture outbound channel messages instead of calling WhatsApp/Telegram."""
    out = []
    from common import channels
    monkeypatch.setattr(channels, "send", lambda ch, cid, text: out.append((ch, cid, text)))
    return out
