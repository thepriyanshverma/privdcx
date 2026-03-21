import requests
import json
import uuid
import time

# Configuration
GATEWAY_URL = "http://localhost:8000"
ADMIN_EMAIL = "admin@infraos.io"
ADMIN_PASSWORD = "admin_password_123"

def safe_post(url, json=None, data=None, headers=None, expected_status=[200, 201], retries=5):
    for i in range(retries):
        try:
            if data:
                resp = requests.post(url, data=data, headers=headers, timeout=10)
            else:
                resp = requests.post(url, json=json, headers=headers, timeout=10)
            
            allowed = expected_status if isinstance(expected_status, list) else [expected_status]
            if resp.status_code in allowed:
                return resp
            print(f"⚠️ {url} got {resp.status_code}, retrying ({i+1}/{retries})...")
        except Exception as e:
            print(f"⚠️ {url} failed: {e}, retrying ({i+1}/{retries})...")
        time.sleep(2 * (i + 1))
    raise Exception(f"Failed to POST to {url} after {retries} attempts")

def wait_for_platform(url, timeout=60):
    start_time = time.time()
    print(f"⌛ Waiting for platform at {url}...")
    while time.time() - start_time < timeout:
        try:
            resp = requests.get(f"{url}/health", timeout=2)
            if resp.status_code == 200:
                print("✅ Platform is Healthy")
                return True
        except:
            pass
        time.sleep(2)
    return False

