import asyncio
import logging
import os
from typing import Any, Dict, List

import httpx

PROM_URL = os.getenv("PROMETHEUS_URL", "http://prometheus:9090").rstrip("/")
PROM_TIMEOUT_S = float(os.getenv("PROMETHEUS_TIMEOUT_S", "5"))
PROM_RETRIES = int(os.getenv("PROMETHEUS_QUERY_RETRIES", "2"))
PROM_RETRY_BACKOFF_S = float(os.getenv("PROMETHEUS_RETRY_BACKOFF_S", "0.25"))

logger = logging.getLogger("metrics-adapter.prometheus")

_client: httpx.AsyncClient | None = None
_client_lock = asyncio.Lock()


async def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        async with _client_lock:
            if _client is None:
                _client = httpx.AsyncClient(base_url=PROM_URL, timeout=PROM_TIMEOUT_S)
    return _client


async def close_prometheus_client() -> None:
    global _client
    if _client is None:
        return
    await _client.aclose()
    _client = None


async def query_prometheus(query: str) -> List[Dict[str, Any]]:
    if not query:
        return []

    client = await _get_client()
    last_error: Exception | None = None
    for attempt in range(PROM_RETRIES + 1):
        try:
            response = await client.get("/api/v1/query", params={"query": query})
            response.raise_for_status()
            payload = response.json()

            if payload.get("status") != "success":
                logger.warning("query_unsuccessful", extra={"query": query, "status": payload.get("status")})
                return []

            result = payload.get("data", {}).get("result")
            if isinstance(result, list):
                return result
            return []
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if attempt < PROM_RETRIES:
                await asyncio.sleep(PROM_RETRY_BACKOFF_S * (attempt + 1))

    logger.error("query_failed", extra={"query": query, "error": str(last_error)})
    return []
