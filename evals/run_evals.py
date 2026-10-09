"""Run the agent eval set against a deployed stage (spec 7.4, 13.3).

    python evals/run_evals.py --stage https://<api-id>.execute-api.ap-south-1.amazonaws.com \
        --eval-token "$(aws ssm get-parameter --name /jaltaap/eval_token --with-decryption --query Parameter.Value --output text)"

Checks for every case: expected tools were called (and forbidden ones were not), the reply script
matches the input script, the reply is <= 600 characters, "112" is on line 1 in emergencies, and
every number in the reply appears in a tool result or in the input (grounding).
Exit code 1 when any P0 case fails. Append the pass rate to DECISIONS.md after prompt changes.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import uuid
from pathlib import Path

import httpx
import yaml

DEVANAGARI = re.compile(r"[ऀ-ॿ]")
ALWAYS_OK_NUMBERS = {"112", "1077", "1070", "108", "102"}   # Delhi emergency helplines
NUM = re.compile(r"\d+(?:[.:]\d+)?")


def script_of(text: str) -> str:
    return "devanagari" if DEVANAGARI.search(text or "") else "latin"


def numbers_in(text: str) -> list[str]:
    # ignore digits inside URLs (directions links carry coordinates from tool results anyway)
    text = re.sub(r"https?://\S+", " ", text or "")
    return NUM.findall(text)


def grounded(number: str, haystack: str) -> bool:
    """A reply number is grounded if it appears in tool results or input, allowing 12-hour clock
    forms of HH:00 times (e.g. '4' for 16:00) and rounded decimals."""
    if number in ALWAYS_OK_NUMBERS or number in haystack:
        return True
    if ":" in number:
        h, m = number.split(":")
        return f"{int(h):02d}:{m}" in haystack or f"{int(h) + 12:02d}:{m}" in haystack
    if "." in number:
        return number.split(".")[0] in haystack
    n = int(number)
    if n <= 12 and (f"{n:02d}:00" in haystack or f"{n + 12:02d}:00" in haystack):
        return True
    # rounded forms of decimals in tool results, e.g. 44 for 43.6 or 44.2
    return any(abs(float(x) - n) < 0.5 for x in re.findall(r"\d+\.\d+", haystack))


def check_case(case: dict, reply: str, tools_called: list[str], tool_results: list) -> list[str]:
    """Returns a list of failure messages (empty when the case passes)."""
    fails: list[str] = []
    for t in case.get("expect_tools", []):
        if t not in tools_called:
            fails.append(f"expected tool {t} not called (called: {tools_called})")
    for t in case.get("forbid_tools", []):
        if t in tools_called:
            fails.append(f"forbidden tool {t} was called")
    if script_of(reply) != script_of(case["input"]):
        fails.append(f"reply script {script_of(reply)} != input script {script_of(case['input'])}")
    if len(reply) > 600:
        fails.append(f"reply is {len(reply)} characters (> 600)")
    lines = [l for l in reply.splitlines() if l.strip()]
    if case.get("emergency") and (not lines or "112" not in lines[0]):
        fails.append("emergency case without 112 on line 1")
    for s in case.get("must_contain", []):
        if s.lower() not in reply.lower():
            fails.append(f"missing '{s}'")
    if case.get("must_contain_any") and not any(s.lower() in reply.lower() for s in case["must_contain_any"]):
        fails.append(f"missing any of {case['must_contain_any']}")
    for s in case.get("must_not_contain", []) + case.get("must_not_contain_any", []):
        if s.lower() in reply.lower():
            fails.append(f"contains forbidden text '{s}'")
    haystack = json.dumps(tool_results, ensure_ascii=False) + " " + case["input"]
    loose = [n for n in numbers_in(reply) if not grounded(n, haystack)]
    if loose:
        fails.append(f"ungrounded numbers: {loose}")
    return fails


def run(stage: str, token: str, only: str | None) -> int:
    cases = yaml.safe_load(Path(__file__).with_name("agent_cases.yaml").read_text(encoding="utf-8"))["cases"]
    if only:
        cases = [c for c in cases if c["priority"] == only or c["id"] == only]
    results, p0_fail = [], 0
    with httpx.Client(timeout=30) as http:
        for case in cases:
            body = {"session_id": f"eval-{case['id']}-{uuid.uuid4().hex[:8]}", "message": case["input"]}
            if "lat" in case:
                body.update(lat=case["lat"], lon=case["lon"])
            t0 = time.time()
            try:
                r = http.post(f"{stage.rstrip('/')}/chat", json=body, headers={"x-eval-token": token})
                data = r.json()
            except Exception as err:  # noqa: BLE001
                data, r = {"reply": "", "eval": {}}, None
                fails = [f"request failed: {err}"]
            else:
                ev = data.get("eval") or {}
                if not ev:
                    fails = ["no eval trace (wrong --eval-token?)"]
                else:
                    fails = check_case(case, data.get("reply", ""), ev.get("tools_called", []), ev.get("tool_results", []))
            secs = round(time.time() - t0, 1)
            ok = not fails
            p0_fail += (not ok) and case["priority"] == "P0"
            results.append({"id": case["id"], "priority": case["priority"], "ok": ok, "secs": secs, "fails": fails,
                            "reply": data.get("reply", "")})
            print(f"{'PASS' if ok else 'FAIL'} {case['id']:4} {case['priority']} {secs:5.1f}s  " + ("; ".join(fails) if fails else ""))
            time.sleep(1)   # stay under the per-session rate limit
    passed = sum(r["ok"] for r in results)
    out = Path(__file__).with_name("last_run.json")
    out.write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n{passed}/{len(results)} passed; P0 failures: {p0_fail}. Replies saved to {out}")
    return 1 if p0_fail else 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", required=True)
    ap.add_argument("--eval-token", required=True)
    ap.add_argument("--only", help="P0, P1 or a case id")
    a = ap.parse_args()
    sys.exit(run(a.stage, a.eval_token, a.only))
