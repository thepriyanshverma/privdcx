import uuid
from typing import Optional
from fastapi import Request, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from app.core.security import SECRET_KEY, ALGORITHM
from app.repositories.base import UserRepository, RoleAssignmentRepository
from app.core.database import AsyncSessionLocal
from app.models.domain import User, RoleAssignment, ScopeType

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/v1/auth/login")

async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            print("DEBUG Tenant Auth: payload missing 'sub'")
            raise credentials_exception
    except JWTError as e:
        print(f"DEBUG Tenant Auth: JWT decrpytion failed: {e}")
        raise credentials_exception
        
    async with AsyncSessionLocal() as session:
        user_repo = UserRepository(session)
        user = await user_repo.get(uuid.UUID(user_id))
        if user is None:
            print(f"DEBUG Tenant Auth: user not found in DB: {user_id}")
            raise credentials_exception
        print(f"DEBUG Tenant Auth: successfully validated user: {user.email}")
        return user

class TenantContext:
    def __init__(
        self, 
        org_id: Optional[uuid.UUID] = None, 
        workspace_id: Optional[uuid.UUID] = None, 
        logical_space_id: Optional[uuid.UUID] = None
    ):
        self.org_id = org_id
        self.workspace_id = workspace_id
        self.logical_space_id = logical_space_id

async def inject_tenant_context(request: Request):
    org_id = request.headers.get("X-Org-Id")
    workspace_id = request.headers.get("X-Workspace-Id")
    logical_space_id = request.headers.get("X-Logical-Space-Id")
    
    request.state.tenant = TenantContext(
        org_id=uuid.UUID(org_id) if org_id else None,
        workspace_id=uuid.UUID(workspace_id) if workspace_id else None,
        logical_space_id=uuid.UUID(logical_space_id) if logical_space_id else None
    )

def check_permission(required_role: str, scope: ScopeType):
    async def permission_dependency(
        current_user: User = Depends(get_current_user),
        request: Request = None
    ):
        tenant = request.state.tenant
        target_scope_id = None
        
        if scope == ScopeType.ORG:
            target_scope_id = tenant.org_id
        elif scope == ScopeType.WORKSPACE:
            target_scope_id = tenant.workspace_id
        elif scope == ScopeType.LOGICAL_SPACE:
            target_scope_id = tenant.logical_space_id
            
        if not target_scope_id:
            raise HTTPException(status_code=400, detail=f"Target scope {scope} ID missing in headers")
            
        async with AsyncSessionLocal() as session:
            role_repo = RoleAssignmentRepository(session)
            assignments = await role_repo.list_by_user(current_user.id)
            
            # Check for exact role match in the specific scope
            has_role = any(
                a.role == required_role and a.scope_type == scope and a.scope_id == target_scope_id
                for a in assignments
            )
            
            # TODO: Add platform_admin bypass logic here
            
            if not has_role:
                raise HTTPException(status_code=403, detail="Insufficient permissions for this scope")
                
    return permission_dependency
