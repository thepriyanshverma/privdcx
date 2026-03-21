from fastapi import FastAPI
from contextlib import asynccontextmanager
from app.api.metrics import get_prometheus_metrics
from app.services.loop import SimulationLoop

sim_loop = SimulationLoop(tick_interval_s=1.0)

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
    return get_prometheus_metrics()

@app.get("/health")
async def health():
    return {"status": "healthy", "service": "infra-simulation"}
