import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr, ConfigDict
from app.models.domain import InvitationStatus, ScopeType, MembershipStatus


# ─── Invitation Schemas ───────────────────────────────────────────────────────

class InvitationCreate(BaseModel):
    email: EmailStr
    role: str
    scope_type: Optional[ScopeType] = None  # Router always overrides this
    scope_id: Optional[uuid.UUID] = None    # Router always overrides this
    expires_in_days: Optional[int] = 7


class InvitationRead(BaseModel):
    id: uuid.UUID
    code: str
    email: str
    role: str
    scope_type: ScopeType
    scope_id: uuid.UUID
    invited_by: uuid.UUID
    status: InvitationStatus
    expires_at: datetime
    created_at: datetime
    accepted_at: Optional[datetime]
    # Raw token — only non-None when returned immediately after creation
    # For all other reads, this is None (security: never expose again)
    token: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class InvitationCreatedResponse(InvitationRead):
    """Response on initial creation — includes raw token ONCE."""
    token: str


class InvitationAccept(BaseModel):
    token: str
    # Caller's email for validation (must match invite.email)
    email: EmailStr


class InvitationRevoke(BaseModel):
    invitation_id: uuid.UUID


# ─── Membership Schemas ───────────────────────────────────────────────────────

class WorkspaceMemberRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_email: str
    workspace_id: uuid.UUID
    role: str
    status: MembershipStatus
    invited_by: Optional[uuid.UUID]
    joined_at: datetime
    model_config = ConfigDict(from_attributes=True)
