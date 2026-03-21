from fastapi import FastAPI, HTTPException
from contextlib import asynccontextmanager
from typing import List, Optional
from app.services.orchestrator import RuntimeOrchestrator
from app.schemas.runtime import InfraState

# Global Orchestrator
orchestrator = RuntimeOrchestrator()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Setup sample topology for propagation (e.g., Rack_1 <-> Rack_2)
    orchestrator.propagation_model.update_topology([("R1", "R2"), ("R2", "R3")])
    await orchestrator.start()
    yield
    await orchestrator.stop()

app = FastAPI(title="InfraOS Runtime Orchestrator", lifespan=lifespan)

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.get("/state/{entity_id}", response_model=Optional[InfraState])
async def get_state(entity_id: str):
    state = await orchestrator.state_manager.get_current_state(entity_id)
    if not state:
        raise HTTPException(status_code=404, detail="State not found")
    return state

@app.post("/remediation/pause")
async def pause_remediation():
    orchestrator.is_paused = True
    return {"message": "Remediation engine paused"}

@app.post("/remediation/resume")
async def resume_remediation():
    orchestrator.is_paused = False
    return {"message": "Remediation engine resumed"}

@app.post("/state/snapshot")
async def create_snapshot():
    # In a real app, this would trigger a Mongo dump of current states
    return {"message": "Manual snapshot created"}
