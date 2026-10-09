import pytest

from risk.heat import (BAND_ORDER, HourInput, build_heat_plan, day_band_from_hours, escalate_band,
                       escalation_for, hour_band)


# ---- band boundaries: exactly 25, 28, 30 wet-bulb; exactly 37, 40, 44 C ----
@pytest.mark.parametrize("wb,band", [(24.99, "GREEN"), (25.0, "YELLOW"), (27.99, "YELLOW"), (28.0, "ORANGE"),
                                     (29.99, "ORANGE"), (30.0, "RED")])
def test_wet_bulb_boundaries(wb, band):
    assert hour_band(30.0, wb) == band


@pytest.mark.parametrize("t,band", [(36.99, "GREEN"), (37.0, "YELLOW"), (39.99, "YELLOW"), (40.0, "ORANGE"),
                                    (43.99, "ORANGE"), (44.0, "RED")])
def test_temperature_boundaries(t, band):
    assert hour_band(t, 20.0) == band


def test_either_rule_is_enough():
    assert hour_band(33.0, 28.5) == "ORANGE"   # humid, never 40 C
    assert hour_band(44.5, 22.0) == "RED"      # dry, low wet-bulb


# ---- escalation ----
def test_hot_night_turns_yellow_into_orange():
    esc = escalation_for("YELLOW", last_night_min_c=30.0, prev_day_bands=[], profile=[])
    assert esc.environment == ["hot_night"]
    assert escalate_band("YELLOW", esc) == "ORANGE"


def test_hot_night_threshold_is_inclusive():
    assert escalation_for("YELLOW", 29.9, [], []).environment == []
    assert escalation_for("YELLOW", 30.0, [], []).environment == ["hot_night"]


def test_environment_adds_at_most_one():
    esc = escalation_for("ORANGE", 31.0, ["ORANGE", "RED"], [])
    assert set(esc.environment) == {"hot_night", "duration"}
    assert escalate_band("YELLOW", esc) == "ORANGE"   # +1, not +2


def test_environment_plus_profile_gives_at_most_two():
    esc = escalation_for("YELLOW", 31.0, [], ["heavy_work", "age_60_plus"])
    assert esc.steps == 2
    assert escalate_band("YELLOW", esc) == "RED"


def test_red_stays_red():
    esc = escalation_for("RED", 31.0, ["RED", "RED"], ["pregnant"])
    assert escalate_band("RED", esc) == "RED"


def test_green_hours_are_not_escalated():
    esc = escalation_for("YELLOW", 31.0, [], ["heavy_work"])
    assert escalate_band("GREEN", esc) == "GREEN"


def test_duration_needs_two_previous_orange_days_and_today_orange():
    assert "duration" in escalation_for("ORANGE", None, ["ORANGE", "ORANGE"], []).environment
    assert "duration" not in escalation_for("ORANGE", None, ["YELLOW", "ORANGE"], []).environment
    assert "duration" not in escalation_for("YELLOW", None, ["ORANGE", "ORANGE"], []).environment
    assert "duration" not in escalation_for("ORANGE", None, ["ORANGE"], []).environment


def test_unknown_profile_flags_are_ignored():
    assert escalation_for("YELLOW", None, [], ["astronaut"]).profile == []


# ---- the plan ----
def _day(temps, rh=20, date="2026-05-22"):
    return [HourInput(time=f"{date}T{h:02d}:00", temp_c=t, rh=rh) for h, t in enumerate(temps)]


def _plan(temps, **kw):
    return build_heat_plan(location={"lat": 28.61, "lon": 76.98, "label": "Najafgarh"}, date="2026-05-22",
                           hours=_day(temps), last_night_min_c=kw.pop("night", 28.0),
                           data_updated_at="2026-05-22T05:00:00+05:30", **kw)


HOT_DAY = [30] * 6 + [36, 38, 39, 41, 42, 43, 45, 46, 46, 45, 43, 41, 39, 38] + [34] * 4


def test_day_band_is_worst_hour_inside_window():
    plan = _plan(HOT_DAY)
    assert plan["day_band"] == "RED"
    assert plan["blocks"][0]["from"] == "06:00"
    assert plan["blocks"][-1]["to"] == "20:00"


def test_hours_outside_window_do_not_set_day_band():
    temps = [45] * 6 + [30] * 18      # scorching at 03:00 only
    assert day_band_from_hours(_day(temps)) == "GREEN"


def test_noon_pause_applies_at_orange_or_worse():
    plan = _plan(HOT_DAY)
    assert plan["noon_pause"] == {"from": "12:00", "to": "15:00"}
    assert "noon_pause" in plan["advice_keys"]
    for w in plan["heavy_work_windows"]:
        assert not ("12:00" <= w["from"] < "15:00")


def test_no_noon_pause_on_a_yellow_day():
    plan = _plan([30] * 10 + [38] * 6 + [30] * 8)
    assert plan["day_band"] == "YELLOW"
    assert plan["noon_pause"] is None and "noon_pause" not in plan["advice_keys"]


def test_blocks_cover_window_contiguously():
    plan = _plan(HOT_DAY)
    for a, b in zip(plan["blocks"], plan["blocks"][1:]):
        assert a["to"] == b["from"] and a["band"] != b["band"]


def test_plan_contract_fields():
    plan = _plan(HOT_DAY, profile=["heavy_work"])
    for key in ("kind", "location", "date", "source", "data_updated_at", "day_band", "escalations",
                "blocks", "hours", "advice_keys"):
        assert key in plan
    assert plan["kind"] == "heat_plan"
    assert "profile:heavy_work" in plan["escalations"]
    assert all(h["band"] in BAND_ORDER for h in plan["hours"])
    assert len(plan["hours"]) == 24
