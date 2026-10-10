"""Pan-India coverage, crew schedules, water-access reports, Cedar officer permissions and voice."""
import io
import json

import boto3
import pytest

from common import dynamo, i18n
from common.ids import iso, now_ist


# ---------------------------------------------------------------- area rain (any city, any pin)
@pytest.mark.parametrize("n1,n3,l24,level", [
    (0, 0, 0, "LOW"),
    (5, 5, 0, "LOW"),          # 0.6 x 0.25 = 0.15
    (10, 10, 0, "MEDIUM"),     # 0.6 x 0.50 = 0.30
    (20, 20, 0, "MEDIUM"),     # 0.6 x 0.75 = 0.45
    (35, 35, 0, "HIGH"),       # 0.6 x 1.00 = 0.60
    (35, 60, 70, "HIGH"),      # + antecedent 0.10 = 0.70, still below SEVERE
])
def test_area_rain_level_never_reaches_severe(n1, n3, l24, level):
    from risk.flood import score_area
    assert score_area(rain_next_1h_mm=n1, rain_next_3h_mm=n3, rain_last_24h_mm=l24)["level"] == level


# ---------------------------------------------------------------- crew schedule
def _plan(bands: dict[int, str], heavy_windows, noon_pause=None):
    hours = [{"time": f"2026-05-22T{h:02d}:00", "temp_c": 40.0, "rh": 20, "wet_bulb_c": 24.0, "band": bands.get(h, "GREEN")}
             for h in range(24)]
    return {"location": {"lat": 28.6, "lon": 77.2, "label": "Test"}, "date": "2026-05-22", "source": "open-meteo",
            "data_updated_at": "2026-05-22T05:00:00+05:30", "hours": hours, "heavy_work_windows": heavy_windows,
            "noon_pause": noon_pause}


def test_crew_schedule_follows_heavy_windows_noon_pause_and_red():
    from risk.crew import crew_schedule
    bands = {h: "ORANGE" for h in range(11, 17)} | {13: "RED", 14: "RED"}
    plan = _plan(bands, [{"from": "06:00", "to": "11:00"}, {"from": "17:00", "to": "20:00"}],
                 noon_pause={"from": "12:00", "to": "15:00"})
    s = crew_schedule(plan, crew_size=20, shift_from="08:00", shift_to="18:00")
    by = {r["time"]: r for r in s["hours"]}
    assert by["08:00"]["activity"] == "heavy" and by["08:00"]["work_min"] == 50
    assert by["12:00"]["activity"] == "light" and by["12:00"]["rest_min"] == 15
    assert by["13:00"]["band"] == "RED" and by["13:00"]["work_min"] == 30 and by["13:00"]["rest_min"] == 30
    assert by["17:00"]["activity"] == "heavy"
    assert s["heavy_work_hours"] == ["08:00", "09:00", "10:00", "17:00"]
    assert s["worst_band"] == "RED" and s["ors_needed"]
    # four rest groups of five for a 15-minute rest, everyone rests in turn
    rot = by["12:00"]["rotation"]
    assert [g["workers"] for g in rot] == [5, 5, 5, 5] and rot[1]["rest"] == ":15-:30"
    # water: 250 ml/h GREEN x 4 + 750 ml/h ORANGE x 4 + 1000 ml/h RED x 2 = 6.0 L per worker
    assert s["water"]["litres_per_worker"] == 6.0 and s["water"]["litres_total"] == 120


def test_crew_schedule_light_only_and_bad_shift():
    from risk.crew import crew_schedule
    plan = _plan({}, [{"from": "06:00", "to": "20:00"}])
    s = crew_schedule(plan, crew_size=3, shift_from="09:00", shift_to="11:00", heavy_work=False)
    assert {r["activity"] for r in s["hours"]} == {"light"} and not s["no_heavy_work"]
    with pytest.raises(ValueError):
        crew_schedule(plan, crew_size=3, shift_from="18:00", shift_to="08:00")


