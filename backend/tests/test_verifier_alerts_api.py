import io
import json
from datetime import timedelta

import boto3
import pytest
from PIL import Image

from common import dynamo, i18n
from common.ids import iso, now_ist
from common.vision import parse_verdict

GOOD = {"relevant": True, "hazard_type": "waterlogging", "water_depth": "knee", "vehicles_stalled": True,
        "electrical_hazard_visible": False, "people_at_risk_visible": False, "severity": 3, "confidence": 0.82,
        "summary_en": "Knee-deep water under the underpass.", "summary_hi": "अंडरपास के नीचे घुटनों तक पानी।"}


class FakeBedrock:
    def __init__(self, outputs):
        self.outputs, self.calls = list(outputs), 0

    def converse(self, **kw):
        self.calls += 1
        text = self.outputs.pop(0)
        return {"output": {"message": {"content": [{"text": text}]}}}


def test_parse_verdict_valid_and_extra_text():
    assert parse_verdict("Sure! " + json.dumps(GOOD)).water_depth == "knee"


@pytest.mark.parametrize("bad", ["not json", json.dumps({**GOOD, "confidence": 1.5}),
                                 json.dumps({**GOOD, "hazard_type": "fire"}), json.dumps({**GOOD, "extra": 1})])
def test_parse_verdict_rejects(bad):
    with pytest.raises(Exception):
        parse_verdict(bad)


def _jpeg(exif_time=None):
    img = Image.new("RGB", (800, 600), (40, 90, 140))
    for x in range(0, 800, 40):
        for y in range(0, 600, 40):
            img.putpixel((x, y), (255, 255, 255))
    buf = io.BytesIO()
    if exif_time:
        exif = Image.Exif()
        exif[306] = exif_time   # DateTime
        img.save(buf, "JPEG", exif=exif)
    else:
        img.save(buf, "JPEG")
    return buf.getvalue()


def _report(rid="R1", lat=28.6611, lon=77.1500, channel="web"):
    from common.geo import geohash, geohash_decode
    item = {"pk": f"report#{rid}", "report_id": rid, "user_hash": "u1", "channel": channel,
            "s3_key": f"reports/raw/2026/07/09/{rid}.jpg", "lat": lat, "lon": lon,
            "geohash7": geohash(lat, lon, 7), "geohash5": geohash(lat, lon, 5),
            "status": "pending", "created_at": iso(now_ist())}
    dynamo.put_report(item)
    return item


def _put(key, body):
    boto3.client("s3", region_name="ap-south-1").put_object(Bucket="jaltaap-test-bucket", Key=key, Body=body)


def test_verified_report_sets_status_thumbnail_and_agency(aws, sent):
    from handlers.verifier import verify
    r = _report()
    _put(r["s3_key"], _jpeg())
    br = FakeBedrock([json.dumps(GOOD)])
    out = verify("jaltaap-test-bucket", r["s3_key"], bedrock=br)
    assert out["status"] == "verified"
    saved = dynamo.get_report("R1")
    assert saved["status"] == "verified" and saved["verdict"]["water_depth"] == "knee"
    assert saved["agency"] in ("PWD", "MCD")
    thumb = boto3.client("s3", region_name="ap-south-1").get_object(Bucket="jaltaap-test-bucket", Key=saved["thumb_key"])
    assert "exif" not in Image.open(io.BytesIO(thumb["Body"].read())).info


def test_malformed_twice_goes_to_needs_review(aws, sent):
    from handlers.verifier import verify
    r = _report("R2")
    _put(r["s3_key"], _jpeg())
    br = FakeBedrock(["nonsense", "still nonsense"])
    assert verify("jaltaap-test-bucket", r["s3_key"], bedrock=br)["status"] == "needs_review"
    assert br.calls == 2


def test_retry_then_valid(aws, sent):
    from handlers.verifier import verify
    r = _report("R3")
    _put(r["s3_key"], _jpeg())
    br = FakeBedrock(["oops", json.dumps(GOOD)])
    assert verify("jaltaap-test-bucket", r["s3_key"], bedrock=br)["status"] == "verified"


def test_low_confidence_is_not_verified(aws, sent):
    from handlers.verifier import verify
    r = _report("R4")
    _put(r["s3_key"], _jpeg())
    out = verify("jaltaap-test-bucket", r["s3_key"], bedrock=FakeBedrock([json.dumps({**GOOD, "confidence": 0.5})]))
    assert out["status"] == "needs_review"


