import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, ForeignKey, DateTime, Float, Integer, Enum as SQLEnum, Index
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base
from enum import Enum

class AllocationState(str, Enum):
    FREE = "free"
    RESERVED = "reserved"
    ALLOCATED = "allocated"

class RackType(str, Enum):
    COMPUTE = "compute"
    STORAGE = "storage"
    NETWORK = "network"
    GPU = "gpu"
    EMPTY = "empty"

class Rack(Base):
    __tablename__ = "racks"
    
    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), default="Rack")
    rack_type: Mapped[RackType] = mapped_column(SQLEnum(RackType), default=RackType.COMPUTE)
    
    # Hierarchy Links
    workspace_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), index=True)
    facility_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), index=True)
    hall_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), index=True)
    zone_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), index=True)
    aisle_id: Mapped[Optional[uuid.UUID]] = mapped_column(PG_UUID(as_uuid=True), index=True)
    
    # Physical Placement (Metres)
    position_x_m: Mapped[float] = mapped_column(Float)
    position_y_m: Mapped[float] = mapped_column(Float)
    position_z_m: Mapped[float] = mapped_column(Float, default=0.0)
    
    # Grid Metadata
    row_index: Mapped[Optional[int]] = mapped_column(Integer)
    column_index: Mapped[Optional[int]] = mapped_column(Integer)
    # Dimensions (Metres)
    width_m: Mapped[float] = mapped_column(Float, default=0.6)
    depth_m: Mapped[float] = mapped_column(Float, default=1.1)
    width_mm: Mapped[Optional[int]] = mapped_column(Integer) # For schema compatibility
    depth_mm: Mapped[Optional[int]] = mapped_column(Integer) # For schema compatibility
    height_u: Mapped[int] = mapped_column(Integer, default=42)
    orientation: Mapped[float] = mapped_column(Float, default=0.0) # Degrees
    floor_unit_index: Mapped[Optional[int]] = mapped_column(Integer)
    
    # Containment & Airflow
    aisle_type: Mapped[Optional[str]] = mapped_column(String(20)) # hot / cold
    containment_zone_id: Mapped[Optional[uuid.UUID]] = mapped_column(PG_UUID(as_uuid=True))
    airflow_direction: Mapped[str] = mapped_column(String(20), default="front_to_back")
    
    # Electrical Model (Baseline)
    max_power_kw: Mapped[float] = mapped_column(Float, default=12.5)
    redundancy_zone: Mapped[Optional[str]] = mapped_column(String(50))
    power_feed_a: Mapped[bool] = mapped_column(default=True)
    power_feed_b: Mapped[bool] = mapped_column(default=True)
    
    # Ownership & Allocation
    logical_space_id: Mapped[Optional[uuid.UUID]] = mapped_column(PG_UUID(as_uuid=True), index=True)
    subscription_id: Mapped[Optional[uuid.UUID]] = mapped_column(PG_UUID(as_uuid=True))
    tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(PG_UUID(as_uuid=True))
    allocation_state: Mapped[AllocationState] = mapped_column(SQLEnum(AllocationState), default=AllocationState.FREE)
    
    # Operational Metadata
    template_id: Mapped[Optional[str]] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

# Spatial Indexing (PostGIS Readiness)
Index("idx_racks_spatial", Rack.position_x_m, Rack.position_y_m)
