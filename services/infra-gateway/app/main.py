from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, HTTPException, Query
from contextlib import asynccontextmanager
from app.services.proxy import ServiceProxy
from app.services.web_sockets import WebSocketManager
from app.services.aggregator import DataAggregator
from app.middleware.auth import AuthMiddleware, JWT_SECRET, JWT_ALGORITHM
import jwt
import os

# Global Services
proxy = ServiceProxy()
ws_manager = WebSocketManager()
aggregator = DataAggregator(proxy.client)
auth_middleware = AuthMiddleware()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Establish RabbitMQ connection for WS bridge
    await ws_manager.connect_rabbitmq()
    yield
    # Cleanup
    await ws_manager.close()
    await proxy.close()

app = FastAPI(
    title="InfraOS API Gateway", 
    lifespan=lifespan,
    swagger_ui_parameters={"persistAuthorization": True}
)

# Add Security Definitions for Swagger UI
from fastapi.openapi.models import OAuthFlows as OAuthFlowsModel
from fastapi.openapi.utils import get_openapi

def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    openapi_schema = get_openapi(
        title="InfraOS API Gateway",
        version="0.1.0",
        description="Unified Edge Gateway for InfraOS Microservices",
        routes=app.routes,
    )
    openapi_schema["components"]["securitySchemes"] = {
        "BearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
        }
    }
    # Apply security globally
    openapi_schema["security"] = [{"BearerAuth": []}]
    app.openapi_schema = openapi_schema
    return app.openapi_schema

app.openapi = custom_openapi

# Note: We apply Middleware manually or via Starlette for better control over proxy routes
from fastapi.responses import JSONResponse

@app.middleware("http")
async def gateway_cors_and_auth(request: Request, call_next):
    # Log requests for debugging
    print(f"DEBUG: {request.method} {request.url.path}")

    origin = request.headers.get("Origin", "*")

    # Manual CORS Preflight Handling
    if request.method == "OPTIONS":
        return JSONResponse(
            content="OK",
            headers={
                "Access-Control-Allow-Origin": origin,
                "Access-Control-Allow-Methods": "*",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Credentials": "true",
            }
        )

    # Bypass for WebSockets - they are handled in the specialized websocket_endpoint
    if request.headers.get("upgrade", "").lower() == "websocket":
        return await call_next(request)

    # Proceed to Authentication
    try:
        response = await auth_middleware(request, call_next)
    except Exception as e:
        print(f"ERROR in gateway_cors_and_auth: {e}")
        return JSONResponse(status_code=500, content={"detail": str(e)})
    
    # Add CORS headers to all responses
    response.headers["Access-Control-Allow-Origin"] = origin
    response.headers["Access-Control-Allow-Methods"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "*"
    response.headers["Access-Control-Allow-Credentials"] = "true"
    
    return response

@app.get("/health")
async def health():
    return {"status": "healthy", "service": "gateway"}

@app.get("/api/v1/dashboard/overview")
async def dashboard_overview(request: Request):
    """
    Unified dashboard endpoint - Data Aggregation Layer
    """
    user_payload = getattr(request.state, "user", {})
    headers = {}
    
    tenant_id = user_payload.get("tenant_id")
    workspace_id = user_payload.get("workspace_id")
    
    if tenant_id and str(tenant_id).lower() != "none":
        headers["X-Tenant-Id"] = str(tenant_id)
        
    if workspace_id and str(workspace_id).lower() != "none":
        headers["X-Workspace-Id"] = str(workspace_id)
        
    return await aggregator.get_dashboard_summary(headers)


@app.get("/api/v1/timeline")
async def infra_timeline(
    request: Request,
    workspace_id: str | None = Query(default=None),
    facility_id: str | None = Query(default=None),
    entity_id: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
):
    """
    Unified infra lifecycle timeline endpoint:
    Metric -> Alert -> Queue -> Runtime -> Verification -> Resolution
    """
    user_payload = getattr(request.state, "user", {}) or {}

    derived_workspace_id = workspace_id or user_payload.get("workspace_id")
    if not derived_workspace_id:
        raise HTTPException(status_code=400, detail="workspace_id is required")

    headers = {}
    tenant_id = user_payload.get("tenant_id")
    if tenant_id and str(tenant_id).lower() != "none":
        headers["X-Tenant-Id"] = str(tenant_id)
    headers["X-Workspace-Id"] = str(derived_workspace_id)

    return await aggregator.get_timeline(
        headers=headers,
        workspace_id=str(derived_workspace_id),
        facility_id=facility_id,
        entity_id=entity_id,
        limit=limit,
    )

@app.websocket("/ws/infra-state")
async def websocket_endpoint(websocket: WebSocket):
    """
    Real-time infrastructure state broadcast via WebSockets.
    """
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008)
        return
        
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        tenant_id = payload.get("tenant_id")
        
        await ws_manager.connect_client(websocket, tenant_id)
        
        try:
            while True:
                # Keep connection alive, listen for client messages if needed
                await websocket.receive_text()
        except WebSocketDisconnect:
            ws_manager.disconnect_client(websocket, tenant_id)
            
    except Exception:
        await websocket.close(code=1008)

@app.api_route("/api/v1/{service_key}/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"], operation_id="gateway_proxy_endpoint")
async def gateway_proxy(service_key: str, path: str, request: Request):
    """
    Generic reverse proxy to internal microservices.
    """
    return await proxy.proxy_request(service_key, path, request)
