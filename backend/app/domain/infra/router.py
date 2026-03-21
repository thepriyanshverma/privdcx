import uuid
import math
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.domain.infra.models import Facility, Rack, RackEquipment

router = APIRouter()


# ─── Pydantic Schemas ────────────────────────────────────────────────────────

class FacilityIn(BaseModel):
    id: str
    name: str
    width: float
    length: float
    max_power_mw: float = 2.0
    cooling_type: str = "air"

class RackOut(BaseModel):
    id: str
    template_type: str
    pos_x: float
    pos_y: float
    pos_z: float
    rotation_y: float
    max_power_w: int
    max_slots_u: int
    tenant_id: str | None = None
    equipment: list[dict] = []

    class Config:
        from_attributes = True


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
async def create_or_update_facility(
    body: FacilityIn,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    existing = await db.get(Facility, body.id)
    if existing:
        existing.name = body.name
        existing.width = body.width
        existing.length = body.length
        existing.max_power_mw = body.max_power_mw
        existing.cooling_type = body.cooling_type
    else:
        db.add(Facility(
            id=body.id,
            name=body.name,
            width=body.width,
            length=body.length,
            max_power_mw=body.max_power_mw,
            cooling_type=body.cooling_type,
        ))
    await db.commit()
    return {"message": "ok", "id": body.id}


@router.post("/{facility_id}/generate-layout")
async def generate_layout(
    facility_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    facility = await db.get(Facility, facility_id)
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")

    # Delete existing racks + cascade equipment
    await db.execute(delete(Rack).where(Rack.facility_id == facility_id))
    await db.commit()

    # Grid-based procedural layout (matches frontend grid conventions)
    rack_w = 1
    rack_d = 2
    cold_aisle = 2
    hot_aisle = 2
    scale = 0.6  # 1 grid unit = 0.6 metres

    start_x = math.ceil((-facility.width / 2 + 2) / scale)
    end_x = math.floor((facility.width / 2 - 2) / scale)
    start_z = math.ceil((-facility.length / 2 + 2) / scale)
    end_z = math.floor((facility.length / 2 - 2) / scale)

    new_racks: list[Rack] = []
    current_x = start_x
    is_cold_face = True

    while current_x + rack_d <= end_x:
        current_z = start_z
        rotation_y = 0.0 if is_cold_face else math.pi
        while current_z + rack_w <= end_z:
            new_racks.append(Rack(
                id=str(uuid.uuid4()),
                facility_id=facility_id,
                template_type="custom",
                pos_x=current_x + rack_d / 2,
                pos_y=1.0,
                pos_z=current_z + rack_w / 2,
                rotation_y=rotation_y,
                max_power_w=10000,
                max_slots_u=42,
            ))
            current_z += rack_w

        if is_cold_face:
            current_x += rack_d + hot_aisle
            is_cold_face = False
        else:
            current_x += rack_d + cold_aisle
            is_cold_face = True

    db.add_all(new_racks)
    await db.commit()

    print(f"[InfraOS] Layout generated: {len(new_racks)} racks for facility {facility_id}")
    return {"message": "Layout generated", "rack_count": len(new_racks)}


@router.get("/{facility_id}/racks", response_model=list[RackOut])
async def get_racks(
    facility_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[Any]:
    result = await db.execute(
        select(Rack)
        .where(Rack.facility_id == facility_id)
        .options(selectinload(Rack.equipment))
    )
    racks = result.scalars().all()

    return [
        RackOut(
            id=r.id,
            template_type=r.template_type,
            pos_x=r.pos_x,
            pos_y=r.pos_y,
            pos_z=r.pos_z,
            rotation_y=r.rotation_y,
            max_power_w=r.max_power_w,
            max_slots_u=r.max_slots_u,
            tenant_id=r.tenant_id,
            equipment=[
                {
                    "id": eq.id,
                    "type": eq.type,
                    "u_size": eq.u_size,
                    "slot_position": eq.slot_position,
                    "specifications": eq.specifications or {},
                }
                for eq in r.equipment
            ],
        )
        for r in racks
    ]
