from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.domain import Facility, Rack
from app.schemas.domain import FacilityBase
import uuid

router = APIRouter(prefix="/facilities", tags=["facilities"])

@router.post("/", response_model=FacilityBase)
def create_facility(facility: FacilityBase, db: Session = Depends(get_db)):
    db_fac = Facility(**facility.model_dump())
    db.add(db_fac)
    db.commit()
    db.refresh(db_fac)
    return db_fac

@router.post("/{facility_id}/generate-layout")
def generate_layout(facility_id: str, db: Session = Depends(get_db)):
    facility = db.query(Facility).filter(Facility.id == facility_id).first()
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")

    # Clear existing racks
    db.query(Rack).filter(Rack.facility_id == facility_id).delete()
    db.commit()

    # Generate layout (Ported from frontend monolithic store)
    rack_w = 1  # 0.6m
    rack_d = 2  # 1.2m deep
    cold_aisle = 2  # 1.2m
    hot_aisle = 2  # 1.2m

    start_x = round((-facility.width / 2 + 2) / 0.6)
    end_x = round((facility.width / 2 - 2) / 0.6)
    start_z = round((-facility.length / 2 + 2) / 0.6)
    end_z = round((facility.length / 2 - 2) / 0.6)

    current_x = start_x
    is_cold_aisle_face = True
    new_racks = []

    while current_x + rack_d <= end_x:
        current_z = start_z
        while current_z + rack_w <= end_z:
            new_racks.append(Rack(
                id=str(uuid.uuid4()),
                facility_id=facility_id,
                template_type="custom",
                pos_x=current_x + (rack_d/2),
                pos_y=1,
                pos_z=current_z + (rack_w/2),
                max_power_w=10000,
                max_slots_u=42
            ))
            current_z += rack_w
        
        if is_cold_aisle_face:
            current_x += rack_d + hot_aisle
            is_cold_aisle_face = False
        else:
            current_x += rack_d + cold_aisle
            is_cold_aisle_face = True

    db.add_all(new_racks)
    db.commit()
    
    # In full implementation, emit `layout.generated` to RabbitMQ here
    
    return {"message": "Layout generated successfully", "rack_count": len(new_racks)}

@router.get("/{facility_id}/racks")
def get_racks(facility_id: str, db: Session = Depends(get_db)):
    racks = db.query(Rack).filter(Rack.facility_id == facility_id).all()
    return racks
