from pydantic import BaseModel
from typing import List, Optional, Dict, Any

class EquipmentBase(BaseModel):
    id: str
    type: str
    vendor: str
    model: str
    u_size: int
    slot_position: int
    specifications: Dict[str, Any] = {}

class RackBase(BaseModel):
    id: str
    template_type: str
    pos_x: float
    pos_y: float
    pos_z: float
    max_power_w: int
    max_slots_u: int
    tenant_id: Optional[str] = None
    equipment: List[EquipmentBase] = []

class FacilityBase(BaseModel):
    id: str
    name: str
    width: float
    length: float
    max_power_mw: float
    cooling_type: str
