from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.repositories.project_repo import ProjectRepository
from app.domain.datacenter.schemas import ProjectCreate, ProjectResponse
from app.api.v1.deps import get_current_user
from app.domain.auth.models import User

router = APIRouter()


@router.post("", response_model=ProjectResponse)
async def create_project(
    body: ProjectCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ProjectResponse:
    repo = ProjectRepository(db)
    # TODO: Check if user has planner permission in workspace
    project = await repo.create_project(
        workspace_id=body.workspace_id,
        name=body.name,
        created_by=current_user.id,
        description=body.description
    )
    await db.commit()
    await db.refresh(project)
    return project


@router.get("", response_model=list[ProjectResponse])
async def list_projects(
    workspace_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ProjectResponse]:
    repo = ProjectRepository(db)
    # TODO: Check if user has viewer permission in workspace
    return await repo.get_by_workspace(workspace_id)
