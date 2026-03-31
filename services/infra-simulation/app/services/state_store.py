import asyncio
import time
from typing import Any


class MetricsStore:
    """
    Thread-safe in-memory state store for latest simulation outputs.
    """

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._latest_metrics: dict[str, Any] = {
            "updated_at": 0.0,
            "devices": [],
            "racks": [],
            "facilities": [],
            "prometheus_text": "",
        }

    async def update(
        self,
        *,
        devices: list[dict[str, Any]],
        racks: list[dict[str, Any]],
        facilities: list[dict[str, Any]],
        prometheus_text: str,
    ) -> None:
        now = time.time()
        async with self._lock:
            self._latest_metrics = {
                "updated_at": now,
                "devices": list(devices),
                "racks": list(racks),
                "facilities": list(facilities),
                "prometheus_text": prometheus_text,
            }

    async def snapshot(self) -> dict[str, Any]:
        async with self._lock:
            return {
                "updated_at": self._latest_metrics["updated_at"],
                "devices": list(self._latest_metrics["devices"]),
                "racks": list(self._latest_metrics["racks"]),
                "facilities": list(self._latest_metrics["facilities"]),
                "prometheus_text": self._latest_metrics["prometheus_text"],
            }


metrics_store = MetricsStore()
