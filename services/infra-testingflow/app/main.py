import time
import asyncio
import logging
import random
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from playwright.async_api import async_playwright
import os
from typing import Literal

# Setup logging to stdout
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    force=True
)
logger = logging.getLogger("testingflow")
# Ensure logs are flushed immediately
import sys
handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
logger.addHandler(handler)
logger.propagate = False

app = FastAPI(title="InfraOS Testing Flow Service")

SCREENSHOT_PATH = "/tmp/last_error.png"

class FlowResult(BaseModel):
    success: bool
    admin_email: str
    member_email: str
    org_code: str = ""
    workspace_code: str = ""
    error: str = None
    timestamp: float

@app.get("/")
async def root():
    return {"status": "ok", "service": "infra-testingflow"}

@app.get("/api/v1/testing/screenshot")
async def get_screenshot():
    if os.path.exists(SCREENSHOT_PATH):
        return FileResponse(SCREENSHOT_PATH)
    raise HTTPException(status_code=404, detail="No screenshot available")

@app.post("/api/v1/testing/run-flow", response_model=FlowResult)
async def run_testing_flow(frontend_url: str = "http://frontend-control-plane:3000"):
    timestamp = time.time()
    ts_str = str(int(timestamp))
    admin_email = f"admin_{ts_str}@example.com"
    member_email = f"member_{ts_str}@example.com"
    password = "Password123!"
    org_name = f"AutoOrg_{ts_str}"
    workspace_name = f"AutoWS_{ts_str}"
    
    result_data = {
        "success": False,
        "admin_email": admin_email,
        "member_email": member_email,
        "timestamp": timestamp,
    }

    logger.info(f"Starting testing flow at {frontend_url}")
    logger.info(f"Admin: {admin_email}, Member: {member_email}")

    async with async_playwright() as p:
        browser = None
        try:
            browser = await p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-setuid-sandbox'])
            browser_context = await browser.new_context(viewport={'width': 1280, 'height': 720})
            page = await browser_context.new_page()
            
            # --- Phase: Register & Login Admin ---
            logger.info("Phase 1: Registering Admin User")
            await page.goto(f"{frontend_url}/register")
            await page.fill('input[type="text"]', "Admin User")
            await page.fill('input[type="email"]', admin_email)
            await page.fill('input[type="password"]', password)
            await page.click('button:has-text("Register")')
            
            logger.info("Phase 2: Logging in Admin User")
            await page.wait_for_url(f"**/login**")
            await page.fill('input[type="email"]', admin_email)
            await page.fill('input[type="password"]', password)
            await page.click('button:has-text("Sign In")')
            
            # --- Phase: Create Org ---
            logger.info(f"Phase 3: Creating Organization '{org_name}'")
            await page.wait_for_url("**/org/select")
            await page.click('button:has-text("Create New Organization")')
            
            await page.wait_for_url("**/org/create")
            await page.fill('input[placeholder="e.g. Acme Corp"]', org_name)
            await page.click('button:has-text("Create Organization")')
            
            logger.info("Phase 4: Selecting Organization")
            await page.wait_for_url("**/org/select")
            await page.wait_for_selector(f'tr:has-text("{org_name}")')
            await page.click(f'tr:has-text("{org_name}") button:has-text("Select Org")')
            
            # --- Phase: Create Workspace ---
            logger.info(f"Phase 5: Creating Workspace '{workspace_name}'")
            await page.wait_for_url("**/workspace/select")
            await page.click('button:has-text("Create New Workspace")')
            await page.wait_for_url("**/workspace/create")
            await page.fill('input[placeholder="e.g. Hyperscale Cluster 01"]', workspace_name)
            await page.click('button:has-text("Create Workspace")')
            
            logger.info("Phase 6: Selecting Workspace")
            await page.wait_for_url("**/workspace/select")
            await page.wait_for_selector(f'tr:has-text("{workspace_name}")')
            await page.click(f'tr:has-text("{workspace_name}") button:has-text("Select Workspace")')
            
            # --- Phase: Generate Invites ---
            logger.info("Phase 7: Generating Invitations")
            await page.wait_for_url("**/app/design/facility")
            await page.goto(f"{frontend_url}/app/governance/invitations")
            
            # Org Invite
            logger.info(f"Creating Organization Invite for {member_email}")
            org_form = page.locator('form').filter(has=page.locator('button', has_text="Create Organization Invite"))
            await org_form.locator('input[type="email"]').fill(member_email)
            await org_form.locator('button:has-text("Create Organization Invite")').click()
            
            # Use explicit wait with timeout to handle potential API lag
            logger.info("Waiting for Org Invite Code to appear...")
            await org_form.locator('text=Invite Code:').wait_for(state='visible', timeout=10000)
            org_code = await org_form.locator('strong').inner_text()
            logger.info(f"Org Code Captured: {org_code}")
            result_data["org_code"] = org_code
            
            # Workspace Invite
            logger.info(f"Creating Workspace Invite for {member_email}")
            ws_form = page.locator('form').filter(has=page.locator('button', has_text="Create Workspace Invite"))
            await ws_form.locator('input[type="email"]').fill(member_email)
            await ws_form.locator('button:has-text("Create Workspace Invite")').click()
            
            logger.info("Waiting for Workspace Invite Code to appear...")
            await ws_form.locator('text=Invite Code:').wait_for(state='visible', timeout=10000)
            ws_code = await ws_form.locator('strong').inner_text()
            logger.info(f"Workspace Code Captured: {ws_code}")
            result_data["workspace_code"] = ws_code
            
            # --- Phase: Logout & Register Member ---
            logger.info("Phase 8: Logging out Admin and Registering Member")
            await page.goto(f"{frontend_url}/org/select")
            await page.click('button:has-text("Sign Out")')
            
            await page.wait_for_url(f"**/login**")
            await page.goto(f"{frontend_url}/register")
            await page.fill('input[type="text"]', "Member User")
            await page.fill('input[type="email"]', member_email)
            await page.fill('input[type="password"]', password)
            await page.click('button:has-text("Register")')
            
            logger.info("Phase 9: Logging in Member User")
            await page.wait_for_url(f"**/login**")
            await page.fill('input[type="email"]', member_email)
            await page.fill('input[type="password"]', password)
            await page.click('button:has-text("Sign In")')
            
            # --- Phase: Joining ---
            logger.info("Phase 10: Joining Organization via Invite Code")
            await page.wait_for_url("**/org/select")
            await page.fill('input[placeholder="invite_code"]', org_code)
            await page.click('button:has-text("Join Organization")')
            await page.wait_for_selector(f'tr:has-text("{org_name}")')
            await page.click(f'tr:has-text("{org_name}") button:has-text("Select Org")')
            
            logger.info("Phase 11: Joining Workspace via Invite Code")
            await page.wait_for_url("**/workspace/select")
            await page.fill('input[placeholder="invite_code"]', ws_code)
            await page.click('button:has-text("Join Workspace")')
            await page.wait_for_selector(f'tr:has-text("{workspace_name}")')
            await page.click(f'tr:has-text("{workspace_name}") button:has-text("Select Workspace")')
            
            logger.info("Phase 12: Final Access Verification")
            await page.wait_for_url("**/app/design/facility")
            
            logger.info("Test Flow Completed Successfully!")
            result_data["success"] = True
            return result_data

        except Exception as e:
            logger.error(f"Automation Error: {str(e)}")
            if page:
                await page.screenshot(path=SCREENSHOT_PATH)
                logger.info(f"Diagnostic screenshot saved to {SCREENSHOT_PATH}")
            result_data["error"] = str(e)
            return result_data
        finally:
            if browser:
                await browser.close()

