import requests
import json
import jwt
import time
from datetime import datetime, timedelta, timezone

# Configuration
GATEWAY_URL = "http://localhost:8000"
JWT_SECRET = "infraos_super_secret_key_for_jwt_32_chars"
JWT_ALGORITHM = "HS256"

def generate_admin_token():
    """Generates a root admin token for bootstrapping"""
    payload = {
        "sub": "admin-bootstrap",
        "tenant_id": "00000000-0000-0000-0000-000000000000",
        "workspace_id": "00000000-0000-0000-0000-000000000000",
        "org_id": "00000000-0000-0000-0000-000000000000",
        "roles": ["PLATFORM_ADMIN"],
        "exp": datetime.now(timezone.utc) + timedelta(hours=1)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def bootstrap():
    print("🚀 Starting InfraOS Platform Bootstrap...")
    
    # 1. Register Root User
    print("👤 Registering Root Administrator...")
    root_user_data = {
        "email": "admin@infraos.io",
        "password": "admin_password_123",
        "full_name": "System Administrator"
    }
    try:
        resp = requests.post(f"{GATEWAY_URL}/api/v1/tenants/auth/register", json=root_user_data)
        if resp.status_code == 200:
            print("✅ Root User Registered")
        else:
            print(f"ℹ️ Root User might already exist: {resp.status_code}")
    except Exception as e:
        print(f"❌ Registration failed: {e}")

    # 2. Login to get Session Token
    print("🔑 Authenticating...")
    login_data = {
        "username": "admin@infraos.io",
        "password": "admin_password_123"
    }
    try:
        resp = requests.post(f"{GATEWAY_URL}/api/v1/tenants/auth/login", data=login_data)
        resp.raise_for_status()
        token_data = resp.json()
        token = token_data.get("access_token")
        headers = {"Authorization": f"Bearer {token}"}
        print("✅ Authentication Successful")
    except Exception as e:
        print(f"❌ Authentication failed: {e}")
        return

    # 3. Create Organization
    print("🏢 Creating Primary Organization...")
    org_data = {
        "name": "Hyperscale Cloud Corp",
        "billing_email": "billing@hyperscale.cloud"
    }
    try:
        resp = requests.post(f"{GATEWAY_URL}/api/v1/tenants/organizations", json=org_data, headers=headers)
        resp.raise_for_status()
        org = resp.json()
        org_id = org.get("id")
        print(f"✅ Organization Created: {org_id}")
    except Exception as e:
        print(f"❌ Failed to create organization: {e}")
        return

    # 4. Create Workspace
    print("📂 Creating Operational Workspace...")
    workspace_data = {
        "organization_id": org_id,
        "name": "US-EAST-DATACENTER-1",
        "region": "us-east-1"
    }
    try:
        resp = requests.post(f"{GATEWAY_URL}/api/v1/tenants/workspaces", json=workspace_data, headers=headers)
        resp.raise_for_status()
        workspace = resp.json()
        workspace_id = workspace.get("id")
        print(f"✅ Workspace Created: {workspace_id}")
    except Exception as e:
        print(f"❌ Failed to create workspace: {e}")
        return

    # 5. Verify Runtime Service Connectivity
    print("🌀 Verifying Runtime Orchestrator...")
    try:
        resp = requests.get(f"{GATEWAY_URL}/api/v1/runtime/health", headers=headers)
        print(f"✅ Runtime Health: {resp.json().get('status')}")
    except Exception as e:
        print(f"⚠️ Runtime service check skipped or failed: {e}")

    print("\n--- BOOTSTRAP COMPLETE ---")
    print(f"ORG_ID: {org_id}")
    print(f"WORKSPACE_ID: {workspace_id}")
    print(f"SESSION_TOKEN: {token}")
    print("\nYou can now use this token to interact with the API Gateway at port 8000.")

if __name__ == "__main__":
    bootstrap()
