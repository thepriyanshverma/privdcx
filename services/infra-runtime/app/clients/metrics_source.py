import os
from typing import Any, Optional

import httpx
import structlog


def _operator_violation(value: float, operator: str, threshold: float) -> bool:
    if operator == ">":
        return value > threshold
    if operator == "<":
        return value < threshold
    if operator == ">=":
        return value >= threshold
    if operator == "<=":
        return value <= threshold
    if operator == "==":
        return value == threshold
    return False


class MetricsSourceClient:
    def __init__(self):
        self.prometheus_url = os.getenv("PROMETHEUS_URL", "http://prometheus:9090")
        self.timeout_s = float(os.getenv("RUNTIME_METRICS_TIMEOUT_S", "8"))
        self.client = httpx.AsyncClient(timeout=self.timeout_s)
        self.logger = structlog.get_logger("infra-runtime.metrics-source")

    async def close(self) -> None:
        await self.client.aclose()

    async def query_current_metric(
        self,
        *,
        metric_name: str,
        entity_type: str,
        entity_id: str,
        workspace_id: Optional[str],
        facility_id: Optional[str],
    ) -> Optional[float]:
        label_clauses = []
        if entity_type == "device":
            label_clauses.append(f'device_id="{entity_id}"')
        elif entity_type == "rack":
            label_clauses.append(f'rack_id="{entity_id}"')
        else:
            label_clauses.append(f'facility_id="{entity_id}"')

        if workspace_id:
            label_clauses.append(f'workspace_id="{workspace_id}"')
        if facility_id and entity_type != "facility":
            label_clauses.append(f'facility_id="{facility_id}"')

        if label_clauses:
            query = f'{metric_name}{{{",".join(label_clauses)}}}'
        else:
            query = metric_name

        try:
            resp = await self.client.get(f"{self.prometheus_url}/api/v1/query", params={"query": query})
            if resp.status_code != 200:
                self.logger.warning("prom_query_failed", status=resp.status_code, query=query, body=resp.text)
                return None
            payload = resp.json()
            data = payload.get("data", {})
            result = data.get("result", [])
            if not result:
                return None
            value_pair = result[0].get("value", [])
            if len(value_pair) != 2:
                return None
            return float(value_pair[1])
        except Exception as exc:
            self.logger.warning("prom_query_exception", query=query, error=str(exc))
            return None

    def safe_threshold(self, metric_name: str, operator: str, threshold: float) -> float:
        metric_lower = metric_name.lower()
        if operator in {">", ">="}:
            margin = 5.0 if "temp" in metric_lower else max(1.0, threshold * 0.1)
            return threshold - margin
        if operator in {"<", "<="}:
            margin = 2.0 if "temp" in metric_lower else max(1.0, abs(threshold) * 0.1)
            return threshold + margin
        # Equality rule: define a small drift band.
        return threshold

    def verify_success(self, *, observed_value: float, operator: str, threshold: float, metric_name: str) -> tuple[bool, float]:
        safe_threshold = self.safe_threshold(metric_name, operator, threshold)
        if operator in {">", ">="}:
            return observed_value < safe_threshold, safe_threshold
        if operator in {"<", "<="}:
            return observed_value > safe_threshold, safe_threshold
        # For equality rules we require drift outside small tolerance.
        tolerance = max(1.0, abs(threshold) * 0.1)
        return abs(observed_value - threshold) > tolerance, safe_threshold

    def still_violating(self, *, observed_value: float, operator: str, threshold: float) -> bool:
        return _operator_violation(observed_value, operator, threshold)
