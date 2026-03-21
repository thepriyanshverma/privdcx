import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict
from app.models.domain import AllocationState, RackType

class RackBase(BaseModel):
    name: str = "Rack"
    position_x_m: float
    position_y_m: float
    position_z_m: float = 0.0
    orientation: float = 0.0
    height_u: int = 42
    width_mm: int = 600
    depth_mm: int = 1100
    rack_type: RackType = RackType.COMPUTE
    max_power_kw: float = 12.5

class RackCreate(RackBase):
    workspace_id: uuid.UUID
    facility_id: uuid.UUID
    hall_id: uuid.UUID
    zone_id: uuid.UUID
    aisle_id: Optional[uuid.UUID] = None
    row_index: Optional[int] = None
    column_index: Optional[int] = None

class RackRead(RackBase):
    id: uuid.UUID
    workspace_id: uuid.UUID
    facility_id: uuid.UUID
    hall_id: uuid.UUID
    zone_id: uuid.UUID
    aisle_id: Optional[uuid.UUID]
    row_index: Optional[int]
    column_index: Optional[int]
    allocation_state: AllocationState
    logical_space_id: Optional[uuid.UUID]
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class RackUpdate(BaseModel):
    name: Optional[str] = None
    position_x_m: Optional[float] = None
    position_y_m: Optional[float] = None
    orientation: Optional[float] = None
    allocation_state: Optional[AllocationState] = None
    logical_space_id: Optional[uuid.UUID] = None

class GridLayoutParams(BaseModel):
    zone_id: uuid.UUID
    aisle_id: Optional[uuid.UUID] = None
    start_x_m: float = 0.0
    start_y_m: float = 0.0
    rows: int
    cols: int
    row_pitch_m: float = 3.2 # Distance between rows
    col_pitch_m: float = 0.61 # Rack width (~24 inches)
    aisle_pattern: str = "hot_cold" # hot_cold, cold_only
    rack_type: RackType = RackType.COMPUTE
    workspace_id: uuid.UUID
    facility_id: uuid.UUID
    hall_id: uuid.UUID
