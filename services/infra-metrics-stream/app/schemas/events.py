from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
import time
import uuid

class InfraMetricEvent(BaseModel):
    version: str = "v1"
    timestamp: float = Field(default_factory=time.time)
    metric_name: str
    value: float
    tenant_id: Optional[str] = None
    workspace_id: Optional[str] = None
    facility_id: Optional[str] = None
    rack_id: Optional[str] = None
    device_id: Optional[str] = None
    labels: Dict[str, Any] = Field(default_factory=dict)

    class Config:
        populate_by_name = True
