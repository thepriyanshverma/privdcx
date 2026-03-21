from fastapi import FastAPI
from app.core.database import engine, Base

# Create tables (In a real app, use Alembic migrations)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="InfraOS Domain Service",
    description="Authoritative source of truth for physical infrastructure entities",
    version="1.0.0"
)

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "infra-domain"}

from app.api.facility import router as facility_router

# TODO: Add API routers
app.include_router(facility_router)