import httpx

class APIFlowResult(BaseModel):
    success: bool
    admin_email: str
    member_email: str
    admin_token: str = ""
    member_token: str = ""
    org_id: str = ""
    workspace_id: str = ""
    org_invite_code: str = ""
    workspace_invite_code: str = ""
    error: str = None
    step: str = ""
    timestamp: float


class FacilitySpec(BaseModel):
    name: str
    width_m: float
    length_m: float
    height_m: float
    cooling_type: str = "air"


class HallSpec(BaseModel):
    name: str
    width_m: float
    length_m: float
    height_m: float
    power_capacity_mw: float


class RackLayoutSpec(BaseModel):
    rows: int = Field(ge=1, le=500)
    cols: int = Field(ge=1, le=500)
    row_pitch_m: float = Field(default=3.2, gt=0)
    col_pitch_m: float = Field(default=0.6, gt=0)


class DeviceTemplateSpec(BaseModel):
    name: str
    device_type: Literal["server", "gpu", "storage", "network"]
    size_u: int = Field(ge=1, le=42)
    default_power_kw: float = Field(gt=0)
    vendor: str = "Generic"
    model: str | None = None
    default_heat_btu: float | None = None


class DeviceDeploySpec(BaseModel):
    devices_per_rack: int = Field(default=1, ge=1, le=20)
    start_u: int = Field(default=1, ge=1, le=42)


class PlacementStrategySpec(BaseModel):
    type: Literal["row_pattern"] = "row_pattern"
    pattern: list[Literal["server", "gpu", "storage", "network"]] = Field(min_length=1)


class InfraFlowSpec(BaseModel):
    facility: FacilitySpec
    halls: list[HallSpec]
    rack_layout: RackLayoutSpec
    device_templates: list[DeviceTemplateSpec] = Field(default_factory=list)
    placement_strategy: PlacementStrategySpec | None = None
    # Backward compatibility with older callers
    device_template: DeviceTemplateSpec | None = None
    device_deploy: DeviceDeploySpec | None = None
    additional_device_templates: list[DeviceTemplateSpec] = Field(default_factory=list)


class InfraDeviceSummary(BaseModel):
    device_id: str
    device_type: str
    rack_id: str
    facility_id: str
    hall_id: str
    row_index: int | None
    workspace_id: str
    org_id: str
    logical_space_id: str | None = None
    start_u: int
    size_u: int
    power_kw: float


class InfraFlowResult(BaseModel):
    success: bool
    org_id: str = ""
    workspace_id: str = ""
    facility_id: str = ""
    hall_ids: list[str] = Field(default_factory=list)
    rack_count: int = 0
    device_count: int = 0
    devices: list[InfraDeviceSummary] = Field(default_factory=list)
    rack_capacity: dict = Field(default_factory=lambda: {"max_u": 42, "max_power_kw": 20.0})
    placement_summary: dict = Field(default_factory=lambda: {"total_racks": 0, "devices_per_rack_avg": 0.0, "total_devices": 0})
    warnings: list[str] = Field(default_factory=list)
    error: str | None = None
    failed_step: str | None = None
    timestamp: float


