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
            
        public_paths = ["/health", "/metrics", "/docs", "/openapi.json", "/auth/register", "/auth/login"]
        if any(path in request.url.path for path in public_paths):
            return await call_next(request)

        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"detail": "Missing or invalid Authorization header"}
            )

        token = auth_header.split(" ")[1]
        print(f"DEBUG Auth: Processing token: {token[:10]}...{token[-10:]}")
        try:
            # Debug log (Remove in production)
            print(f"DEBUG Auth: Attempting to decode token with secret starting with: {JWT_SECRET[:5]}...")
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            print(f"DEBUG Auth: Decoded payload: {payload}")
            
            # Inject headers for downstream services (if present)
            tenant_id = payload.get("tenant_id")
            workspace_id = payload.get("workspace_id")
            org_id = payload.get("org_id")
            
            # Store in request state for internal use
            request.state.user = payload
            
            # Note: Standard FastAPI middleware can't easily modify request headers 
            # for the NEXT call in a proxy scenario without a custom wrapper.
            # We'll use these values in our Proxy service.
            
            return await call_next(request)
            
        except jwt.ExpiredSignatureError:
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=401, content={"detail": "Token expired"})
        except jwt.InvalidTokenError as e:
            print(f"DEBUG Auth: Invalid Token Error: {e}")
            print(f"DEBUG Auth: Token Length: {len(token)}")
            print(f"DEBUG Auth: Full Token: {token}")
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
