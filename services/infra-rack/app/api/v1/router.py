from fastapi import APIRouter, Depends, HTTPException, status
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.services.rack import RackService
from app.schemas.domain import RackCreate, RackRead, RackUpdate, GridLayoutParams
import uuid

router = APIRouter()

# --- Rack CRUD ---
@router.post("/racks", response_model=RackRead)
async def create_rack(rack_in: RackCreate, db: AsyncSession = Depends(get_db)):
    service = RackService(db)
    return await service.create_rack(rack_in)

@router.get("/racks/{id}", response_model=RackRead)
async def get_rack(id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    service = RackService(db)
    rack = await service.get_rack(id)
    if not rack: raise HTTPException(status_code=404)
    return rack

@router.delete("/racks/{id}")
async def delete_rack(id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    service = RackService(db)
    success = await service.delete_rack(id)
    if not success: raise HTTPException(status_code=404)
    return {"status": "deleted"}

# --- Bulk & Layout Ops ---
@router.post("/layouts/grid", response_model=list[RackRead])
async def generate_grid(params: GridLayoutParams, db: AsyncSession = Depends(get_db)):
    service = RackService(db)
    return await service.generate_grid(params)

@router.get("/racks", response_model=list[RackRead])
async def list_racks(workspace_id: Optional[uuid.UUID] = None, db: AsyncSession = Depends(get_db)):
    service = RackService(db)
    return await service.list_racks(workspace_id)

# --- Placement Ops ---
@router.patch("/racks/{id}/move", response_model=RackRead)
async def move_rack(id: uuid.UUID, x: float, y: float, orientation: float = 0.0, db: AsyncSession = Depends(get_db)):
    service = RackService(db)
    rack = await service.move_rack(id, x, y, orientation)
    if not rack: raise HTTPException(status_code=404)
    return rack

@router.patch("/racks/{id}/assign-logical-space", response_model=RackRead)
async def assign_logical_space(id: uuid.UUID, logical_space_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    service = RackService(db)
    rack = await service.assign_logical_space(id, logical_space_id)
    if not rack: raise HTTPException(status_code=404)
    return rack
