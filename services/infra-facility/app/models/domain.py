import uuid
from datetime import datetime
from typing import List, Optional
from sqlalchemy import String, ForeignKey, DateTime, JSON, Float, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from enum import Enum

class CoolingType(str, Enum):
    AIR = "air"
    LIQUID = "liquid"
    HYBRID = "hybrid"

class ZoneType(str, Enum):
    COOLING = "cooling"
    CONTAINMENT = "containment"
    POWER = "power"
    LOGICAL = "logical"

class AisleType(str, Enum):
    HOT = "hot"
    COLD = "cold"

class Orientation(str, Enum):
    NORTH_SOUTH = "north_south"
    EAST_WEST = "east_west"

class Facility(Base):
    __tablename__ = "facilities"
    
    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), index=True) # Logical link to tenant service
    name: Mapped[str] = mapped_column(String(255))
    location: Mapped[Optional[str]] = mapped_column(String(255))
    width_m: Mapped[float] = mapped_column(Float)
    length_m: Mapped[float] = mapped_column(Float)
    height_m: Mapped[float] = mapped_column(Float)
    cooling_type: Mapped[CoolingType] = mapped_column(SQLEnum(CoolingType), default=CoolingType.AIR)
    tier_level: Mapped[int] = mapped_column(default=3)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True) # Soft delete
    
    halls: Mapped[List["Hall"]] = relationship(back_populates="facility", cascade="all, delete-orphan")

class Hall(Base):
    __tablename__ = "halls"
    
    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    facility_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("facilities.id"))
    name: Mapped[str] = mapped_column(String(255))
    width_m: Mapped[float] = mapped_column(Float)
    length_m: Mapped[float] = mapped_column(Float)
    height_m: Mapped[float] = mapped_column(Float)
    floor_type: Mapped[str] = mapped_column(String(50), default="raised") # e.g. "raised", "slab"
    power_capacity_mw: Mapped[float] = mapped_column(Float)
    
    facility: Mapped["Facility"] = relationship(back_populates="halls")
    zones: Mapped[List["Zone"]] = relationship(back_populates="hall", cascade="all, delete-orphan")

class Zone(Base):
    __tablename__ = "zones"
    
    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hall_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("halls.id"))
    name: Mapped[str] = mapped_column(String(255))
    zone_type: Mapped[ZoneType] = mapped_column(SQLEnum(ZoneType))
    cooling_capacity_kw: Mapped[float] = mapped_column(Float)
    power_capacity_kw: Mapped[float] = mapped_column(Float)
    
    hall: Mapped["Hall"] = relationship(back_populates="zones")
    aisles: Mapped[List["Aisle"]] = relationship(back_populates="zone", cascade="all, delete-orphan")

class Aisle(Base):
    __tablename__ = "aisles"
    
    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    zone_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("zones.id"))
    aisle_type: Mapped[AisleType] = mapped_column(SQLEnum(AisleType))
    orientation: Mapped[Orientation] = mapped_column(SQLEnum(Orientation))
    width_m: Mapped[float] = mapped_column(Float)
    
    zone: Mapped["Zone"] = relationship(back_populates="aisles")
