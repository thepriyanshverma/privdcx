import uuid
from sqlalchemy import String, Float, Integer, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class Facility(Base):
    __tablename__ = "facilities"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    width: Mapped[float] = mapped_column(Float, nullable=False)
    length: Mapped[float] = mapped_column(Float, nullable=False)
    max_power_mw: Mapped[float] = mapped_column(Float, default=2.0)
    cooling_type: Mapped[str] = mapped_column(String(64), default="air")

    racks: Mapped[list["Rack"]] = relationship("Rack", back_populates="facility", cascade="all, delete-orphan")


class Rack(Base):
    __tablename__ = "facility_racks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    facility_id: Mapped[str] = mapped_column(String(36), ForeignKey("facilities.id", ondelete="CASCADE"), nullable=False, index=True)
    template_type: Mapped[str] = mapped_column(String(64), default="custom")

    pos_x: Mapped[float] = mapped_column(Float, nullable=False)
    pos_y: Mapped[float] = mapped_column(Float, default=1.0)
    pos_z: Mapped[float] = mapped_column(Float, nullable=False)
    rotation_y: Mapped[float] = mapped_column(Float, default=0.0)

    max_power_w: Mapped[int] = mapped_column(Integer, default=10000)
    max_slots_u: Mapped[int] = mapped_column(Integer, default=42)
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    facility: Mapped["Facility"] = relationship("Facility", back_populates="racks")
    equipment: Mapped[list["RackEquipment"]] = relationship("RackEquipment", back_populates="rack", cascade="all, delete-orphan")


class RackEquipment(Base):
    __tablename__ = "rack_equipment"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    rack_id: Mapped[str] = mapped_column(String(36), ForeignKey("facility_racks.id", ondelete="CASCADE"), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(64), nullable=False)  # server, storage, switch, pdu
    vendor: Mapped[str | None] = mapped_column(String(128), nullable=True)
    model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    u_size: Mapped[int] = mapped_column(Integer, default=1)
    slot_position: Mapped[int] = mapped_column(Integer, default=0)
    specifications: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    rack: Mapped["Rack"] = relationship("Rack", back_populates="equipment")
