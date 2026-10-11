"""Builds and runs one Strands agent per incoming message (spec 7.1)."""
from __future__ import annotations

import re
import time

from strands import Agent
from strands.models import BedrockModel

from agent.prompts import SYSTEM_PROMPT, context_preamble
from agent.tools import UserContext, build_tools
from common import i18n
from common.config import settings
from common.ids import now_ist

MAX_CHARS = 600

# Latin-script terms need word boundaries ("ulti" must not match "multiple").
_EMERGENCY = re.compile(
    r"\b(confus\w*|faint\w*|collaps\w*|unconscious|seizures?|convuls\w*|vomit\w*|not sweating|no sweat\w*|"
    r"hot (and )?dry skin|behosh\w*|chakkar|ulti|pasina nahi|paseena nahi|daura|gir gay\w*|gir pad\w*)\b"
    r"|बेहोश|चक्कर|उल्टी|पसीना नहीं|दौरा|गिर गय|उलझन", re.IGNORECASE)


def is_emergency(text: str) -> bool:
    return bool(_EMERGENCY.search(text or ""))


def build_agent(ctx: UserContext, history: list[dict], model_id: str | None = None) -> Agent:
    s = settings()
    if s.llm_provider == "ollama":   # local development only; "think" off keeps small models fast
        from strands.models.ollama import OllamaModel
        model = OllamaModel(s.ollama_host, model_id=model_id or s.model_id, temperature=0.2, max_tokens=600,
                            additional_args={"think": False})
    else:
        model = BedrockModel(model_id=model_id or s.model_id, region_name=s.bedrock_region,
                             temperature=0.2, max_tokens=600, streaming=False)
    return Agent(model=model, system_prompt=SYSTEM_PROMPT, tools=build_tools(ctx), messages=list(history),
                 callback_handler=None)


def _cap(text: str, limit: int = MAX_CHARS) -> str:
    text = text.strip()
    if len(text) <= limit:
        return text
    lines, out = text.splitlines(), []
    for line in lines:
        if len("\n".join(out + [line])) > limit:
            break
        out.append(line)
    return "\n".join(out) if out else text[:limit]


def finalize(reply: str, ctx: UserContext, user_text: str) -> str:
    """Deterministic guards on top of the model's reply."""
    reply = (reply or "").strip()
    lines = [l for l in reply.splitlines() if l.strip()]
    if is_emergency(user_text):
        first = i18n.t("emergency_line1", ctx.lang)
        if not lines or "112" not in lines[0]:
            lines = [first] + ([i18n.t("emergency_steps", ctx.lang)] if not lines else lines)
    footer = ctx.footers[-1] if ctx.footers else None
    if footer and not any("Open-Meteo" in l for l in lines):
        lines.append(footer)
    text = "\n".join(lines)
    if len(text) > MAX_CHARS and footer:
        body = _cap("\n".join(l for l in lines if "Open-Meteo" not in l), MAX_CHARS - len(footer) - 1)
        text = body + "\n" + footer
    return _cap(text)


def run(ctx: UserContext, user_text: str, history: list[dict]) -> dict:
    """Run the agent; retry once on the fallback model; never raise to the caller."""
    s = settings()
    prompt = context_preamble(ctx.lang, ctx.last_location, now_ist().strftime("%Y-%m-%d %H:%M"),
                              ctx.profile, ctx.shift) + "\n\n" + user_text
    started = time.time()
    model_used, reply, error = None, None, None
    for model_id in [m for m in (s.model_id, s.fallback_model_id) if m]:
        ctx.tools_called.clear()
        ctx.footers.clear()
        ctx.tool_results.clear()
        ctx.data_updated_at = None
        try:
            result = build_agent(ctx, history, model_id)(prompt)
            reply, model_used = str(result), model_id
            break
        except Exception as err:  # noqa: BLE001 - try the fallback, then a fixed safe reply
            error = repr(err)[:300]
    if reply is None:
        reply = i18n.t("emergency_line1", ctx.lang) + "\n" + i18n.t("emergency_steps", ctx.lang) \
            if is_emergency(user_text) else i18n.t("data_unavailable", ctx.lang)
    return {
        "reply": finalize(reply, ctx, user_text),
        "tools_called": list(ctx.tools_called),
        "tool_results": list(ctx.tool_results),
        "data_updated_at": ctx.data_updated_at,
        "model_used": model_used,
        "fallback_used": bool(model_used and model_used != s.model_id),
        "latency_ms": int((time.time() - started) * 1000),
        "error": error if model_used is None else None,
    }
