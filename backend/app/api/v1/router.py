from fastapi import APIRouter

from app.api.v1.routers import auth, org, workspace, datacenter
from app.domain.infra.router import router as facilities_router

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(org.router, prefix="/orgs", tags=["organizations"])
api_router.include_router(workspace.router, prefix="/workspaces", tags=["workspaces"])
api_router.include_router(datacenter.router, prefix="/projects", tags=["projects"])
api_router.include_router(facilities_router, prefix="/facilities", tags=["facilities"])
