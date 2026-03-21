import uuid
from datetime import datetime
from typing import List, Optional
from sqlalchemy import String, ForeignKey, DateTime, JSON, Boolean, Table, Column, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from enum import Enum

class ScopeType(str, Enum):
    ORG = "org"
    WORKSPACE = "workspace"
    LOGICAL_SPACE = "logical_space"

class RoleName(str, Enum):
    # Platform Roles
    PLATFORM_ADMIN = "platform_admin"
    PLATFORM_OPERATOR = "platform_operator"
    
    # Organization Roles
    ORG_OWNER = "org_owner"
    ORG_ADMIN = "org_admin"
    ORG_BILLING_ADMIN = "org_billing_admin"
    
    # Workspace Roles
    WORKSPACE_OWNER = "workspace_owner"
    WORKSPACE_ADMIN = "workspace_admin"
    INFRA_ARCHITECT = "infra_architect"
    INFRA_OPERATOR = "infra_operator"
    INFRA_VIEWER = "infra_viewer"
    
    # Tenant / Logical Space Roles
    TENANT_OWNER = "tenant_owner"
    TENANT_OPERATOR = "tenant_operator"
    TENANT_VIEWER = "tenant_viewer"

class User(Base):
    __tablename__ = "users"
    
    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(255))
    hashed_password: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_workspace_id: Mapped[Optional[uuid.UUID]] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    
    role_assignments: Mapped[List["RoleAssignment"]] = relationship(back_populates="user")

class Organization(Base):
    __tablename__ = "organizations"
    
    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255))
    billing_email: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True) # Soft delete
    
    workspaces: Mapped[List["Workspace"]] = relationship(back_populates="organization")
    subscriptions: Mapped[List["Subscription"]] = relationship(back_populates="organization")

class Workspace(Base):
    __tablename__ = "workspaces"
    
    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("organizations.id"))
    name: Mapped[str] = mapped_column(String(255))
    region: Mapped[str] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    organization: Mapped["Organization"] = relationship(back_populates="workspaces")
    logical_spaces: Mapped[List["LogicalSpace"]] = relationship(back_populates="workspace")

class Subscription(Base):
    __tablename__ = "subscriptions"
    
    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("organizations.id"))
    plan_type: Mapped[str] = mapped_column(String(50)) # e.g. "Pro", "Enterprise"
    rack_limit: Mapped[int] = mapped_column(default=10)
    simulation_limit: Mapped[int] = mapped_column(default=5)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active")
    
    organization: Mapped["Organization"] = relationship(back_populates="subscriptions")

class LogicalSpace(Base):
    __tablename__ = "logical_spaces"
    
    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("workspaces.id"))
    name: Mapped[str] = mapped_column(String(255))
    capacity_quota: Mapped[int] = mapped_column(default=1000) # e.g. kW
    tenant_type: Mapped[str] = mapped_column(String(50)) # e.g. "dedicated", "shared"
    
    workspace: Mapped["Workspace"] = relationship(back_populates="logical_spaces")

class RoleAssignment(Base):
    __tablename__ = "role_assignments"
    
    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
    role: Mapped[RoleName] = mapped_column(SQLEnum(RoleName))
    scope_type: Mapped[ScopeType] = mapped_column(SQLEnum(ScopeType))
    scope_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True)) # ID of org, workspace, or logical_space
    
    user: Mapped["User"] = relationship(back_populates="role_assignments")
