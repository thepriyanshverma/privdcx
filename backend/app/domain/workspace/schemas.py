from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Literal

WorkspaceRole = Literal["owner", "admin", "planner", "viewer"]


class WorkspaceBase(BaseModel):
    name: str


class WorkspaceCreate(WorkspaceBase):
    org_id: str


class WorkspaceUpdate(BaseModel):
    name: str | None = None


class WorkspaceResponse(WorkspaceBase):
    id: str
    org_id: str
    created_by: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class WorkspaceMemberResponse(BaseModel):
    user_id: str
    workspace_id: str
    role: WorkspaceRole
    joined_at: datetime

    class Config:
        from_attributes = True


class WorkspaceInviteCreate(BaseModel):
    email: EmailStr
    role: WorkspaceRole = "viewer"


class WorkspaceInviteResponse(BaseModel):
    id: str
    workspace_id: str
    email: str
    role: str
    token: str
    expires_at: datetime
    accepted: bool

    class Config:
        from_attributes = True