class InfraFlowPayloadResponse(BaseModel):
    target_endpoint: str
    generated_at: float
    payload: InfraFlowSpec


DEVICE_TYPE_TO_SERVICE = {
    "server": "server",
    "gpu": "gpu",
    "storage": "storage",
    "network": "switch",  # infra-device currently uses "switch" enum value
}

SERVICE_TO_OUTPUT_DEVICE_TYPE = {
    "server": "server",
    "gpu": "gpu",
    "storage": "storage",
    "switch": "network",
}

ALLOWED_COOLING_TYPES = {"air", "liquid", "hybrid"}

PROFILE_FACILITY = {
    "small": {"width_m": 60.0, "length_m": 40.0, "height_m": 4.0, "cooling_type": "air", "total_mw": 2.4},
    "standard": {"width_m": 120.0, "length_m": 80.0, "height_m": 4.5, "cooling_type": "liquid", "total_mw": 5.5},
    "large": {"width_m": 180.0, "length_m": 120.0, "height_m": 5.0, "cooling_type": "liquid", "total_mw": 9.6},
    "hyperscale": {"width_m": 240.0, "length_m": 160.0, "height_m": 5.5, "cooling_type": "hybrid", "total_mw": 16.0},
}

PROFILE_LAYOUT = {
    "small": {"rows": 3, "cols": 6, "row_pitch_m": 3.0, "col_pitch_m": 0.8},
    "standard": {"rows": 5, "cols": 10, "row_pitch_m": 3.2, "col_pitch_m": 0.6},
    "large": {"rows": 8, "cols": 14, "row_pitch_m": 3.2, "col_pitch_m": 0.65},
    "hyperscale": {"rows": 12, "cols": 20, "row_pitch_m": 3.4, "col_pitch_m": 0.65},
}

DEVICE_TEMPLATE_CATALOG = {
    "server": {
        "name": "GEN-COMPUTE",
        "device_type": "server",
        "size_u": 2,
        "default_power_kw": 1.2,
        "vendor": "Dell",
        "model": "R760",
        "default_heat_btu": 4094.0,
    },
    "gpu": {
        "name": "GPU-NODE",
        "device_type": "gpu",
        "size_u": 4,
        "default_power_kw": 3.5,
        "vendor": "NVIDIA",
        "model": "H100",
        "default_heat_btu": 11942.0,
    },
    "storage": {
        "name": "STORAGE-DENSE",
        "device_type": "storage",
        "size_u": 4,
        "default_power_kw": 2.2,
        "vendor": "PureStorage",
        "model": "FlashBlade",
        "default_heat_btu": 7506.0,
    },
    "network": {
        "name": "TOR-SWITCH",
        "device_type": "network",
        "size_u": 1,
        "default_power_kw": 0.9,
        "vendor": "Arista",
        "model": "7280R3",
        "default_heat_btu": 3071.0,
    },
}


def _build_device_template(device_type: str) -> DeviceTemplateSpec:
    template = DEVICE_TEMPLATE_CATALOG[device_type]
    return DeviceTemplateSpec(**template)


@app.get("/api/v1/testing/generate-infra-flow-payload", response_model=InfraFlowPayloadResponse)
async def generate_infra_flow_payload(
    profile: Literal["small", "standard", "large", "hyperscale"] = Query(default="standard"),
    halls: int = Query(default=1, ge=1, le=12),
    primary_device_type: Literal["server", "gpu", "storage", "network"] = Query(default="gpu"),
    include_all_device_templates: bool = Query(default=True),
    rows: int | None = Query(default=None, ge=1, le=500),
    cols: int | None = Query(default=None, ge=1, le=500),
):
    rng = random.SystemRandom()
    unique_suffix = f"{int(time.time() * 1000)}-{rng.randint(1000, 9999)}"

    def jitter(value: float, pct: float, minimum: float) -> float:
        delta = value * pct
        return round(max(minimum, rng.uniform(value - delta, value + delta)), 2)

    profile_facility = PROFILE_FACILITY[profile]
    profile_layout = PROFILE_LAYOUT[profile].copy()
    profile_layout["rows"] = rows if rows is not None else rng.randint(max(1, profile_layout["rows"] - 2), min(500, profile_layout["rows"] + 2))
    profile_layout["cols"] = cols if cols is not None else rng.randint(max(1, profile_layout["cols"] - 3), min(500, profile_layout["cols"] + 3))
    profile_layout["row_pitch_m"] = jitter(profile_layout["row_pitch_m"], 0.12, 0.5)
    profile_layout["col_pitch_m"] = jitter(profile_layout["col_pitch_m"], 0.15, 0.2)

    facility_width = jitter(profile_facility["width_m"], 0.08, 20.0)
    facility_length = jitter(profile_facility["length_m"], 0.08, 20.0)
    facility_height = jitter(profile_facility["height_m"], 0.1, 3.0)
    total_mw = jitter(profile_facility["total_mw"], 0.2, 0.8)
    cooling_type = rng.choice(sorted(ALLOWED_COOLING_TYPES))

    hall_width = max(10.0, round((facility_width - ((halls + 1) * 2.0)) / halls, 2))
    hall_length = max(10.0, round(facility_length - 4.0, 2))
    hall_height = max(3.0, round(facility_height - 0.2, 2))
    hall_power = max(0.5, round(total_mw / halls, 3))

    generated_halls = [
        HallSpec(
            name=f"Hall-{idx + 1}-{unique_suffix}",
            width_m=jitter(hall_width, 0.06, 8.0),
            length_m=jitter(hall_length, 0.05, 8.0),
            height_m=jitter(hall_height, 0.06, 3.0),
            power_capacity_mw=round(max(0.5, hall_power * rng.uniform(0.9, 1.1)), 3),
        )
        for idx in range(halls)
    ]

    primary_template = _build_device_template(primary_device_type)
    primary_template.name = f"{primary_template.name}-{unique_suffix}"
    additional_templates = []
    if include_all_device_templates:
        additional_templates = [
            _build_device_template(device_type)
            for device_type in ["server", "gpu", "storage", "network"]
            if device_type != primary_device_type
        ]
        rng.shuffle(additional_templates)
        for idx, template in enumerate(additional_templates):
            template.name = f"{template.name}-{idx + 1}-{unique_suffix}"

    all_templates = [primary_template] + additional_templates
    pattern = [primary_device_type, primary_device_type]
    for template in additional_templates[:2]:
        pattern.append(template.device_type)
    if not pattern:
        pattern = [primary_device_type]

    payload = InfraFlowSpec(
        facility=FacilitySpec(
            name=f"DC-{profile.upper()}-{unique_suffix}",
            width_m=facility_width,
            length_m=facility_length,
            height_m=facility_height,
            cooling_type=cooling_type,
        ),
        halls=generated_halls,
        rack_layout=RackLayoutSpec(**profile_layout),
        device_templates=all_templates,
        placement_strategy=PlacementStrategySpec(type="row_pattern", pattern=pattern),
    )

    return {
        "target_endpoint": "/api/v1/testing/run-infra-flow",
        "generated_at": time.time(),
        "payload": payload,
    }

