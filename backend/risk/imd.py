"""Optional IMD adapter (P2), behind IMD_ENABLED=false.

IMD's API list includes district warnings (warnings_district_api.php), district nowcast
(nowcast_district_api.php) and district rainfall (districtwise_rainfall_api.php). Access goes
through IMD's authenticated API platform. The demo never depends on this client.
"""
from __future__ import annotations

import httpx

from common.config import settings

BASE = "https://mausam.imd.gov.in/api"


class ImdClient:
    def __init__(self, enabled: bool | None = None):
        self.enabled = settings().imd_enabled if enabled is None else enabled

    def district_warnings(self, district_id: str) -> list[dict] | None:
        """Returns IMD district warnings, or None when the adapter is disabled or IMD is unreachable."""
        if not self.enabled:
            return None
        try:
            r = httpx.get(f"{BASE}/warnings_district_api.php", params={"id": district_id}, timeout=8.0)
            r.raise_for_status()
            data = r.json()
            return data if isinstance(data, list) else [data]
        except (httpx.HTTPError, ValueError):
            return None
