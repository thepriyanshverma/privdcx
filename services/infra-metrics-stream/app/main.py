import asyncio
import time
from typing import Any, Dict, Optional

from fastapi import FastAPI, Query
from contextlib import asynccontextmanager
from app.services.stream_worker import StreamWorker

# Global worker instance
worker = StreamWorker(interval_s=2.0)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize worker
    await worker.start()
    yield
    # Cleanup
    await worker.stop()

app = FastAPI(title="InfraOS Metrics Stream Bridge", lifespan=lifespan)

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "running": worker.running,
        "paused": worker.is_paused,
    }

@app.get("/stream/status")
async def get_status():
    return {
        "running": worker.running,
        "is_paused": worker.is_paused,
        "topic": worker.topic,
        "polling_interval": worker.interval_s,
        "snapshot_flush_interval": worker.snapshot_flush_interval_s,
        "mongo_queue_size": worker._mongo_queue.qsize(),
        "metrics_polled": worker.metrics_to_poll,
        "last_tick_ts": worker.last_tick_ts,
        "last_tick_event_count": worker.last_tick_event_count,
        "prometheus_samples_seen_total": worker.prometheus_samples_seen_total,
        "samples_skipped_missing_labels_total": worker.samples_skipped_missing_labels_total,
        "kafka_events_published_total": worker.kafka_events_published_total,
        "mongo_snapshots_written_total": worker.mongo_snapshots_written_total,
        "mongo_docs_written_total": worker.mongo_docs_written_total,
    }

@app.post("/stream/pause")
async def pause_stream():
    worker.pause()
    return {"message": "Stream worker paused"}

@app.post("/stream/resume")
async def resume_stream():
    worker.resume()
    return {"message": "Stream worker resumed"}


def _safe_metric_value(row: Dict[str, Any]) -> Optional[float]:
    value = row.get("value")
    if isinstance(value, list) and len(value) >= 2:
        try:
            return float(value[1])
        except (TypeError, ValueError):
            return None
    return None


def _merge_entity_metric(
    entities: Dict[str, Dict[str, Any]],
    entity_id: str,
    entity_type: str,
) -> Dict[str, Any]:
    if entity_id not in entities:
        entities[entity_id] = {
            "entity_id": entity_id,
            "entityType": entity_type,
            "temperature": None,
            "power": None,
            "networkUsage": None,
            "deviceType": None,
            "metricName": None,
            "metricValue": None,
            "facilityId": None,
            "rackId": None,
        }
    return entities[entity_id]


@app.get("/api/v1/entities/live")
async def get_live_entity_metrics(
    workspace_id: str = Query(..., min_length=1),
    facility_id: Optional[str] = Query(default=None),
):
    metric_queries = await asyncio.gather(
        worker.prom_client.query_vector("rack_power_kw"),
        worker.prom_client.query_vector("rack_temp_c"),
        worker.prom_client.query_vector("device_power_kw"),
        worker.prom_client.query_vector("device_temp_c"),
        return_exceptions=True,
    )

    rack_power_rows = metric_queries[0] if isinstance(metric_queries[0], list) else []
    rack_temp_rows = metric_queries[1] if isinstance(metric_queries[1], list) else []
    device_power_rows = metric_queries[2] if isinstance(metric_queries[2], list) else []
    device_temp_rows = metric_queries[3] if isinstance(metric_queries[3], list) else []

    entities: Dict[str, Dict[str, Any]] = {}

    def include_row(labels: Dict[str, str]) -> bool:
        if str(labels.get("workspace_id") or "") != str(workspace_id):
            return False
        if facility_id and str(labels.get("facility_id") or "") != str(facility_id):
            return False
        return True

    for row in rack_power_rows:
        labels = row.get("metric") or {}
        if not include_row(labels):
            continue
        rack_id = str(labels.get("rack_id") or "").strip()
        if not rack_id:
            continue
        value = _safe_metric_value(row)
        if value is None:
            continue
        record = _merge_entity_metric(entities, rack_id, "rack")
        record["power"] = value
        record["metricName"] = "rack_power_kw"
        record["metricValue"] = value
        record["facilityId"] = labels.get("facility_id")

    for row in rack_temp_rows:
        labels = row.get("metric") or {}
        if not include_row(labels):
            continue
        rack_id = str(labels.get("rack_id") or "").strip()
        if not rack_id:
            continue
        value = _safe_metric_value(row)
        if value is None:
            continue
        record = _merge_entity_metric(entities, rack_id, "rack")
        record["temperature"] = value
        if not record.get("metricName"):
            record["metricName"] = "rack_temp_c"
            record["metricValue"] = value
        record["facilityId"] = labels.get("facility_id")

    for row in device_power_rows:
        labels = row.get("metric") or {}
        if not include_row(labels):
            continue
        device_id = str(labels.get("device_id") or "").strip()
        if not device_id:
            continue
        value = _safe_metric_value(row)
        if value is None:
            continue
        record = _merge_entity_metric(entities, device_id, "device")
        record["power"] = value
        record["metricName"] = "device_power_kw"
        record["metricValue"] = value
        record["facilityId"] = labels.get("facility_id")
        record["rackId"] = labels.get("rack_id")
        record["deviceType"] = labels.get("device_type")

    for row in device_temp_rows:
        labels = row.get("metric") or {}
        if not include_row(labels):
            continue
        device_id = str(labels.get("device_id") or "").strip()
        if not device_id:
            continue
        value = _safe_metric_value(row)
        if value is None:
            continue
        record = _merge_entity_metric(entities, device_id, "device")
        record["temperature"] = value
        if not record.get("metricName"):
            record["metricName"] = "device_temp_c"
            record["metricValue"] = value
        record["facilityId"] = labels.get("facility_id")
        record["rackId"] = labels.get("rack_id")
        if labels.get("device_type"):
            record["deviceType"] = labels.get("device_type")

    return {
        "workspace_id": workspace_id,
        "facility_id": facility_id,
        "updated_at": time.time(),
        "entities": entities,
    }


@app.get("/metrics/summary")
async def get_metrics_summary():
    """
    Returns a quick summary of the most important infrastructure metrics.
    """
    metrics = {
        "grid_load_mw": 0.0,
        "avg_inlet_temp_c": 0.0,
        "avg_risk_index": 0.0
    }
    
    # Query Prometheus for averages/sums
    load_val = await worker.prom_client.query_scalar("sum(rack_power_kw) / 1000")
    if load_val is not None:
        metrics["grid_load_mw"] = load_val
    
    temp_val = await worker.prom_client.query_scalar("avg(rack_temp_c)")
    if temp_val is not None:
        metrics["avg_inlet_temp_c"] = temp_val
    
    risk_val = await worker.prom_client.query_scalar("avg(infra_risk_index)")
    if risk_val is not None:
        metrics["avg_risk_index"] = risk_val
    
    return metrics