@app.post("/api/v1/testing/run-api-flow", response_model=APIFlowResult)
async def run_api_testing_flow(gateway_url: str = "http://infra-gateway:8000"):
    timestamp = time.time()
    ts_str = str(int(timestamp))
    admin_email = f"api_admin_{ts_str}@example.com"
    member_email = f"api_member_{ts_str}@example.com"
    password = "Password123!"
    org_name = f"APIOrg_{ts_str}"
    workspace_name = f"APIWS_{ts_str}"
    
    result = {
        "success": False,
        "admin_email": admin_email,
        "member_email": member_email,
        "timestamp": timestamp,
        "step": "INIT"
    }

    logger.info(f"Starting API testing flow at {gateway_url}")

    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        try:
            async def call_api(
                step: str,
                method: str,
                path: str,
                *,
                headers: dict | None = None,
                json_payload: dict | None = None,
                expected_status: tuple[int, ...] = (200, 201),
            ):
                result["step"] = step
                logger.info(f"{step}: {method} {path}")
                response = await client.request(
                    method,
                    f"{gateway_url}{path}",
                    headers=headers,
                    json=json_payload,
                )
                if response.status_code not in expected_status:
                    raise Exception(f"{step} Failed ({response.status_code}): {response.text}")
                return response

            # 1. Register Admin
            await call_api(
                "ADMIN_REGISTER",
                "POST",
                "/api/v1/tenant/auth/register",
                json_payload={
                    "email": admin_email,
                    "password": password,
                    "full_name": "API Admin",
                },
            )

            # 2. Login Admin
            login_admin = await call_api(
                "ADMIN_LOGIN",
                "POST",
                "/api/v1/tenant/auth/login",
                json_payload={
                    "email": admin_email,
                    "password": password,
                },
            )
            admin_token = login_admin.json()["access_token"]
            result["admin_token"] = admin_token[:15] + "..."
            admin_headers = {"Authorization": f"Bearer {admin_token}"}

            # 3. Create Organization
            create_org = await call_api(
                "CREATE_ORG",
                "POST",
                "/api/v1/tenant/organizations",
                headers=admin_headers,
                json_payload={"name": org_name, "billing_email": admin_email},
            )
            org_id = create_org.json()["id"]
            result["org_id"] = org_id

            # 4. Select Organization Context (token exchange)
            select_org = await call_api(
                "ADMIN_SELECT_ORG",
                "POST",
                "/api/v1/auth/token/context",
                headers=admin_headers,
                json_payload={"org_id": org_id},
            )
            admin_token = select_org.json()["access_token"]
            admin_headers = {"Authorization": f"Bearer {admin_token}"}

            # 5. Create Workspace
            create_workspace = await call_api(
                "CREATE_WORKSPACE",
                "POST",
                "/api/v1/tenant/workspaces",
                headers=admin_headers,
                json_payload={
                    "name": workspace_name,
                    "organization_id": org_id,
                    "region": "us-east-1",
                },
            )
            workspace_id = create_workspace.json()["id"]
            result["workspace_id"] = workspace_id

            # 6. Select Workspace Context (token exchange)
            select_workspace = await call_api(
                "ADMIN_SELECT_WORKSPACE",
                "POST",
                "/api/v1/auth/token/context",
                headers=admin_headers,
                json_payload={"org_id": org_id, "workspace_id": workspace_id},
            )
            admin_token = select_workspace.json()["access_token"]
            admin_headers = {"Authorization": f"Bearer {admin_token}"}
            result["admin_token"] = admin_token[:15] + "..."

            # 7. Create Org Invite
            org_invite_resp = await call_api(
                "ORG_INVITE",
                "POST",
                f"/api/v1/invitations/organization/{org_id}/invite",
                headers=admin_headers,
                json_payload={"email": member_email, "role": "org_member"},
            )
            org_invite_code = org_invite_resp.json()["code"]
            result["org_invite_code"] = org_invite_code

            # 8. Create Workspace Invite
            workspace_invite_resp = await call_api(
                "WORKSPACE_INVITE",
                "POST",
                f"/api/v1/invitations/workspace/{workspace_id}/invite",
                headers=admin_headers,
                json_payload={"email": member_email, "role": "infra_operator"},
            )
            workspace_invite_code = workspace_invite_resp.json()["code"]
            result["workspace_invite_code"] = workspace_invite_code

            # 9. Register Member
            await call_api(
                "MEMBER_REGISTER",
                "POST",
                "/api/v1/tenant/auth/register",
                json_payload={
                    "email": member_email,
                    "password": password,
                    "full_name": "API Member",
                },
            )

            # 10. Login Member
            login_member = await call_api(
                "MEMBER_LOGIN",
                "POST",
                "/api/v1/tenant/auth/login",
                json_payload={"email": member_email, "password": password},
            )
            member_token = login_member.json()["access_token"]
            result["member_token"] = member_token[:15] + "..."
            member_headers = {"Authorization": f"Bearer {member_token}"}

            # 11. Accept Organization Invite by code
            await call_api(
                "ACCEPT_ORG_INVITE",
                "POST",
                f"/api/v1/invitations/codes/{org_invite_code}/accept",
                headers=member_headers,
                json_payload={"email": member_email, "token": org_invite_code},
            )

            # 12. Select Organization Context as Member
            member_select_org = await call_api(
                "MEMBER_SELECT_ORG",
                "POST",
                "/api/v1/auth/token/context",
                headers=member_headers,
                json_payload={"org_id": org_id},
            )
            member_token = member_select_org.json()["access_token"]
            member_headers = {"Authorization": f"Bearer {member_token}"}

            # 13. Accept Workspace Invite by code
            await call_api(
                "ACCEPT_WORKSPACE_INVITE",
                "POST",
                f"/api/v1/invitations/codes/{workspace_invite_code}/accept",
                headers=member_headers,
                json_payload={"email": member_email, "token": workspace_invite_code},
            )

            # 14. Select Workspace Context as Member
            member_select_workspace = await call_api(
                "MEMBER_SELECT_WORKSPACE",
                "POST",
                "/api/v1/auth/token/context",
                headers=member_headers,
                json_payload={"org_id": org_id, "workspace_id": workspace_id},
            )
            member_token = member_select_workspace.json()["access_token"]
            member_headers = {"Authorization": f"Bearer {member_token}"}
            result["member_token"] = member_token[:15] + "..."

            # 15. Verify organization access for member
            member_orgs_resp = await call_api(
                "VERIFY_ORG_ACCESS",
                "GET",
                "/api/v1/tenant/organizations/me",
                headers=member_headers,
                expected_status=(200,),
            )
            member_orgs = member_orgs_resp.json()
            in_org = any(str(org.get("id")) == str(org_id) for org in member_orgs)
            if not in_org:
                raise Exception("VERIFY_ORG_ACCESS Failed: member org mapping not found")

            # 16. Verify workspace membership for member
            members_resp = await call_api(
                "VERIFY_WORKSPACE_MEMBERSHIP",
                "GET",
                f"/api/v1/invitations/workspace/{workspace_id}/members",
                headers=member_headers,
                expected_status=(200,),
            )
            members = members_resp.json()
            in_workspace = any(
                str(m.get("user_email", "")).lower() == member_email.lower() for m in members
            )
            if not in_workspace:
                raise Exception("VERIFY_WORKSPACE_MEMBERSHIP Failed: member not present in workspace members")

            logger.info("API Test Flow Completed Successfully!")
            result["success"] = True
            result["step"] = "COMPLETED"
            return result

        except Exception as e:
            logger.error(f"API Flow Error at step {result['step']}: {str(e)}")
            result["error"] = str(e)
            return result


