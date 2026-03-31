import asyncio
import logging
import os
import time
from collections import defaultdict
from typing import Any, Dict

from metrics_adapter.services.aggregator import (
    aggregate_rack,
    extract_entity_metadata,
    first_metric_value,
    merge_metric_maps,
    normalize_prometheus_result,
)
from metrics_adapter.services.cache import set_entity_metrics
from metrics_adapter.services.prometheus_client import query_prometheus

logger = logging.getLogger("metrics-adapter.runner")

AGGREGATION_INTERVAL_SECONDS = float(os.getenv("AGGREGATION_INTERVAL_SECONDS", "5"))

TEMPERATURE_QUERY = os.getenv("PROM_QUERY_TEMPERATURE", "rack_temp_c or device_temp_c")
POWER_QUERY = os.getenv("PROM_QUERY_POWER", "power_kw or rack_power_kw or device_power_kw")
NETWORK_QUERY = os.getenv("PROM_QUERY_NETWORK", "network_io or device_network_io")

RACK_TEMP_AGG_QUERY = os.getenv(
    "PROM_QUERY_RACK_AVG_TEMP",
    "avg by (workspace_id, facility_id, rack_id) (rack_temp_c or device_temp_c)",
)
RACK_POWER_AGG_QUERY = os.getenv(
    "PROM_QUERY_RACK_TOTAL_POWER",
    "sum by (workspace_id, facility_id, rack_id) (power_kw or rack_power_kw or device_power_kw)",
)


def _merge_metadata(*maps: Dict[str, Dict[str, str]]) -> Dict[str, Dict[str, str]]:
    merged: Dict[str, Dict[str, str]] = {}
    for meta_map in maps:
        for entity_id, payload in meta_map.items():
            merged.setdefault(entity_id, {}).update(payload)
    return merged


def _as_entity_type(entity_id: str, metadata: Dict[str, str]) -> str:
    explicit = str(metadata.get("entity_type") or "").strip().lower()
    if explicit:
        return explicit

    if str(metadata.get("device_id") or "").strip():
        return "device"

    rack_id = str(metadata.get("rack_id") or "").strip()
    if rack_id and rack_id == entity_id:
        return "rack"

    return "entity"


def _group_devices_by_rack(
    metrics_map: Dict[str, Dict[str, float]],
    metadata_map: Dict[str, Dict[str, str]],
) -> tuple[Dict[str, list[Dict[str, Any]]], Dict[str, Dict[str, str]]]:
    grouped: Dict[str, list[Dict[str, Any]]] = defaultdict(list)
    rack_metadata: Dict[str, Dict[str, str]] = {}
    for entity_id, metrics in metrics_map.items():
        meta = metadata_map.get(entity_id, {})
        if _as_entity_type(entity_id, meta) != "device":
            continue
        rack_id = str(meta.get("rack_id") or "").strip()
        if not rack_id:
            continue
        grouped[rack_id].append(metrics)
        if rack_id not in rack_metadata:
            rack_metadata[rack_id] = {
                "workspace_id": str(meta.get("workspace_id") or "").strip(),
                "facility_id": str(meta.get("facility_id") or "").strip(),
                "rack_id": rack_id,
            }
    return grouped, rack_metadata


def _build_entity_payload(
    entity_id: str,
    metrics: Dict[str, float],
    metadata: Dict[str, str],
) -> Dict[str, Any]:
    metric_name, metric_value = first_metric_value(metrics)
    payload = {
        "temperature": metrics.get("temperature"),
        "power": metrics.get("power"),
        "network": metrics.get("network"),
        "networkUsage": metrics.get("network"),
        "status": "ACTIVE",
        "metricName": metric_name,
        "metricValue": metric_value,
        "entityType": _as_entity_type(entity_id, metadata),
        "deviceType": metadata.get("device_type"),
        "workspace_id": metadata.get("workspace_id"),
        "facility_id": metadata.get("facility_id"),
        "rack_id": metadata.get("rack_id"),
        "updated_at": time.time(),
    }
    return payload


