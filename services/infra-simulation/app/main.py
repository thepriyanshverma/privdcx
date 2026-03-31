from fastapi import FastAPI
from contextlib import asynccontextmanager
from app.api.metrics import get_prometheus_metrics
from app.services.loop import SimulationLoop
from app.services.state_store import metrics_store

sim_loop = SimulationLoop(tick_interval_s=1.0, metrics_store=metrics_store)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start Simulation Loop
    await sim_loop.start()
    yield
    # Stop Simulation Loop
    await sim_loop.stop()

app = FastAPI(title="InfraOS Simulation & Telemetry", lifespan=lifespan)

@app.get("/metrics")
async def metrics():
    return await get_prometheus_metrics(metrics_store)

@app.get("/health")
async def health():
    snapshot = await metrics_store.snapshot()
    return {
        "status": "healthy",
        "service": "infra-simulation",
        "running": sim_loop.running,
        "devices": len(snapshot["devices"]),
        "racks": len(snapshot["racks"]),
        "facilities": len(snapshot["facilities"]),
    }
