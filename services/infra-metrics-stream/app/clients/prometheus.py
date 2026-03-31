import httpx
import asyncio
from typing import List, Dict, Any, Optional
import os
import structlog

class PrometheusClient:
    def __init__(self, base_url: str | None = None):
        self.base_url = base_url or os.getenv("PROMETHEUS_URL", "http://prometheus:9090")
        self.timeout_s = float(os.getenv("PROMETHEUS_TIMEOUT_S", "5"))
        self.retries = int(os.getenv("PROMETHEUS_QUERY_RETRIES", "2"))
        self.retry_backoff_s = float(os.getenv("PROMETHEUS_RETRY_BACKOFF_S", "0.25"))
        self.client = httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout_s)
        self.logger = structlog.get_logger("infra-metrics-stream.prometheus")

    async def query_vector(self, query: str) -> List[Dict[str, Any]]:
        """
        Queries Prometheus instant vector endpoint and returns raw metric samples.
        Retries on transient failures.
        """
        params = {"query": query}
        url = "/api/v1/query"
        for attempt in range(self.retries + 1):
            try:
                response = await self.client.get(url, params=params)
                response.raise_for_status()
                data = response.json()
                if data.get("status") != "success":
                    self.logger.warning(
                        "prometheus_query_unsuccessful",
                        query=query,
                        status=data.get("status"),
                    )
                    return []
                result_type = data.get("data", {}).get("resultType")
                if result_type != "vector":
                    self.logger.warning(
                        "prometheus_query_unexpected_type",
                        query=query,
                        result_type=result_type,
                    )
                    return []
                return data.get("data", {}).get("result", [])
            except Exception as exc:
                if attempt < self.retries:
                    await asyncio.sleep(self.retry_backoff_s * (attempt + 1))
                    continue
                self.logger.error(
                    "prometheus_query_failed",
                    query=query,
                    attempts=attempt + 1,
                    error=str(exc),
                )
                return []

    async def query_scalar(self, query: str) -> Optional[float]:
        rows = await self.query_vector(query)
        if not rows:
            return None
        try:
            return float(rows[0]["value"][1])
        except Exception:
            return None

    async def close(self):
        await self.client.aclose()
