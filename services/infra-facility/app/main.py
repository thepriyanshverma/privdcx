from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.router import router as api_v1_router
from app.middleware.context import inject_workspace_context

app = FastAPI(title="InfraOS Facility Physical Topology", version="1.0.0")

@app.on_event("startup")
async def startup():
    from app.core.database import engine, Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global dependencies
app.include_router(api_v1_router, prefix="/api/v1", dependencies=[Depends(inject_workspace_context)])

@app.get("/health")
async def health():
    return {"status": "healthy", "service": "infra-facility"}
