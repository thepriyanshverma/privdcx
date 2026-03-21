import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict
from app.models.domain import CoolingType, ZoneType, AisleType, Orientation

class FacilityBase(BaseModel):
    name: str
    location: Optional[str] = None
    width_m: float
    length_m: float
    height_m: float
    cooling_type: CoolingType = CoolingType.AIR
    tier_level: int = 3

class FacilityCreate(FacilityBase):
    workspace_id: uuid.UUID

class FacilityRead(FacilityBase):
    id: uuid.UUID
    workspace_id: uuid.UUID
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class HallBase(BaseModel):
    name: str
    width_m: float
    length_m: float
    height_m: float
    floor_type: str = "raised"
    power_capacity_mw: float

class HallCreate(HallBase):
    facility_id: uuid.UUID

class HallRead(HallBase):
    id: uuid.UUID
    facility_id: uuid.UUID
    model_config = ConfigDict(from_attributes=True)

class ZoneBase(BaseModel):
    name: str
    zone_type: ZoneType
    cooling_capacity_kw: float
    power_capacity_kw: float

class ZoneCreate(ZoneBase):
    hall_id: uuid.UUID

class ZoneRead(ZoneBase):
    id: uuid.UUID
    hall_id: uuid.UUID
    model_config = ConfigDict(from_attributes=True)

class AisleBase(BaseModel):
    aisle_type: AisleType
    orientation: Orientation
    width_m: float

class AisleCreate(AisleBase):
    zone_id: uuid.UUID

class AisleRead(AisleBase):
    id: uuid.UUID
    zone_id: uuid.UUID
    model_config = ConfigDict(from_attributes=True)