def test_crew_endpoint(aws, ctx, monkeypatch):
    from handlers import public_api
    from risk import service
    monkeypatch.setattr(service, "heat_plan", lambda lat, lon, label, day, profile=None: {
        **_plan({}, [{"from": "06:00", "to": "20:00"}]), "date": day})
    ev = {"routeKey": "GET /crew", "queryStringParameters": {"lat": "19.07", "lon": "72.88", "size": "12"},
          "headers": {}, "requestContext": {"http": {"sourceIp": "9.9.9.9"}}}
    body = json.loads(public_api.handler(ev, ctx)["body"])
    assert body["crew_size"] == 12 and body["city"] == "Mumbai" and body["blocks"]
    ev["queryStringParameters"] = {"lat": "51.5", "lon": "-0.12", "size": "3"}
    assert public_api.handler(ev, ctx)["statusCode"] == 400


# ---------------------------------------------------------------- Cedar
OFFICER = {"id": "o1", "agency": "PWD", "city": "delhi", "groups": ["officers"]}
REPORT = {"report_id": "R1", "agency": "PWD", "status": "verified", "lat": 28.6, "lon": 77.2}


def test_cedar_policies_validate_against_schema():
    import cedarpy
    from common.authz import POLICY_DIR
    res = cedarpy.validate_policies((POLICY_DIR / "reports.cedar").read_text(), (POLICY_DIR / "schema.cedarschema").read_text())
    assert res.validation_passed, res


@pytest.mark.parametrize("officer,action,report,ctx,allowed", [
    (OFFICER, "view", REPORT, None, True),
    ({**OFFICER, "agency": "MCD"}, "view", REPORT, None, False),
    (OFFICER, "resolve", REPORT, None, True),
    (OFFICER, "resolve", {**REPORT, "status": "needs_review"}, None, False),
    (OFFICER, "confirm", {**REPORT, "status": "resolved"}, None, False),
    ({"id": "c1", "agency": "", "city": "delhi", "groups": ["control_room"]}, "view", REPORT, None, True),
    ({"id": "c1", "agency": "", "city": "mumbai", "groups": ["control_room"]}, "view", REPORT, None, False),
    ({"id": "c1", "agency": "", "city": "delhi", "groups": ["control_room"]}, "resolve", REPORT, None, False),
    (OFFICER, "reassign", REPORT, {"to_agency": "MCD", "known_agencies": ["PWD", "MCD"]}, True),
    (OFFICER, "reassign", REPORT, {"to_agency": "PWD", "known_agencies": ["PWD", "MCD"]}, False),
    (OFFICER, "reassign", REPORT, {"to_agency": "ACME", "known_agencies": ["PWD", "MCD"]}, False),
    (OFFICER, "delete", REPORT, None, False),
])
def test_cedar_decisions(officer, action, report, ctx, allowed):
    from common.authz import is_allowed
    assert is_allowed(officer, action, report, ctx) is allowed


def _http(route, body=None, path=None, claims=None, query=None):
    ev = {"routeKey": route, "queryStringParameters": query, "pathParameters": path,
          "body": json.dumps(body) if body is not None else None, "headers": {},
          "requestContext": {"http": {"sourceIp": "1.2.3.4"}}}
    if claims is not None:
        ev["requestContext"]["authorizer"] = {"jwt": {"claims": claims}}
    return ev


def _report(rid, **kw):
    from common.geo import geohash
    lat, lon = kw.pop("lat", 28.6611), kw.pop("lon", 77.15)
    item = {"pk": f"report#{rid}", "report_id": rid, "user_hash": "u1", "channel": "web", "lat": lat, "lon": lon,
            "geohash7": geohash(lat, lon, 7), "geohash5": geohash(lat, lon, 5), "status": "verified",
            "agency": "PWD", "created_at": iso(now_ist()), **kw}
    dynamo.put_report(item)
    return item


