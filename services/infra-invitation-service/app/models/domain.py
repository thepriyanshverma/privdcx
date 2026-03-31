import uuid
import hashlib
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy import String, DateTime, Enum as SQLEnum, Integer, Boolean
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base
from enum import Enum


class InvitationStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    EXPIRED = "expired"
    REVOKED = "revoked"
    CANCELLED = "cancelled"


class ScopeType(str, Enum):
    ORG = "org"
    WORKSPACE = "workspace"
    LOGICAL_SPACE = "logical_space"


class MembershipStatus(str, Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"


class Invitation(Base):
    """Temporary tokenized invitation — NOT the same as membership."""
    __tablename__ = "invitations"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(12), unique=True, index=True) # Human-readable invite code
    email: Mapped[str] = mapped_column(String(255), index=True)
    role: Mapped[str] = mapped_column(String(50))
    scope_type: Mapped[ScopeType] = mapped_column(SQLEnum(ScopeType))
    scope_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True))
    invited_by: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True))
    invited_by_role: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    # Token security: only token_hash stored; raw token returned ONCE at creation
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    status: Mapped[InvitationStatus] = mapped_column(SQLEnum(InvitationStatus), default=InvitationStatus.PENDING)
    expires_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.utcnow() + timedelta(days=7))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    accepted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class WorkspaceMembership(Base):
    """Permanent membership record — created when an invite is accepted."""
    __tablename__ = "workspace_memberships"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), index=True)
    user_email: Mapped[str] = mapped_column(String(255))
    workspace_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), index=True)
    role: Mapped[str] = mapped_column(String(50))
    status: Mapped[MembershipStatus] = mapped_column(SQLEnum(MembershipStatus), default=MembershipStatus.ACTIVE)
    invited_by: Mapped[Optional[uuid.UUID]] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    invitation_id: Mapped[Optional[uuid.UUID]] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


def hash_token(raw_token: str) -> str:
    """SHA256 hash of the raw invitation token for secure DB storage."""
    return hashlib.sha256(raw_token.encode()).hexdigest()
