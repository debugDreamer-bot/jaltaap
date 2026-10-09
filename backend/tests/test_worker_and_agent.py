import io

import boto3
import pytest
from PIL import Image

from agent.agent import finalize, is_emergency
from agent.tools import UserContext
from common import dynamo, i18n
from common.ids import user_hash
from common.models import InboundMessage


def _msg(**kw):
    base = dict(channel="telegram", channel_user_id="555", message_id=kw.pop("message_id", "m1"), type="text")
    base.update(kw)
    return InboundMessage(**base)


@pytest.fixture
def fake_agent(monkeypatch):
    calls = []

    def fake_answer(**kw):
        calls.append(kw)
        return {"reply": "ok reply", "tools_called": [], "data_updated_at": None, "model_used": "m",
                "fallback_used": False, "latency_ms": 5, "error": None}
    import handlers.worker as worker
    monkeypatch.setattr(worker, "answer", fake_answer)
    return calls


def test_first_contact_sends_consent_then_reply(aws, sent, fake_agent):
    from handlers.worker import process
    process(_msg(text="aaj kaam kab karu bhai"))
    assert sent[0][2] == i18n.t("consent", "hinglish")
    assert sent[1][2] == "ok reply"
    assert dynamo.get_user(user_hash("telegram", "555"))["lang"] == "hinglish"
    process(_msg(message_id="m2", text="aur kal?"))
    assert len(sent) == 3   # no second consent


def test_stop_deletes_user_subscriptions_and_history(aws, sent, fake_agent):
    from handlers.worker import process
    uh = user_hash("telegram", "555")
    process(_msg(text="hello"))
    dynamo.subscribe(uh, "ttnfv", "heat")
    dynamo.append_turn(uh, "user", "hi")
    process(_msg(message_id="m3", text="STOP"))
    assert dynamo.get_user(uh) is None
    assert dynamo.list_user_subscriptions(uh) == []
    assert dynamo.last_turns(uh) == []
    assert "STOP" not in sent[-1][2] and sent[-1][2] == i18n.t("stop_done", "en")


def test_location_outside_delhi_is_refused(aws, sent, fake_agent):
    from handlers.worker import process
    process(_msg(type="location", lat=19.07, lon=72.88))
    assert sent[-1][2] == i18n.t("outside_delhi", "hi")
    assert fake_agent == []


def _jpeg():
    buf = io.BytesIO()
    Image.new("RGB", (64, 48), (90, 120, 160)).save(buf, "JPEG")
    return buf.getvalue()


def test_photo_without_location_is_held_then_released(aws, sent, fake_agent, monkeypatch):
    import handlers.worker as worker
    monkeypatch.setattr(worker, "_download", lambda msg: _jpeg())
    worker.process(_msg(text="hi"))
    worker.process(_msg(message_id="p1", type="image", media_id="F1"))
    assert sent[-1][2] == i18n.t("photo_need_location", "hi") or "location" in sent[-1][2].lower()
    worker.process(_msg(message_id="p2", type="location", lat=28.66, lon=77.15))
    s3 = boto3.client("s3", region_name="ap-south-1")
    keys = [o["Key"] for o in s3.list_objects_v2(Bucket="jaltaap-test-bucket").get("Contents", [])]
    assert any(k.startswith("reports/raw/") for k in keys)
    assert not any(k.startswith("reports/hold/") for k in keys)
    assert dynamo.reports_by_status("pending")[0]["lat"] == 28.66


def test_report_rate_limit(aws, sent, fake_agent, monkeypatch):
    import handlers.worker as worker
    monkeypatch.setattr(worker, "_download", lambda msg: _jpeg())
    worker.process(_msg(type="location", lat=28.66, lon=77.15))
    for i in range(11):
        worker.process(_msg(message_id=f"img{i}", type="image", media_id="F"))
    assert "hour" in sent[-1][2] or "घंटे" in sent[-1][2] or "ghante" in sent[-1][2]


# ---- deterministic guards on the agent reply ----
def test_emergency_line_forced_first():
    ctx = UserContext(user_hash="x", channel="web", lang="hinglish")
    out = finalize("Unhe chhaon mein le jaayein.", ctx, "mere saathi ko chakkar aa raha hai, pasina nahi aa raha")
    assert out.splitlines()[0] == i18n.t("emergency_line1", "hinglish")
    assert "112" in out.splitlines()[0]


def test_emergency_line_kept_when_model_already_put_112_first():
    ctx = UserContext(user_hash="x", channel="web", lang="en")
    out = finalize("Call 112 now.\nMove them to shade.", ctx, "he fainted")
    assert out.splitlines()[0] == "Call 112 now."


def test_footer_appended_when_forecast_used():
    ctx = UserContext(user_hash="x", channel="web", lang="hi")
    ctx.footers.append("Data: Open-Meteo, 05:00 IST")
    out = finalize("आज 11 से 4 बजे तक भारी काम न करें", ctx, "kal najafgarh")
    assert out.endswith("Data: Open-Meteo, 05:00 IST")


def test_reply_capped_at_600_with_footer_kept():
    ctx = UserContext(user_hash="x", channel="web", lang="en")
    ctx.footers.append("Data: Open-Meteo, 05:00 IST")
    long = "\n".join(["line " + "x" * 80] * 20)
    out = finalize(long, ctx, "heat plan")
    assert len(out) <= 600 and out.endswith("Data: Open-Meteo, 05:00 IST")


def test_not_emergency():
    assert not is_emergency("Nearest cooling centre to Jama Masjid?")


@pytest.mark.parametrize("text,lang", [("कल नजफगढ़ में काम कब करूं?", "hi"),
                                       ("bhai aaj dhoop me kab tak kaam karu", "hinglish"),
                                       ("Nearest cooling centre to Jama Masjid?", "en"),
                                       ("garmi", "hinglish"), ("Tell me a joke", "en")])
def test_detect_language(text, lang):
    assert i18n.detect_language(text) == lang
