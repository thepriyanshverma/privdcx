import uuid
import secrets
from datetime import datetime, timedelta
from typing import Any, Optional, List
from fastapi import HTTPException
import os
import httpx
from app.repositories.base import InvitationRepository, MembershipRepository
from app.schemas.domain import InvitationCreate
from app.models.domain import InvitationStatus, MembershipStatus, ScopeType, hash_token


# Role hierarchy for RBAC enforcement
MANAGEMENT_ROLES = {"org_owner", "org_admin", "workspace_owner", "infra_architect"}
OWNER_ROLES = {"org_owner", "org_admin", "workspace_owner"}


class InvitationService:
    def __init__(self, session):
        self.inv_repo = InvitationRepository(session)
        self.mem_repo = MembershipRepository(session)

    async def create_invitation(
        self,
        invite_in: InvitationCreate,
        invited_by: uuid.UUID,
        invited_by_role: str,
    ) -> tuple[Any, str]:
        """Returns (Invitation DB object, raw_token). Raw token shown ONCE."""
        if invited_by_role not in MANAGEMENT_ROLES:
            raise HTTPException(status_code=403, detail="Insufficient role to create invitations.")

        # Check for existing pending invite to this email in this scope
        existing = await self.inv_repo.list_by_scope(invite_in.scope_id)
        for inv in existing:
            if inv.email == invite_in.email and inv.status == InvitationStatus.PENDING:
                raise HTTPException(
                    status_code=409,
                    detail=f"An active invitation for {invite_in.email} already exists in this scope."
                )

        raw_token = secrets.token_urlsafe(48)
        token_hash = hash_token(raw_token)
        code = secrets.token_hex(6).upper() # 12-char alphanumeric code

        expires_at = datetime.utcnow() + timedelta(days=invite_in.expires_in_days or 7)

        invite_data = {
            "code": code,
            "email": invite_in.email,
            "role": invite_in.role,
            "scope_type": invite_in.scope_type,
            "scope_id": invite_in.scope_id,
            "invited_by": invited_by,
            "invited_by_role": invited_by_role,
            "token_hash": token_hash,
            "status": InvitationStatus.PENDING,
            "expires_at": expires_at,
        }
        invite = await self.inv_repo.create(invite_data)
        return invite, raw_token

    async def get_invitation_by_token(self, raw_token: str) -> Any:
        """Verify a token is valid and not expired."""
        invite = await self.inv_repo.get_by_token(raw_token)
        if not invite:
            raise HTTPException(status_code=404, detail="Invitation not found or invalid code.")

        if invite.status != InvitationStatus.PENDING:
            raise HTTPException(status_code=400, detail=f"Invitation is {invite.status.value}.")

        if invite.expires_at < datetime.utcnow():
            invite.status = InvitationStatus.EXPIRED
            await self.inv_repo.session.commit()
            raise HTTPException(status_code=400, detail="Invitation has expired.")

        return invite

    async def accept_invitation(
        self,
        raw_token: str,
        caller_email: str,
        caller_user_id: uuid.UUID,
    ) -> Any:
        """Accept an invitation. Validates email match. Creates WorkspaceMembership."""
        invite = await self.get_invitation_by_token(raw_token)

        # Security: email must match
        if invite.email.lower() != caller_email.lower():
            raise HTTPException(
                status_code=403,
                detail="This invitation was issued to a different email address."
            )

        # Check not already a member
        existing_membership = await self.mem_repo.get_by_user_and_workspace(
            caller_user_id, invite.scope_id
        )
        if existing_membership:
            raise HTTPException(status_code=409, detail="You are already a member of this workspace.")

        # Create permanent membership
        membership_data = {
            "user_id": caller_user_id,
            "user_email": caller_email,
            "workspace_id": invite.scope_id,
            "role": invite.role,
            "status": MembershipStatus.ACTIVE,
            "invited_by": invite.invited_by,
            "invitation_id": invite.id,
        }
        await self.mem_repo.create(membership_data)

        # Finalize invite
        invite.status = InvitationStatus.ACCEPTED
        invite.accepted_at = datetime.utcnow()
        await self.inv_repo.session.commit()
        await self.inv_repo.session.refresh(invite)

        # Notify Tenant Service about Org Membership if applicable
        if invite.scope_type == ScopeType.ORG:
            tenant_url = os.getenv("TENANT_SERVICE_URL", "http://infra-tenant:8005/api/v1")
            try:
                async with httpx.AsyncClient() as client:
                    await client.post(
                        f"{tenant_url}/organizations/{invite.scope_id}/members",
                        params={"user_id": str(caller_user_id), "role": invite.role},
                        timeout=5.0
                    )
            except Exception as e:
                # Log error but don't fail acceptance if sync fails (can be reconciled later)
                print(f"ERROR: Failed to sync org membership to tenant service: {e}")

        return invite

    async def revoke_invitation(
        self,
        invitation_id: uuid.UUID,
        revoker_user_id: uuid.UUID,
        revoker_role: str,
    ) -> bool:
        """Only the invitation creator or a workspace owner can revoke."""
        invite = await self.inv_repo.get(invitation_id)
        if not invite:
            raise HTTPException(status_code=404, detail="Invitation not found.")

        is_owner = revoker_role in OWNER_ROLES
        is_creator = invite.invited_by == revoker_user_id
        if not (is_owner or is_creator):
            raise HTTPException(status_code=403, detail="Not authorized to revoke this invitation.")

        if invite.status not in (InvitationStatus.PENDING,):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot revoke an invitation with status '{invite.status.value}'."
            )

        invite.status = InvitationStatus.REVOKED
        await self.inv_repo.session.commit()
        return True

    async def get_workspace_members(self, workspace_id: uuid.UUID) -> List[Any]:
        return await self.mem_repo.get_by_workspace(workspace_id)

    async def get_workspace_invitations(
        self,
        workspace_id: uuid.UUID,
        viewer_role: str,
        viewer_user_id: uuid.UUID,
    ) -> List[Any]:
        if viewer_role not in MANAGEMENT_ROLES:
            raise HTTPException(status_code=403, detail="Insufficient role to view invitations.")
        return await self.inv_repo.list_for_workspace(workspace_id, viewer_role, viewer_user_id)

    async def get_organization_members(self, org_id: uuid.UUID, auth_token: Optional[str] = None) -> List[Any]:
        """Fetch organization members from Tenant Service."""
        tenant_url = os.getenv("TENANT_SERVICE_URL", "http://infra-tenant:8005/api/v1")
        headers = {}
        if auth_token:
            headers["Authorization"] = f"Bearer {auth_token}"
            
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{tenant_url}/organizations/{org_id}/members", 
                    headers=headers,
                    timeout=5.0
                )
                if resp.status_code == 200:
                    return resp.json()
                print(f"DEBUG: Tenant service returned {resp.status_code} for org members")
                return []
        except Exception as e:
            print(f"ERROR: Failed to fetch org members: {e}")
            return []

    async def get_organization_invitations(
        self,
        org_id: uuid.UUID,
        viewer_role: str,
        viewer_user_id: uuid.UUID,
    ) -> List[Any]:
        # Org management roles: org_owner, org_admin
        if viewer_role not in {"org_owner", "org_admin"}:
            raise HTTPException(status_code=403, detail="Insufficient role to view organization invitations.")
        return await self.inv_repo.list_for_organization(org_id, viewer_role, viewer_user_id)
