from fastapi import APIRouter, Depends, HTTPException, status, Request
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.services.topology import TopologyService
from app.schemas.domain import (
    FacilityCreate, FacilityRead, 
    HallCreate, HallRead, HallBase,
    ZoneCreate, ZoneRead, ZoneBase,
    AisleCreate, AisleRead, AisleBase
)
from app.middleware.context import inject_workspace_context
import uuid

router = APIRouter()

# --- Facilities ---
@router.post("/facilities", response_model=FacilityRead)
async def create_facility(fac_in: FacilityCreate, db: AsyncSession = Depends(get_db)):
    service = TopologyService(db)
    return await service.create_facility(fac_in)

@router.get("/facilities/{id}", response_model=FacilityRead)
async def get_facility(id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    service = TopologyService(db)
    fac = await service.get_facility(id)
    if not fac: raise HTTPException(status_code=404)
    return fac

@router.get("/facilities", response_model=list[FacilityRead])
async def list_facilities(workspace_id: Optional[uuid.UUID] = None, db: AsyncSession = Depends(get_db)):
    service = TopologyService(db)
    return await service.list_facilities(workspace_id)

@router.delete("/facilities/{id}")
async def delete_facility(id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    service = TopologyService(db)
    success = await service.delete_facility(id)
    if not success: raise HTTPException(status_code=404)
    return {"status": "deleted"}

# --- Halls ---
@router.post("/facilities/{id}/halls", response_model=HallRead)
async def create_hall(id: uuid.UUID, hall_in: HallBase, db: AsyncSession = Depends(get_db)):
    # Note: HallBase should be used here and facility_id injected
    from app.schemas.domain import HallCreate
    service = TopologyService(db)
    full_in = HallCreate(**hall_in.model_dump(), facility_id=id)
    return await service.create_hall(full_in)

@router.get("/halls/{id}", response_model=HallRead)
async def get_hall(id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    service = TopologyService(db)
    hall = await service.get_hall(id)
    if not hall: raise HTTPException(status_code=404)
    return hall

# --- Zones ---
@router.post("/halls/{id}/zones", response_model=ZoneRead)
async def create_zone(id: uuid.UUID, zone_in: ZoneBase, db: AsyncSession = Depends(get_db)):
    from app.schemas.domain import ZoneCreate
    service = TopologyService(db)
    full_in = ZoneCreate(**zone_in.model_dump(), hall_id=id)
    return await service.create_zone(full_in)

@router.get("/zones/{id}", response_model=ZoneRead)
async def get_zone(id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    service = TopologyService(db)
    zone = await service.get_zone(id)
    if not zone: raise HTTPException(status_code=404)
    return zone

# --- Aisles ---
@router.post("/zones/{id}/aisles", response_model=AisleRead)
async def create_aisle(id: uuid.UUID, aisle_in: AisleBase, db: AsyncSession = Depends(get_db)):
    from app.schemas.domain import AisleCreate
    service = TopologyService(db)
    full_in = AisleCreate(**aisle_in.model_dump(), zone_id=id)
    return await service.create_aisle(full_in)

@router.get("/aisles/{id}", response_model=AisleRead)
async def get_aisle(id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    service = TopologyService(db)
    aisle = await service.get_aisle(id)
    if not aisle: raise HTTPException(status_code=404)
    return aisle
