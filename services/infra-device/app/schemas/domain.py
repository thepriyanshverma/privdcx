import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict
from app.models.domain import DeviceType, DeviceStatus, ClusterType

class DeviceTemplateBase(BaseModel):
    name: str
    device_type: DeviceType
    size_u: int
    default_power_kw: float = 0.5
    default_heat_btu: float = 1700.0
    airflow_profile: str = "front_to_back"
    vendor: str
    model: str
    category: Optional[str] = None

class DeviceTemplateCreate(DeviceTemplateBase):
    pass

class DeviceTemplateRead(DeviceTemplateBase):
    id: uuid.UUID
    model_config = ConfigDict(from_attributes=True)

class ClusterBase(BaseModel):
    name: str
    cluster_type: ClusterType
    redundancy_strategy: Optional[str] = None

class ClusterCreate(ClusterBase):
    workspace_id: uuid.UUID
    logical_space_id: Optional[uuid.UUID] = None

class ClusterRead(ClusterBase):
    id: uuid.UUID
    workspace_id: uuid.UUID
    logical_space_id: Optional[uuid.UUID]
    model_config = ConfigDict(from_attributes=True)

class DeviceBase(BaseModel):
    rack_id: uuid.UUID
    template_id: uuid.UUID
    cluster_id: Optional[uuid.UUID] = None
    status: DeviceStatus = DeviceStatus.ACTIVE
    start_u: int
    size_u: int
    power_draw_kw: float
    max_power_kw: float
    heat_output_btu: float
    vendor: str
    model: str
    serial_number: Optional[str] = None

class DeviceCreate(DeviceBase):
    workspace_id: uuid.UUID
    tenant_id: Optional[uuid.UUID] = None
    logical_space_id: Optional[uuid.UUID] = None

class DeviceRead(DeviceBase):
    id: uuid.UUID
    workspace_id: uuid.UUID
    tenant_id: Optional[uuid.UUID]
    logical_space_id: Optional[uuid.UUID]
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class BulkDeployRequest(BaseModel):
    template_id: uuid.UUID
    rack_ids: List[uuid.UUID]
    start_u: int
    count: int = 1
    workspace_id: uuid.UUID
    cluster_id: Optional[uuid.UUID] = None
    logical_space_id: Optional[uuid.UUID] = None
