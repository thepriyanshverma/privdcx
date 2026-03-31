import os
from typing import Any, Optional

import httpx
import structlog


class AlertServiceClient:
    def __init__(self):
        self.base_url = os.getenv("ALERT_SERVICE_URL", "http://infra-alert-engine:8012")
        self.timeout_s = float(os.getenv("ALERT_SERVICE_TIMEOUT_S", "8"))
        self.client = httpx.AsyncClient(timeout=self.timeout_s)
        self.logger = structlog.get_logger("infra-runtime.alert-service")
        self._rules_cache: dict[str, dict[str, Any]] = {}

    async def close(self) -> None:
        await self.client.aclose()

    async def acknowledge_alert(self, alert_id: str) -> bool:
        try:
            resp = await self.client.post(f"{self.base_url}/api/v1/alerts/{alert_id}/ack")
            return resp.status_code == 200
        except Exception as exc:
            self.logger.warning("alert_ack_failed", alert_id=alert_id, error=str(exc))
            return False

    async def resolve_alert(self, alert_id: str) -> bool:
        try:
            resp = await self.client.post(f"{self.base_url}/api/v1/alerts/{alert_id}/resolve")
            return resp.status_code == 200
        except Exception as exc:
            self.logger.warning("alert_resolve_failed", alert_id=alert_id, error=str(exc))
            return False

    async def get_rule(self, rule_id: str) -> Optional[dict[str, Any]]:
        if rule_id in self._rules_cache:
            return self._rules_cache[rule_id]
        try:
            resp = await self.client.get(f"{self.base_url}/api/v1/rules")
            if resp.status_code != 200:
                return None
            rules = resp.json()
            self._rules_cache = {str(rule.get("rule_id", "")): rule for rule in rules if rule.get("rule_id")}
            return self._rules_cache.get(rule_id)
        except Exception as exc:
            self.logger.warning("alert_rule_fetch_failed", rule_id=rule_id, error=str(exc))
            return None

    async def find_latest_active_alert_id(self, *, workspace_id: str, entity_id: str, rule_id: str) -> Optional[str]:
        try:
            params = {"workspace_id": workspace_id, "entity_id": entity_id, "limit": 20}
            resp = await self.client.get(f"{self.base_url}/api/v1/alerts", params=params)
            if resp.status_code != 200:
                return None
            alerts = resp.json()
            for alert in alerts:
                if alert.get("rule_id") == rule_id and alert.get("status") == "ACTIVE":
                    return alert.get("id")
            return None
        except Exception as exc:
            self.logger.warning(
                "alert_lookup_failed",
                workspace_id=workspace_id,
                entity_id=entity_id,
                rule_id=rule_id,
                error=str(exc),
            )
            return None
