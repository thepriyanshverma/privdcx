from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.user_repo import UserRepository
from app.repositories.org_repo import OrgRepository
from app.domain.auth.schemas import UserCreate, UserProfile
from app.domain.auth.models import User
from app.core.security import verify_password, create_access_token


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.user_repo = UserRepository(db)
        self.org_repo = OrgRepository(db)

    async def register_user(self, user_in: UserCreate) -> User:
        # Check if user exists
        existing_user = await self.user_repo.get_by_email(user_in.email)
        if existing_user:
            raise ValueError("User with this email already exists")

        # Create User
        user = await self.user_repo.create(user_in)

        # Auto-create Personal Organization
        org_name = f"{user.name}'s Organization"
        org = await self.org_repo.create_org(name=org_name, owner_id=user.id)

        # Add User as Owner of the Org
        await self.org_repo.create_membership(org_id=org.id, user_id=user.id, role="owner")

        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def authenticate(self, email: str, password: str) -> str | None:
        user = await self.user_repo.get_by_email(email)
        if not user or not verify_password(password, user.hashed_password):
            return None

        return create_access_token(subject=user.id)

    async def get_user_by_id(self, user_id: str) -> User | None:
        return await self.user_repo.get_by_id(user_id)
