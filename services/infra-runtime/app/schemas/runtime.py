import uuid
from datetime import datetime
from enum import Enum
from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


class OperationalStatus(str, Enum):
    ACTIVE = "ACTIVE"
    DEGRADED = "DEGRADED"
    FAILED = "FAILED"
    RECOVERING = "RECOVERING"
    MAINTENANCE = "MAINTENANCE"
    ISOLATED = "ISOLATED"
    AT_RISK = "AT_RISK"


class InfraState(BaseModel):
    id: str
    entity_type: str  # rack | facility | device
    tenant_id: Optional[str] = None
    workspace_id: Optional[str] = None
    health_score: float = 1.0
    operational_status: OperationalStatus = OperationalStatus.ACTIVE
    power_state: str = "NORMAL"
    thermal_state: str = "NORMAL"
    network_state: str = "NORMAL"
    sub_states: Dict[str, str] = Field(default_factory=lambda: {"thermal": "NORMAL", "power": "NORMAL", "network": "NORMAL"})
    last_reason: Optional[str] = None
    last_updated: datetime = Field(default_factory=datetime.utcnow)


class IncomingAlert(BaseModel):
    version: str = "v1"
    timestamp: float
    alert_id: Optional[str] = None
    trace_id: Optional[str] = None
    tenant_id: Optional[str] = None
    workspace_id: Optional[str] = None
    facility_id: Optional[str] = None
    entity_id: str
    entity_type: str
    severity: str
    rule_id: str
    metric_name: str
    metric_value: float
    operator: Optional[str] = None
    threshold: Optional[float] = None
    deviation_pct: Optional[float] = None
    queue_time: Optional[float] = None
    raw_metric_event: Dict[str, Any] = Field(default_factory=dict)
    description: Optional[str] = None
    rack_id: Optional[str] = None
    device_id: Optional[str] = None


class StateUpdateEvent(BaseModel):
    version: str = "v1"
    timestamp: float = Field(default_factory=lambda: datetime.utcnow().timestamp())
    tenant_id: Optional[str] = None
    workspace_id: Optional[str] = None
    entity_type: str
    entity_id: str
    previous_state: OperationalStatus
    current_state: OperationalStatus
    health_score: float
    reason: str


class RemediationAction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    tenant_id: Optional[str] = None
    workspace_id: Optional[str] = None
    alert_id: Optional[str] = None
    entity_id: str
    entity_type: str
    rule_id: str
    action_type: str
    status: str = "EXECUTED"
    details: Dict[str, Any] = Field(default_factory=dict)


class VerificationResult(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    alert_id: Optional[str] = None
    tenant_id: Optional[str] = None
    workspace_id: Optional[str] = None
    entity_id: str
    rule_id: str
    metric_name: str
    observed_value: float
    threshold: float
    operator: str
    safe_threshold: float
    success: bool
    details: Dict[str, Any] = Field(default_factory=dict)