def test_officer_reassign_and_resolve_rules(aws, ctx):
    from handlers.officer_api import handler
    pwd = {"cognito:groups": "[officers]", "custom:agency": "PWD"}
    mcd = {"cognito:groups": "[officers]", "custom:agency": "MCD"}
    room = {"cognito:groups": "[control_room]", "custom:city": "delhi"}
    _report("R1")
    _report("R2", status="needs_review")
    # resolving needs evidence
    assert handler(_http("PATCH /reports/{id}", {"status": "resolved"}, {"id": "R2"}, pwd), ctx)["statusCode"] == 403
    # control room sees both but cannot act
    seen = json.loads(handler(_http("GET /officer/reports", claims=room), ctx)["body"])["reports"]
    assert {r["id"] for r in seen} == {"R1", "R2"}
    assert handler(_http("PATCH /reports/{id}", {"status": "confirmed"}, {"id": "R1"}, room), ctx)["statusCode"] == 403
    # PWD hands R1 to MCD; then only MCD can act on it
    res = handler(_http("PATCH /reports/{id}", {"agency": "mcd"}, {"id": "R1"}, pwd), ctx)
    assert res["statusCode"] == 200 and json.loads(res["body"])["report"]["reassigned_from"] == "PWD"
    assert handler(_http("PATCH /reports/{id}", {"status": "resolved"}, {"id": "R1"}, pwd), ctx)["statusCode"] == 403
    assert handler(_http("PATCH /reports/{id}", {"status": "resolved"}, {"id": "R1"}, mcd), ctx)["statusCode"] == 200
    # closed stays closed
    assert handler(_http("PATCH /reports/{id}", {"status": "confirmed"}, {"id": "R1"}, mcd), ctx)["statusCode"] == 403
    # unknown agency and ambiguous bodies are refused
    _report("R3")
    assert handler(_http("PATCH /reports/{id}", {"agency": "ACME"}, {"id": "R3"}, pwd), ctx)["statusCode"] == 403
    assert handler(_http("PATCH /reports/{id}", {"agency": "MCD", "status": "confirmed"}, {"id": "R3"}, pwd), ctx)["statusCode"] == 400


# ---------------------------------------------------------------- water-access reports
def test_text_water_reports_corroborate_after_three_people(aws, ctx):
    from common import water
    from handlers.public_api import handler
    first = water.file_text_report(user_hash="a", channel="telegram", lat=28.6311, lon=77.2201, issue="tanker_no_show")
    assert first["status"] == "unverified" and first["agency"] == "DJB"
    again = water.file_text_report(user_hash="a", channel="telegram", lat=28.6312, lon=77.2202, issue="tanker_no_show")
    assert again["duplicate"] and again["report_id"] == first["report_id"]
    assert json.loads(handler(_http("GET /water-issues"), ctx)["body"])["issues"] == []   # not public yet
    water.file_text_report(user_hash="b", channel="whatsapp", lat=28.6313, lon=77.2203, issue="tanker_no_show")
    third = water.file_text_report(user_hash="c", channel="web", lat=28.6314, lon=77.2204, issue="tanker_no_show")
    assert third["status"] == "corroborated" and third["reporters"] == 3
    assert dynamo.get_report(first["report_id"])["status"] == "corroborated"
    issues = json.loads(handler(_http("GET /water-issues"), ctx)["body"])["issues"]
    assert len(issues) == 1 and issues[0]["reports"] == 3 and issues[0]["issue"] == "tanker_no_show"
    assert "user_hash" not in issues[0] and "note" not in issues[0]
    # stored at the ~1 km cell centre, not the exact point
    assert dynamo.get_report(first["report_id"])["lat"] != 28.6311


def test_water_agency_per_city():
    from common import water
    assert water.water_agency(28.6, 77.2) == "DJB"
    assert water.water_agency(13.08, 80.27) == "CMWSSB"
    assert water.water_agency(31.10, 77.17) == "SJPNL"          # Shimla
    assert water.water_agency(23.5, 78.5) == "LOCAL_WATER"     # rural, no covered city


def test_photo_of_leak_goes_to_water_agency(aws, sent):
    from handlers.verifier import verify
    from tests.test_verifier_alerts_api import GOOD, FakeBedrock, _jpeg, _put, _report as vreport
    r = vreport("W1", lat=19.07, lon=72.88)
    _put(r["s3_key"], _jpeg())
    leak = {**GOOD, "hazard_type": "pipe_leak", "water_depth": "none", "summary_en": "Water gushing from a broken main.",
            "summary_hi": "टूटी पाइपलाइन से पानी बह रहा है।"}
    assert verify("jaltaap-test-bucket", r["s3_key"], FakeBedrock([json.dumps(leak)]))["status"] == "verified"
    got = dynamo.get_report("W1")
    assert got["agency"] == "BMC" and got["category"] == "water" and got["issue"] == "leak" and got["hotspot_id"] == ""


