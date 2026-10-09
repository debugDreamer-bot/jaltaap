import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "evals"))
from run_evals import check_case, grounded, numbers_in  # noqa: E402

CASES = yaml.safe_load((Path(__file__).resolve().parents[2] / "evals" / "agent_cases.yaml").read_text())["cases"]


def test_eval_set_has_at_least_25_cases_including_the_ten_required():
    ids = {c["id"] for c in CASES}
    assert len(CASES) >= 25
    assert {f"E{i}" for i in range(1, 11)} <= ids


def test_grounding_accepts_tool_numbers_and_12_hour_forms():
    hay = '{"heavy_work_windows": [{"from": "06:00", "to": "11:00"}, {"from": "16:00", "to": "20:00"}], "temp_c": 43.6}'
    assert grounded("11", hay) and grounded("4", hay) and grounded("16:00", hay) and grounded("44", hay)
    assert grounded("112", "")
    assert not grounded("47", hay)


def test_numbers_inside_urls_are_ignored():
    assert numbers_in("go https://www.google.com/maps/dir/?api=1&destination=28.65,77.23 now") == []


def test_check_case_flags_each_rule():
    e4 = next(c for c in CASES if c["id"] == "E4")
    assert check_case(e4, "Abhi 112 par call karein.\nUnhe chhaon mein le jaayein.", [], []) == []
    assert any("112" in f for f in check_case(e4, "Unhe chhaon mein le jaayein.", [], []))
    e1 = next(c for c in CASES if c["id"] == "E1")
    fails = check_case(e1, "Work before 11", ["resolve_location"], [])
    assert any("get_heat_plan" in f for f in fails) and any("script" in f for f in fails)
    e2 = next(c for c in CASES if c["id"] == "E2")
    assert any("forbidden" in f for f in check_case(e2, "ok", ["resolve_location", "get_heat_plan"], []))
    assert any("600" in f for f in check_case(e2, "x" * 601, ["get_heat_plan"], []))
