from datetime import datetime, timedelta, timezone

import pytest

from risk.flood import antecedent_bonus, level_for, rain_factor, rain_windows, score_hotspot, susceptibility

IST = timezone(timedelta(hours=5, minutes=30))
NOW = datetime(2026, 7, 9, 6, 0, tzinfo=IST)
SPOT = {"id": "hs_x", "name": "X underpass", "type": "underpass", "agency": "PWD", "years_seen": 3,
        "lat": 28.6600, "lon": 77.1500}


def test_susceptibility():
    assert susceptibility(1, "arterial_road") == pytest.approx(0.4)
    assert susceptibility(3, "arterial_road") == pytest.approx(0.7)
    assert susceptibility(3, "underpass") == pytest.approx(0.9)
    assert susceptibility(9, "underpass") == 1.0     # capped at max


@pytest.mark.parametrize("h1,h3,f", [
    (35, 0, 1.00), (34.9, 60, 1.00), (34.9, 59.9, 0.75),
    (20, 0, 0.75), (19.9, 40, 0.75), (19.9, 39.9, 0.50),
    (10, 0, 0.50), (9.9, 20, 0.50), (9.9, 19.9, 0.25),
    (5, 0, 0.25), (4.9, 19.9, 0.0), (0, 0, 0.0),
])
def test_rain_factor_boundaries(h1, h3, f):
    assert rain_factor(h1, h3) == f


def test_antecedent_bonus_boundary():
    assert antecedent_bonus(64.4) == 0.0
    assert antecedent_bonus(64.5) == pytest.approx(0.10)


@pytest.mark.parametrize("risk,level", [(0.0, "LOW"), (0.249, "LOW"), (0.25, "MEDIUM"), (0.5, "HIGH"),
                                        (0.749, "HIGH"), (0.75, "SEVERE"), (1.0, "SEVERE")])
def test_levels(risk, level):
    assert level_for(risk) == level


def test_risk_capped_at_one():
    s = score_hotspot(dict(SPOT, years_seen=9), rain_next_1h_mm=50, rain_next_3h_mm=90, rain_last_24h_mm=120)
    assert s["risk"] == 1.0 and s["level"] == "SEVERE"


def test_antecedent_only_is_low():
    s = score_hotspot(SPOT, rain_next_1h_mm=0, rain_next_3h_mm=0, rain_last_24h_mm=80)
    assert s["risk"] == pytest.approx(0.10) and s["level"] == "LOW"


def _report(minutes_ago, lat=28.6605, lon=77.1503, status="verified", confidence=0.85):
    return {"lat": lat, "lon": lon, "status": status, "confidence": confidence,
            "created_at": (NOW - timedelta(minutes=minutes_ago)).isoformat()}


def test_crowd_override_sets_confirmed():
    s = score_hotspot(SPOT, rain_next_1h_mm=0, rain_next_3h_mm=0, rain_last_24h_mm=0,
                      reports=[_report(30)], now=NOW)
    assert s["level"] == "CONFIRMED" and s["confirmed_reports"] == 1


@pytest.mark.parametrize("report", [
    _report(121),                                   # outside the 2 h window
    _report(30, lat=28.6650),                       # ~560 m away
    _report(30, status="pending"),                  # not verified
    _report(30, confidence=0.69),                   # below min confidence
])
def test_crowd_override_rejects(report):
    s = score_hotspot(SPOT, rain_next_1h_mm=0, rain_next_3h_mm=0, rain_last_24h_mm=0, reports=[report], now=NOW)
    assert s["level"] == "LOW"


def test_rain_windows():
    precip = [1.0] * 24 + [12.0, 5.0, 4.0, 0.0]
    assert rain_windows(precip, 24) == (12.0, 21.0, 24.0)
