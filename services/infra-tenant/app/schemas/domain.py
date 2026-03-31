import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, EmailStr, ConfigDict
from app.models.domain import ScopeType, RoleName

class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    is_active: bool = True

class UserCreate(UserBase):
    password: str

class UserRead(UserBase):
    id: uuid.UUID
    created_at: datetime
    last_workspace_id: Optional[uuid.UUID] = None
    model_config = ConfigDict(from_attributes=True)

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    last_workspace_id: Optional[uuid.UUID] = None

class OrganizationBase(BaseModel):
    name: str
    billing_email: EmailStr

class OrganizationCreate(OrganizationBase):
    pass

class OrganizationRead(OrganizationBase):
    id: uuid.UUID
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class OrganizationMembershipBase(BaseModel):
    organization_id: uuid.UUID
    user_id: uuid.UUID
    role: RoleName
    status: str = "active"

class OrganizationMembershipCreate(OrganizationMembershipBase):
    invited_by: Optional[uuid.UUID] = None

class OrganizationMembershipRead(OrganizationMembershipBase):
    id: uuid.UUID
    joined_at: datetime
    invited_by: Optional[uuid.UUID] = None
    model_config = ConfigDict(from_attributes=True)

class OrganizationMemberRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    organization_id: uuid.UUID
    user_email: str
    full_name: str
    role: RoleName
    status: str
    joined_at: datetime
    model_config = ConfigDict(from_attributes=True)

class OrganizationWithRoleRead(OrganizationRead):
    role: RoleName


class WorkspaceBase(BaseModel):
    name: str
    region: str

class WorkspaceCreate(WorkspaceBase):
    organization_id: uuid.UUID

class WorkspaceRead(WorkspaceBase):
    id: uuid.UUID
    organization_id: uuid.UUID
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class SubscriptionBase(BaseModel):
    plan_type: str
    rack_limit: int
    simulation_limit: int
    status: str = "active"

class SubscriptionCreate(SubscriptionBase):
    organization_id: uuid.UUID
    expires_at: Optional[datetime] = None

class SubscriptionRead(SubscriptionBase):
    id: uuid.UUID
    organization_id: uuid.UUID
    expires_at: Optional[datetime]
    model_config = ConfigDict(from_attributes=True)

class LogicalSpaceBase(BaseModel):
    name: str
    capacity_quota: int
    tenant_type: str

class LogicalSpaceCreate(LogicalSpaceBase):
    workspace_id: uuid.UUID

class LogicalSpaceRead(LogicalSpaceBase):
    id: uuid.UUID
    workspace_id: uuid.UUID
    model_config = ConfigDict(from_attributes=True)

class RoleAssignmentBase(BaseModel):
    user_id: uuid.UUID
    role: RoleName
    scope_type: ScopeType
    scope_id: uuid.UUID

class RoleAssignmentCreate(RoleAssignmentBase):
    pass

class RoleAssignmentRead(RoleAssignmentBase):
    id: uuid.UUID
    model_config = ConfigDict(from_attributes=True)

class Token(BaseModel):
    access_token: str
    token_type: str
    state: Optional[str] = None # e.g. "ORG_REQUIRED"

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class TokenData(BaseModel):
    email: Optional[str] = None
    user_id: Optional[uuid.UUID] = None

class TokenContextRequest(BaseModel):
    org_id: Optional[uuid.UUID] = None
    workspace_id: Optional[uuid.UUID] = None
