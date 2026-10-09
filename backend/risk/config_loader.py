"""Loads risk.yaml once per container."""
from functools import lru_cache
from pathlib import Path

import yaml

CONFIG_PATH = Path(__file__).parent / "config" / "risk.yaml"


@lru_cache(maxsize=1)
def load_config() -> dict:
    with open(CONFIG_PATH, encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def heat_config() -> dict:
    return load_config()["heat"]


def flood_config() -> dict:
    return load_config()["flood"]
