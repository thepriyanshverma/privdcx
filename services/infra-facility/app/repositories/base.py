from typing import TypeVar, Generic, Type, List, Optional, Any
import uuid
from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import Base
from app.models.domain import Facility, Hall, Zone, Aisle

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
        db_obj = self.model(**obj_in_data)
        self.session.add(db_obj)
        try:
            await self.session.commit()
            await self.session.refresh(db_obj)
            return db_obj
        except Exception:
            await self.session.rollback()
            raise

    async def update(self, id: uuid.UUID, obj_in_data: dict) -> Optional[T]:
        try:
            await self.session.execute(
                update(self.model).where(self.model.id == id).values(**obj_in_data)
            )
            await self.session.commit()
            return await self.get(id)
        except Exception:
            await self.session.rollback()
            raise

    async def delete_soft(self, id: uuid.UUID) -> bool:
        from datetime import datetime
        try:
            await self.session.execute(
                update(self.model)
                .where(self.model.id == id)
                .values(deleted_at=datetime.utcnow())
            )
            await self.session.commit()
            return True
        except Exception:
            await self.session.rollback()
            raise

class FacilityRepository(BaseRepository[Facility]):
    def __init__(self, session: AsyncSession):
        super().__init__(Facility, session)

    async def list_by_workspace(self, workspace_id: uuid.UUID) -> List[Facility]:
        result = await self.session.execute(
            select(Facility).filter_by(workspace_id=workspace_id, deleted_at=None)
        )
        return result.scalars().all()

class HallRepository(BaseRepository[Hall]):
    def __init__(self, session: AsyncSession):
        super().__init__(Hall, session)

class ZoneRepository(BaseRepository[Zone]):
    def __init__(self, session: AsyncSession):
        super().__init__(Zone, session)

class AisleRepository(BaseRepository[Aisle]):
    def __init__(self, session: AsyncSession):
        super().__init__(Aisle, session)
