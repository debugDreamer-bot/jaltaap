"""Secrets from SSM Parameter Store (SecureString), read at runtime and cached per container.

CloudFormation cannot inject SecureStrings into Lambda environment variables, so secrets are
never in the template or the repo. For `sam local` and tests, an environment variable
JALTAAP_SECRET_<NAME> (name upper-cased, slashes as underscores) overrides SSM, for example
JALTAAP_SECRET_TELEGRAM_BOT_TOKEN for /jaltaap/telegram/bot_token.
"""
from __future__ import annotations

import os

from common.aws import client
from common.config import settings

_cache: dict[str, str] = {}


def _override_name(name: str) -> str:
    return "JALTAAP_SECRET_" + name.strip("/").replace("/", "_").upper()


def get_secret(name: str) -> str:
    """name is relative to the prefix, e.g. 'telegram/bot_token'."""
    if name in _cache:
        return _cache[name]
    override = os.environ.get(_override_name(name))
    if override is not None:
        _cache[name] = override
        return override
    full = f"{settings().ssm_prefix}/{name}"
    value = client("ssm").get_parameter(Name=full, WithDecryption=True)["Parameter"]["Value"]
    _cache[name] = value
    return value


def clear() -> None:
    _cache.clear()
