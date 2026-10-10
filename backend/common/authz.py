"""Officer authorization with Cedar (policies/reports.cedar), the AWS open-source policy language.

Every officer action on a report (view, confirm, mark_false, resolve, reassign) is a Cedar
request: principal = the officer (agency and city from the Cognito token), resource = the report
(agency, status, city, category). The policy file is the single place that says who can do what.
If the Cedar engine cannot load, every action is denied (fail closed) and the error is logged.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from common.obs import logger
from risk import grid as gridmod

POLICY_DIR = Path(__file__).resolve().parent.parent / "policies"
ACTIONS = ("view", "confirm", "mark_false", "resolve", "reassign")
STATUS_ACTION = {"confirmed": "confirm", "false": "mark_false", "resolved": "resolve"}


@lru_cache(maxsize=1)
def _engine():
    import cedarpy
    return cedarpy, cedarpy.PolicySet.from_str((POLICY_DIR / "reports.cedar").read_text(encoding="utf-8"))


def known_agencies() -> list[str]:
    """Every agency code a report can be routed to (Delhi hotspot owners plus each city's agencies)."""
    from common import refdata
    codes = {"PWD", "MCD", "NDMC", "DJB", "LOCAL_BODY", "LOCAL_WATER"}
    codes |= {h["agency"] for h in refdata.hotspots() if h.get("agency") and h["agency"] != "UNKNOWN"}
    for c in gridmod.cities():
        codes |= set(c["agencies"].values())
        for z in c.get("zones", []):
            codes |= set(z["agencies"].values())
    return sorted(codes)


def report_city(report: dict) -> str:
    c = gridmod.city_of(float(report["lat"]), float(report["lon"])) if report.get("lat") is not None else None
    return c["id"] if c else "other"


def is_allowed(officer: dict, action: str, report: dict, context: dict | None = None) -> bool:
    """officer = {"id", "agency", "city", "groups": [...]}; report = a Reports item."""
    if action not in ACTIONS:
        return False
    try:
        cedarpy, policies = _engine()
    except Exception:  # noqa: BLE001 - fail closed
        logger.exception("cedar engine unavailable; denying")
        return False
    officer_uid = {"type": "JalTaap::Officer", "id": officer.get("id") or "officer"}
    report_uid = {"type": "JalTaap::Report", "id": report.get("report_id") or "report"}
    entities = [
        {"uid": officer_uid, "attrs": {"agency": officer.get("agency") or "", "city": officer.get("city") or ""},
         "parents": [{"type": "JalTaap::Group", "id": g} for g in officer.get("groups", [])]},
        {"uid": report_uid, "attrs": {"agency": report.get("agency") or "", "status": report.get("status") or "",
                                      "city": report_city(report), "category": report.get("category") or "flood"},
         "parents": []},
    ] + [{"uid": {"type": "JalTaap::Group", "id": g}, "attrs": {}, "parents": []} for g in officer.get("groups", [])]
    request = {"principal": officer_uid, "action": {"type": "JalTaap::Action", "id": action},
               "resource": report_uid, "context": context or {}}
    result = cedarpy.is_authorized(request, policies, entities)
    return result.allowed
