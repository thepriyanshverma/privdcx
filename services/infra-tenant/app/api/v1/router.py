from typing import List, Optional, Any
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.services.tenant import TenantService
from app.schemas.domain import UserCreate, UserRead, UserUpdate, Token, UserLogin, OrganizationCreate, OrganizationRead, WorkspaceCreate, WorkspaceRead, RoleAssignmentCreate, RoleAssignmentRead, LogicalSpaceCreate, SubscriptionCreate, OrganizationWithRoleRead, TokenContextRequest
from app.middleware.auth import get_current_user, inject_tenant_context, check_permission
from app.models.domain import User, RoleName, ScopeType
import uuid

router = APIRouter()

# --- Auth ---
@router.post("/auth/register", response_model=UserRead)
async def register(user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    service = TenantService(db)
    return await service.create_user(user_in)

@router.post("/auth/login", response_model=Token)
async def login(login_data: UserLogin, db: AsyncSession = Depends(get_db)):
    from app.core.security import verify_password, create_access_token
    from app.repositories.base import UserRepository
    user_repo = UserRepository(db)
    user = await user_repo.get_by_email(login_data.email)
    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    token_str = create_access_token(user.id, email=user.email)
    print(f"DEBUG Auth: Generated token for {user.email}: {token_str[:20]}...{token_str[-20:]} (len: {len(token_str)})")
    
    # Check for bootstrap state
    service = TenantService(db)
    memberships = await service.get_user_memberships(user.id)
    state = "ORG_REQUIRED" if not memberships else None
    
    return {"access_token": token_str, "token_type": "bearer", "state": state}

@router.post("/auth/token/context", response_model=Token)
async def exchange_context_token(
    request_data: TokenContextRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    from app.core.security import create_access_token
    from app.services.tenant import TenantService
    
    service = TenantService(db)
    org_id = request_data.org_id
    workspace_id = request_data.workspace_id
    
    membership = None
    # Verify membership if org_id is provided
    if org_id:
        membership = await service.mem_repo.get_membership(current_user.id, org_id)
        if not membership:
            raise HTTPException(status_code=403, detail="Not a member of this organization")
        
        # Verify workspace belongs to org if workspace_id is provided
        if workspace_id:
            ws = await service.wrk_repo.get(workspace_id)
            if not ws or ws.organization_id != org_id:
                raise HTTPException(status_code=400, detail="Workspace does not belong to this organization")

    # Generate new token with context
    # membership.role is a RoleName enum (str, Enum), so str() or .value gives 'org_owner'
    return {
        "access_token": create_access_token(
            current_user.id,
            email=current_user.email,
            full_name=current_user.full_name,
            org_id=str(org_id) if org_id else None, 
            workspace_id=str(workspace_id) if workspace_id else None,
            role=membership.role.value if membership else None
        ),
        "token_type": "bearer"
    }

@router.get("/auth/me", response_model=UserRead)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.patch("/auth/me", response_model=UserRead)
async def update_me(user_update: UserUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    service = TenantService(db)
    updated = await service.update_user_profile(current_user.id, user_update)
    await db.commit()
    return updated

# --- Organizations ---
@router.post("/organizations", response_model=OrganizationRead, dependencies=[Depends(inject_tenant_context)])
async def create_org(org_in: OrganizationCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    service = TenantService(db)
    org = await service.create_organization(org_in, current_user.id)
    await db.commit()
    return org

@router.get("/organizations/me", response_model=list[OrganizationWithRoleRead])
async def get_my_orgs(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    service = TenantService(db)
    return await service.list_user_organizations(current_user.id)

@router.get("/organizations/{id}", response_model=OrganizationRead, dependencies=[Depends(inject_tenant_context)])
async def get_org(id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.repositories.base import OrganizationRepository
    repo = OrganizationRepository(db)
    org = await repo.get(id)
    if not org: raise HTTPException(status_code=404)
    return org

@router.get("/organizations/{id}/members")
async def list_organization_members(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    service = TenantService(db)
    # Basic check: requester must be a member of the org to see other members
    membership = await service.mem_repo.get_membership(current_user.id, id)
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this organization")
    
    members = await service.mem_repo.list_members(id)
    return members


@router.post("/organizations/{id}/members")
async def add_organization_member(
    id: uuid.UUID,
    user_id: uuid.UUID,
    role: str = "org_member",
    db: AsyncSession = Depends(get_db)
):
    # This endpoint is primarily for internal service-to-service calls (e.g. from invitation service)
    # In a real system, we would verify a service token or internal network source.
    from app.services.tenant import TenantService
    service = TenantService(db)
    
    # Check if already a member
    existing = await service.mem_repo.get_membership(user_id, id)
    if existing:
        return {"status": "already_member"}
    
    normalized_role = str(role).strip().lower()
    try:
        normalized_role = RoleName(normalized_role).name
    except ValueError:
        normalized_role = RoleName.ORG_MEMBER.name

    await service.mem_repo.create({
        "organization_id": id,
        "user_id": user_id,
        "role": normalized_role,
        "status": "active"
    })
    await db.commit()
    return {"status": "success"}

# --- Workspaces ---
@router.post("/workspaces", response_model=WorkspaceRead, dependencies=[Depends(inject_tenant_context)])
async def create_workspace(workspace_in: WorkspaceCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    service = TenantService(db)
    ws = await service.create_workspace(workspace_in)
    await db.commit()
    return ws

@router.get("/workspaces", response_model=list[WorkspaceRead])
async def list_workspaces(org_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.repositories.base import WorkspaceRepository
    repo = WorkspaceRepository(db)
    return await repo.list_by_organization(org_id)

@router.get("/workspaces/{id}", response_model=WorkspaceRead, dependencies=[Depends(inject_tenant_context)])
async def get_workspace(id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.repositories.base import WorkspaceRepository
    repo = WorkspaceRepository(db)
    ws = await repo.get(id)
    if not ws: raise HTTPException(status_code=404)
    return ws

# --- Role Management ---
@router.post("/roles/assign", response_model=RoleAssignmentRead, dependencies=[Depends(inject_tenant_context)])
async def assign_role(assignment_in: RoleAssignmentCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    service = TenantService(db)
    return await service.assign_role(assignment_in)

@router.get("/roles/user/{user_id}", response_model=list[RoleAssignmentRead], dependencies=[Depends(inject_tenant_context)])
async def get_user_roles(user_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    service = TenantService(db)
    return await service.get_user_permissions(user_id)

# --- Tenancy / Logical Spaces ---
@router.post("/tenants", response_model=LogicalSpaceCreate, dependencies=[Depends(inject_tenant_context)]) # Alias for logical space creation
@router.post("/logical-spaces", response_model=LogicalSpaceCreate, dependencies=[Depends(inject_tenant_context)])
async def create_logical_space(ls_in: LogicalSpaceCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    service = TenantService(db)
    return await service.create_logical_space(ls_in)

# --- Subscriptions ---
@router.post("/subscriptions", response_model=SubscriptionCreate, dependencies=[Depends(inject_tenant_context)])
async def create_subscription(sub_in: SubscriptionCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    service = TenantService(db)
    return await service.create_subscription(sub_in)