async def fetch_and_store() -> Dict[str, int]:
    temp_results, power_results, network_results, rack_temp_results, rack_power_results = await asyncio.gather(
        query_prometheus(TEMPERATURE_QUERY),
        query_prometheus(POWER_QUERY),
        query_prometheus(NETWORK_QUERY),
        query_prometheus(RACK_TEMP_AGG_QUERY),
        query_prometheus(RACK_POWER_AGG_QUERY),
    )

    temp_map = normalize_prometheus_result(temp_results, "temperature")
    power_map = normalize_prometheus_result(power_results, "power")
    net_map = normalize_prometheus_result(network_results, "network")
    entity_metrics = merge_metric_maps(temp_map, power_map, net_map)

    entity_meta = _merge_metadata(
        extract_entity_metadata(temp_results),
        extract_entity_metadata(power_results),
        extract_entity_metadata(network_results),
    )

    cached_entities = 0
    for entity_id, metrics in entity_metrics.items():
        metadata = entity_meta.get(entity_id, {})
        payload = _build_entity_payload(entity_id, metrics, metadata)
        await set_entity_metrics(
            entity_id=entity_id,
            data=payload,
            workspace_id=payload.get("workspace_id"),
            facility_id=payload.get("facility_id"),
        )
        cached_entities += 1

    rack_temp_map = normalize_prometheus_result(rack_temp_results, "avg_temperature")
    rack_power_map = normalize_prometheus_result(rack_power_results, "total_power")
    rack_meta = _merge_metadata(
        extract_entity_metadata(rack_temp_results),
        extract_entity_metadata(rack_power_results),
    )
    rack_metrics = merge_metric_maps(rack_temp_map, rack_power_map)

    # Fallback rack aggregation from device metrics if aggregate queries are sparse.
    device_groups, fallback_rack_meta = _group_devices_by_rack(entity_metrics, entity_meta)
    for rack_id, devices in device_groups.items():
        fallback_agg = aggregate_rack(devices)
        rack_slot = rack_metrics.setdefault(rack_id, {})
        if rack_slot.get("avg_temperature") is None:
            rack_slot["avg_temperature"] = fallback_agg.get("avg_temperature")
        if rack_slot.get("total_power") is None:
            rack_slot["total_power"] = fallback_agg.get("total_power")
        rack_meta.setdefault(rack_id, {}).update({
            "workspace_id": fallback_rack_meta.get(rack_id, {}).get("workspace_id"),
            "facility_id": fallback_rack_meta.get(rack_id, {}).get("facility_id"),
            "rack_id": rack_id,
        })

    cached_racks = 0
    for rack_id, rack_values in rack_metrics.items():
        metadata = rack_meta.get(rack_id, {})
        payload = {
            "temperature": rack_values.get("avg_temperature"),
            "power": rack_values.get("total_power"),
            "network": None,
            "networkUsage": None,
            "status": "ACTIVE",
            "metricName": "avg_temperature" if rack_values.get("avg_temperature") is not None else "total_power",
            "metricValue": (
                rack_values.get("avg_temperature")
                if rack_values.get("avg_temperature") is not None
                else rack_values.get("total_power")
            ),
            "entityType": "rack",
            "workspace_id": metadata.get("workspace_id"),
            "facility_id": metadata.get("facility_id"),
            "rack_id": metadata.get("rack_id", rack_id),
            "updated_at": time.time(),
        }
        await set_entity_metrics(
            entity_id=rack_id,
            data=payload,
            workspace_id=payload.get("workspace_id"),
            facility_id=payload.get("facility_id"),
        )
        cached_racks += 1

    return {
        "entities": cached_entities,
        "racks": cached_racks,
    }


class AggregationRunner:
    def __init__(self, interval_seconds: float = AGGREGATION_INTERVAL_SECONDS):
        self.interval_seconds = max(1.0, float(interval_seconds))
        self.running = False
        self.last_error: str | None = None
        self.last_run_ts: float | None = None
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        self.running = True
        self._task = asyncio.create_task(self._run(), name="metrics-adapter-aggregation-loop")

    async def stop(self) -> None:
        self.running = False
        if self._task is None:
            return
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        self._task = None

    async def _run(self) -> None:
        while self.running:
            try:
                result = await fetch_and_store()
                self.last_error = None
                self.last_run_ts = time.time()
                logger.info("aggregation_completed", extra=result)
            except Exception as exc:  # noqa: BLE001
                self.last_error = str(exc)
                self.last_run_ts = time.time()
                logger.exception("aggregation_failed")
            await asyncio.sleep(self.interval_seconds)


_default_runner = AggregationRunner()


async def start_loop() -> None:
    await _default_runner.start()


async def stop_loop() -> None:
    await _default_runner.stop()


def get_runner() -> AggregationRunner:
    return _default_runner
