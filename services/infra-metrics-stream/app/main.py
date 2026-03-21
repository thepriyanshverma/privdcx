from fastapi import FastAPI, HTTPException
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
    return {"status": "healthy"}

@app.get("/stream/status")
async def get_status():
    return {
        "running": worker.running,
        "is_paused": worker.is_paused,
        "topic": worker.topic,
        "polling_interval": worker.interval_s
    }

@app.post("/stream/pause")
async def pause_stream():
    worker.pause()
    return {"message": "Stream worker paused"}

@app.post("/stream/resume")
async def resume_stream():
    worker.resume()
    return {"message": "Stream worker resumed"}
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
    load_events = await worker.prom_client.query_metrics("sum(rack_power_kw) / 1000")
    if load_events: metrics["grid_load_mw"] = load_events[0].value
    
    temp_events = await worker.prom_client.query_metrics("avg(rack_temp_c)")
    if temp_events: metrics["avg_inlet_temp_c"] = temp_events[0].value
    
    risk_events = await worker.prom_client.query_metrics("avg(infra_risk_index)")
    if risk_events: metrics["avg_risk_index"] = risk_events[0].value
    
    return metrics
