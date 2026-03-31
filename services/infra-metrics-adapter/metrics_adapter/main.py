import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Query

from metrics_adapter.models.schemas import (
    AllMetricsResponse,
    EntityMetricsResponse,
    LiveEntitiesResponse,
)
from metrics_adapter.services.aggregator_runner import AggregationRunner
from metrics_adapter.services.cache import (
    close_cache,
    get_all_entity_metrics,
    get_entities_for_workspace,
    get_entity_metrics,
)
from metrics_adapter.services.prometheus_client import close_prometheus_client

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

runner = AggregationRunner()


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    await runner.start()
    yield
    await runner.stop()
    await close_prometheus_client()
    await close_cache()


app = FastAPI(title="InfraOS Metrics Adapter", version="1.0.0", lifespan=lifespan)


async def _entity_response(entity_id: str):
    data = await get_entity_metrics(entity_id)
    return {
        "entity_id": entity_id,
        "metrics": data or {},
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "infra-metrics-adapter",
        "running": runner.running,
        "last_run_ts": runner.last_run_ts,
        "last_error": runner.last_error,
    }


@app.get("/metrics/entity/{entity_id}", response_model=EntityMetricsResponse)
async def get_entity(entity_id: str):
    return await _entity_response(entity_id)


@app.get("/api/v1/entity/{entity_id}", response_model=EntityMetricsResponse)
async def get_entity_v1(entity_id: str):
    return await _entity_response(entity_id)


@app.get("/metrics/all", response_model=AllMetricsResponse)
async def get_all(limit: int = Query(default=2000, ge=1, le=20000)):
    entities = await get_all_entity_metrics(limit=limit)
    return {
        "count": len(entities),
        "entities": entities,
    }


@app.get("/api/v1/entities/live", response_model=LiveEntitiesResponse)
async def get_live_entities(
    workspace_id: str = Query(..., min_length=1),
    facility_id: str | None = Query(default=None),
):
    entities = await get_entities_for_workspace(workspace_id=workspace_id, facility_id=facility_id)
    return {
        "workspace_id": workspace_id,
        "facility_id": facility_id,
        "updated_at": time.time(),
        "entities": entities,
    }
