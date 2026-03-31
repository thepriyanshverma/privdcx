from typing import Any, Dict, Iterable, List, Tuple


def _resolve_entity_id(labels: Dict[str, Any]) -> str:
    return str(
        labels.get("entity_id")
        or labels.get("device_id")
        or labels.get("rack_id")
        or ""
    ).strip()


def _extract_value(row: Dict[str, Any]) -> float | None:
    value = row.get("value")
    if not isinstance(value, list) or len(value) < 2:
        return None
    try:
        return float(value[1])
    except (TypeError, ValueError):
        return None


def normalize_prometheus_result(results: Iterable[Dict[str, Any]], metric_name: str) -> Dict[str, Dict[str, float]]:
    output: Dict[str, Dict[str, float]] = {}

    for row in results:
        labels = row.get("metric") or {}
        entity_id = _resolve_entity_id(labels)
        value = _extract_value(row)
        if not entity_id or value is None:
            continue

        if entity_id not in output:
            output[entity_id] = {}

        output[entity_id][metric_name] = value

    return output


def extract_entity_metadata(results: Iterable[Dict[str, Any]]) -> Dict[str, Dict[str, str]]:
    metadata: Dict[str, Dict[str, str]] = {}

    for row in results:
        labels = row.get("metric") or {}
        entity_id = _resolve_entity_id(labels)
        if not entity_id:
            continue

        slot = metadata.setdefault(entity_id, {})
        for label in (
            "workspace_id",
            "facility_id",
            "rack_id",
            "device_id",
            "entity_id",
            "entity_type",
            "device_type",
        ):
            value = labels.get(label)
            if value is None or value == "":
                continue
            slot[label] = str(value)

    return metadata


def merge_metric_maps(*metric_maps: Dict[str, Dict[str, float]]) -> Dict[str, Dict[str, float]]:
    merged: Dict[str, Dict[str, float]] = {}
    for metric_map in metric_maps:
        for entity_id, metrics in metric_map.items():
            merged.setdefault(entity_id, {}).update(metrics)
    return merged


def aggregate_rack(devices: List[Dict[str, Any]]) -> Dict[str, float | None]:
    temps = [float(device["temperature"]) for device in devices if device.get("temperature") is not None]
    power = [float(device["power"]) for device in devices if device.get("power") is not None]

    return {
        "avg_temperature": (sum(temps) / len(temps)) if temps else None,
        "total_power": sum(power) if power else None,
    }


def first_metric_value(metrics: Dict[str, float | None]) -> Tuple[str | None, float | None]:
    for key in ("temperature", "power", "network", "avg_temperature", "total_power"):
        value = metrics.get(key)
        if value is None:
            continue
        return key, float(value)
    return None, None
