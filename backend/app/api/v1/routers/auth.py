from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.services.auth_service import AuthService
from app.domain.auth.schemas import LoginRequest, RegisterRequest, Token, UserProfile
from app.api.v1.deps import get_current_user
from app.domain.auth.models import User

router = APIRouter()


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(
    body: RegisterRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Token:
    auth_service = AuthService(db)
    try:
        user = await auth_service.register_user(body)
        access_token = await auth_service.authenticate(body.email, body.password)
        return Token(access_token=access_token, token_type="bearer")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login", response_model=Token)
async def login(
    body: LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Token:
    auth_service = AuthService(db)
    token = await auth_service.authenticate(body.email, body.password)
    if not token:
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    return Token(access_token=token, token_type="bearer")


@router.get("/me", response_model=UserProfile)
async def read_user_me(
    current_user: Annotated[User, Depends(get_current_user)],
) -> UserProfile:
    return current_user
