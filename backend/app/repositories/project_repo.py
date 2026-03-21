from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.domain.datacenter.models import DataCenterProject


class ProjectRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_project(self, workspace_id: str, name: str, created_by: str, description: str = None) -> DataCenterProject:
        project = DataCenterProject(
            workspace_id=workspace_id,
            name=name,
            created_by=created_by,
            description=description
        )
        self.db.add(project)
        await self.db.flush()
        return project

    async def get_by_workspace(self, workspace_id: str) -> list[DataCenterProject]:
        result = await self.db.execute(
            select(DataCenterProject).where(DataCenterProject.workspace_id == workspace_id)
        )
        return list(result.scalars().all())

    async def get_by_id(self, project_id: str) -> DataCenterProject | None:
        result = await self.db.execute(select(DataCenterProject).where(DataCenterProject.id == project_id))
        return result.scalar_one_or_none()
