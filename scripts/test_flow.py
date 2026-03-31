import subprocess
import time
import sys
import os
from playwright.sync_api import sync_playwright

# Requirements:
# pip install playwright
# playwright install chromium

def run_command(command, cwd=None):
    print(f"Executing: {command}")
    # Using shell=True for windows compatibility with docker commands in strings
    result = subprocess.run(command, shell=True, cwd=cwd, text=True)
    if result.returncode != 0:
        print(f"Warning: Command returned non-zero exit code {result.returncode}")
    return result

def main():
    # 1. Docker Build & Up
    print("\n--- Phase 1: Docker Build & Up ---")
    run_command("docker compose build frontend-control-plane")
    run_command("docker compose up -d frontend-control-plane")
    
    # Wait for the service to be ready
    base_url = "http://localhost:3000"
    print(f"Waiting for {base_url} to be ready (30s timeout)...")
    
    # Simple polling for health
    max_retries = 30
    for i in range(max_retries):
        try:
            # check if port is open or use a simple curl-like check
            # but for now we'll just wait a bit as docker up -d returns immediately
            time.sleep(1)
            if i % 5 == 0: print(f"Polling... {i}s")
        except Exception:
            pass
    
    time.sleep(5) # Extra buffer for frontend hydration

    with sync_playwright() as p:
        # Browser setup
        print("Launching browser...")
        browser = p.chromium.launch(headless=False) # Set to True for headless
        context = browser.new_context()
        page = context.new_page()

        timestamp = int(time.time())
        admin_email = f"admin_{timestamp}@example.com"
        member_email = f"member_{timestamp}@example.com"
        password = "Password123!"
        org_name = f"TestOrg_{timestamp}"
        workspace_name = f"TestWS_{timestamp}"

        try:
            # 2. Register Admin
            print(f"\n--- Phase 2: Register Admin ({admin_email}) ---")
            page.goto(f"{base_url}/register")
            page.fill('input[type="text"]', "Admin User") # Full Name
            page.fill('input[type="email"]', admin_email)
            page.fill('input[type="password"]', password)
            page.click('button:has-text("Register")')
            
            # 3. Login Admin
            print("--- Phase 3: Login Admin ---")
            page.wait_for_url(f"**/login**")
            page.fill('input[type="email"]', admin_email)
            page.fill('input[type="password"]', password)
            page.click('button:has-text("Sign In")')
            
            # 4. Create Org
            print(f"--- Phase 4: Create Organization ({org_name}) ---")
            page.wait_for_url("**/org/select")
            page.click('button:has-text("Create New Organization")')
            
            page.wait_for_url("**/org/create")
            page.fill('input[placeholder="e.g. Acme Corp"]', org_name)
            page.click('button:has-text("Create Organization")')
            
            # 5. Select Org
            print("--- Phase 5: Select Organization ---")
            page.wait_for_url("**/org/select")
            # Click "Select Org" for the newly created org
            page.wait_for_selector(f'tr:has-text("{org_name}")')
            page.click(f'tr:has-text("{org_name}") button:has-text("Select Org")')
            
            # 6. Create Workspace
            print(f"--- Phase 6: Create Workspace ({workspace_name}) ---")
            page.wait_for_url("**/workspace/select")
            page.click('button:has-text("Create New Workspace")')
            
            page.wait_for_url("**/workspace/create")
            page.fill('input[placeholder="e.g. Hyperscale Cluster 01"]', workspace_name)
            page.click('button:has-text("Create Workspace")')
            
            # 7. Select Workspace
            print("--- Phase 7: Select Workspace ---")
            page.wait_for_url("**/workspace/select")
            page.wait_for_selector(f'tr:has-text("{workspace_name}")')
            page.click(f'tr:has-text("{workspace_name}") button:has-text("Select Workspace")')
            
            # 8. Generate Invites
            print("--- Phase 8: Generate Invites ---")
            page.wait_for_url("**/app/design/facility")
            
            # Go to Invitations page
            page.goto(f"{base_url}/app/governance/invitations")
            
            # Create Organization Invite
            print(f"Creating Org Invite for {member_email}...")
            org_section = page.locator('div:has-text("Organization Invite")').first
            org_section.locator('input[type="email"]').fill(member_email)
            org_section.locator('button:has-text("Create Organization Invite")').click()
            
            # Capture Org Code
            page.wait_for_selector('text=Invite Code:')
            org_code = page.locator('div:has-text("Invite Code:") strong').first.inner_text()
            print(f"Captured Org Invite Code: {org_code}")
            
            # Create Workspace Invite
            print(f"Creating Workspace Invite for {member_email}...")
            ws_section = page.locator('div:has-text("Workspace Invite")').first
            ws_section.locator('input[type="email"]').fill(member_email)
            ws_section.locator('button:has-text("Create Workspace Invite")').click()
            
            # Capture Workspace Code
            # We wait a bit for the second code to appear or ensure we select the right one
            page.wait_for_timeout(1000)
            ws_code = ws_section.locator('div:has-text("Invite Code:") strong').inner_text()
            print(f"Captured Workspace Invite Code: {ws_code}")
            
            # 9. Logout
            print("--- Phase 9: Logout ---")
            page.goto(f"{base_url}/org/select")
            page.click('button:has-text("Sign Out")')
            page.wait_for_url("**/login")

            # 10. Register Member
            print(f"\n--- Phase 10: Register Member ({member_email}) ---")
            page.goto(f"{base_url}/register")
            page.fill('input[type="text"]', "Member User")
            page.fill('input[type="email"]', member_email)
            page.fill('input[type="password"]', password)
            page.click('button:has-text("Register")')
            
            # 11. Login Member
            print("--- Phase 11: Login Member ---")
            page.wait_for_url(f"**/login**")
            page.fill('input[type="email"]', member_email)
            page.fill('input[type="password"]', password)
            page.click('button:has-text("Sign In")')
            
            # 12. Join Org via Invite Code
            print("--- Phase 12: Join Organization ---")
            page.wait_for_url("**/org/select")
            page.fill('input[placeholder="invite_code"]', org_code)
            page.click('button:has-text("Join Organization")')
            
            # Select the joined org
            page.wait_for_selector(f'tr:has-text("{org_name}")')
            page.click(f'tr:has-text("{org_name}") button:has-text("Select Org")')
            
            # 13. Join Workspace via Invite Code
            print("--- Phase 13: Join Workspace ---")
            page.wait_for_url("**/workspace/select")
            page.fill('input[placeholder="invite_code"]', ws_code)
            page.click('button:has-text("Join Workspace")')
            
            # Select the joined workspace
            page.wait_for_selector(f'tr:has-text("{workspace_name}")')
            page.click(f'tr:has-text("{workspace_name}") button:has-text("Select Workspace")')
            
            # 14. Final Verification
            print("--- Phase 14: Final Verification ---")
            page.wait_for_url("**/app/design/facility")
            print("\nSUCCESS: Member successfully joined Org/Workspace and entered Control Plane!")
            
            time.sleep(5) # Pause to see success

        except Exception as e:
            print(f"\nERROR during automation: {e}")
            page.screenshot(path="debug_error.png")
            print("Screenshot saved to debug_error.png")
            raise e
        finally:
            browser.close()

if __name__ == "__main__":
    main()
