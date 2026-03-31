from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.router import router as api_v1_router
from app.services.topology_events import start_topology_events, stop_topology_events
# from app.middleware.context import inject_workspace_context # To be implemented similarly

app = FastAPI(title="InfraOS Rack Lifecycle & Placement", version="1.0.0")

@app.on_event("startup")
async def startup():
    from app.core.database import engine, Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await start_topology_events()


@app.on_event("shutdown")
async def shutdown():
    await stop_topology_events()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global dependencies (using a simpler pattern for now or reusing tenant logic)
app.include_router(api_v1_router, prefix="/api/v1")

@app.get("/health")
async def health():
    return {"status": "healthy", "service": "infra-rack"}
