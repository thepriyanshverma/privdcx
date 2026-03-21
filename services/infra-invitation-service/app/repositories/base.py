from typing import TypeVar, Generic, Type, List, Optional
import uuid
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import Base
from app.models.domain import Invitation, WorkspaceMembership, hash_token

T = TypeVar("T", bound=Base)


class BaseRepository(Generic[T]):
    def __init__(self, model: Type[T], session: AsyncSession):
        self.model = model
        self.session = session

    async def get(self, id: uuid.UUID) -> Optional[T]:
        result = await self.session.execute(select(self.model).filter_by(id=id))
        return result.scalars().first()

    async def list(self, skip: int = 0, limit: int = 200) -> List[T]:
        result = await self.session.execute(select(self.model).offset(skip).limit(limit))
        return result.scalars().all()

    async def create(self, obj_in_data: dict) -> T:
        try:
            db_obj = self.model(**obj_in_data)
            self.session.add(db_obj)
            await self.session.commit()
            await self.session.refresh(db_obj)
            return db_obj
        except Exception:
            await self.session.rollback()
            raise


class InvitationRepository(BaseRepository[Invitation]):
    def __init__(self, session: AsyncSession):
        super().__init__(Invitation, session)

    async def get_by_token(self, raw_token: str) -> Optional[Invitation]:
        """Lookup by SHA256 hash — never compare raw tokens."""
        token_hash = hash_token(raw_token)
        result = await self.session.execute(
            select(Invitation).filter_by(token_hash=token_hash)
        )
        return result.scalars().first()

    async def list_for_workspace(
        self,
        workspace_id: uuid.UUID,
        viewer_role: str,
        viewer_user_id: uuid.UUID,
    ) -> List[Invitation]:
        """
        RBAC-scoped listing:
         - org_owner / workspace_owner  → all invitations
         - infra_architect              → only invitations they created
         - infra_operator / viewer      → empty (403 enforced at router)
        """
        owner_roles = {"org_owner", "workspace_owner"}
        q = select(Invitation).filter_by(scope_id=workspace_id)

        if viewer_role in owner_roles:
            pass  # see all
        elif viewer_role == "infra_architect":
            q = q.where(Invitation.invited_by == viewer_user_id)
        else:
            return []

        result = await self.session.execute(q)
        return result.scalars().all()

    async def list_by_scope(self, scope_id: uuid.UUID) -> List[Invitation]:
        result = await self.session.execute(
            select(Invitation).filter_by(scope_id=scope_id)
        )
        return result.scalars().all()


class MembershipRepository(BaseRepository[WorkspaceMembership]):
    def __init__(self, session: AsyncSession):
        super().__init__(WorkspaceMembership, session)

    async def get_by_workspace(self, workspace_id: uuid.UUID) -> List[WorkspaceMembership]:
        result = await self.session.execute(
            select(WorkspaceMembership).filter_by(workspace_id=workspace_id)
        )
        return result.scalars().all()

    async def get_by_user_and_workspace(
        self, user_id: uuid.UUID, workspace_id: uuid.UUID
    ) -> Optional[WorkspaceMembership]:
        result = await self.session.execute(
            select(WorkspaceMembership).filter_by(user_id=user_id, workspace_id=workspace_id)
        )
        return result.scalars().first()

    async def get_user_role(self, user_id: uuid.UUID, workspace_id: uuid.UUID) -> Optional[str]:
        m = await self.get_by_user_and_workspace(user_id, workspace_id)
        return m.role if m else None
