import time
from typing import Any, Literal, Optional

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


EdgeType = Literal["network", "power", "cooling", "structural"]
NodeType = Literal["device", "rack", "hall", "facility", "switch", "pdu", "cooling_unit", "zone", "spine"]


class TopologyEvent(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    event: str
    workspace_id: str
    org_id: Optional[str] = Field(default=None, validation_alias=AliasChoices("org_id", "org id "))
    facility_id: Optional[str] = None
    hall_id: Optional[str] = None
    zone_id: Optional[str] = None
    rack_id: Optional[str] = None
    device_id: Optional[str] = None
    device_type: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    timestamp: float = Field(default_factory=time.time)
    version: str = "v1"


class EdgeUpsertRequest(BaseModel):
    workspace_id: str
    from_id: str
    to_id: str
    type: EdgeType
    capacity: Optional[float] = None
    latency: Optional[float] = None
    status: str = "active"
    from_node_type: Optional[NodeType] = None
    to_node_type: Optional[NodeType] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class TopologyNode(BaseModel):
    id: str
    node_type: str
    attributes: dict[str, Any] = Field(default_factory=dict)


class TopologyEdge(BaseModel):
    from_id: str
    to_id: str
    type: str
    capacity: Optional[float] = None
    latency: Optional[float] = None
    status: str = "active"
    attributes: dict[str, Any] = Field(default_factory=dict)
