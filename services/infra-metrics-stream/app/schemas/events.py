from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
import time

class InfraMetricEvent(BaseModel):
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
    labels: Dict[str, Any] = Field(default_factory=dict)

    class Config:
        populate_by_name = True
