from pydantic import BaseModel
from datetime import datetime


class ProjectBase(BaseModel):
    name: str
    description: str | None = None


class ProjectCreate(ProjectBase):
    workspace_id: str


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class ProjectResponse(ProjectBase):
    id: str
    workspace_id: str
    version: int
    created_by: str | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
