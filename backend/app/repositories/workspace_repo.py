from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.domain.workspace.models import Workspace, WorkspaceMembership, WorkspaceInvite


class WorkspaceRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_workspace(self, org_id: str, name: str, created_by: str) -> Workspace:
        ws = Workspace(org_id=org_id, name=name, created_by=created_by)
        self.db.add(ws)
        await self.db.flush()
        return ws

    async def create_membership(self, workspace_id: str, user_id: str, role: str) -> WorkspaceMembership:
        membership = WorkspaceMembership(workspace_id=workspace_id, user_id=user_id, role=role)
        self.db.add(membership)
        await self.db.flush()
        return membership

    async def get_user_workspaces(self, user_id: str) -> list[Workspace]:
        result = await self.db.execute(
            select(Workspace)
            .join(WorkspaceMembership, WorkspaceMembership.workspace_id == Workspace.id)
            .where(WorkspaceMembership.user_id == user_id)
        )
        return list(result.scalars().all())

    async def get_membership(self, workspace_id: str, user_id: str) -> WorkspaceMembership | None:
        result = await self.db.execute(
            select(WorkspaceMembership).where(
                and_(
                    WorkspaceMembership.workspace_id == workspace_id,
                    WorkspaceMembership.user_id == user_id
                )
            )
        )
        return result.scalar_one_or_none()

    async def create_invite(self, workspace_id: str, email: str, role: str) -> WorkspaceInvite:
        invite = WorkspaceInvite(workspace_id=workspace_id, email=email, role=role)
        self.db.add(invite)
        await self.db.flush()
        return invite

    async def get_invite_by_token(self, token: str) -> WorkspaceInvite | None:
        result = await self.db.execute(select(WorkspaceInvite).where(WorkspaceInvite.token == token))
        return result.scalar_one_or_none()
