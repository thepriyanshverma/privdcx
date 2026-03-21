from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.workspace_repo import WorkspaceRepository
from app.repositories.org_repo import OrgRepository
from app.domain.workspace.models import Workspace, WorkspaceInvite, WorkspaceMembership
from app.domain.workspace.schemas import WorkspaceCreate


class WorkspaceService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.workspace_repo = WorkspaceRepository(db)
        self.org_repo = OrgRepository(db)

    async def create_workspace(self, ws_in: WorkspaceCreate, user_id: str) -> Workspace:
        # Check if org exists and user is member
        # (Simplified: assume repo check or handled in API layer)
        ws = await self.workspace_repo.create_workspace(
            org_id=ws_in.org_id,
            name=ws_in.name,
            created_by=user_id
        )
        # Creator becomes owner of the workspace
        await self.workspace_repo.create_membership(
            workspace_id=ws.id,
            user_id=user_id,
            role="owner"
        )
        await self.db.commit()
        await self.db.refresh(ws)
        return ws

    async def list_workspaces(self, user_id: str) -> list[Workspace]:
        return await self.workspace_repo.get_user_workspaces(user_id)

    async def invite_user(self, workspace_id: str, email: str, role: str) -> WorkspaceInvite:
        invite = await self.workspace_repo.create_invite(workspace_id, email, role)
        await self.db.commit()
        await self.db.refresh(invite)
        # LOGIC: Actually send email here in a real app
        return invite

    async def accept_invite(self, token: str, user_id: str) -> WorkspaceMembership:
        invite = await self.workspace_repo.get_invite_by_token(token)
        if not invite:
            raise ValueError("Invalid invite token")
        if invite.accepted:
            raise ValueError("Invite already accepted")
        if invite.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
            raise ValueError("Invite has expired")

        # Check if already a member
        existing = await self.workspace_repo.get_membership(invite.workspace_id, user_id)
        if existing:
             raise ValueError("User is already a member of this workspace")

        membership = await self.workspace_repo.create_membership(
            workspace_id=invite.workspace_id,
            user_id=user_id,
            role=invite.role
        )
        invite.accepted = True
        await self.db.commit()
        return membership