def test_old_exif_rejected(aws, sent):
    from handlers.verifier import verify
    r = _report("R5")
    old = (now_ist() - timedelta(hours=8)).strftime("%Y:%m:%d %H:%M:%S")
    _put(r["s3_key"], _jpeg(old))
    br = FakeBedrock([json.dumps(GOOD)])
    assert verify("jaltaap-test-bucket", r["s3_key"], bedrock=br) == {"status": "rejected", "reason": "reason_old"}
    assert br.calls == 0


def test_duplicate_photo_rejected(aws, sent):
    from handlers.verifier import verify
    a, b = _report("R6"), _report("R7")
    _put(a["s3_key"], _jpeg())
    _put(b["s3_key"], _jpeg())
    verify("jaltaap-test-bucket", a["s3_key"], bedrock=FakeBedrock([json.dumps(GOOD)]))
    assert verify("jaltaap-test-bucket", b["s3_key"], bedrock=FakeBedrock([json.dumps(GOOD)]))["reason"] == "reason_duplicate"


# ---- alert sender: at most once per hazard per area per 6 hours ----
def test_alert_dedupe(aws, sent):
    from handlers.alert_sender import deliver
    dynamo.put_user("u9", channel="telegram", channel_id="99", lang="en")
    dynamo.subscribe("u9", "ttnfv", "heat")
    msg = {"user_hash": "u9", "hazard": "heat", "area": "ttnfv", "template_key": "alert_heat",
           "params": {"band": "ORANGE", "avoid_windows": [{"from": "11:00", "to": "16:00"}],
                      "updated_at": "2026-05-22T05:00:00+05:30"}}
    assert deliver(msg) == "sent"
    assert deliver(msg) == "deduped"
    assert "ORANGE" in sent[0][2] and "11:00–16:00" in sent[0][2] and sent[0][2].endswith("Data: Open-Meteo, 05:00 IST")


def test_alert_skipped_after_unsubscribe(aws, sent):
    from handlers.alert_sender import deliver
    msg = {"user_hash": "nobody", "hazard": "flood", "area": "ttnfv", "template_key": "alert_flood",
           "params": {"spot": "X", "level": "HIGH", "agency": "PWD", "updated_at": "2026-07-09T06:00:00+05:30"}}
    assert deliver(msg) == "unsubscribed" and sent == []


# ---- public and officer APIs ----
def _http(route, ctx_, body=None, query=None, path=None, claims=None):
    ev = {"routeKey": route, "queryStringParameters": query, "pathParameters": path,
          "body": json.dumps(body) if body is not None else None, "headers": {},
          "requestContext": {"http": {"sourceIp": "1.2.3.4"}}}
    if claims is not None:
        ev["requestContext"]["authorizer"] = {"jwt": {"claims": claims}}
    return ev


def test_health_and_unknown_route(aws, ctx):
    from handlers.public_api import handler
    assert json.loads(handler(_http("GET /health", ctx), ctx)["body"])["status"] == "ok"
    assert handler(_http("GET /nope", ctx), ctx)["statusCode"] == 404


def test_risk_heat_from_snapshot_all_cities_and_one_city(aws, ctx):
    from common.ids import hour_iso
    from handlers.public_api import handler
    from handlers.risk_refresh import pack
    from risk.grid import cells
    hour = hour_iso(now_ist())
    row = {"band": "YELLOW", "temp_c": 37.5, "rh": 30, "wet_bulb_c": 24.0, "rain_next_3h_mm": 0.0, "area_flood_level": "LOW"}
    dynamo.put_risk_items([{"pk": "heatgrid", "sk": hour, "cells": {c["id"]: pack(row) for c in cells()}},
                           {"pk": "meta#heat", "sk": "latest", "hours_available": [hour], "data_updated_at": hour}])
    body = json.loads(handler(_http("GET /risk/heat", ctx), ctx)["body"])
    assert len(body["cells"]) == len(cells()) and body["cells"][0]["band"] == "YELLOW" and body["data_updated_at"] == hour
    assert body["cells"][0]["area_flood_level"] == "LOW" and body["cells"][0]["city"] == "delhi"
    mumbai = json.loads(handler(_http("GET /risk/heat", ctx, query={"city": "mumbai"}), ctx)["body"])
    assert len(mumbai["cells"]) == 9 and {c["city"] for c in mumbai["cells"]} == {"mumbai"}
    assert handler(_http("GET /risk/heat", ctx, query={"city": "atlantis"}), ctx)["statusCode"] == 400


