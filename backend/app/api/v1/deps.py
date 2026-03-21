from typing import Annotated, Literal

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.services.auth_service import AuthService
from app.domain.auth.models import User
from app.domain.workspace.models import WorkspaceMembership

reusable_oauth2 = HTTPBearer()

# RBAC hierarchy
ROLE_HIERARCHY = ["viewer", "planner", "admin", "owner"]


async def get_current_user(
    db: Annotated[AsyncSession, Depends(get_db)],
    token: Annotated[HTTPAuthorizationCredentials, Depends(reusable_oauth2)],
) -> User:
    try:
        payload = jwt.decode(
            token.credentials, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Could not validate credentials",
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
        )
    
    auth_service = AuthService(db)
    user = await auth_service.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def require_role(workspace_id: str, minimum_role: Literal["viewer", "planner", "admin", "owner"]):
    async def _dependency(
        db: Annotated[AsyncSession, Depends(get_db)],
        current_user: Annotated[User, Depends(get_current_user)],
    ) -> WorkspaceMembership:
        # (Actually we need workspace_id from path, but this is a dependency factory)
        # Simplified: API routers will call this with path param
        pass
    return _dependency
