"""Personal profile, live warnings (risk.warnings) and Telegram live location."""
from datetime import timedelta

import pytest

from common import dynamo, i18n
from common.channels.telegram import parse_update
from common.ids import now_ist, user_hash
from common.models import ChatRequest, InboundMessage, clean_profile
from risk.warnings import assess, top_key


def _hour(band="GREEN", flood=None, rain=0.0, temp=34.0):
    return {"time": "2026-05-20T14:00+05:30", "band": band, "temp_c": temp, "wet_bulb_c": 26.0,
            "area_flood_level": flood, "rain_next_3h_mm": rain}


def _summary(hours=None, air=None, uv=None):
    return {"hours": hours or [_hour()], "air": air, "uv": uv, "data_updated_at": "2026-05-20T14:05:00+05:30"}


# ---------------- warnings ----------------

def test_all_clear_has_no_warnings():
    assert assess(_summary(air={"category": "SATISFACTORY", "aqi": 80}, uv={"now_category": "HIGH"})) == []
    assert top_key([]) == ""


def test_heat_uses_the_worst_of_the_next_three_hours_only():
    hours = [_hour("YELLOW"), _hour("ORANGE"), _hour("RED", temp=45), _hour("RED")]
    w = assess(_summary(hours))
    assert w[0]["hazard"] == "heat" and w[0]["level"] == "RED" and w[0]["severity"] == 3 and w[0]["temp_c"] == 45
    assert assess(_summary([_hour(), _hour(), _hour(), _hour("RED")])) == []   # 4th hour is outside the window


def test_rain_air_uv_and_ordering():
    w = assess(_summary([_hour("ORANGE", flood="SEVERE", rain=40.0)], air={"category": "POOR", "aqi": 260},
                        uv={"now_category": "EXTREME", "now": 11.2}))
    assert [x["hazard"] for x in w][0] == "rain"            # severity 3 first
    assert {x["hazard"]: x["severity"] for x in w} == {"rain": 3, "heat": 2, "air": 2, "uv": 2}
    assert top_key(w) == "rain:SEVERE"


def test_moderate_air_warns_only_sensitive_people():
    s = _summary(air={"category": "MODERATE", "aqi": 150})
    assert assess(s) == []
    assert assess(s, ["heavy_work"]) == []
    w = assess(s, ["age_60_plus"])
    assert w[0]["hazard"] == "air" and w[0]["severity"] == 1
    assert top_key(w) == ""            # advisories do not trigger messages


# ---------------- personal profile ----------------

def test_profile_flags_are_cleaned():
    assert clean_profile(["pregnant", "made_up", "heavy_work", "pregnant"]) == ["heavy_work", "pregnant"]
    req = ChatRequest(session_id="session-123", message="hi", profile=["chronic_illness", "x"])
    assert req.profile == ["chronic_illness"]


def test_shift_is_validated_and_reaches_the_agent_context():
    from pydantic import ValidationError
    from agent.prompts import context_preamble
    req = ChatRequest(session_id="session-123", message="hi", shift={"start": "08:00", "end": "18:30"})
    assert req.shift.start == "08:00" and req.shift.end == "18:30"
    for bad in ({"start": "8", "end": "18:00"}, {"start": "25:00", "end": "18:00"}, {"start": "08:00"}):
        with pytest.raises(ValidationError):
            ChatRequest(session_id="session-123", message="hi", shift=bad)
    text = context_preamble("en", None, "2026-05-20 09:00", ["heavy_work"], {"start": "08:00", "end": "18:30"})
    assert "does heavy physical work" in text and "08:00 to 18:30 IST" in text
    assert "shift" not in context_preamble("en", None, "2026-05-20 09:00")


def _series(day_temp):
    start = (now_ist() - timedelta(days=2)).replace(hour=0, minute=0, second=0, microsecond=0)
    times = [(start + timedelta(hours=i)).strftime("%Y-%m-%dT%H:00") for i in range(24 * 5)]
    temps = [28 + (day_temp - 28) * (6 <= int(t[11:13]) < 18) for t in times]
    return {"time": times, "temp_c": temps, "rh": [20] * len(times), "wet_bulb_c": [None] * len(times),
            "apparent_c": [None] * len(times), "precip_mm": [0.0] * len(times), "fetched_at": now_ist().isoformat()}


