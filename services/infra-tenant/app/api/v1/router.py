from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.services.tenant import TenantService
from app.schemas.domain import UserCreate, UserRead, UserUpdate, Token, UserLogin, OrganizationCreate, OrganizationRead, WorkspaceCreate, WorkspaceRead, RoleAssignmentCreate, RoleAssignmentRead, LogicalSpaceCreate, SubscriptionCreate
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
    return {"access_token": token_str, "token_type": "bearer"}

@router.get("/auth/me", response_model=UserRead)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.patch("/auth/me", response_model=UserRead)
async def update_me(user_update: UserUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    service = TenantService(db)
    return await service.update_user_profile(current_user.id, user_update)

# --- Organizations ---
@router.post("/organizations", response_model=OrganizationRead, dependencies=[Depends(inject_tenant_context)])
async def create_org(org_in: OrganizationCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    service = TenantService(db)
    return await service.create_organization(org_in, current_user.id)

@router.get("/organizations/{id}", response_model=OrganizationRead, dependencies=[Depends(inject_tenant_context)])
async def get_org(id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.repositories.base import OrganizationRepository
    repo = OrganizationRepository(db)
    org = await repo.get(id)
    if not org: raise HTTPException(status_code=404)
    return org

# --- Workspaces ---
@router.post("/workspaces", response_model=WorkspaceRead, dependencies=[Depends(inject_tenant_context)])
async def create_workspace(workspace_in: WorkspaceCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    service = TenantService(db)
    return await service.create_workspace(workspace_in)

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
