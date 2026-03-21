import uuid
from datetime import datetime
from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

class OperationalStatus(str, Enum):
    ACTIVE = "ACTIVE"
    DEGRADED = "DEGRADED"
    FAILED = "FAILED"
    RECOVERING = "RECOVERING"
    MAINTENANCE = "MAINTENANCE"
    ISOLATED = "ISOLATED"

class InfraState(BaseModel):
    id: str # typically rack_id or facility_id
    entity_type: str # rack | facility | device
    tenant_id: Optional[str] = None
    workspace_id: Optional[str] = None
    device_ids: List[str] = Field(default_factory=list)
    health_score: float = 1.0 # 0.0 to 1.0
    operational_status: OperationalStatus = OperationalStatus.ACTIVE
    power_state: str = "NORMAL"
    thermal_state: str = "NORMAL"
    network_state: str = "NORMAL"
    last_updated: datetime = Field(default_factory=datetime.utcnow)

class StateUpdateEvent(BaseModel):
    version: str = "v1"
    timestamp: float = Field(default_factory=lambda: datetime.utcnow().timestamp())
    tenant_id: Optional[str] = None
    workspace_id: Optional[str] = None
    entity_type: str
    entity_id: str
    previous_state: OperationalStatus
    current_state: OperationalStatus
    reason: str

class RemediationAction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    tenant_id: Optional[str] = None
    entity_id: str
    rule_id: str
    action_type: str
    status: str = "EXECUTED" # EXECUTED | FAILED | PENDING
