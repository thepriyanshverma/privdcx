import uuid
from typing import List, Optional, Any
from app.repositories.base import (
    OrganizationRepository, WorkspaceRepository, UserRepository, 
    RoleAssignmentRepository, LogicalSpaceRepository, SubscriptionRepository,
    OrganizationMembershipRepository
)
from app.schemas.domain import UserCreate, OrganizationCreate, WorkspaceCreate, RoleAssignmentCreate, RoleAssignmentRead, LogicalSpaceCreate, SubscriptionCreate
from app.core.security import get_password_hash
from app.models.domain import User, Organization, Workspace, RoleAssignment

class TenantService:
    def __init__(self, session):
        self.session = session
        self.user_repo = UserRepository(session)
        self.org_repo = OrganizationRepository(session)
        self.wrk_repo = WorkspaceRepository(session)
        self.role_repo = RoleAssignmentRepository(session)
        self.ls_repo = LogicalSpaceRepository(session)
        self.sub_repo = SubscriptionRepository(session)
        self.mem_repo = OrganizationMembershipRepository(session)

    async def create_user(self, user_in: UserCreate) -> User:
        from sqlalchemy.exc import IntegrityError
        from fastapi import HTTPException
        user_data = user_in.model_dump()
        user_data["hashed_password"] = get_password_hash(user_data.pop("password"))
        try:
            return await self.user_repo.create(user_data)
        except IntegrityError:
            raise HTTPException(status_code=400, detail="User already exists")

    async def update_user_profile(self, user_id: uuid.UUID, user_update: Any) -> Optional[User]:
        return await self.user_repo.update(user_id, user_update.model_dump(exclude_unset=True))

    async def create_organization(self, org_in: OrganizationCreate, owner_id: uuid.UUID) -> Organization:
        from app.models.domain import RoleName, ScopeType
        
        # 1. Create Organization
        org = await self.org_repo.create(org_in.model_dump())
        
        # 2. Create Organization Membership
        await self.mem_repo.create({
            "organization_id": org.id,
            "user_id": owner_id,
            "role": RoleName.ORG_OWNER,
            "status": "active"
        })
        
        # 3. Create Default Workspace
        await self.wrk_repo.create({
            "organization_id": org.id,
            "name": "Default Workspace",
            "region": "us-east-1"
        })
        
        # 4. Assign Legacy Role (for backward compatibility if needed)
        await self.role_repo.create({
            "user_id": owner_id,
            "role": RoleName.ORG_OWNER,
            "scope_type": ScopeType.ORG,
            "scope_id": org.id
        })
        
        return org

    async def list_user_organizations(self, user_id: uuid.UUID) -> List[Any]:
        # Get orgs via memberships
        memberships = await self.mem_repo.list_by_user(user_id)
        orgs = []
        for mem in memberships:
            org = await self.org_repo.get(mem.organization_id)
            if org:
                # Add role to the org object for the frontend
                org_data = {
                    "id": org.id,
                    "name": org.name,
                    "billing_email": org.billing_email,
                    "created_at": org.created_at,
                    "role": mem.role
                }
                orgs.append(org_data)
        return orgs

    async def get_user_memberships(self, user_id: uuid.UUID) -> List[Any]:
        return await self.mem_repo.list_by_user(user_id)

    async def create_workspace(self, workspace_in: WorkspaceCreate) -> Workspace:
        return await self.wrk_repo.create(workspace_in.model_dump())

    async def assign_role(self, assignment_in: RoleAssignmentCreate) -> RoleAssignment:
        return await self.role_repo.create(assignment_in.model_dump())

    async def create_logical_space(self, ls_in: LogicalSpaceCreate) -> Any:
        return await self.ls_repo.create(ls_in.model_dump())

    async def create_subscription(self, sub_in: SubscriptionCreate) -> Any:
        return await self.sub_repo.create(sub_in.model_dump())
