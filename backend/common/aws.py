"""boto3 clients, created once per container."""
from __future__ import annotations

from functools import lru_cache

import boto3
from botocore.config import Config

from common.config import settings

_RETRY = Config(retries={"max_attempts": 3, "mode": "standard"}, connect_timeout=3, read_timeout=20)


@lru_cache(maxsize=None)
def client(name: str, region: str | None = None):
    return boto3.client(name, region_name=region or settings().region, config=_RETRY)


@lru_cache(maxsize=None)
def table(name: str):
    return boto3.resource("dynamodb", region_name=settings().region, config=_RETRY).Table(name)


def reset_cache() -> None:
    """Tests call this after starting moto."""
    client.cache_clear()
    table.cache_clear()
