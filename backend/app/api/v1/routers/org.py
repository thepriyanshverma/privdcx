from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.repositories.org_repo import OrgRepository
from app.domain.organization.schemas import OrgCreate, OrgResponse
from app.api.v1.deps import get_current_user
from app.domain.auth.models import User

router = APIRouter()


@router.post("", response_model=OrgResponse)
async def create_org(
    body: OrgCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrgResponse:
    repo = OrgRepository(db)
    org = await repo.create_org(name=body.name, owner_id=current_user.id)
    await repo.create_membership(org_id=org.id, user_id=current_user.id, role="owner")
    await db.commit()
    await db.refresh(org)
    return org


@router.get("", response_model=list[OrgResponse])
async def list_orgs(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[OrgResponse]:
    repo = OrgRepository(db)
    return await repo.get_user_orgs(current_user.id)
