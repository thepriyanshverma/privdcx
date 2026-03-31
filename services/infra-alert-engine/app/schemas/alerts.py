import time
from enum import Enum
from typing import Any, Optional

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator


class AlertSeverity(str, Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


class AlertStatus(str, Enum):
    ACTIVE = "ACTIVE"
    RESOLVED = "RESOLVED"


class EntityType(str, Enum):
    DEVICE = "device"
    RACK = "rack"
    FACILITY = "facility"


class MetricStreamEvent(BaseModel):
    version: str = "v1"
    timestamp: float = Field(default_factory=time.time)
    metric_name: str
    value: float
    tenant_id: str
    workspace_id: str
    facility_id: str
    rack_id: Optional[str] = None
    device_id: Optional[str] = None
    device_type: Optional[str] = None
    labels: dict[str, Any] = Field(default_factory=dict)


class AlertRule(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    rule_id: str = Field(validation_alias=AliasChoices("rule_id", "id"))
    metric_name: str
    operator: str
    threshold: float
    severity: AlertSeverity
    cooldown_sec: int = Field(default=60, ge=1, validation_alias=AliasChoices("cooldown_sec", "suppression_window_s"))
    description: str
    enabled: bool = True

    @field_validator("operator")
    @classmethod
    def validate_operator(cls, value: str) -> str:
        supported = {">", "<", ">=", "<=", "=="}
        if value not in supported:
            raise ValueError(f"Unsupported operator '{value}'. Supported: {sorted(supported)}")
        return value


class InfraAlertEvent(BaseModel):
    version: str = "v1"
    timestamp: float = Field(default_factory=time.time)
    alert_id: Optional[str] = None
    trace_id: Optional[str] = None
    tenant_id: str
    workspace_id: str
    facility_id: str
    entity_id: str
    entity_type: EntityType
    severity: AlertSeverity
    rule_id: str
    metric_name: str
    metric_value: float
    description: str
    operator: Optional[str] = None
    threshold: Optional[float] = None
    deviation_pct: Optional[float] = None
    queue_time: Optional[float] = None
    raw_metric_event: dict[str, Any] = Field(default_factory=dict)
    rack_id: Optional[str] = None
    device_id: Optional[str] = None


class PersistedAlert(BaseModel):
    id: str
    timestamp: float
    created_at: Optional[float] = None
    updated_at: Optional[float] = None
    tenant_id: str
    workspace_id: str
    facility_id: str
    entity_id: str
    entity_type: EntityType
    severity: AlertSeverity
    rule_id: str
    metric_name: str
    metric_value: float
    description: str
    trace_id: Optional[str] = None
    operator: Optional[str] = None
    threshold: Optional[float] = None
    deviation_pct: Optional[float] = None
    queue_time: Optional[float] = None
    raw_metric_event: dict[str, Any] = Field(default_factory=dict)
    status: AlertStatus = AlertStatus.ACTIVE
    acknowledged: bool = False
