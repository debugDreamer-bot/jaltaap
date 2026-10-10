"""India AQI estimate (CPCB breakpoints), UV categories and GET /now."""
import json

import pytest

from risk.air import category, india_aqi, mean_last, sub_index, uv_category
from risk.config_loader import air_config


@pytest.mark.parametrize("pm25,aqi", [(0, 0), (30, 50), (30.9, 50), (31, 51), (60, 100), (61, 101), (90, 200),
                                      (91, 201), (120, 300), (121, 301), (250, 400), (251, 401), (380, 500), (900, 500)])
def test_pm25_breakpoints(pm25, aqi):
    assert sub_index(pm25, air_config()["pm2_5"]) == aqi


@pytest.mark.parametrize("pm10,aqi", [(50, 50), (100, 100), (126.8, 118), (250, 200), (350, 300), (430, 400), (510, 500)])
def test_pm10_breakpoints(pm10, aqi):
    assert sub_index(pm10, air_config()["pm10"]) == aqi


def test_aqi_is_the_worse_sub_index_and_categorised():
    a = india_aqi(65.9, 126.8)            # Delhi, 9 Oct 2026 evening (modelled)
    assert a["aqi"] == 118 and a["dominant"] == "pm10" and a["category"] == "MODERATE" and a["estimate"]
    assert india_aqi(130, 90)["category"] == "VERY_POOR"
    assert india_aqi(130, 90)["advice_keys"] == ["air_mask", "air_limit_heavy", "air_sensitive_indoors"]
    assert india_aqi(None, None) is None
    assert [category(x) for x in (50, 51, 200, 201, 301, 401)] == ["GOOD", "SATISFACTORY", "MODERATE", "POOR", "VERY_POOR", "SEVERE"]


def test_uv_categories():
    assert [uv_category(x) for x in (0, 2.9, 3, 6, 8, 11.2)] == ["LOW", "LOW", "MODERATE", "HIGH", "VERY_HIGH", "EXTREME"]
    assert uv_category(None) is None


def test_mean_last_needs_most_of_the_window():
    vals = [10.0] * 24
    assert mean_last(vals, 23) == 10.0
    assert mean_last([None] * 10 + [10.0] * 14, 23) is None   # only 14 of 24 hours


def test_now_endpoint(aws, ctx, monkeypatch):
    from handlers import public_api
    from risk import service
    monkeypatch.setattr(service, "now_summary", lambda lat, lon, label="": {"location": {"lat": lat, "lon": lon}, "now": {"band": "GREEN"}})
    ev = {"routeKey": "GET /now", "queryStringParameters": {"lat": "12.97", "lon": "77.59"}, "headers": {},
          "requestContext": {"http": {"sourceIp": "5.5.5.5"}}}
    assert json.loads(public_api.handler(ev, ctx)["body"])["now"]["band"] == "GREEN"
    ev["queryStringParameters"] = {"lat": "51.5", "lon": "-0.1"}
    assert public_api.handler(ev, ctx)["statusCode"] == 400


def test_speech_lines_are_fixed_copy_and_follow_the_summary():
    from common.voice import summary_lines
    s = {"now": {"band": "ORANGE", "area_flood_level": "HIGH"},
         "today": {"day_band": "ORANGE", "heavy_work_windows": [{"from": "06:00", "to": "11:00"}, {"from": "16:00", "to": "20:00"}],
                   "noon_pause": {"from": "12:00", "to": "15:00"}},
         "air": {"category": "VERY_POOR"}, "uv": {"today_category": "HIGH"}}
    hi = summary_lines(s, "hi")
    assert hi[0] == "अभी भारी काम न करें।"
    assert hi[1] == "भारी काम 6 से 11 और 16 से 20 बजे तक सुरक्षित है।"
    assert "हर घंटे 3 गिलास पानी पिएँ।" in hi and "हवा प्रदूषित है। मास्क पहनें।" in hi
    assert hi[-1].endswith("112 पर कॉल करें।")
    en = summary_lines({**s, "now": {"band": "GREEN"}, "air": None, "uv": None,
                        "today": {"day_band": "GREEN", "heavy_work_windows": [], "noon_pause": None}}, "en")
    assert en == ["Safe to work now.", "Drink 1 glass of water every hour."]


def test_speak_endpoint_returns_mp3(aws, ctx, monkeypatch):
    import base64
    from common import voice
    from handlers import public_api
    from risk import service
    monkeypatch.setattr(service, "now_summary", lambda lat, lon, label="": {
        "now": {"band": "GREEN"}, "today": {"day_band": "GREEN", "heavy_work_windows": [], "noon_pause": None}})
    spoken = []
    monkeypatch.setattr(voice, "synthesize", lambda text, lang: spoken.append((text, lang)) or b"ID3audio")
    ev = {"routeKey": "GET /speak", "queryStringParameters": {"lat": "28.61", "lon": "77.21"}, "headers": {},
          "requestContext": {"http": {"sourceIp": "7.7.7.7"}}}
    res = public_api.handler(ev, ctx)
    assert res["statusCode"] == 200 and res["isBase64Encoded"] and res["headers"]["Content-Type"] == "audio/mpeg"
    assert base64.b64decode(res["body"]) == b"ID3audio"
    assert spoken == [("अभी काम कर सकते हैं। हर घंटे 1 गिलास पानी पिएँ।", "hi")]