# ---------------------------------------------------------------- tools
def _tools(**kw):
    from agent.tools import UserContext, build_tools
    ctx = UserContext(user_hash="u-test", channel="telegram", lang=kw.pop("lang", "en"), **kw)
    return ctx, {t.tool_name: t for t in build_tools(ctx)}


def test_find_relief_never_points_to_another_city(aws):
    ctx, tools = _tools()
    out = tools["find_relief"](lat=19.07, lon=72.88, kind="cooling")
    assert out["ok"] is False and "112" in out["helplines"]
    near = tools["find_relief"](lat=28.6507, lon=77.2334, kind="cooling")   # Old Delhi
    assert near["ok"] and near["points"][0]["distance_m"] < 25_000


def test_report_water_issue_tool_uses_last_location(aws):
    ctx, tools = _tools(lang="hinglish", last_location={"lat": 12.97, "lon": 77.59, "label": "Bengaluru"})
    out = tools["report_water_issue"](issue="no_supply", note="nal sookhe hain")
    assert out["ok"] and out["agency"] == "BWSSB" and "Bangalore Water Supply" in out["message"]
    assert tools["report_water_issue"](issue="fire")["ok"] is False
    ctx2, tools2 = _tools()
    assert tools2["report_water_issue"](issue="leak")["ok"] is False   # no location yet


def test_flood_risk_outside_delhi_gives_area_level(aws, monkeypatch):
    from agent import tools as toolsmod
    monkeypatch.setattr(toolsmod, "_area_rain", lambda lat, lon: {
        "area": {"level": "HIGH", "rain_next_3h_mm": 62.0, "data_updated_at": "2026-07-09T06:00:00+05:30"},
        "data_updated_at": "2026-07-09T06:00:00+05:30"})
    ctx, tools = _tools()
    out = tools["get_flood_risk"](lat=21.1458, lon=79.0882)      # Nagpur: no listed hotspots
    assert out["ok"] and out["hotspots"] == [] and out["area"]["level"] == "HIGH" and out["city"] == "Nagpur"
    assert out["footer"] == "Data: Open-Meteo, 06:00 IST"


def test_location_helpers_without_network():
    from agent.location import _from_city_name, mentioned_city
    assert mentioned_city("aaj Bombay mein garmi")["id"] == "mumbai"
    assert mentioned_city("चेन्नई में पानी")["id"] == "chennai"
    assert mentioned_city("Saket") is None
    assert _from_city_name("kolkata mein", mentioned_city("kolkata mein"))["label"] == "Kolkata"
    assert _from_city_name("Salt Lake, Kolkata", mentioned_city("Salt Lake, Kolkata")) is None


# ---------------------------------------------------------------- alerts outside Delhi
def test_area_rain_alert_for_subscriber_without_hotspots():
    from common.geo import geohash
    from handlers.risk_refresh import alert_candidates
    area = geohash(19.07, 72.88, 5)
    subs = [{"user": "user#abc", "area": area, "hazard": "flood"}, {"user": "user#abc", "area": area, "hazard": "heat"}]
    cond = {area: {"day_band": "ORANGE", "avoid_windows": [{"from": "12:00", "to": "16:00"}],
                   "heavy_work_windows": [], "area_flood_level": "HIGH", "rain_next_3h_mm": 61.0}}
    out = alert_candidates({"flood_latest": {}, "fetched_at": "2026-07-09T06:00:00+05:30"}, subs, cond)
    assert {m["template_key"] for m in out} == {"alert_rain_area", "alert_heat"}
    from handlers.alert_sender import render
    text = render(next(m for m in out if m["template_key"] == "alert_rain_area"), "en")
    assert "61.0 mm" in text and "HIGH" in text


# ---------------------------------------------------------------- voice
class FakeTranscribe:
    def __init__(self, statuses):
        self.statuses, self.started, self.deleted = list(statuses), [], []

    def start_transcription_job(self, **kw):
        self.started.append(kw)

    def get_transcription_job(self, TranscriptionJobName):
        status = self.statuses.pop(0)
        return {"TranscriptionJob": {"TranscriptionJobStatus": status, "LanguageCode": "hi-IN",
                                     "Transcript": {"TranscriptFileUri": "https://example.test/t.json"}}}

    def delete_transcription_job(self, TranscriptionJobName):
        self.deleted.append(TranscriptionJobName)


