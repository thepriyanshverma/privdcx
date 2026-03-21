from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.router import root_router
from app.db.base import Base
from app.db.session import engine

import asyncio

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    debug=settings.DEBUG,
)

# Set up CORS
if settings.BACKEND_CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[str(origin) for origin in settings.BACKEND_CORS_ORIGINS],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
@app.middleware("http")
async def log_requests(request, call_next):
    print(f"DEBUG: Incoming {request.method} {request.url.path}")
    response = await call_next(request)
    print(f"DEBUG: Response {response.status_code}")
    return response


app.include_router(root_router)


@app.on_event("startup")
async def startup():
    # Direct import of all models to ensure they are registered with Base
    from app.domain.auth.models import User
    from app.domain.organization.models import Organization, OrgMembership
    from app.domain.workspace.models import Workspace, WorkspaceMembership, WorkspaceInvite
    from app.domain.datacenter.models import DataCenterProject
    # InfraOS Domain Models (Phase 2 – layout engine)
    from app.domain.infra.models import Facility, Rack, RackEquipment  # noqa: F401

    async with engine.begin() as conn:
        # For development, create tables on startup
        # In production, use Alembic migrations
        await conn.run_sync(Base.metadata.create_all)


@app.get("/health")
async def health_check():
    return {"status": "ok", "project": settings.PROJECT_NAME}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