def test_cities_index(aws, ctx):
    from handlers.public_api import handler
    body = json.loads(handler(_http("GET /cities", ctx), ctx)["body"])
    ids = [c["id"] for c in body["cities"]]
    assert ids[0] == "delhi" and "mumbai" in ids and len(body["cities"][1]["bounds"]) == 4


def test_replay_name_is_validated(aws, ctx):
    from handlers.public_api import handler
    assert handler(_http("GET /replay/{scenario}", ctx, path={"scenario": "../etc"}), ctx)["statusCode"] == 404
    _put("replays/heat-2026-05-22.json", b'{"scenario":"heat-2026-05-22"}')
    res = handler(_http("GET /replay/{scenario}", ctx, path={"scenario": "heat-2026-05-22"}), ctx)
    assert res["statusCode"] == 200 and json.loads(res["body"])["scenario"] == "heat-2026-05-22"


def test_upload_url_rejects_outside_india_and_creates_pending(aws, ctx):
    from handlers.public_api import handler
    bad = handler(_http("POST /reports/upload-url", ctx, body={"session_id": "abcdefgh12", "lat": 51.5, "lon": -0.12}), ctx)
    assert bad["statusCode"] == 400
    ok = json.loads(handler(_http("POST /reports/upload-url", ctx,
                                  body={"session_id": "abcdefgh12", "lat": 28.66, "lon": 77.15}), ctx)["body"])
    assert ok["upload_url"].startswith("https://") and dynamo.get_report(ok["report_id"])["status"] == "pending"


def test_officer_only_owning_agency(aws, ctx):
    from handlers.officer_api import handler
    _report("R8")
    dynamo.update_report("R8", status="verified", agency="PWD")
    pwd = {"cognito:groups": "[officers]", "custom:agency": "PWD"}
    mcd = {"cognito:groups": "[officers]", "custom:agency": "MCD"}
    assert handler(_http("GET /officer/reports", ctx, claims={}), ctx)["statusCode"] == 403
    listed = json.loads(handler(_http("GET /officer/reports", ctx, claims=pwd), ctx)["body"])
    assert [r["id"] for r in listed["reports"]] == ["R8"]
    assert handler(_http("PATCH /reports/{id}", ctx, body={"status": "resolved"}, path={"id": "R8"}, claims=mcd), ctx)["statusCode"] == 403
    res = handler(_http("PATCH /reports/{id}", ctx, body={"status": "resolved"}, path={"id": "R8"}, claims=pwd), ctx)
    assert json.loads(res["body"])["report"]["status"] == "resolved"
    assert handler(_http("GET /briefs/{agency}", ctx, path={"agency": "MCD"}, claims=pwd), ctx)["statusCode"] == 403


def test_brief_drops_invented_report_ids(aws):
    from handlers.officer_api import build_brief
    _report("R9")
    dynamo.update_report("R9", status="verified", agency="PWD")
    fake = FakeBedrock([json.dumps({"actions": [
        {"n": 1, "spot": "Zakhira", "evidence": "1 report", "ask": "Send a pump", "report_ids": ["R9"]},
        {"n": 2, "spot": "Made up", "evidence": "?", "ask": "?", "report_ids": ["FAKE"]}]})])
    brief = build_brief("PWD", bedrock=fake)
    assert [a["report_ids"] for a in brief["actions"]] == [["R9"]]


def test_consent_copy_exists_in_all_languages():
    for lang in ("hi", "hinglish", "en"):
        assert "STOP" in i18n.t("consent", lang)


def test_dhash_is_stable_under_recompression_and_differs_for_other_images():
    import random

    from common import photo
    rnd = random.Random(7)
    scene = Image.new("RGB", (800, 600))
    scene.putdata([(rnd.randrange(256),) * 3 for _ in range(800 * 600)])
    scene = scene.resize((40, 30)).resize((800, 600))          # blocky texture with left-right structure
    flipped = scene.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    a = photo.open_image(photo.for_model(scene))
    recompressed = photo.open_image(photo.for_model(a))
    assert photo.hamming(photo.phash(a), photo.phash(recompressed)) <= 4
    assert photo.hamming(photo.phash(a), photo.phash(flipped)) > 20


def test_low_trust_reporter_needs_review(aws, sent):
    from handlers.verifier import verify
    dynamo.put_user("u1", channel="telegram", channel_id="1", lang="en")
    dynamo.update_user("u1", trust=0.5)
    r = _report("R10", channel="telegram")
    _put(r["s3_key"], _jpeg())
    out = verify("jaltaap-test-bucket", r["s3_key"], bedrock=FakeBedrock([json.dumps(GOOD)]))
    assert out["status"] == "needs_review" and out["confidence"] == 0.41
