import uuid
from datetime import datetime
from typing import List, Optional
from sqlalchemy import String, ForeignKey, DateTime, Float, Integer, Enum as SQLEnum, JSON
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from enum import Enum

class DeviceType(str, Enum):
    SERVER = "server"
    STORAGE = "storage"
    SWITCH = "switch"
    GPU = "gpu"
    PDU = "pdu"
    OTHER = "other"

class DeviceStatus(str, Enum):
    ACTIVE = "active"
    RESERVED = "reserved"
    FAILED = "failed"
    MAINTENANCE = "maintenance"

class ClusterType(str, Enum):
    COMPUTE = "compute"
    STORAGE = "storage"
    AI = "ai"
    NETWORK = "network"

class DeviceTemplate(Base):
    __tablename__ = "device_templates"
    
    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255))
    device_type: Mapped[DeviceType] = mapped_column(SQLEnum(DeviceType))
    size_u: Mapped[int] = mapped_column(Integer)
    
    # Defaults
    default_power_kw: Mapped[float] = mapped_column(Float, default=0.5)
    default_heat_btu: Mapped[float] = mapped_column(Float, default=1700.0)
    airflow_profile: Mapped[str] = mapped_column(String(50), default="front_to_back")
    
    vendor: Mapped[str] = mapped_column(String(100))
    model: Mapped[str] = mapped_column(String(100))
    category: Mapped[Optional[str]] = mapped_column(String(100))
    
    devices: Mapped[List["Device"]] = relationship(back_populates="template")

class Cluster(Base):
    __tablename__ = "clusters"
    
    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), index=True)
    name: Mapped[str] = mapped_column(String(255))
    cluster_type: Mapped[ClusterType] = mapped_column(SQLEnum(ClusterType))
    logical_space_id: Mapped[Optional[uuid.UUID]] = mapped_column(PG_UUID(as_uuid=True), index=True)
    redundancy_strategy: Mapped[Optional[str]] = mapped_column(String(100))
    
    devices: Mapped[List["Device"]] = relationship(back_populates="cluster")

class Device(Base):
    __tablename__ = "devices"
    
    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), index=True)
    rack_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), index=True)
    template_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("device_templates.id"))
    cluster_id: Mapped[Optional[uuid.UUID]] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("clusters.id"), nullable=True)
    
    device_type: Mapped[DeviceType] = mapped_column(SQLEnum(DeviceType))
    status: Mapped[DeviceStatus] = mapped_column(SQLEnum(DeviceStatus), default=DeviceStatus.ACTIVE)
    
    # Slot Placement
    start_u: Mapped[int] = mapped_column(Integer) # U position from bottom
    size_u: Mapped[int] = mapped_column(Integer)
    
    # Power Model
    power_draw_kw: Mapped[float] = mapped_column(Float)
    max_power_kw: Mapped[float] = mapped_column(Float)
    power_supply_type: Mapped[str] = mapped_column(String(50), default="dual")
    redundancy_group: Mapped[Optional[str]] = mapped_column(String(50))
    
    # Thermal Model
    heat_output_btu: Mapped[float] = mapped_column(Float)
    airflow_cfm: Mapped[float] = mapped_column(Float, default=100.0)
    cooling_profile: Mapped[Optional[str]] = mapped_column(String(50))
    thermal_class: Mapped[Optional[str]] = mapped_column(String(50))
    
    # Network Model (Baseline)
    uplink_ports: Mapped[int] = mapped_column(Integer, default=2)
    network_zone: Mapped[Optional[str]] = mapped_column(String(50))
    tor_switch_id: Mapped[Optional[uuid.UUID]] = mapped_column(PG_UUID(as_uuid=True))
    
    # Ownership
    tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(PG_UUID(as_uuid=True))
    logical_space_id: Mapped[Optional[uuid.UUID]] = mapped_column(PG_UUID(as_uuid=True), index=True)
    
    # Operational Metadata
    firmware_version: Mapped[Optional[str]] = mapped_column(String(50))
    vendor: Mapped[str] = mapped_column(String(100))
    model: Mapped[str] = mapped_column(String(100))
    serial_number: Mapped[Optional[str]] = mapped_column(String(100))
    procurement_date: Mapped[Optional[datetime]] = mapped_column(DateTime)
    lifecycle_state: Mapped[str] = mapped_column(String(50), default="deployed")
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    
    template: Mapped["DeviceTemplate"] = relationship(back_populates="devices")
    cluster: Mapped[Optional["Cluster"]] = relationship(back_populates="devices")
