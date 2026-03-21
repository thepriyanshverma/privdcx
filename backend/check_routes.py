import httpx
import asyncio

async def check():
    async with httpx.AsyncClient() as client:
        # Try different possible paths
        paths = [
            "/api/v1/auth/register",
            "/v1/auth/register",
            "/auth/register",
            "/api/v1/v1/auth/register"
        ]
        print("Checking Backend routes...")
        for path in paths:
            try:
                url = f"http://localhost:8000{path}"
                resp = await client.post(url, json={"email": "test@test.p", "password": "password", "name": "test"})
                print(f"POST {url} -> {resp.status_code}")
                if resp.status_code != 404:
                    print(f"  Response: {resp.text[:100]}")
            except Exception as e:
                print(f"  Error hitting {url}: {e}")

if __name__ == "__main__":
    asyncio.run(check())
