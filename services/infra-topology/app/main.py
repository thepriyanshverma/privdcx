from contextlib import asynccontextmanager

from fastapi import FastAPI, Query

from app.schemas.topology import EdgeUpsertRequest
from app.services.engine import TopologyEngine


engine = TopologyEngine()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await engine.start()
    yield
    await engine.stop()


app = FastAPI(title="InfraOS Topology Service", version="1.0.0", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "infra-topology", "running": engine.running}


@app.get("/api/v1/topology/{workspace_id}")
async def get_topology(workspace_id: str):
    return await engine.graph_store.get_topology(workspace_id)


@app.get("/api/v1/topology/neighbors/{entity_id}")
async def get_neighbors(entity_id: str, workspace_id: str = Query(..., min_length=1)):
    neighbors = await engine.graph_store.get_neighbors(workspace_id=workspace_id, entity_id=entity_id)
    return {"workspace_id": workspace_id, "entity_id": entity_id, "neighbors": neighbors}


@app.get("/api/v1/topology/path")
async def get_path(
    workspace_id: str = Query(..., min_length=1),
    from_id: str = Query(..., min_length=1),
    to_id: str = Query(..., min_length=1),
    edge_type: str | None = Query(default=None),
):
    return await engine.graph_store.get_path(
        workspace_id=workspace_id,
        from_id=from_id,
        to_id=to_id,
        edge_type=edge_type,
    )


@app.get("/api/v1/topology/blast-radius/{entity_id}")
async def get_blast_radius(
    entity_id: str,
    workspace_id: str = Query(..., min_length=1),
    depth: int = Query(default=2, ge=1, le=6),
):
    return await engine.graph_store.get_blast_radius(
        workspace_id=workspace_id,
        entity_id=entity_id,
        depth=depth,
    )


@app.post("/api/v1/topology/edges", status_code=201)
async def upsert_edge(payload: EdgeUpsertRequest):
    await engine.graph_store.upsert_manual_edge(payload)
    return {"success": True, "workspace_id": payload.workspace_id}