def test_now_summary_profile_escalates_bands_and_warnings(monkeypatch):
    from risk import service
    series = _series(39)   # YELLOW by day for most people
    monkeypatch.setattr(service, "fetch_point", lambda *a, **k: series)
    monkeypatch.setattr(service, "air_now", lambda *a, **k: {"air": None, "uv": None, "uv_hours": {}})
    base = service.now_summary(28.6, 77.2)
    personal = service.now_summary(28.6, 77.2, profile=["age_60_plus"])
    from risk.heat import band_index
    assert band_index(personal["today"]["day_band"]) == band_index(base["today"]["day_band"]) + 1
    assert "profile:age_60_plus" in personal["today"]["escalations"]
    assert personal["today"]["base_day_band"] == base["today"]["day_band"]   # "for most people" stays visible
    assert "warnings" in base and isinstance(base["warnings"], list)
    day_hours = [h for h in personal["hours"] if h["time"][:10] == now_ist().date().isoformat()]
    base_hours = {h["time"]: h["band"] for h in base["hours"]}
    assert any(band_index(h["band"]) > band_index(base_hours[h["time"]]) for h in day_hours if 6 <= int(h["time"][11:13]) < 18) \
        or now_ist().hour >= 18


# ---------------- Telegram parsing ----------------

def _loc_update(edited=False, live_period=None, uid=10):
    loc = {"latitude": 28.61, "longitude": 77.21, **({"live_period": live_period} if live_period else {})}
    msg = {"message_id": 5, "chat": {"id": 42}, "date": 1, "location": loc}
    return {"update_id": uid, ("edited_message" if edited else "message"): msg}


def test_parse_live_location_start_update_and_plain_pin():
    assert parse_update(_loc_update())[0].live is None
    assert parse_update(_loc_update(live_period=3600))[0].live == "start"
    upd = parse_update(_loc_update(edited=True, live_period=3600, uid=11))[0]
    assert upd.live == "update" and upd.type == "location" and upd.message_id == "11"


def test_edited_text_is_ignored():
    assert parse_update({"update_id": 3, "edited_message": {"message_id": 1, "chat": {"id": 42}, "text": "typo fix"}}) == []


# ---------------- live location check ----------------

@pytest.fixture
def risk_now(monkeypatch):
    """Point service.now_summary at a mutable summary the test controls."""
    from risk import service
    state = {"summary": _summary(), "calls": 0}

    def fake(lat, lon, label="", profile=None):
        state["calls"] += 1
        s = dict(state["summary"])
        s["warnings"] = assess(s, profile)
        return s
    monkeypatch.setattr(service, "now_summary", fake)
    return state


def _live(msg_id, live="update", lat=28.61, lon=77.21):
    return InboundMessage(channel="telegram", channel_user_id="555", message_id=msg_id, type="location",
                          lat=lat, lon=lon, live=live)


def _user():
    return dynamo.get_user(user_hash("telegram", "555"))


def test_live_location_warns_once_per_change_then_clears(aws, sent, risk_now, monkeypatch):
    import handlers.worker as worker
    from common import live_location
    monkeypatch.setattr(worker, "answer", lambda **kw: {"reply": "plan", "data_updated_at": None})
    worker.process(_live("m1", live="start"))
    assert sent[-1][2] == "plan\n\n" + i18n.t("live_started", "hi")   # a pin has no text: the default language
    n = len(sent)

    risk_now["summary"] = _summary([_hour("RED", temp=46)])
    monkeypatch.setattr(live_location, "LIVE_RECHECK", timedelta(0))
    worker.process(_live("m2", lat=28.70))
    assert len(sent) == n + 1 and sent[-1][2].startswith(i18n.t("live_heat", "hi", band=i18n.band_word("RED", "hi"),
                                                                 temp=46, footer="")[:30])
    assert _user()["live_warning"] == "heat:RED"

    worker.process(_live("m3", lat=28.71))           # same risk: silent
    assert len(sent) == n + 1

    risk_now["summary"] = _summary()
    worker.process(_live("m4", lat=28.72))           # back to safe: one all-clear
    assert len(sent) == n + 2 and sent[-1][2].startswith(i18n.t("live_clear", "hi", footer="").strip()[:20])
    worker.process(_live("m5", lat=28.73))
    assert len(sent) == n + 2


def test_live_moves_within_a_cell_are_throttled(aws, sent, risk_now, monkeypatch):
    import handlers.worker as worker
    monkeypatch.setattr(worker, "answer", lambda **kw: {"reply": "plan", "data_updated_at": None})
    worker.process(_live("m1", live="start"))
    calls = risk_now["calls"]
    worker.process(_live("m2", lat=28.6101))         # same ~1 km cell, within 15 minutes
    assert risk_now["calls"] == calls
    assert _user()["last_geohash6"]


def test_live_update_never_calls_the_model(aws, sent, risk_now, monkeypatch):
    import handlers.worker as worker

    def boom(**kw):
        raise AssertionError("the LLM must not run for live moves")
    monkeypatch.setattr(worker, "answer", boom)
    dynamo.put_user(user_hash("telegram", "555"), channel="telegram", channel_id="555", lang="en")
    risk_now["summary"] = _summary([_hour("ORANGE")])
    worker.process(_live("m9"))
    assert sent and sent[-1][2].startswith("JalTaap heat warning")
