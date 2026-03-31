from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import FastAPI, HTTPException, Path, Query

from app.schemas.alerts import AlertRule, AlertSeverity, PersistedAlert
from app.services.processor import AlertProcessor


processor = AlertProcessor()

DEFAULT_RULES = [
    AlertRule(
        rule_id="THERMAL_WARNING",
        metric_name="rack_temp_c",
        operator=">",
        threshold=35.0,
        severity=AlertSeverity.WARNING,
        cooldown_sec=45,
        description="Rack temperature exceeded 35C warning threshold",
    ),
    AlertRule(
        rule_id="THERMAL_CRITICAL",
        metric_name="rack_temp_c",
        operator=">",
        threshold=45.0,
        severity=AlertSeverity.CRITICAL,
        cooldown_sec=60,
        description="Rack temperature exceeded 45C critical threshold",
    ),
    AlertRule(
        rule_id="POWER_CRITICAL",
        metric_name="rack_power_kw",
        operator=">",
        threshold=20.0,
        severity=AlertSeverity.CRITICAL,
        cooldown_sec=60,
        description="Rack power draw exceeded 20kW critical threshold",
    ),
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    processor.rule_engine.replace_rules(DEFAULT_RULES)
    await processor.start()
    yield
    await processor.stop()


app = FastAPI(title="InfraOS Alert Engine", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.get("/engine/status")
async def get_status():
    return {
        "running": processor.running,
        "is_paused": processor.is_paused,
        "rule_count": len(processor.rule_engine.list_rules()),
        "kafka_topic": processor.consumer.topic,
        "consumer_group": processor.consumer.group_id,
        "metrics_events_seen_total": processor.metrics_events_seen_total,
        "alerts_evaluated_total": processor.alerts_evaluated_total,
        "alerts_published_total": processor.alerts_published_total,
        "alerts_suppressed_total": processor.alerts_suppressed_total,
        "alerts_persisted_total": processor.alerts_persisted_total,
    }


@app.post("/engine/pause")
async def pause_engine():
    processor.is_paused = True
    return {"message": "Alert engine paused"}


@app.post("/engine/resume")
async def resume_engine():
    processor.is_paused = False
    return {"message": "Alert engine resumed"}


@app.get("/api/v1/rules", response_model=list[AlertRule])
async def list_rules():
    return processor.rule_engine.list_rules()


@app.post("/api/v1/rules", response_model=AlertRule, status_code=201)
async def create_or_update_rule(rule: AlertRule):
    return processor.rule_engine.upsert_rule(rule)


@app.delete("/api/v1/rules/{rule_id}")
async def delete_rule(rule_id: Annotated[str, Path(min_length=1)]):
    deleted = processor.rule_engine.delete_rule(rule_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Rule '{rule_id}' not found")
    return {"success": True, "rule_id": rule_id}


@app.get("/api/v1/alerts", response_model=list[PersistedAlert])
async def list_alert_history(
    workspace_id: Annotated[str, Query(min_length=1)],
    severity: Annotated[AlertSeverity | None, Query()] = None,
    entity_id: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=1000)] = 100,
):
    return await processor.mongo_store.list_alerts(
        workspace_id=workspace_id,
        severity=severity,
        entity_id=entity_id,
        limit=limit,
    )


@app.post("/api/v1/alerts/{alert_id}/ack")
async def acknowledge_alert(alert_id: Annotated[str, Path(min_length=1)]):
    updated = await processor.mongo_store.acknowledge_alert(alert_id)
    if not updated:
        raise HTTPException(status_code=404, detail=f"Alert '{alert_id}' not found")
    return {"success": True, "id": alert_id, "acknowledged": True}


@app.post("/api/v1/alerts/{alert_id}/resolve")
async def resolve_alert(alert_id: Annotated[str, Path(min_length=1)]):
    updated = await processor.mongo_store.resolve_alert(alert_id)
    if not updated:
        raise HTTPException(status_code=404, detail=f"Alert '{alert_id}' not found")
    return {"success": True, "id": alert_id, "status": "RESOLVED", "acknowledged": True}