@app.post("/api/v1/testing/run-infra-flow", response_model=InfraFlowResult)
async def run_infra_flow(
    spec: InfraFlowSpec,
    gateway_url: str = "http://infra-gateway:8000",
):
    timestamp = time.time()
    ts_str = str(int(timestamp))
    admin_email = f"infra_admin_{ts_str}@example.com"
    password = "Password123!"
    org_name = f"{spec.facility.name}-ORG-{ts_str}"
    workspace_name = f"{spec.facility.name}-WS-{ts_str}"

    result = {
        "success": False,
        "org_id": "",
        "workspace_id": "",
        "facility_id": "",
        "hall_ids": [],
        "rack_count": 0,
        "device_count": 0,
        "devices": [],
        "rack_capacity": {"max_u": 42, "max_power_kw": 20.0},
        "placement_summary": {"total_racks": 0, "devices_per_rack_avg": 0.0, "total_devices": 0},
        "warnings": [],
        "error": None,
        "failed_step": None,
        "timestamp": timestamp,
    }

    logger.info(f"Starting infra flow at {gateway_url} for facility={spec.facility.name}")

    if not spec.halls:
        result["failed_step"] = "INPUT_VALIDATION"
        result["error"] = "At least one hall is required."
        return result

    cooling_type = str(spec.facility.cooling_type).strip().lower()
    if cooling_type not in ALLOWED_COOLING_TYPES:
        result["failed_step"] = "INPUT_VALIDATION"
        result["error"] = f"Unsupported cooling_type '{spec.facility.cooling_type}'. Allowed: air, liquid, hybrid."
        return result

    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
        try:
            async def call_api(
                step: str,
                method: str,
                path: str,
                *,
                headers: dict | None = None,
                json_payload: dict | None = None,
                expected_status: tuple[int, ...] = (200, 201),
            ):
                result["failed_step"] = step
                logger.info(f"{step}: {method} {path}")
                response = await client.request(
                    method,
                    f"{gateway_url}{path}",
                    headers=headers,
                    json=json_payload,
                )
                if response.status_code not in expected_status:
                    raise Exception(f"{step} Failed ({response.status_code}): {response.text}")
                return response

            def auth_headers(token: str, workspace_id: str | None = None, org_id: str | None = None):
                headers = {"Authorization": f"Bearer {token}"}
                if workspace_id:
                    headers["X-Workspace-Id"] = workspace_id
                if org_id:
                    headers["X-Org-Id"] = org_id
                return headers

            def template_payload(template: DeviceTemplateSpec):
                service_device_type = DEVICE_TYPE_TO_SERVICE.get(template.device_type)
                if not service_device_type:
                    raise Exception(
                        f"Unsupported device_type '{template.device_type}'. Allowed: server, gpu, storage, network."
                    )
                payload = {
                    "name": template.name,
                    "device_type": service_device_type,
                    "size_u": template.size_u,
                    "default_power_kw": template.default_power_kw,
                    "vendor": template.vendor,
                    "model": template.model or template.name,
                }
                if template.default_heat_btu is not None:
                    payload["default_heat_btu"] = template.default_heat_btu
                return payload

            # 1) Authenticate user
            await call_api(
                "REGISTER_ADMIN",
                "POST",
                "/api/v1/tenant/auth/register",
                json_payload={
                    "email": admin_email,
                    "password": password,
                    "full_name": "Infra Flow Admin",
                },
            )
            login_admin = await call_api(
                "LOGIN_ADMIN",
                "POST",
                "/api/v1/tenant/auth/login",
                json_payload={"email": admin_email, "password": password},
            )
            admin_token = login_admin.json()["access_token"]
            admin_headers = auth_headers(admin_token)

            # 2) Create organization
            org_response = await call_api(
                "CREATE_ORG",
                "POST",
                "/api/v1/tenant/organizations",
                headers=admin_headers,
                json_payload={"name": org_name, "billing_email": admin_email},
            )
            org_id = org_response.json()["id"]
            result["org_id"] = org_id

            # 3) Create workspace
            org_context = await call_api(
                "SELECT_ORG_CONTEXT",
                "POST",
                "/api/v1/auth/token/context",
                headers=admin_headers,
                json_payload={"org_id": org_id},
            )
            admin_token = org_context.json()["access_token"]
            admin_headers = auth_headers(admin_token, org_id=org_id)

            workspace_response = await call_api(
                "CREATE_WORKSPACE",
                "POST",
                "/api/v1/tenant/workspaces",
                headers=admin_headers,
                json_payload={
                    "name": workspace_name,
                    "organization_id": org_id,
                    "region": "us-east-1",
                },
            )
            workspace_id = workspace_response.json()["id"]
            result["workspace_id"] = workspace_id

            workspace_context = await call_api(
                "SELECT_WORKSPACE_CONTEXT",
                "POST",
                "/api/v1/auth/token/context",
                headers=admin_headers,
                json_payload={"org_id": org_id, "workspace_id": workspace_id},
            )
            admin_token = workspace_context.json()["access_token"]
            workload_headers = auth_headers(admin_token, workspace_id=workspace_id, org_id=org_id)

            # 4) Build facility
            facility_response = await call_api(
                "CREATE_FACILITY",
                "POST",
                "/api/v1/facility/facilities",
                headers=workload_headers,
                json_payload={
                    "name": spec.facility.name,
                    "width_m": spec.facility.width_m,
                    "length_m": spec.facility.length_m,
                    "height_m": spec.facility.height_m,
                    "cooling_type": cooling_type,
                    "workspace_id": workspace_id,
                    "tier_level": 3,
                },
            )
            facility_id = facility_response.json()["id"]
            result["facility_id"] = facility_id

            # 5) Create halls + zones + aisles
            hall_zone_aisle = []
            for hall_index, hall in enumerate(spec.halls):
                hall_response = await call_api(
                    f"CREATE_HALL_{hall_index + 1}",
                    "POST",
                    f"/api/v1/facility/facilities/{facility_id}/halls",
                    headers=workload_headers,
                    json_payload={
                        "name": hall.name,
                        "width_m": hall.width_m,
                        "length_m": hall.length_m,
                        "height_m": hall.height_m,
                        "power_capacity_mw": hall.power_capacity_mw,
                        "floor_type": "raised",
                    },
                )
                hall_id = hall_response.json()["id"]
                result["hall_ids"].append(hall_id)

                zone_response = await call_api(
                    f"CREATE_ZONE_{hall_index + 1}",
                    "POST",
                    f"/api/v1/facility/halls/{hall_id}/zones",
                    headers=workload_headers,
                    json_payload={
                        "name": f"{hall.name}-ZONE-1",
                        "zone_type": "logical",
                        "cooling_capacity_kw": max(100.0, hall.power_capacity_mw * 1000.0),
                        "power_capacity_kw": max(100.0, hall.power_capacity_mw * 1000.0),
                    },
                )
                zone_id = zone_response.json()["id"]

                aisle_response = await call_api(
                    f"CREATE_AISLE_{hall_index + 1}",
                    "POST",
                    f"/api/v1/facility/zones/{zone_id}/aisles",
                    headers=workload_headers,
                    json_payload={
                        "aisle_type": "cold",
                        "orientation": "north_south",
                        "width_m": 1.2,
                    },
                )
                aisle_id = aisle_response.json()["id"]

                hall_zone_aisle.append(
                    {"hall_id": hall_id, "zone_id": zone_id, "aisle_id": aisle_id}
                )

            # 6) Generate rack layout
            all_racks = []
            for hall_index, entry in enumerate(hall_zone_aisle):
                start_y = hall_index * (spec.rack_layout.rows * spec.rack_layout.row_pitch_m + 4.0)
                layout_response = await call_api(
                    f"RACK_GENERATION_{hall_index + 1}",
                    "POST",
                    "/api/v1/rack/layouts/grid",
                    headers=workload_headers,
                    json_payload={
                        "zone_id": entry["zone_id"],
                        "aisle_id": entry["aisle_id"],
                        "start_x_m": 0.0,
                        "start_y_m": start_y,
                        "rows": spec.rack_layout.rows,
                        "cols": spec.rack_layout.cols,
                        "row_pitch_m": spec.rack_layout.row_pitch_m,
                        "col_pitch_m": spec.rack_layout.col_pitch_m,
                        "aisle_pattern": "hot_cold",
                        "rack_type": "compute",
                        "workspace_id": workspace_id,
                        "facility_id": facility_id,
                        "hall_id": entry["hall_id"],
                    },
                )
                generated = layout_response.json()
                all_racks.extend(generated)

            if not all_racks:
                raise Exception("RACK_GENERATION produced zero racks.")

            rack_ids = [rack["id"] for rack in all_racks]
            result["rack_count"] = len(rack_ids)

            # 7) Create device templates
            warnings: list[str] = []
            template_specs: list[DeviceTemplateSpec] = []
            if spec.device_templates:
                template_specs.extend(spec.device_templates)
            elif spec.device_template:
                template_specs.append(spec.device_template)
                template_specs.extend(spec.additional_device_templates)
            else:
                raise Exception(
                    "No device templates provided. Use 'device_templates' (preferred) or legacy 'device_template'."
                )

            template_specs_by_type: dict[str, DeviceTemplateSpec] = {}
            for template in template_specs:
                if template.device_type in template_specs_by_type:
                    warnings.append(
                        f"DUPLICATE_TEMPLATE_TYPE: '{template.device_type}' encountered. Latest template '{template.name}' will be used."
                    )
                template_specs_by_type[template.device_type] = template

            template_id_by_type: dict[str, str] = {}
            for template_index, (device_type, template) in enumerate(template_specs_by_type.items()):
                template_response = await call_api(
                    f"CREATE_DEVICE_TEMPLATE_{template_index + 1}",
                    "POST",
                    "/api/v1/device/device-templates",
                    headers=workload_headers,
                    json_payload=template_payload(template),
                )
                template_id_by_type[device_type] = template_response.json()["id"]

            # 8) Constraint-aware smart placement deploy
            placement_pattern = (
                spec.placement_strategy.pattern
                if spec.placement_strategy and spec.placement_strategy.pattern
                else [next(iter(template_specs_by_type.keys()))]
            )

            max_u = 42
            default_max_power_kw = 20.0
            result["rack_capacity"] = {"max_u": max_u, "max_power_kw": default_max_power_kw}

            deployment_batches: dict[tuple[str, int], list[str]] = {}
            planned_total_devices = 0

            for hall_id in result["hall_ids"]:
                hall_racks = [rack for rack in all_racks if str(rack.get("hall_id")) == str(hall_id)]
                row_indices = sorted({int(rack.get("row_index", 0)) for rack in hall_racks})

                for row_index in row_indices:
                    device_type_for_row = placement_pattern[row_index % len(placement_pattern)]
                    template = template_specs_by_type.get(device_type_for_row)
                    template_id = template_id_by_type.get(device_type_for_row)
                    row_racks = sorted(
                        [rack for rack in hall_racks if int(rack.get("row_index", 0)) == row_index],
                        key=lambda x: int(x.get("column_index", 0)),
                    )

                    if not template or not template_id:
                        warnings.append(
                            f"MISSING_TEMPLATE_FOR_PATTERN: row_index={row_index}, device_type='{device_type_for_row}', racks_skipped={len(row_racks)}."
                        )
                        continue

                    for rack in row_racks:
                        rack_id = str(rack["id"])
                        max_power_kw = float(rack.get("max_power_kw") or default_max_power_kw)
                        used_u = 0
                        used_power = 0.0
                        placements_for_rack = 0

                        while (
                            (used_u + template.size_u) <= max_u
                            and (used_power + template.default_power_kw) <= max_power_kw
                        ):
                            used_u += template.size_u
                            used_power += template.default_power_kw
                            placements_for_rack += 1

                        if placements_for_rack == 0:
                            warnings.append(
                                f"RACK_SKIPPED_NO_CAPACITY: rack_id={rack_id}, template={template.name}, "
                                f"template_u={template.size_u}, template_power_kw={template.default_power_kw}, "
                                f"max_u={max_u}, max_power_kw={max_power_kw}."
                            )
                            continue

                        planned_total_devices += placements_for_rack
                        batch_key = (template_id, placements_for_rack)
                        deployment_batches.setdefault(batch_key, []).append(rack_id)

            if planned_total_devices == 0:
                raise Exception("SMART_PLACEMENT_FAILED: no devices could be placed under current rack constraints.")

            for deployment_index, ((template_id, count), batch_rack_ids) in enumerate(deployment_batches.items()):
                await call_api(
                    f"DEVICE_DEPLOYMENT_SMART_{deployment_index + 1}",
                    "POST",
                    "/api/v1/device/devices/bulk-deploy",
                    headers=workload_headers,
                    json_payload={
                        "template_id": template_id,
                        "rack_ids": batch_rack_ids,
                        "count": count,
                        "start_u": 1,
                        "workspace_id": workspace_id,
                    },
                )

            # 9) Read back devices + racks for validation
            list_devices_response = await call_api(
                "LIST_DEVICES",
                "GET",
                f"/api/v1/device/devices?workspace_id={workspace_id}&limit=10000",
                headers=workload_headers,
                expected_status=(200,),
            )
            devices = list_devices_response.json()

            list_racks_response = await call_api(
                "LIST_RACKS",
                "GET",
                f"/api/v1/rack/racks?workspace_id={workspace_id}",
                headers=workload_headers,
                expected_status=(200,),
            )
            racks = list_racks_response.json()

            rack_map = {str(rack["id"]): rack for rack in racks}
            hall_id_set = set(result["hall_ids"])

            # Validation: no slot overlap in each rack
            devices_by_rack: dict[str, list[dict]] = {}
            for device in devices:
                rack_id = str(device["rack_id"])
                devices_by_rack.setdefault(rack_id, []).append(device)

            for rack_id, rack_devices in devices_by_rack.items():
                intervals: list[tuple[int, int, str]] = []
                for device in rack_devices:
                    start_u = int(device["start_u"])
                    size_u = int(device["size_u"])
                    end_u = start_u + size_u - 1
                    device_id = str(device["id"])
                    for existing_start, existing_end, existing_id in intervals:
                        overlaps = not (end_u < existing_start or start_u > existing_end)
                        if overlaps:
                            raise Exception(
                                f"SLOT_OVERLAP in rack {rack_id}: device {device_id} overlaps with {existing_id}."
                            )
                    intervals.append((start_u, end_u, device_id))

            # Validation: mapping integrity
            device_summaries = []
            for device in devices:
                rack_id = str(device["rack_id"])
                rack = rack_map.get(rack_id)
                if not rack:
                    raise Exception(f"RACK_MAPPING_INVALID: Device {device['id']} references unknown rack {rack_id}.")

                if str(rack["facility_id"]) != str(facility_id):
                    raise Exception(
                        f"FACILITY_MAPPING_INVALID: Device {device['id']} rack facility {rack['facility_id']} != {facility_id}."
                    )

                if str(rack["hall_id"]) not in hall_id_set:
                    raise Exception(
                        f"HALL_MAPPING_INVALID: Device {device['id']} rack hall {rack['hall_id']} not in created halls."
                    )

                if str(device["workspace_id"]) != str(workspace_id):
                    raise Exception(
                        f"WORKSPACE_ISOLATION_INVALID: Device {device['id']} workspace {device['workspace_id']} != {workspace_id}."
                    )

                normalized_type = SERVICE_TO_OUTPUT_DEVICE_TYPE.get(
                    str(device["device_type"]).lower(),
                    str(device["device_type"]).lower(),
                )

                device_summaries.append(
                    {
                        "device_id": str(device["id"]),
                        "device_type": normalized_type,
                        "rack_id": rack_id,
                        "facility_id": str(rack["facility_id"]),
                        "hall_id": str(rack["hall_id"]),
                        "row_index": rack.get("row_index"),
                        "workspace_id": str(device["workspace_id"]),
                        "org_id": str(org_id),
                        "logical_space_id": (
                            str(device["logical_space_id"]) if device.get("logical_space_id") else None
                        ),
                        "start_u": int(device["start_u"]),
                        "size_u": int(device["size_u"]),
                        "power_kw": float(device.get("power_draw_kw", 0.0)),
                    }
                )

            # Validation: org propagation (token context + membership)
            org_check = await call_api(
                "VERIFY_ORG_PROPAGATION",
                "GET",
                "/api/v1/tenant/organizations/me",
                headers=workload_headers,
                expected_status=(200,),
            )
            orgs = org_check.json()
            in_org = any(str(org.get("id")) == str(org_id) for org in orgs)
            if not in_org:
                raise Exception("ORG_PROPAGATION_INVALID: org not found in authenticated context.")

            result["device_count"] = len(device_summaries)
            result["devices"] = device_summaries
            result["placement_summary"] = {
                "total_racks": len(rack_ids),
                "devices_per_rack_avg": round((len(device_summaries) / len(rack_ids)), 3) if rack_ids else 0.0,
                "total_devices": len(device_summaries),
            }
            result["warnings"] = warnings
            result["success"] = True
            result["failed_step"] = None
            return result

        except Exception as e:
            logger.error(f"Infra Flow Error at step {result['failed_step']}: {str(e)}")
            result["error"] = str(e)
            return result

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8020)