class FakeResp:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self.payload


def test_transcribe_polls_until_complete_and_cleans_up(aws):
    from common import voice
    tc = FakeTranscribe(["IN_PROGRESS", "COMPLETED"])
    payload = {"results": {"transcripts": [{"transcript": "कल नजफगढ़ में काम कब करूं"}]}}
    out = voice.transcribe(b"OggS...", "audio/ogg", transcribe_client=tc, http_get=lambda *a, **k: FakeResp(payload),
                           sleep=lambda s: None)
    assert out == {"text": "कल नजफगढ़ में काम कब करूं", "language": "hi-IN"}
    job = tc.started[0]
    assert job["MediaFormat"] == "ogg" and job["LanguageOptions"] == ["hi-IN", "en-IN"] and tc.deleted
    keys = boto3.client("s3", region_name="ap-south-1").list_objects_v2(Bucket="jaltaap-test-bucket").get("KeyCount", 0)
    assert keys == 0   # the voice note is deleted right after transcription
    assert voice.transcribe(b"x", "application/pdf", transcribe_client=tc) is None


def test_speakable_drops_links_and_footer():
    from common.voice import speakable
    text = "Line one.\nGo here https://www.google.com/maps/dir/?api=1&destination=1,2 now.\nData: Open-Meteo, 05:00 IST"
    assert speakable(text) == "Line one.\nGo here now."


def test_worker_voice_note_round_trip(aws, sent, monkeypatch):
    from common import channels, voice
    from common.ids import user_hash
    from common.models import InboundMessage
    from handlers import worker
    monkeypatch.setenv("VOICE_ENABLED", "true")
    dynamo.put_user(user_hash("telegram", "777"), channel="telegram", channel_id="777", lang="hi")
    monkeypatch.setattr(worker, "_download_with_type", lambda msg: (b"OggS", "audio/ogg"))
    monkeypatch.setattr(voice, "transcribe", lambda audio, mime: {"text": "आज गर्मी में काम कब करूं", "language": "hi-IN"})
    monkeypatch.setattr(voice, "synthesize", lambda reply, lang: b"ID3mp3")
    audio_out = []
    monkeypatch.setattr(channels, "send_audio", lambda ch, cid, mp3: audio_out.append((ch, mp3)))
    monkeypatch.setattr(worker, "answer", lambda **kw: {"reply": "सुबह 11 बजे तक काम करें", "tools_called": [],
                                                       "data_updated_at": None, "model_used": "m", "fallback_used": False,
                                                       "latency_ms": 5, "error": None})
    worker.process(InboundMessage(channel="telegram", channel_user_id="777", message_id="v1", type="audio", media_id="f1"))
    assert sent[-1][2].startswith(i18n.t("voice_heard", "hi", text="आज गर्मी में काम कब करूं"))
    assert audio_out == [("telegram", b"ID3mp3")]


def test_voice_disabled_falls_back_to_text_prompt(aws, sent, monkeypatch):
    from common.ids import user_hash
    from common.models import InboundMessage
    from handlers import worker
    monkeypatch.setenv("VOICE_ENABLED", "false")
    dynamo.put_user(user_hash("telegram", "778"), channel="telegram", channel_id="778", lang="hi")
    worker.process(InboundMessage(channel="telegram", channel_user_id="778", message_id="v2", type="audio", media_id="f2"))
    assert sent[-1][2] == i18n.t("voice_not_supported", "hi")


def test_researched_city_hotspots_are_scored_with_their_own_city_cell(aws):
    from common import refdata
    from risk import grid as gridmod
    spots = [h for h in refdata.hotspots() if h.get("city") == "mumbai"]
    assert spots and all(h["source"].startswith("http") and h["needs_check"] for h in spots)
    assert all(gridmod.nearest_cell(h["lat"], h["lon"]) in {c["id"] for c in gridmod.cells("mumbai")} for h in spots)


