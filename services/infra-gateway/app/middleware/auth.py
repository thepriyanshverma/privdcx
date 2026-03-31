import jwt
from fastapi import Request, HTTPException, status
from typing import Optional, Dict, Any
import os

JWT_SECRET = os.getenv("JWT_SECRET", "infraos_secret_key_change_me")
JWT_ALGORITHM = "HS256"

class AuthMiddleware:
    async def __call__(self, request: Request, call_next):
        """
        Validates JWT, extracts tenant context, and injects headers for downstream.
        """
        # Skip auth for public endpoints and CORS preflight
        if request.method == "OPTIONS":
            return await call_next(request)
            
        public_paths = [
            "/health",
            "/metrics",
            "/docs",
            "/openapi.json",
            "/auth/register",
            "/auth/login",
            "/api/v1/timeline",
            "/api/v1/topology",
        ]
        if any(path in request.url.path for path in public_paths) or request.url.path.startswith("/ws/"):
            return await call_next(request)

        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"detail": "Missing or invalid Authorization header"}
            )

        token = auth_header.split(" ")[1]
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            request.state.user = payload
            
            # ─── Org & Workspace Context Enforcement ─────────────────────────────
            path = request.url.path
            
            # 1. Public Paths (already skipped above)
            
            # 2. Infra / Control Plane Paths (Strict Org + Workspace Required)
            # These paths belong to actual hardware/runtime services
            infra_prefixes = [
                "/api/v1/racks", "/api/v1/devices", "/api/v1/facilities", 
                "/api/v1/simulations", "/api/v1/metrics", "/api/v1/alerts", "/api/v1/topology"
            ]
            
            # 3. Workspace Selection Paths (Org Required)
            workspace_prefixes = ["/api/v1/tenants/workspaces"]

            org_id = payload.get("org_id")
            workspace_id = payload.get("workspace_id")

            # Check Infra Requirements
            if any(path.startswith(prefix) for prefix in infra_prefixes):
                if not org_id or not workspace_id:
                    from fastapi.responses import JSONResponse
                    return JSONResponse(
                        status_code=403, 
                        content={"detail": "Context Required: Organization and Workspace selection mandatory for control plane access."}
                    )

            # Check Workspace Requirements
            if any(path.startswith(prefix) for prefix in workspace_prefixes):
                # GET /workspaces?org_id= is allowed, but we can enforce it's in the token if we want strict session
                # For now, let's just ensure if they are trying to DO something infra-related, they have context
                pass

            return await call_next(request)
            
        except jwt.ExpiredSignatureError:
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=401, content={"detail": "Token expired"})
        except jwt.InvalidTokenError as e:
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=401, content={"detail": "Invalid token"})

def get_tenant_headers(payload: Dict[str, Any]) -> Dict[str, str]:
    """
    Helper to generate headers for downstream requests.
    """
    return {
        "X-Tenant-Id": str(payload.get("tenant_id", "")),
        "X-Workspace-Id": str(payload.get("workspace_id", "")),
        "X-Org-Id": str(payload.get("org_id", ""))
    }
