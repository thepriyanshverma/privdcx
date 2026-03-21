from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.services.workspace_service import WorkspaceService
from app.domain.workspace.schemas import (
    WorkspaceCreate, WorkspaceResponse, WorkspaceInviteCreate, 
    WorkspaceInviteResponse, WorkspaceMemberResponse
)
from app.api.v1.deps import get_current_user
from app.domain.auth.models import User

router = APIRouter()


@router.post("", response_model=WorkspaceResponse)
async def create_workspace(
    body: WorkspaceCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> WorkspaceResponse:
    service = WorkspaceService(db)
    return await service.create_workspace(body, current_user.id)


@router.get("", response_model=list[WorkspaceResponse])
async def list_workspaces(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[WorkspaceResponse]:
    service = WorkspaceService(db)
    return await service.list_workspaces(current_user.id)


@router.post("/{workspace_id}/invite", response_model=WorkspaceInviteResponse)
async def invite_user(
    workspace_id: str,
    body: WorkspaceInviteCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> WorkspaceInviteResponse:
    service = WorkspaceService(db)
    # TODO: Check if current_user has permission to invite
    return await service.invite_user(workspace_id, body.email, body.role)


@router.post("/join/{token}", response_model=WorkspaceMemberResponse)
async def accept_invite(
    token: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> WorkspaceMemberResponse:
    service = WorkspaceService(db)
    try:
        return await service.accept_invite(token, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
