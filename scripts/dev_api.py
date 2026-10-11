"""Local development API: runs the real Lambda handlers behind a tiny HTTP server, with DynamoDB,
S3 and SQS emulated in memory by moto. Forecasts come live from Open-Meteo.

    .venv/bin/python scripts/dev_api.py --port 8787
    VITE_API_URL=http://127.0.0.1:8787 npm run dev   (in web/)

The agent runs on a free local Ollama model by default (`ollama pull qwen3.5:9b`), because moto
cannot emulate Bedrock. With JALTAAP_SECRET_TELEGRAM_BOT_TOKEN set (shell or a gitignored .env),
`--telegram` long-polls the bot and feeds each message to the real worker: no deploy or public URL.
Development only; never deploy this file.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qsl, urlparse

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "backend" / "tests"))

# Real dev values that must win over conftest's test defaults (it sets a fake bot token).
DEV_KEYS = ("LLM_PROVIDER", "MODEL_ID", "OLLAMA_HOST", "JALTAAP_SECRET_TELEGRAM_BOT_TOKEN")


def _dev_env() -> dict:
    found = {}
    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            key, sep, value = line.strip().partition("=")
            if sep and key in DEV_KEYS:
                found[key] = value.strip().strip("\"'")
    found.update({k: os.environ[k] for k in DEV_KEYS if os.environ.get(k)})
    return found


DEV_ENV = _dev_env()

import boto3  # noqa: E402
from moto import mock_aws  # noqa: E402

import conftest  # noqa: E402,F401  (fake credentials, table helpers, secret overrides)

ROUTES = [
    ("GET", "/health", "public_api", "GET /health"),
    ("GET", "/risk/heat", "public_api", "GET /risk/heat"),
    ("GET", "/risk/flood", "public_api", "GET /risk/flood"),
    ("GET", "/cities", "public_api", "GET /cities"),
    ("GET", "/water-issues", "public_api", "GET /water-issues"),
    ("GET", "/crew", "public_api", "GET /crew"),
    ("GET", "/now", "public_api", "GET /now"),
    ("GET", "/speak", "public_api", "GET /speak"),
    ("GET", "/relief", "public_api", "GET /relief"),
    ("GET", "/reports", "public_api", "GET /reports"),
    ("GET", "/replay", "public_api", "GET /replay"),
    ("GET", "/replay/{scenario}", "public_api", "GET /replay/{scenario}"),
    ("POST", "/reports/upload-url", "public_api", "POST /reports/upload-url"),
    ("GET", "/reports/{id}/status", "public_api", "GET /reports/{id}/status"),
    ("POST", "/chat", "chat_api", "POST /chat"),
    # officer routes: API Gateway's Cognito JWT authorizer is stood in for by a signed dev token
    ("GET", "/officer/reports", "officer_api", "GET /officer/reports"),
    ("PATCH", "/reports/{id}", "officer_api", "PATCH /reports/{id}"),
    ("GET", "/briefs/{agency}", "officer_api", "GET /briefs/{agency}"),
    ("GET", "/officer/agencies", "officer_api", "GET /officer/agencies"),
    ("POST", "/dev/login", "dev_login", "POST /dev/login"),
]

# ---------------- development-only officer sign-in ----------------
# Stands in for Amazon Cognito so the officer view can be tried locally. Never deployed: this file
# is not in the Lambda package, and the web app only offers it in `vite dev` without Cognito settings.
import base64 as _b64  # noqa: E402
import hashlib as _hashlib  # noqa: E402
import hmac as _hmac  # noqa: E402
import secrets as _secrets  # noqa: E402

DEV_SECRET = _secrets.token_bytes(32)          # new every run: tokens die with the dev server
DEMO_PASSWORD = "JalTaap@2026"
DEMO_ACCOUNTS = {
    "pwd@demo.jaltaap.in": {"custom:agency": "PWD", "custom:city": "delhi", "cognito:groups": ["officers"]},
    "mcd@demo.jaltaap.in": {"custom:agency": "MCD", "custom:city": "delhi", "cognito:groups": ["officers"]},
    "djb@demo.jaltaap.in": {"custom:agency": "DJB", "custom:city": "delhi", "cognito:groups": ["officers"]},
    "bmc@demo.jaltaap.in": {"custom:agency": "BMC", "custom:city": "mumbai", "cognito:groups": ["officers"]},
    "control@demo.jaltaap.in": {"custom:city": "delhi", "cognito:groups": ["control_room"]},
}


def _sign(claims: dict) -> str:
    body = _b64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    sig = _hmac.new(DEV_SECRET, body.encode(), _hashlib.sha256).hexdigest()
    return f"{body}.{sig}"


def _verify(token: str) -> dict | None:
    try:
        body, sig = token.split(".")
    except ValueError:
        return None
    if not _hmac.compare_digest(sig, _hmac.new(DEV_SECRET, body.encode(), _hashlib.sha256).hexdigest()):
        return None
    return json.loads(_b64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))


def dev_login(body: str | None) -> dict:
    try:
        req = json.loads(body or "{}")
    except ValueError:
        req = {}
    user = str(req.get("username", "")).strip().lower()
    if user not in DEMO_ACCOUNTS or not _hmac.compare_digest(str(req.get("password", "")), DEMO_PASSWORD):
        return {"statusCode": 401, "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "wrong email or password", "status": 401})}
    claims = {"sub": f"dev-{user}", "email": user, **DEMO_ACCOUNTS[user]}
    return {"statusCode": 200, "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"token": _sign(claims), "claims": claims})}


def seed_demo_reports() -> None:
    """A few reports so the officer queue has something to act on (no photos: S3 is in-process)."""
    from common import dynamo
    from common.geo import geohash
    from common.ids import iso, now_ist
    from datetime import timedelta
    now = now_ist()
    demo = [
        ("DEMO-PWD-1", 28.66763, 77.16744, "PWD", "verified", "flood", None, "hs_zakhira", 0.88,
         {"hazard_type": "waterlogging", "water_depth": "knee", "severity": 3, "summary_en": "Knee-deep water under the Zakhira underpass; two cars stalled.",
          "summary_hi": "ज़खीरा अंडरपास के नीचे घुटनों तक पानी, दो गाड़ियाँ फँसी।"}, 0.6),
        ("DEMO-PWD-2", 28.63345, 77.22667, "PWD", "needs_review", "flood", None, "hs_minto_bridge", 0.55,
         {"hazard_type": "waterlogging", "water_depth": "unknown", "severity": 2, "summary_en": "Unclear photo near Minto Bridge; possible pooling.",
          "summary_hi": "मिंटो ब्रिज के पास फ़ोटो साफ़ नहीं, शायद पानी जमा।"}, 1.5),
        ("DEMO-MCD-1", 28.6519, 77.1909, "MCD", "verified", "flood", None, "", 0.81,
         {"hazard_type": "waterlogging", "water_depth": "ankle", "severity": 2, "summary_en": "Ankle-deep water across a colony lane in Karol Bagh.",
          "summary_hi": "करोल बाग की गली में टखने तक पानी।"}, 2.2),
        ("DEMO-DJB-1", 28.5794, 77.0471, "DJB", "corroborated", "water", "tanker_no_show", "", None, None, 1.0),
        ("DEMO-DJB-2", 28.6311, 77.2201, "DJB", "verified", "water", "leak", "", 0.9,
         {"hazard_type": "pipe_leak", "water_depth": "none", "severity": 3, "summary_en": "Water gushing from a broken main on the footpath.",
          "summary_hi": "फ़ुटपाथ पर टूटी पाइपलाइन से पानी बह रहा है।"}, 3.0),
        ("DEMO-BMC-1", 19.1197, 72.8468, "BMC", "verified", "flood", None, "hs_mumbai_andheri_subway", 0.93,
         {"hazard_type": "waterlogging", "water_depth": "waist_or_more", "severity": 5, "summary_en": "Andheri subway flooded waist-deep; closed to traffic.",
          "summary_hi": "अंधेरी सबवे में कमर तक पानी; यातायात बंद।"}, 0.4),
    ]
    for rid, lat, lon, agency, status, cat, issue, hs, conf, verdict, hours_ago in demo:
        item = {"pk": f"report#{rid}", "report_id": rid, "user_hash": "demo", "channel": "telegram", "lat": lat, "lon": lon,
                "geohash7": geohash(lat, lon, 7), "geohash6": geohash(lat, lon, 6), "geohash5": geohash(lat, lon, 5),
                "status": status, "agency": agency, "category": cat, "hotspot_id": hs,
                "source": "text" if verdict is None else "photo", "created_at": iso(now - timedelta(hours=hours_ago))}
        if issue:
            item["issue"] = issue
        if conf is not None:
            item["confidence"] = conf
        if verdict:
            item["verdict"] = verdict
        if status == "corroborated":
            item.update(corroborations=4, note="Tanker did not come for 3 days")
        dynamo.put_report(item)


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
    seed_demo_reports()


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
        if fn == "dev_login":
            return self._send(dev_login(body))
        claims = None
        if fn == "officer_api":
            auth = self.headers.get("authorization") or ""
            claims = _verify(auth.removeprefix("Bearer ").strip()) if auth.startswith("Bearer ") else None
            if claims is None:   # what API Gateway's JWT authorizer does with a bad token
                return self._send({"statusCode": 401, "headers": {"Content-Type": "application/json"},
                                   "body": json.dumps({"message": "Unauthorized"})})
        event = {"routeKey": route, "rawPath": url.path, "pathParameters": params or None,
                 "queryStringParameters": dict(parse_qsl(url.query)) or None, "body": body, "isBase64Encoded": False,
                 "headers": {k.lower(): v for k, v in self.headers.items()},
                 "requestContext": {"http": {"method": method, "sourceIp": self.client_address[0]}}}
        if claims is not None:
            event["requestContext"]["authorizer"] = {"jwt": {"claims": claims}}
        module = __import__(f"handlers.{fn}", fromlist=["handler"])
        res = module.handler(event, conftest.FakeContext(function_name=fn))
        self._send(res)

    def _send(self, res: dict) -> None:
        payload = res.get("body") or ""
        if res.get("isBase64Encoded"):   # binary responses (GET /speak audio)
            import base64
            payload = base64.b64decode(payload)
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

    def do_PATCH(self):  # noqa: N802
        self._dispatch("PATCH")

    def log_message(self, fmt, *args):
        sys.stderr.write("dev_api %s\n" % (fmt % args))


def poll_telegram(token: str) -> None:
    """Free local stand-in for TelegramWebhookFn + SQS: long-poll getUpdates, run the real worker."""
    import httpx
    from common import dynamo
    from common.channels import telegram
    from handlers import worker
    api = f"https://api.telegram.org/bot{token}"
    try:
        me = httpx.get(f"{api}/getMe", timeout=15).json()
    except httpx.HTTPError as err:
        print(f"Telegram: could not reach api.telegram.org ({err!r}); bot not started")
        return
    if not me.get("ok"):
        print(f"Telegram: token rejected ({me.get('description')}); bot not started")
        return
    httpx.post(f"{api}/deleteWebhook", timeout=15)   # getUpdates is refused while a webhook is set
    print(f"Telegram bot @{me['result']['username']} is live: open https://t.me/{me['result']['username']}")
    offset = None
    while True:
        try:
            r = httpx.get(f"{api}/getUpdates", timeout=70,
                          params={"timeout": 50, "offset": offset, "allowed_updates": '["message", "edited_message"]'})
            updates = r.json().get("result", [])
        except (httpx.HTTPError, ValueError) as err:
            sys.stderr.write(f"telegram poll failed: {err!r}; retrying\n")
            time.sleep(5)
            continue
        for update in updates:
            offset = update["update_id"] + 1
            for msg in telegram.parse_update(update):
                if not dynamo.claim_message("telegram", msg.message_id):
                    continue
                try:   # the local model is slow; show "typing…" while it works (live moves skip the model)
                    if msg.live != "update":
                        httpx.post(f"{api}/sendChatAction", json={"chat_id": msg.channel_user_id, "action": "typing"},
                                   timeout=10)
                    worker.process(msg)
                except Exception:  # noqa: BLE001 - keep polling; the deployed worker would retry via SQS
                    traceback.print_exc()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8787)
    ap.add_argument("--llm", choices=("ollama", "bedrock"), default=DEV_ENV.get("LLM_PROVIDER", "ollama"),
                    help="ollama (free, local) or bedrock (needs real AWS; moto cannot emulate it)")
    ap.add_argument("--model", default=DEV_ENV.get("MODEL_ID", "qwen3.5:9b"), help="Ollama model name")
    ap.add_argument("--telegram", action="store_true", help="run the Telegram bot by long polling")
    args = ap.parse_args()
    os.environ.setdefault("JALTAAP_SECRET_EVAL_TOKEN", "dev-eval")
    os.environ.update(DEV_ENV)
    if args.llm == "ollama":
        os.environ.update(LLM_PROVIDER="ollama", MODEL_ID=args.model, FALLBACK_MODEL_ID="")
    token = DEV_ENV.get("JALTAAP_SECRET_TELEGRAM_BOT_TOKEN")
    if args.telegram and not token:
        sys.exit("--telegram needs JALTAAP_SECRET_TELEGRAM_BOT_TOKEN (from @BotFather) in the shell or .env")
    with mock_aws():
        from common import aws as awsmod
        awsmod.reset_cache()
        seed()
        print(f"JalTaap dev API on http://127.0.0.1:{args.port}  (moto; Ctrl-C to stop)")
        print(f"Agent model: {args.llm} {os.environ['MODEL_ID']}")
        print(f"Dev officer sign-in: {', '.join(DEMO_ACCOUNTS)} / password {DEMO_PASSWORD}")
        if args.telegram:
            threading.Thread(target=poll_telegram, args=(token,), daemon=True).start()
        ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
