from typing import TypeVar, Generic, Type, List, Optional, Any
import uuid
from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import Base
from app.models.domain import Rack

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

    async def bulk_create(self, objects_in: List[dict]) -> List[T]:
        db_objs = [self.model(**obj_data) for obj_data in objects_in]
        self.session.add_all(db_objs)
        try:
            await self.session.commit()
            for obj in db_objs:
                await self.session.refresh(obj)
            return db_objs
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

    async def delete(self, id: uuid.UUID) -> bool:
        try:
            result = await self.session.execute(delete(self.model).where(self.model.id == id))
            await self.session.commit()
            return result.rowcount > 0
        except Exception:
            await self.session.rollback()
            raise

class RackRepository(BaseRepository[Rack]):
    def __init__(self, session: AsyncSession):
        super().__init__(Rack, session)

    async def list_by_workspace(self, workspace_id: uuid.UUID) -> List[Rack]:
        result = await self.session.execute(select(Rack).filter_by(workspace_id=workspace_id))
        return result.scalars().all()

    async def list_by_zone(self, zone_id: uuid.UUID) -> List[Rack]:
        result = await self.session.execute(select(Rack).filter_by(zone_id=zone_id))
        return result.scalars().all()
