import httpx
from fastapi import Request, Response
from typing import Dict
import os

# Internal Service Map (Service Name -> Base URL)
SERVICE_MAP = {
    "tenant": "http://infra-tenant:8005/api/v1",
    "tenants": "http://infra-tenant:8005/api/v1",
    "facility": "http://infra-facility:8006/api/v1",
    "facilities": "http://infra-facility:8006/api/v1",
    "rack": "http://infra-rack:8007/api/v1",
    "racks": "http://infra-rack:8007/api/v1",
    "device": "http://infra-device:8008/api/v1",
    "devices": "http://infra-device:8008/api/v1",
    "simulation": "http://infra-simulation:8010/api/v1",
    "metrics": "http://infra-metrics-adapter:8016/api/v1",
    "alerts": "http://infra-alert-engine:8012/api/v1",
    "runtime": "http://infra-runtime:8013/api/v1",
    "topology": "http://infra-topology:8015/api/v1/topology",
    "invitations": "http://infra-invitation:8014/api/v1",
    "auth": "http://infra-tenant:8005/api/v1/auth"
}

class ServiceProxy:
    def __init__(self):
        timeout = httpx.Timeout(connect=10.0, read=30.0, write=30.0, pool=30.0)
        self.client = httpx.AsyncClient(timeout=timeout)

    async def proxy_request(self, service_key: str, path: str, request: Request) -> Response:
        """
        Proxies an incoming request to the target internal microservice.
        """
        base_url = SERVICE_MAP.get(service_key)
        if not base_url:
            print(f"PROXY TRACE: Service key '{service_key}' not found in map!")
            return Response(content="Service not found", status_code=404)

        # Fix: Only add trailing slash if path is not empty to avoid 307 redirects in microsrvices
        url = f"{base_url}/{path}" if path else base_url
        if request.query_params:
            url += f"?{request.query_params}"
            
        print(f"PROXY TRACE: Forwarding {request.method} /{path} to -> {url}")

        # Get Tenant Context from request state (InfraGateway JWT middleware)
        user_payload = getattr(request.state, "user", {})
        headers = dict(request.headers)
        
        # Inject tenant identity headers
        headers["X-Tenant-Id"] = str(user_payload.get("tenant_id", ""))
        headers["X-Workspace-Id"] = str(user_payload.get("workspace_id", ""))
        headers["X-Org-Id"] = str(user_payload.get("org_id", ""))
        
        # Remove Host header to avoid conflicts
        headers.pop("host", None)

        try:
            method = request.method
            content = await request.body()
            
            resp = await self.client.request(
                method,
                url,
                headers=headers,
                content=content
            )
            
            print(f"PROXY TRACE: Received {resp.status_code} from {url}")
            
            return Response(
                content=resp.content,
                status_code=resp.status_code,
                headers=dict(resp.headers)
            )
        except Exception as e:
            print(f"PROXY ERROR: Failed to reach {url}. Exception: {type(e).__name__}: {str(e)}")
            return Response(content=f"Proxy Error: {str(e)}", status_code=502)

    async def close(self):
        await self.client.aclose()
