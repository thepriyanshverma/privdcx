from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Query

from app.schemas.runtime import InfraState
from app.services.orchestrator import RuntimeOrchestrator


orchestrator = RuntimeOrchestrator()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await orchestrator.start()
    yield
    await orchestrator.stop()


app = FastAPI(title="InfraOS Runtime Orchestrator", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.get("/api/v1/state/{entity_id}", response_model=Optional[InfraState])
async def get_state(entity_id: str):
    state = await orchestrator.state_manager.get_current_state(entity_id)
    if not state:
        raise HTTPException(status_code=404, detail="State not found")
    return state


@app.get("/api/v1/state")
async def list_states(
    workspace_id: str = Query(..., min_length=1),
    entity_id: str | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=2000),
):
    return await orchestrator.state_manager.list_states(
        workspace_id=workspace_id,
        entity_id=entity_id,
        limit=limit,
    )


@app.post("/api/v1/remediation/pause")
async def pause_remediation():
    orchestrator.is_paused = True
    return {"message": "Remediation engine paused"}


@app.post("/api/v1/remediation/resume")
async def resume_remediation():
    orchestrator.is_paused = False
    return {"message": "Remediation engine resumed"}


@app.post("/api/v1/state/snapshot")
async def create_snapshot():
    snapshot = await orchestrator.state_manager.snapshot_states()
    return {
        "message": "State snapshot created",
        "timestamp": snapshot["timestamp"],
        "state_count": snapshot["state_count"],
    }


@app.get("/api/v1/remediation/actions")
async def list_remediation_actions(
    workspace_id: str = Query(..., min_length=1),
    entity_id: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
):
    return await orchestrator.state_manager.list_remediations(
        workspace_id=workspace_id,
        entity_id=entity_id,
        limit=limit,
    )


@app.get("/api/v1/remediation/verifications")
async def list_verifications(
    workspace_id: str = Query(..., min_length=1),
    entity_id: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
):
    return await orchestrator.state_manager.list_verifications(
        workspace_id=workspace_id,
        entity_id=entity_id,
        limit=limit,
    )
