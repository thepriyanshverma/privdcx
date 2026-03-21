from pydantic import BaseModel
from datetime import datetime
from typing import Literal

OrgRole = Literal["owner", "admin", "member"]


class OrgBase(BaseModel):
    name: str


class OrgCreate(OrgBase):
    pass


class OrgUpdate(BaseModel):
    name: str | None = None
    plan_type: str | None = None


class OrgResponse(OrgBase):
    id: str
    owner_id: str
    plan_type: str
    created_at: datetime

    class Config:
        from_attributes = True


class OrgMembershipResponse(BaseModel):
    user_id: str
    org_id: str
    role: OrgRole
    created_at: datetime

    class Config:
        from_attributes = True