def test_find_relief_skips_planned_places(aws, monkeypatch):
    from common import refdata
    monkeypatch.setattr(refdata, "relief_points", lambda: [
        {"id": "a", "name": "Planned shed", "kind": "cooling", "status": "planned", "lat": 20.2725, "lon": 85.8339},
        {"id": "b", "name": "Real shelter", "kind": "cooling", "status": "seasonal", "lat": 20.29, "lon": 85.84}])
    _, tools = _tools()
    out = tools["find_relief"](lat=20.2724, lon=85.8338, kind="cooling")
    assert [p["name"] for p in out["points"]] == ["Real shelter"]


def test_officer_brief_falls_back_to_rules_without_bedrock(aws):
    from handlers.officer_api import build_brief

    class Down:
        def converse(self, **kw):
            raise RuntimeError("model unavailable")
    _report("RB1", agency="DJB", category="water", issue="tanker_no_show", status="corroborated", corroborations=4)
    _report("RB2", agency="DJB", category="water", issue="leak",
            verdict={"severity": 4, "summary_en": "Broken main."})
    out = build_brief("DJB", bedrock=Down())
    assert out["generated_by"] == "rules" and len(out["actions"]) == 2
    assert {a["report_ids"][0] for a in out["actions"]} == {"RB1", "RB2"}
    assert any("tanker" in a["ask"].lower() for a in out["actions"]) and all("IST" in a["evidence"] for a in out["actions"])
    assert any(a["evidence"].startswith("4 people reported it") for a in out["actions"])


def test_reporter_hears_back_when_an_officer_acts(aws, ctx, sent):
    from common.ids import user_hash
    from handlers.officer_api import handler
    uh = user_hash("telegram", "4242")
    dynamo.put_user(uh, channel="telegram", channel_id="4242", lang="hi")
    _report("RN1", channel="telegram", user_hash=uh, hotspot_id="hs_zakhira", lat=28.66763, lon=77.16744)
    _report("RN2", channel="web", user_hash="webby")
    pwd = {"cognito:groups": "[officers]", "custom:agency": "PWD"}
    assert handler(_http("PATCH /reports/{id}", {"status": "resolved"}, {"id": "RN1"}, pwd), ctx)["statusCode"] == 200
    assert sent[-1][1] == "4242" and "#RN1"[-3:] in sent[-1][2] and "ठीक" in sent[-1][2] and "Zakhira" in sent[-1][2]
    n = len(sent)
    assert handler(_http("PATCH /reports/{id}", {"status": "resolved"}, {"id": "RN2"}, pwd), ctx)["statusCode"] == 200
    assert len(sent) == n   # web reports have no channel to reach
    _report("RN3", channel="telegram", user_hash=uh)
    assert handler(_http("PATCH /reports/{id}", {"agency": "MCD"}, {"id": "RN3"}, pwd), ctx)["statusCode"] == 200
    assert "Municipal Corporation of Delhi" in sent[-1][2]
    dynamo.delete_everything(uh)   # after STOP nobody is messaged
    _report("RN4", channel="telegram", user_hash=uh)
    n = len(sent)
    handler(_http("PATCH /reports/{id}", {"status": "confirmed"}, {"id": "RN4"}, pwd), ctx)
    assert len(sent) == n


def test_now_summary_has_a_three_day_outlook(monkeypatch):
    from datetime import timedelta
    from common.ids import now_ist
    from risk import service
    start = (now_ist() - timedelta(days=2)).replace(hour=0, minute=0, second=0, microsecond=0)
    times = [(start + timedelta(hours=i)).strftime("%Y-%m-%dT%H:00") for i in range(24 * 5)]
    temps = [30 + 12 * (6 <= int(t[11:13]) < 18) for t in times]   # 42 C by day: ORANGE
    series = {"time": times, "temp_c": temps, "rh": [20] * len(times), "wet_bulb_c": [None] * len(times),
              "apparent_c": [None] * len(times), "precip_mm": [0.0] * len(times), "fetched_at": now_ist().isoformat()}
    monkeypatch.setattr(service, "fetch_point", lambda *a, **k: series)
    monkeypatch.setattr(service, "air_now", lambda *a, **k: {"air": None, "uv": None, "uv_hours": {}})
    out = service.now_summary(28.6, 77.2)
    assert [d["date"] for d in out["days"]] == [(now_ist().date() + timedelta(days=i)).isoformat() for i in range(3)]
    assert all(d["day_band"] in ("ORANGE", "RED") and d["max_temp_c"] == 42 for d in out["days"])