def full_test():
    print("🚀 Starting Full System Integration Test...")
    
    if not wait_for_platform(GATEWAY_URL):
        print("❌ Platform failed to become healthy")
        return

    # 1. Register Root Administrator
    print("\n👤 Registering Root Administrator...")
    root_data = {
        "email": ADMIN_EMAIL,
        "full_name": "Root Admin",
        "password": ADMIN_PASSWORD
    }
    
    reg_success = False
    for i in range(5):
        try:
            # We use /tenants/auth/register since that's what bootstrap uses
            resp = requests.post(f"{GATEWAY_URL}/api/v1/tenants/auth/register", json=root_data, timeout=5)
            if resp.status_code in [200, 201, 400, 409]:
                reg_success = True
                print(f"✅ Root User Status: {resp.status_code}")
                break
            else:
                print(f"ℹ️ Attempt {i+1} got status {resp.status_code}: {resp.text}")
        except Exception as e:
            print(f"⚠️ Registration retry {i+1} due to {e}")
        time.sleep(5)
    
    if not reg_success:
        print("❌ Failed to register root user")
        return

    # 2. Login
    print("\n🔑 Authenticating...")
    login_data = {"username": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    resp = requests.post(f"{GATEWAY_URL}/api/v1/tenants/auth/login", data=login_data)
    resp.raise_for_status()
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    print("✅ Authentication Successful")

    # 2. Create Organization
    print("\n🏢 Creating Organization...")
    u_suffix = str(uuid.uuid4())[:8]
    org_data = {
        "name": f"GDS-{u_suffix}",
        "billing_email": f"billing-{u_suffix}@gds.com"
    }
    resp = safe_post(f"{GATEWAY_URL}/api/v1/tenants/organizations", json=org_data, headers=headers)
    org = resp.json()
    org_id = org["id"]
    print(f"✅ Organization Created: {org_id}")

    # 4. Create Workspace
    print("\n📂 Creating Workspace...")
    workspace_data = {
        "organization_id": org_id,
        "name": f"Cluster-{u_suffix}",
        "region": "us-west-2"
    }
    resp = safe_post(f"{GATEWAY_URL}/api/v1/tenants/workspaces", json=workspace_data, headers=headers)
    workspace = resp.json()
    workspace_id = workspace["id"]
    print(f"✅ Workspace Created: {workspace_id}")

    # 5. Create Facility (Facility Service)
    print("\n🏛️ Creating Facility...")
    facility_data = {
        "workspace_id": workspace_id,
        "name": "Santa Clara DC-1",
        "width_m": 120.0,
        "length_m": 80.0,
        "height_m": 8.0,
        "location": "3200 Lakeside Dr, Santa Clara, CA"
    }
    resp = safe_post(f"{GATEWAY_URL}/api/v1/facility/facilities", json=facility_data, headers=headers)
    facility = resp.json()
    facility_id = facility["id"]
    print(f"✅ Facility Created: {facility_id}")

    # 5. Create Hall
    print("\n📍 Creating Data Hall...")
    hall_data = {
        "name": "Hall A",
        "width_m": 50.0,
        "length_m": 40.0,
        "height_m": 5.0,
        "power_capacity_mw": 2.5
    }
    resp = safe_post(f"{GATEWAY_URL}/api/v1/facility/facilities/{facility_id}/halls", json=hall_data, headers=headers)
    hall = resp.json()
    hall_id = hall["id"]
    print(f"✅ Hall Created: {hall_id}")

    # 6. Create Zone
    print("\n🌀 Creating Cooling Zone...")
    zone_data = {
        "name": "Zone 1-Pod-A",
        "zone_type": "cooling", # Fixed Enum
        "cooling_capacity_kw": 500.0,
        "power_capacity_kw": 600.0
    }
    resp = safe_post(f"{GATEWAY_URL}/api/v1/facility/halls/{hall_id}/zones", json=zone_data, headers=headers)
    zone = resp.json()
    zone_id = zone["id"]
    print(f"✅ Zone Created: {zone_id}")

    # 7. Create Aisle
    print("\n🛣️ Creating Aisle...")
    aisle_data = {
        "aisle_type": "hot", # Fixed Enum
        "orientation": "north_south", # Fixed Enum
        "width_m": 1.2
    }
    resp = safe_post(f"{GATEWAY_URL}/api/v1/facility/zones/{zone_id}/aisles", json=aisle_data, headers=headers)
    aisle = resp.json()
    aisle_id = aisle["id"]
    print(f"✅ Aisle Created: {aisle_id}")

    # 8. Create Rack (Rack Service)
    print("\n🔳 Creating Rack...")
    rack_data = {
        "workspace_id": workspace_id,
        "facility_id": facility_id,
        "hall_id": hall_id,
        "zone_id": zone_id,
        "aisle_id": aisle_id,
        "name": "Rack-A01",
        "position_x_m": 10.5,
        "position_y_m": 5.2,
        "position_z_m": 0.0,
        "rack_type": "compute",
        "height_u": 42
    }
    resp = safe_post(f"{GATEWAY_URL}/api/v1/rack/racks", json=rack_data, headers=headers)
    rack = resp.json()
    rack_id = rack["id"]
    print(f"✅ Rack Created: {rack_id}")

    # 9. Create Device Template (Device Service)
    print("\n📋 Creating Device Template...")
    template_data = {
        "name": "PowerEdge R750",
        "device_type": "server",
        "size_u": 2,
        "vendor": "Dell",
        "model": "R750",
        "default_power_kw": 0.85,
        "category": "compute"
    }
    resp = safe_post(f"{GATEWAY_URL}/api/v1/device/device-templates", json=template_data, headers=headers)
    template = resp.json()
    template_id = template["id"]
    print(f"✅ Template Created: {template_id}")

    # 10. Create Device
    print("\n🖥️ Deploying Device...")
    device_data = {
        "workspace_id": workspace_id,
        "rack_id": rack_id,
        "template_id": template_id,
        "start_u": 10,
        "size_u": 2,
        "power_draw_kw": 0.6,
        "max_power_kw": 0.85,
        "heat_output_btu": 2900.0,
        "vendor": "Dell",
        "model": "R750",
        "status": "active"
    }
    resp = safe_post(f"{GATEWAY_URL}/api/v1/device/devices", json=device_data, headers=headers)
    device = resp.json()
    print(f"✅ Device Deployed: {device['id']}")

    # 11. Dashboard Verification
    print("\n📊 Checking Dashboard Overview...")
    time.sleep(1) # Wait for event bus / caches if needed
    resp = requests.get(f"{GATEWAY_URL}/api/v1/dashboard/overview", headers=headers)
    resp.raise_for_status()
    summary = resp.json()
    print("\n--- TEST SUMMARY ---")
    print(json.dumps(summary, indent=2))
    
    if summary.get("facilities") and len(summary["facilities"]) >= 1:
        print("\n✨ ALL SYSTEMS OPERATIONAL AND COMMUNICATING ✨")
    else:
        print("\n❌ Dashboard summary mismatch. Check service connectivity.")

if __name__ == "__main__":
    try:
        full_test()
    except Exception as e:
        print(f"\nFATAL: Test failed - {e}")
        if hasattr(e, 'response') and e.response is not None:
             print(f"Response Detail: {e.response.text}")
