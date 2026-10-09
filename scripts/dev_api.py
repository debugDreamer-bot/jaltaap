"""Local development API: runs the real Lambda handlers behind a tiny HTTP server, with DynamoDB,
S3 and SQS emulated in memory by moto. Forecasts come live from Open-Meteo.

    .venv/bin/python scripts/dev_api.py --port 8787
    VITE_API_URL=http://127.0.0.1:8787 npm run dev   (in web/)

Bedrock is not emulated: /chat works only with real AWS credentials and model access. Without
them the agent falls back to its fixed "data unavailable" reply, which is the correct production
behaviour when the model is down. Development only; never deploy this file.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qsl, urlparse

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "backend" / "tests"))

import boto3  # noqa: E402
from moto import mock_aws  # noqa: E402

import conftest  # noqa: E402,F401  (fake credentials, table helpers, secret overrides)

ROUTES = [
    ("GET", "/health", "public_api", "GET /health"),
    ("GET", "/risk/heat", "public_api", "GET /risk/heat"),
    ("GET", "/risk/flood", "public_api", "GET /risk/flood"),
    ("GET", "/relief", "public_api", "GET /relief"),
    ("GET", "/reports", "public_api", "GET /reports"),
    ("GET", "/replay", "public_api", "GET /replay"),
    ("GET", "/replay/{scenario}", "public_api", "GET /replay/{scenario}"),
    ("POST", "/reports/upload-url", "public_api", "POST /reports/upload-url"),
    ("GET", "/reports/{id}/status", "public_api", "GET /reports/{id}/status"),
    ("POST", "/chat", "chat_api", "POST /chat"),
]


def match(method: str, path: str):
    parts = path.rstrip("/").split("/") or [""]
    for m, pattern, fn, route in ROUTES:
        pp = pattern.split("/")
        if m != method or len(pp) != len(parts):
            continue
        params = {}
        for a, b in zip(pp, parts):
            if a.startswith("{"):
                params[a[1:-1]] = b
            elif a != b:
                break
        else:
            return fn, route, params
    return None


def seed():
    conftest._create_tables(boto3.client("dynamodb", region_name="ap-south-1"))
    s3 = boto3.client("s3", region_name="ap-south-1")
    s3.create_bucket(Bucket=os.environ["BUCKET"], CreateBucketConfiguration={"LocationConstraint": "ap-south-1"})
    for name in ("grid", "hotspots", "relief_points"):
        s3.put_object(Bucket=os.environ["BUCKET"], Key=f"data/{name}.json", Body=(ROOT / "data" / f"{name}.json").read_bytes())
    for f in (ROOT / "backtests" / "outputs" / "replays").glob("*.json"):
        s3.put_object(Bucket=os.environ["BUCKET"], Key=f"replays/{f.name}", Body=f.read_bytes())
    sqs = boto3.client("sqs", region_name="ap-south-1")
    os.environ["INBOUND_QUEUE_URL"] = sqs.create_queue(QueueName="inbound")["QueueUrl"]
    os.environ["ALERT_QUEUE_URL"] = sqs.create_queue(QueueName="alerts")["QueueUrl"]
    # fill RiskCache once, exactly as the hourly scheduler would
    from handlers import risk_refresh
    result = risk_refresh.compute()
    from common import dynamo
    dynamo.put_risk_items(result["items"])
    print(f"seeded RiskCache with {len(result['items'])} items from live Open-Meteo data")


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "content-type, authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")

    def do_OPTIONS(self):  # noqa: N802
        self.send_response(204)
        self._cors()
        self.end_headers()

    def _dispatch(self, method):
        url = urlparse(self.path)
        hit = match(method, url.path)
        if not hit:
            self.send_response(404); self._cors(); self.end_headers(); return  # noqa: E702
        fn, route, params = hit
        length = int(self.headers.get("content-length") or 0)
        body = self.rfile.read(length).decode("utf-8") if length else None
        event = {"routeKey": route, "rawPath": url.path, "pathParameters": params or None,
                 "queryStringParameters": dict(parse_qsl(url.query)) or None, "body": body, "isBase64Encoded": False,
                 "headers": {k.lower(): v for k, v in self.headers.items()},
                 "requestContext": {"http": {"method": method, "sourceIp": self.client_address[0]}}}
        module = __import__(f"handlers.{fn}", fromlist=["handler"])
        res = module.handler(event, conftest.FakeContext(function_name=fn))
        payload = res.get("body") or ""
        self.send_response(res["statusCode"])
        self._cors()
        for k, v in (res.get("headers") or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(payload.encode("utf-8") if isinstance(payload, str) else payload)

    def do_GET(self):  # noqa: N802
        self._dispatch("GET")

    def do_POST(self):  # noqa: N802
        self._dispatch("POST")

    def log_message(self, fmt, *args):
        sys.stderr.write("dev_api %s\n" % (fmt % args))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8787)
    args = ap.parse_args()
    os.environ.setdefault("JALTAAP_SECRET_EVAL_TOKEN", "dev-eval")
    with mock_aws():
        from common import aws as awsmod
        awsmod.reset_cache()
        seed()
        print(f"JalTaap dev API on http://127.0.0.1:{args.port}  (moto; Ctrl-C to stop)")
        ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
