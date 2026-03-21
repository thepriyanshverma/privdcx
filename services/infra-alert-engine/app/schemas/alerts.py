import uuid
from datetime import datetime
from enum import Enum
from typing import List, Optional, Union, Dict, Any
from pydantic import BaseModel, Field

class AlertSeverity(str, Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"

class RuleType(str, Enum):
    THRESHOLD = "threshold"
    COMPOSITE = "composite"

class AlertRule(BaseModel):
    id: str
    name: str
    rule_type: RuleType
    metric_name: Optional[str] = None
    operator: Optional[str] = None # >, <, ==, etc
    threshold: Optional[float] = None
    severity: AlertSeverity
    suppression_window_s: int = 60
    description: str
    
    # For composite rules
    conditions: Optional[List[Dict[str, Any]]] = None

class InfraAlertEvent(BaseModel):
    version: str = "v1"
    timestamp: float = Field(default_factory=datetime.utcnow().timestamp)
    tenant_id: Optional[str] = None
    workspace_id: Optional[str] = None
    facility_id: Optional[str] = None
    rack_id: Optional[str] = None
    device_id: Optional[str] = None
    severity: AlertSeverity
    rule_id: str
    metric_name: Optional[str] = None
    metric_value: Optional[float] = None
    description: str
