from typing import TypeVar, Generic, Type, List, Optional, Any
import uuid
from sqlalchemy import select, update, delete, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import Base
from app.models.domain import Device, DeviceTemplate, Cluster

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

    async def delete(self, id: uuid.UUID) -> bool:
        try:
            result = await self.session.execute(delete(self.model).where(self.model.id == id))
            await self.session.commit()
            return result.rowcount > 0
        except Exception:
            await self.session.rollback()
            raise

class DeviceRepository(BaseRepository[Device]):
    def __init__(self, session: AsyncSession):
        super().__init__(Device, session)

    async def get_rack_occupancy(self, rack_id: uuid.UUID) -> List[Device]:
        result = await self.session.execute(
            select(Device).where(and_(Device.rack_id == rack_id, Device.deleted_at == None))
        )
        return result.scalars().all()

    async def list_by_cluster(self, cluster_id: uuid.UUID) -> List[Device]:
        result = await self.session.execute(select(Device).filter_by(cluster_id=cluster_id))
        return result.scalars().all()

    async def list_filtered(
        self,
        workspace_id: Optional[uuid.UUID] = None,
        rack_id: Optional[uuid.UUID] = None,
        skip: int = 0,
        limit: int = 1000,
    ) -> List[Device]:
        stmt = select(Device).where(Device.deleted_at == None)  # noqa: E711
        if workspace_id:
            stmt = stmt.where(Device.workspace_id == workspace_id)
        if rack_id:
            stmt = stmt.where(Device.rack_id == rack_id)
        stmt = stmt.offset(skip).limit(limit)
        result = await self.session.execute(stmt)
        return result.scalars().all()

class TemplateRepository(BaseRepository[DeviceTemplate]):
    def __init__(self, session: AsyncSession):
        super().__init__(DeviceTemplate, session)

class ClusterRepository(BaseRepository[Cluster]):
    def __init__(self, session: AsyncSession):
        super().__init__(Cluster, session)
