import time
from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


class EntityMetrics(BaseModel):
    temperature: Optional[float] = None
    power: Optional[float] = None
    network: Optional[float] = None
    networkUsage: Optional[float] = None
    status: str = "ACTIVE"
    metricName: Optional[str] = None
    metricValue: Optional[float] = None
    entityType: Optional[str] = None
    deviceType: Optional[str] = None
    workspace_id: Optional[str] = None
    facility_id: Optional[str] = None
    rack_id: Optional[str] = None
    updated_at: float = Field(default_factory=time.time)


class EntityMetricsResponse(BaseModel):
    entity_id: str
    metrics: Dict[str, Any]


class AllMetricsResponse(BaseModel):
    count: int
    entities: Dict[str, Dict[str, Any]]


class LiveEntitiesResponse(BaseModel):
    workspace_id: str
    facility_id: Optional[str] = None
    updated_at: float
    entities: Dict[str, Dict[str, Any]]
