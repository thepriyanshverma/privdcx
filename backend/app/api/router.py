from fastapi import APIRouter

from app.core.config import settings
from app.api.v1.router import api_router as v1_router

root_router = APIRouter()

root_router.include_router(v1_router, prefix=settings.API_V1_STR)
