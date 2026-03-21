import httpx
import asyncio

async def check():
    async with httpx.AsyncClient() as client:
        base = "http://localhost:8000"
        
        # 1. Register a test user
        print("\n--- Testing Register ---")
        reg_url = f"{base}/api/v1/auth/register"
        user_data = {"email": "debug@test.com", "password": "password", "name": "Debugger"}
        resp = await client.post(reg_url, json=user_data)
        print(f"POST {reg_url} -> {resp.status_code}")
        
        if resp.status_code in [200, 201]:
            token = resp.json().get("access_token")
            headers = {"Authorization": f"Bearer {token}"}
            
            # 2. Test /me
            print("\n--- Testing /me ---")
            me_url = f"{base}/api/v1/auth/me"
            resp_me = await client.get(me_url, headers=headers)
            print(f"GET {me_url} -> {resp_me.status_code}")
            if resp_me.status_code == 404:
                print(f"  FAILED: {resp_me.text}")
            
            # 3. Test /orgs
            print("\n--- Testing /orgs ---")
            orgs_url = f"{base}/api/v1/orgs"
            resp_orgs = await client.get(orgs_url, headers=headers)
            print(f"GET {orgs_url} -> {resp_orgs.status_code}")
            
            # 4. Test /workspaces
            print("\n--- Testing /workspaces ---")
            ws_url = f"{base}/api/v1/workspaces"
            resp_ws = await client.get(ws_url, headers=headers)
            print(f"GET {ws_url} -> {resp_ws.status_code}")
        else:
            print(f"Registration failed: {resp.text}")

if __name__ == "__main__":
    asyncio.run(check())
