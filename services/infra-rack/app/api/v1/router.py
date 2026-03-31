from fastapi import APIRouter, Depends, HTTPException, Request, status
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.services.rack import RackService
from app.schemas.domain import RackCreate, RackRead, RackUpdate, GridLayoutParams
from app.services.topology_events import publish_topology_event
import uuid

router = APIRouter()

# --- Rack CRUD ---
@router.post("/racks", response_model=RackRead)
async def create_rack(rack_in: RackCreate, request: Request, db: AsyncSession = Depends(get_db)):
    service = RackService(db)
    rack = await service.create_rack(rack_in)
    await publish_topology_event(
        {
            "event": "RACK_CREATED",
            "workspace_id": str(rack.workspace_id),
            "org_id": request.headers.get("X-Org-Id"),
            "facility_id": str(rack.facility_id),
            "hall_id": str(rack.hall_id),
            "zone_id": str(rack.zone_id),
            "rack_id": str(rack.id),
            "metadata": {
                "row_index": rack.row_index,
                "column_index": rack.column_index,
                "rack_type": str(rack.rack_type.value if hasattr(rack.rack_type, "value") else rack.rack_type),
            },
        }
    )
    return rack

@router.get("/racks/{id}", response_model=RackRead)
async def get_rack(id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    service = RackService(db)
    rack = await service.get_rack(id)
    if not rack: raise HTTPException(status_code=404)
    return rack

@router.delete("/racks/{id}")
async def delete_rack(id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db)):
    service = RackService(db)
    existing = await service.get_rack(id)
    if not existing:
        raise HTTPException(status_code=404)
    success = await service.delete_rack(id)
    if not success: raise HTTPException(status_code=404)
    await publish_topology_event(
        {
            "event": "RACK_DELETED",
            "workspace_id": str(existing.workspace_id),
            "org_id": request.headers.get("X-Org-Id"),
            "facility_id": str(existing.facility_id),
            "hall_id": str(existing.hall_id),
            "zone_id": str(existing.zone_id),
            "rack_id": str(existing.id),
        }
    )
    return {"status": "deleted"}

# --- Bulk & Layout Ops ---
@router.post("/layouts/grid", response_model=list[RackRead])
async def generate_grid(params: GridLayoutParams, request: Request, db: AsyncSession = Depends(get_db)):
    service = RackService(db)
    racks = await service.generate_grid(params)
    for rack in racks:
        await publish_topology_event(
            {
                "event": "RACK_CREATED",
                "workspace_id": str(rack.workspace_id),
                "org_id": request.headers.get("X-Org-Id"),
                "facility_id": str(rack.facility_id),
                "hall_id": str(rack.hall_id),
                "zone_id": str(rack.zone_id),
                "rack_id": str(rack.id),
                "metadata": {
                    "row_index": rack.row_index,
                    "column_index": rack.column_index,
                    "rack_type": str(rack.rack_type.value if hasattr(rack.rack_type, "value") else rack.rack_type),
                },
            }
        )
    return racks

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
