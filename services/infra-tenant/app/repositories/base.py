from typing import TypeVar, Generic, Type, List, Optional, Any
import uuid
from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import Base
from app.models.domain import User, Organization, Workspace, Subscription, LogicalSpace, RoleAssignment

T = TypeVar("T", bound=Base)

class BaseRepository(Generic[T]):
    def __init__(self, model: Type[T], session: AsyncSession):
        self.model = model
        self.session = session

    async def get(self, id: uuid.UUID) -> Optional[T]:
        result = await self.session.execute(select(self.model).filter_by(id=id))
        return result.scalars().first()

    async def list(self, skip: int = 0, limit: int = 100) -> List[T]:
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

    async def update(self, id: uuid.UUID, obj_in_data: dict) -> Optional[T]:
        await self.session.execute(
            update(self.model).where(self.model.id == id).values(**obj_in_data)
        )
        await self.session.commit()
        return await self.get(id)

    async def delete(self, id: uuid.UUID) -> bool:
        result = await self.session.execute(delete(self.model).where(self.model.id == id))
        await self.session.commit()
        return result.rowcount > 0

class UserRepository(BaseRepository[User]):
    def __init__(self, session: AsyncSession):
        super().__init__(User, session)

    async def get_by_email(self, email: str) -> Optional[User]:
        result = await self.session.execute(select(User).filter_by(email=email))
        return result.scalars().first()

class OrganizationRepository(BaseRepository[Organization]):
    def __init__(self, session: AsyncSession):
        super().__init__(Organization, session)

class WorkspaceRepository(BaseRepository[Workspace]):
    def __init__(self, session: AsyncSession):
        super().__init__(Workspace, session)

    async def list_by_organization(self, org_id: uuid.UUID) -> List[Workspace]:
        result = await self.session.execute(select(Workspace).filter_by(organization_id=org_id))
        return result.scalars().all()

class SubscriptionRepository(BaseRepository[Subscription]):
    def __init__(self, session: AsyncSession):
        super().__init__(Subscription, session)

class LogicalSpaceRepository(BaseRepository[LogicalSpace]):
    def __init__(self, session: AsyncSession):
        super().__init__(LogicalSpace, session)

class RoleAssignmentRepository(BaseRepository[RoleAssignment]):
    def __init__(self, session: AsyncSession):
        super().__init__(RoleAssignment, session)

    async def list_by_user(self, user_id: uuid.UUID) -> List[RoleAssignment]:
        result = await self.session.execute(select(RoleAssignment).filter_by(user_id=user_id))
        return result.scalars().all()
