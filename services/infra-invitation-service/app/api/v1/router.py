from fastapi import APIRouter, Depends, HTTPException, Query, Header, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.services.invitation import InvitationService
from app.schemas.domain import (
    InvitationCreate, InvitationRead, InvitationCreatedResponse,
    InvitationAccept, InvitationRevoke, WorkspaceMemberRead
)
from typing import List, Optional
import uuid
import os
from jose import jwt, JWTError

router = APIRouter()

# ─── JWT Auth (matches infra-tenant security config) ──────────────────────────
SECRET_KEY = os.getenv("SECRET_KEY", "SUPER_SECRET_KEY_FOR_DEV_ONLY")
ALGORITHM = "HS256"
bearer_scheme = HTTPBearer(auto_error=False)


def decode_jwt(token: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return {}


async def get_caller(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    x_user_id: Optional[str] = Header(None),
    x_user_role: Optional[str] = Header(None),
    x_user_email: Optional[str] = Header(None),
) -> dict:
    """
    Resolve caller identity — priority:
      1. Decode Bearer JWT (most reliable — gateway always passes it)
      2. Fall back to X-User-* gateway headers
      3. Default to zero-permission viewer (safe fallback)
    """
    # 1. Try JWT Bearer
    if credentials and credentials.credentials:
        payload = decode_jwt(credentials.credentials)
        if payload.get("sub"):
            return {
                "user_id": uuid.UUID(payload["sub"]),
                "user_role": payload.get("role", "workspace_owner"),  # Default to owner when no role in JWT yet
                "user_email": payload.get("email", ""),
                "raw_token": credentials.credentials,
            }

    # 2. Fall back to gateway-injected headers
    if x_user_id:
        return {
            "user_id": uuid.UUID(x_user_id),
            "user_role": x_user_role or "workspace_owner",
            "user_email": x_user_email or "",
            "raw_token": None,
        }

    # 3. Safe default — unauthenticated
    raise HTTPException(status_code=401, detail="Not authenticated")


async def get_caller_with_workspace_role(
    workspace_id: uuid.UUID,
    caller: dict,
    db: AsyncSession,
) -> dict:
    """
    Look up the caller's actual role in the workspace_memberships table.
    If no membership exists and they are the workspace creator (first user),
    auto-bootstrap them as workspace_owner.
    """
    from app.repositories.base import MembershipRepository
    from app.models.domain import MembershipStatus
    
    mem_repo = MembershipRepository(db)
    membership = await mem_repo.get_by_user_and_workspace(caller["user_id"], workspace_id)
    
    if membership:
        return {**caller, "user_role": membership.role}
    
    # ── Bootstrap: First user in this workspace becomes owner ──────────────
    # This handles the case where a workspace was created without creating a membership first.
    all_members = await mem_repo.get_by_workspace(workspace_id)
    if len(all_members) == 0:
        # No members at all — auto-grant workspace_owner to this caller
        await mem_repo.create({
            "user_id": caller["user_id"],
            "user_email": caller["user_email"],
            "workspace_id": workspace_id,
            "role": "workspace_owner",
            "status": MembershipStatus.ACTIVE,
            "invited_by": None,
            "invitation_id": None,
        })
        return {**caller, "user_role": "workspace_owner"}
    
    # Has members but this user is not one of them — default to viewer 
    return {**caller, "user_role": "infra_viewer"}


# ─── Workspace Member Endpoints ────────────────────────────────────────────────

@router.get("/workspace/{workspace_id}/members", response_model=List[WorkspaceMemberRead])
async def list_members(
    workspace_id: uuid.UUID,
    caller: dict = Depends(get_caller),
    db: AsyncSession = Depends(get_db),
):
    """All roles can list members."""
    svc = InvitationService(db)
    return await svc.get_workspace_members(workspace_id)


# ─── Invitation Management Endpoints ──────────────────────────────────────────

@router.get("/workspace/{workspace_id}/invites", response_model=List[InvitationRead])
async def list_invitations(
    workspace_id: uuid.UUID,
    caller: dict = Depends(get_caller),
    db: AsyncSession = Depends(get_db),
):
    resolved = await get_caller_with_workspace_role(workspace_id, caller, db)
    svc = InvitationService(db)
    invitations = await svc.get_workspace_invitations(
        workspace_id, resolved["user_role"], resolved["user_id"]
    )
    return [InvitationRead.model_validate(inv) for inv in invitations]


@router.post("/workspace/{workspace_id}/invite", response_model=InvitationCreatedResponse)
async def create_invite(
    workspace_id: uuid.UUID,
    invite_in: InvitationCreate,
    caller: dict = Depends(get_caller),
    db: AsyncSession = Depends(get_db),
):
    """Create invitation. Raw token returned ONCE — never shown again."""
    resolved = await get_caller_with_workspace_role(workspace_id, caller, db)
    invite_in.scope_id = workspace_id
    svc = InvitationService(db)
    invite, raw_token = await svc.create_invitation(
        invite_in,
        invited_by=resolved["user_id"],
        invited_by_role=resolved["user_role"],
    )
    invite_dict = InvitationRead.model_validate(invite).model_dump()
    invite_dict["token"] = raw_token
    return InvitationCreatedResponse(**invite_dict)


@router.post("/workspace/{workspace_id}/invite/{invitation_id}/revoke")
async def revoke_invite(
    workspace_id: uuid.UUID,
    invitation_id: uuid.UUID,
    caller: dict = Depends(get_caller),
    db: AsyncSession = Depends(get_db),
):
    resolved = await get_caller_with_workspace_role(workspace_id, caller, db)
    svc = InvitationService(db)
    await svc.revoke_invitation(invitation_id, resolved["user_id"], resolved["user_role"])
    return {"status": "revoked", "invitation_id": str(invitation_id)}


@router.post("/workspace/{workspace_id}/invite/{token}/accept", response_model=InvitationRead)
async def accept_invite(
    workspace_id: uuid.UUID,
    token: str,
    accept_in: InvitationAccept,
    caller: dict = Depends(get_caller),
    db: AsyncSession = Depends(get_db),
):
    svc = InvitationService(db)
    invite = await svc.accept_invitation(
        raw_token=accept_in.token,
        caller_email=accept_in.email,
        caller_user_id=caller["user_id"],
    )
    return InvitationRead.model_validate(invite)


# ─── Legacy endpoints (WorkspaceSelectorPage compat) ──────────────────────────

@router.get("/invitations/{token}", response_model=InvitationRead)
async def get_invite_by_token(token: str, db: AsyncSession = Depends(get_db)):
    svc = InvitationService(db)
    invite = await svc.get_invitation_by_token(token)
    return InvitationRead.model_validate(invite)


@router.post("/invitations/accept", response_model=InvitationRead)
async def accept_invite_legacy(
    accept_in: InvitationAccept,
    caller: dict = Depends(get_caller),
    db: AsyncSession = Depends(get_db),
):
    svc = InvitationService(db)
    invite = await svc.accept_invitation(
        raw_token=accept_in.token,
        caller_email=accept_in.email,
        caller_user_id=caller["user_id"],
    )
    return InvitationRead.model_validate(invite)


@router.get("/invitations", response_model=List[InvitationRead])
async def list_invitations_legacy(
    scope_id: Optional[uuid.UUID] = Query(None),
    caller: dict = Depends(get_caller),
    db: AsyncSession = Depends(get_db),
):
    from app.repositories.base import InvitationRepository
    repo = InvitationRepository(db)
    if scope_id:
        resolved = await get_caller_with_workspace_role(scope_id, caller, db)
        invites = await repo.list_for_workspace(scope_id, resolved["user_role"], resolved["user_id"])
    else:
        invites = await repo.list()
    return [InvitationRead.model_validate(inv) for inv in invites]
