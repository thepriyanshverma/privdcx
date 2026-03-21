from sqlalchemy import Column, String, Float, Integer, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base

class Facility(Base):
    __tablename__ = "facilities"
    id = Column(String, primary_key=True, index=True)
    name = Column(String, index=True)
    width = Column(Float)
    length = Column(Float)
    max_power_mw = Column(Float)
    cooling_type = Column(String)

    racks = relationship("Rack", back_populates="facility")

class Rack(Base):
    __tablename__ = "racks"
    id = Column(String, primary_key=True, index=True)
    facility_id = Column(String, ForeignKey("facilities.id"))
    template_type = Column(String)
    
    # Position mapping (spatial grid)
    pos_x = Column(Float)
    pos_y = Column(Float)
    pos_z = Column(Float)
    
    # Attributes
    max_power_w = Column(Integer)
    max_slots_u = Column(Integer)
    
    # Ownership
    tenant_id = Column(String, nullable=True)

    facility = relationship("Facility", back_populates="racks")
    equipment = relationship("Equipment", back_populates="rack")

class Equipment(Base):
    __tablename__ = "equipment"
    id = Column(String, primary_key=True, index=True)
    rack_id = Column(String, ForeignKey("racks.id"))
    type = Column(String)  # server, storage, switch, pdu
    vendor = Column(String)
    model = Column(String)
    u_size = Column(Integer)
    slot_position = Column(Integer)
    
    specifications = Column(JSON) # Store dynamic specs (TDP, networking)

    rack = relationship("Rack", back_populates="equipment")
